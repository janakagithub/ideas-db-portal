#!/usr/bin/env python3
"""Analyze the tetrad_v1 IDEAS Apache Iceberg warehouse and build the portal
data bundle (typed).

Reads the CURRENT snapshot of each Iceberg table (via iceberg_read.py, which
resolves the live parquet files locally), preserving REAL column types, and emits
into build/:
  - metadata.json          (superset the site renders from; same shape as before
                            plus new `project`, `iceberg`, `identifiers` sections)
  - data_dictionary.enriched.json, data_dictionary.csv/.tsv
  - ideas.db (typed SQLite) + ideas_dump.sql
  - parquet/<table>.parquet  (current snapshot per table, for download/explore)
  - tetrad_v1_iceberg.zip    (the whole Iceberg warehouse, for download/explore)

Run:  PYTHONPATH=./.pylibs python3 analyze_iceberg.py [WAREHOUSE_DIR]
"""
import csv
import datetime as dt
import json
import os
import shutil
import sqlite3
import subprocess
import sys

import duckdb

import iceberg_read as ir
import schema_knowledge as K

HERE = os.path.dirname(os.path.abspath(__file__))
WAREHOUSE = sys.argv[1] if len(sys.argv) > 1 else "/home/janakae/claude_projects/Ideas-DB/tetrad_v1"
WAREHOUSE_ZIP_SRC = os.path.join(os.path.dirname(WAREHOUSE), "tetrad_v1.zip")
BUILD = os.path.join(HERE, "build")
NOTES_TXT = "/home/janakae/claude_projects/Ideas-DB/notes_text.txt"

NUMERIC_TYPES = {"BIGINT", "INTEGER", "DOUBLE", "FLOAT", "DECIMAL", "HUGEINT", "SMALLINT", "TINYINT"}


def short_type(t):
    t = t.upper()
    if t.startswith("DECIMAL"):
        return "decimal"
    return {
        "BIGINT": "int", "INTEGER": "int", "SMALLINT": "int", "TINYINT": "int", "HUGEINT": "int",
        "DOUBLE": "real", "FLOAT": "real",
        "VARCHAR": "text", "BOOLEAN": "bool", "DATE": "date",
        "TIMESTAMP WITH TIME ZONE": "timestamptz", "TIMESTAMP": "timestamp",
    }.get(t, t.lower())


def sqlite_type(t):
    t = t.upper()
    if t in ("BIGINT", "INTEGER", "SMALLINT", "TINYINT", "HUGEINT", "BOOLEAN"):
        return "INTEGER"
    if t in ("DOUBLE", "FLOAT") or t.startswith("DECIMAL"):
        return "REAL"
    return "TEXT"


def role_of(table, field, is_pk, is_fk, dtype):
    if is_pk:
        return "identifier (primary key)"
    if is_fk:
        return "identifier (foreign key)"
    if field in ("created_at", "updated_at", "created_by"):
        return "provenance"
    if table in ("sample_parameter",) and field in ("label", "value", "value_type", "unit"):
        return "measured value"
    if field in ("concentration", "concentration_unit", "coefficient"):
        return "measured value"
    if field in K.ONTOLOGY_COLS:
        return "structured identifier"
    return "descriptor"


def cell(v):
    """JSON-serialisable display value; keep numbers numeric for sorting."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat(sep=" ")
    return str(v)


def main():
    os.makedirs(BUILD, exist_ok=True)
    con = ir.connect()
    con.execute("SET TimeZone='UTC'")
    tables = ir.tables(WAREHOUSE)

    # ---- pull each table (current snapshot, typed) ----
    fk_children = {(c, f) for (c, f, _, _) in K.FKS}
    fk_target = {(c, f): (p, pf) for (c, f, p, pf) in K.FKS}

    meta_tables = []
    dd_rows = []          # flat data-dictionary rows
    enriched = []         # enriched dict entries
    sqlite_specs = {}     # table -> [(col, sqlitetype)]
    sqlite_data = {}      # table -> list[tuple]
    iceberg_info = []     # per-table iceberg snapshot history
    curie_prefixes = {}   # prefix -> {example,count}
    parquet_dir = os.path.join(BUILD, "parquet")
    os.makedirs(parquet_dir, exist_ok=True)

    for t in tables:
        meta, mpath = ir.current_meta(WAREHOUSE, t)
        files = ir.live_data_files(WAREHOUSE, t, con)
        frag = f"read_parquet(['{chr(39).join([''])}" + "','".join(files) + "'])" if files else None
        frag = "read_parquet(['" + "','".join(files) + "'])"
        rel = con.sql(f"SELECT * FROM {frag}")
        cols = list(rel.columns)
        types = [str(x) for x in rel.types]
        nrows = con.execute(f"SELECT count(*) FROM {frag}").fetchone()[0]

        # write per-table parquet (current snapshot) for download/explore
        con.execute(
            f"COPY (SELECT * FROM {frag}) TO '{os.path.join(parquet_dir, t + '.parquet')}' (FORMAT PARQUET)"
        )

        # fetch all rows for the site + sqlite
        rows_raw = con.execute(f"SELECT * FROM {frag}").fetchall()
        rows = [[cell(v) for v in r] for r in rows_raw]

        bclass, desc = K.TABLE_DESC.get(t, ("", t))
        col_meta = []
        filled_cells = 0
        for i, (c, ty) in enumerate(zip(cols, types)):
            is_pk = (c == "id")
            is_fk = (t, c) in fk_children
            ftab, ffield = fk_target.get((t, c), ("", ""))
            # per-column stats
            nonnull = con.execute(f"SELECT count({c}) FROM {frag}").fetchone()[0]
            distinct = con.execute(f"SELECT count(DISTINCT {c}) FROM {frag}").fetchone()[0]
            missing = nrows - nonnull
            filled_cells += nonnull
            ex = con.execute(
                f"SELECT DISTINCT {c} FROM {frag} WHERE {c} IS NOT NULL LIMIT 6"
            ).fetchall()
            examples = "; ".join(str(x[0]) for x in ex)
            desc_col = K.COL_DESC.get(f"{t}.{c}") or K.AUDIT_DESC.get(c) or ""
            onto = ""
            if c in K.ONTOLOGY_COLS:
                onto = K.ONTOLOGY_COLS[c]
            role = role_of(t, c, is_pk, is_fk, ty)
            is_num = ty.upper() in NUMERIC_TYPES
            cm = {
                "table_name": t, "field_name": c,
                "data_type": ty, "short_type": short_type(ty),
                "is_nullable": "no" if (is_pk or missing == 0) else "yes",
                "is_primary_key": "yes" if is_pk else "",
                "is_foreign_key": "yes" if is_fk else "",
                "foreign_table": ftab, "foreign_field": ffield,
                "relationship_status": "", "role": role,
                "description": desc_col, "scientific_meaning": desc_col,
                "example_values": examples, "unit": "", "ontology": onto,
                "controlled_vocabulary": "", "allowed_values": [],
                "unique_count": distinct, "missing_count": missing,
                "missing_percent": round(100 * missing / nrows, 1) if nrows else 0.0,
                "interpretation_confidence": "high" if desc_col else "medium",
                "is_numeric": is_num,
            }
            col_meta.append(cm)
            dd_rows.append(cm)
            enriched.append(cm)
            sqlite_specs.setdefault(t, []).append((c, sqlite_type(ty)))
            # CURIE prefix harvest from id-like columns
            if is_pk or is_fk:
                for (val,) in ex:
                    s = str(val)
                    if ":" in s and not s.startswith("http"):
                        pre = s.split(":", 1)[0]
                        if pre and not pre.isdigit() and len(pre) <= 12:
                            d = curie_prefixes.setdefault(pre, {"example": s, "count": 0})
                            d["count"] += 1

        completeness = round(100 * filled_cells / (nrows * len(cols)), 1) if nrows and cols else 0.0
        meta_tables.append({
            "name": t, "group": "populated" if nrows else "empty",
            "bridge_class": bclass, "desc": desc,
            "nrows": nrows, "ncols": len(cols),
            "columns": cols, "completeness": completeness,
            "col_meta": col_meta, "rows": rows,
        })
        sqlite_data[t] = rows_raw

        # ---- iceberg snapshot history ----
        snaps = []
        for s in meta.get("snapshots", []):
            summ = s.get("summary", {})
            snaps.append({
                "snapshot_id": str(s["snapshot-id"]),
                "timestamp": dt.datetime.utcfromtimestamp(s["timestamp-ms"] / 1000).isoformat() + "Z",
                "operation": summ.get("operation", ""),
                "records": int(summ.get("total-records", 0) or 0),
                "data_files": int(summ.get("total-data-files", 0) or 0),
                "is_current": s["snapshot-id"] == meta.get("current-snapshot-id"),
            })
        data_files_meta = [
            {"name": os.path.basename(f), "bytes": os.path.getsize(f)} for f in files
        ]
        iceberg_info.append({
            "name": t,
            "format_version": meta.get("format-version"),
            "current_snapshot": str(meta.get("current-snapshot-id")),
            "n_metadata_versions": len(
                [x for x in os.listdir(os.path.join(WAREHOUSE, t, "metadata")) if x.endswith(".metadata.json")]
            ),
            "n_snapshots": len(snaps),
            "snapshots": sorted(snaps, key=lambda x: x["timestamp"]),
            "current_data_files": data_files_meta,
            "current_bytes": sum(d["bytes"] for d in data_files_meta),
            "iceberg_version": next(
                (s.get("summary", {}).get("iceberg-version") for s in meta.get("snapshots", [])
                 if s["snapshot-id"] == meta.get("current-snapshot-id")), ""),
            "schema": [
                {"id": cid, "name": nm, "type": str(ty), "required": req}
                for (cid, nm, ty, req) in ir.iceberg_schema(meta)
            ],
        })

    TBL = {t["name"]: t for t in meta_tables}

    # ---- relationships (verify coverage of the declared logical FKs) ----
    relationships = []
    for (ct, cf, pt, pf) in K.FKS:
        if ct not in TBL or pt not in TBL:
            continue
        cfrag = "read_parquet(['" + "','".join(ir.live_data_files(WAREHOUSE, ct, con)) + "'])"
        pfrag = "read_parquet(['" + "','".join(ir.live_data_files(WAREHOUSE, pt, con)) + "'])"
        n_child = con.execute(f"SELECT count({cf}) FROM {cfrag}").fetchone()[0]
        n_distinct = con.execute(f"SELECT count(DISTINCT {cf}) FROM {cfrag}").fetchone()[0]
        parent_n = TBL[pt]["nrows"]
        if n_child == 0:
            cov, orphans, status = None, None, "uncertain"
        else:
            matched = con.execute(
                f"SELECT count(*) FROM {cfrag} c WHERE c.{cf} IS NOT NULL AND "
                f"c.{cf} IN (SELECT {pf} FROM {pfrag})"
            ).fetchone()[0]
            cov = round(100 * matched / n_child, 1)
            orphans = n_child - matched
            status = "inferred" if cov >= 100 else "uncertain"
        relationships.append({
            "child_table": ct, "child_field": cf,
            "parent_table": pt, "parent_field": pf,
            "status": status, "declared": False,
            "n_child_values": n_child, "n_distinct_child": n_distinct,
            "coverage_percent": cov, "parent_empty": parent_n == 0,
            "orphans": orphans,
        })
        # tag the child column with its resolved status
        for cm in TBL[ct]["col_meta"]:
            if cm["field_name"] == cf:
                cm["relationship_status"] = status

    # ---- units used (from sample_parameter + sample_reactant) ----
    units_used = {}
    sp = "read_parquet(['" + "','".join(ir.live_data_files(WAREHOUSE, "sample_parameter", con)) + "'])"
    for u, n in con.execute(f"SELECT unit, count(*) FROM {sp} WHERE unit IS NOT NULL GROUP BY unit").fetchall():
        units_used[u] = units_used.get(u, 0) + n
    sr = "read_parquet(['" + "','".join(ir.live_data_files(WAREHOUSE, "sample_reactant", con)) + "'])"
    for u, n in con.execute(f"SELECT concentration_unit, count(*) FROM {sr} WHERE concentration_unit IS NOT NULL GROUP BY concentration_unit").fetchall():
        units_used[u] = units_used.get(u, 0) + n

    # ---- dbxref summary ----
    dbxref_summary = {}
    dx = "read_parquet(['" + "','".join(ir.live_data_files(WAREHOUSE, "idea_dbxref", con)) + "'])"
    for db, acc in con.execute(f"SELECT database_name, accession FROM {dx} WHERE accession IS NOT NULL").fetchall():
        dbxref_summary.setdefault(db, [])
        if acc not in dbxref_summary[db]:
            dbxref_summary[db].append(acc)

    # ---- measurement catalogue (idea_measurement events + EAV parameters) ----
    meas_events = []
    im = "read_parquet(['" + "','".join(ir.live_data_files(WAREHOUSE, "idea_measurement", con)) + "'])"
    for ty, n in con.execute(f"SELECT type, count(*) FROM {im} GROUP BY type ORDER BY count(*) DESC").fetchall():
        meas_events.append({"type": ty, "count": n})
    eav_params = []
    for label, unit, vt, n, mn, md, mx in con.execute(f"""
        SELECT label, unit, value_type, count(*) n,
               min(TRY_CAST(value AS DOUBLE)), median(TRY_CAST(value AS DOUBLE)),
               max(TRY_CAST(value AS DOUBLE))
        FROM {sp} GROUP BY label, unit, value_type ORDER BY n DESC""").fetchall():
        eav_params.append({
            "label": label, "unit": unit, "value_type": vt, "records": n,
            "min": mn, "median": md, "max": mx,
        })

    # ---- findings ----
    findings = []
    for r in relationships:
        if r["orphans"]:
            findings.append({"severity": "warning", "table": r["child_table"],
                             "finding": f"{r['child_table']}.{r['child_field']} → {r['parent_table']}.{r['parent_field']} has {r['orphans']} value(s) with no matching parent ({r['coverage_percent']}% coverage)."})
    # sample_protein.idea_mutant_id has no parent table
    mut_filled = con.execute(
        "read_parquet is placeholder", ) if False else None
    smf = "read_parquet(['" + "','".join(ir.live_data_files(WAREHOUSE, "sample_protein", con)) + "'])"
    n_mut = con.execute(f"SELECT count(idea_mutant_id) FROM {smf}").fetchone()[0]
    findings.append({
        "severity": "info", "table": "sample_protein",
        "finding": f"idea_mutant_id references an engineered-variant entity, but this release ships no idea_mutant table ({n_mut} value(s) present, unresolvable)."
        if n_mut else "idea_mutant_id is present but empty in this release (no engineered variants recorded).",
    })
    findings.append({
        "severity": "info", "table": "(warehouse)",
        "finding": "Source is an Apache Iceberg v2 export; only the CURRENT snapshot of each table is loaded here. Older snapshots remain in the warehouse (see the Iceberg & Files page)."
    })

    # ---- CURIE / identifier summary ----
    curie_meaning = {
        "SMP": "IDEAS sample", "EXP": "IDEAS experiment", "PROT": "IDEAS protein",
        "RXN": "IDEAS reaction", "RCT": "IDEAS reactant", "CHEBI": "ChEBI compound",
    }
    identifiers = {
        "curie_prefixes": [
            {"prefix": p, "example": d["example"], "count": d["count"],
             "meaning": curie_meaning.get(p, "")}
            for p, d in sorted(curie_prefixes.items(), key=lambda kv: -kv[1]["count"])
        ],
        "dbxref_databases": [
            {"database": db, "n_accessions": len(a), "examples": a[:5]}
            for db, a in sorted(dbxref_summary.items())
        ],
    }

    # ---- ERD mermaid ----
    mer = ["erDiagram"]
    for t in meta_tables:
        safe = t["name"]
        mer.append(f"  {safe} {{")
        for cm in t["col_meta"][:12]:
            key = "PK" if cm["is_primary_key"] else ("FK" if cm["is_foreign_key"] else "")
            mer.append(f"    {cm['short_type']} {cm['field_name']} {key}".rstrip())
        mer.append("  }")
    for r in relationships:
        mer.append(f'  {r["parent_table"]} ||--o{{ {r["child_table"]} : "{r["child_field"]}"')
    erd_mermaid = "\n".join(mer)

    # ---- warehouse zip (for download/explore) ----
    files_inventory = []
    if os.path.exists(WAREHOUSE_ZIP_SRC):
        shutil.copy(WAREHOUSE_ZIP_SRC, os.path.join(BUILD, "tetrad_v1_iceberg.zip"))
    # inventory: per-table parquet (current snapshot)
    for t in tables:
        p = os.path.join(parquet_dir, t + ".parquet")
        files_inventory.append({"name": t + ".parquet", "bytes": os.path.getsize(p)})

    # ---- SQLite (typed) + dump ----
    dbpath = os.path.join(BUILD, "ideas.db")
    if os.path.exists(dbpath):
        os.remove(dbpath)
    sq = sqlite3.connect(dbpath)
    for t in tables:
        spec = sqlite_specs[t]
        coldefs = ", ".join(f'"{c}" {ty}{" PRIMARY KEY" if c == "id" else ""}' for c, ty in spec)
        sq.execute(f'CREATE TABLE "{t}" ({coldefs})')
        placeholders = ",".join("?" * len(spec))
        conv = []
        for r in sqlite_data[t]:
            conv.append(tuple(
                (1 if v else 0) if isinstance(v, bool) else
                (v.isoformat(sep=" ") if isinstance(v, (dt.datetime, dt.date)) else v)
                for v in r))
        sq.executemany(f'INSERT INTO "{t}" VALUES ({placeholders})', conv)
    sq.commit()
    with open(os.path.join(BUILD, "ideas_dump.sql"), "w") as fh:
        for line in sq.iterdump():
            fh.write(line + "\n")
    sq.close()

    # ---- data dictionary CSV / TSV / enriched JSON ----
    dd_cols = ["table_name", "field_name", "data_type", "role", "is_primary_key",
               "is_foreign_key", "foreign_table", "foreign_field", "unit", "ontology",
               "unique_count", "missing_count", "missing_percent",
               "interpretation_confidence", "description", "example_values"]
    with open(os.path.join(BUILD, "data_dictionary.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=dd_cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(dd_rows)
    with open(os.path.join(BUILD, "data_dictionary.tsv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=dd_cols, extrasaction="ignore", delimiter="\t")
        w.writeheader()
        w.writerows(dd_rows)
    with open(os.path.join(BUILD, "data_dictionary.enriched.json"), "w") as fh:
        json.dump(enriched, fh, indent=1, default=str)

    total_rows = sum(t["nrows"] for t in meta_tables)
    total_cols = sum(t["ncols"] for t in meta_tables)

    metadata = {
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "source_dir": WAREHOUSE,
        "source_format": "Apache Iceberg (v2) warehouse export",
        "n_tables": len(meta_tables),
        "n_populated": sum(1 for t in meta_tables if t["nrows"]),
        "total_rows": total_rows,
        "total_columns": total_cols,
        "tables": meta_tables,
        "relationships": relationships,
        "units_used": units_used,
        "dbxref_summary": dbxref_summary,
        "ontology_hints": {c: K.ONTOLOGY_COLS[c] for c in K.ONTOLOGY_COLS},
        "findings": findings,
        "files": files_inventory,
        "erd_mermaid": erd_mermaid,
        # ---- new sections ----
        "project": K.PROJECT,
        "iceberg": {
            "format": "Apache Iceberg v2",
            "warehouse": os.path.basename(WAREHOUSE),
            "note": "Each table is an Iceberg table with data/*.parquet and "
                    "metadata/ (metadata.json, manifest & snapshot .avro). Only the "
                    "current snapshot is loaded into the portal.",
            "tables": iceberg_info,
        },
        "identifiers": identifiers,
        "measurements": {
            "events_by_type": meas_events,
            "n_events": sum(e["count"] for e in meas_events),
            "eav_parameters": eav_params,
        },
    }
    with open(os.path.join(BUILD, "metadata.json"), "w") as fh:
        json.dump(metadata, fh, default=str)

    print(f"OK  {len(meta_tables)} tables, {total_rows} rows, {total_cols} cols")
    print(f"    relationships: {len(relationships)}  "
          f"({sum(1 for r in relationships if r['status']=='inferred')} inferred, "
          f"{sum(1 for r in relationships if r['status']=='uncertain')} uncertain)")
    print(f"    units: {len(units_used)}  dbxref DBs: {len(dbxref_summary)}  "
          f"CURIE prefixes: {len(identifiers['curie_prefixes'])}")
    print(f"    measurement events: {metadata['measurements']['n_events']}  "
          f"EAV params: {len(eav_params)}")
    print(f"    build/ -> metadata.json, ideas.db, ideas_dump.sql, parquet/*.parquet, "
          f"tetrad_v1_iceberg.zip, data_dictionary.*")


if __name__ == "__main__":
    main()
