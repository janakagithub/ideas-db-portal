#!/usr/bin/env python3
"""Analyze the IDEAS data and build the portal data bundle — UNION of two releases.

Two releases are merged so nothing is lost:
  * tetrad_v1  — the newer, TYPED Apache Iceberg warehouse (12 tables, real types,
                 the actual assay readouts). Read via iceberg_read.py.
  * earlier    — the earlier all-TEXT parquet release (21 tables) that carries the
                 richer measurements (reaction conditions + computed protein
                 metrics) and 9 tables tetrad_v1 dropped. Read from *.parquet.

For every table / column / measured parameter we record a `release` flag:
    both        present in both releases
    tetrad_v1   added in tetrad_v1   (typed readouts, audit / FK columns)
    earlier     only in the earlier release (dropped in tetrad_v1)

Emits into build/:
  - metadata.json           (superset the site renders from, incl. new `releases`
                             and `linkml` sections, per-column `release`)
  - ideas.linkml.yaml       (generated LinkML schema for the merged dataset)
  - data_dictionary.enriched.json, data_dictionary.csv/.tsv
  - ideas.db (SQLite) + ideas_dump.sql
  - parquet/<table>.parquet (+ sample_parameter__earlier.parquet)
  - tetrad_v1_iceberg.zip   (typed Iceberg warehouse)
  - ideas_earlier_parquet.zip (earlier release parquet)

Run:  PYTHONPATH=./.pylibs python3 analyze_iceberg.py [WAREHOUSE_DIR] [EARLIER_DIR]
"""
import csv
import datetime as dt
import glob
import json
import os
import shutil
import sqlite3
import sys
import zipfile

import iceberg_read as ir
import schema_knowledge as K

HERE = os.path.dirname(os.path.abspath(__file__))
WAREHOUSE = sys.argv[1] if len(sys.argv) > 1 else "/home/janakae/claude_projects/Ideas-DB/tetrad_v1"
EARLIER_DIR = sys.argv[2] if len(sys.argv) > 2 else "/home/janakae/claude_projects/Ideas-DB"
WAREHOUSE_ZIP_SRC = os.path.join(os.path.dirname(WAREHOUSE), "tetrad_v1.zip")
BUILD = os.path.join(HERE, "build")

NUMERIC_TYPES = {"BIGINT", "INTEGER", "DOUBLE", "FLOAT", "DECIMAL", "HUGEINT", "SMALLINT", "TINYINT"}
AUDIT = ("created_at", "updated_at", "created_by")


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


def linkml_range(t):
    s = short_type(t)
    return {"int": "integer", "real": "float", "decimal": "float", "text": "string",
            "bool": "boolean", "date": "date", "timestamp": "datetime",
            "timestamptz": "datetime"}.get(s, "string")


def role_of(table, field, is_pk, is_fk, dtype):
    if is_pk:
        return "identifier (primary key)"
    if is_fk:
        return "identifier (foreign key)"
    if field in AUDIT:
        return "provenance"
    if table in ("sample_parameter", "protein_parameter") and field in ("label", "value", "value_type", "unit", "error"):
        return "measured value"
    if field in ("concentration", "concentration_unit", "coefficient"):
        return "measured value"
    if field in K.ONTOLOGY_COLS:
        return "structured identifier"
    return "descriptor"


def cell(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat(sep=" ")
    return str(v)


def pq(files):
    return "read_parquet(['" + "','".join(files) + "'])"


def yq(s):
    """YAML double-quoted scalar (safe for colons, commas, quotes)."""
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def col_stats(con, frag, col, nrows):
    nonnull = con.execute(f"SELECT count({col}) FROM {frag}").fetchone()[0]
    distinct = con.execute(f"SELECT count(DISTINCT {col}) FROM {frag}").fetchone()[0]
    ex = con.execute(
        f"SELECT DISTINCT {col} FROM {frag} WHERE {col} IS NOT NULL LIMIT 6"
    ).fetchall()
    return nonnull, distinct, ex


def build_linkml(meta_tables):
    """Generate a LinkML YAML schema for the merged dataset + a structured view."""
    # collect slot ranges (prefer a specific range over the default string)
    slot_range = {}
    for t in meta_tables:
        for cm in t["col_meta"]:
            r = linkml_range(cm["data_type"])
            cur = slot_range.get(cm["field_name"])
            if cur is None or (cur == "string" and r != "string"):
                slot_range[cm["field_name"]] = r

    lines = []
    lines.append("id: https://w3id.org/ideas/ideas-schema")
    lines.append("name: ideas_schema")
    lines.append("title: " + yq("IDEAS enzyme-engineering dataset (BRIDGE)"))
    lines.append("description: " + yq(
        "Auto-generated LinkML schema for the merged IDEAS dataset (Argonne's BRIDGE "
        "contribution). Each class specializes a shared BRIDGE base class; measurements "
        "use the attribute/value/unit pattern with UCUM-coded units; identifiers are "
        "CURIEs; provenance is captured via a ProvenanceMixin."))
    lines.append("license: https://creativecommons.org/licenses/by/4.0/")
    lines.append("default_prefix: ideas")
    lines.append("default_range: string")
    lines.append("prefixes:")
    for p, u in K.LINKML_PREFIXES.items():
        lines.append(f"  {p}: {yq(u)}")
    lines.append("imports:")
    lines.append("  - linkml:types")

    # ---- classes ----
    lines.append("classes:")
    # provenance mixin
    lines.append("  ProvenanceMixin:")
    lines.append("    mixin: true")
    lines.append("    description: " + yq("Provenance fields required on ingested records."))
    lines.append("    slots: [created_at, updated_at, created_by]")
    # abstract base classes
    for base, desc in K.BASE_CLASS_DESC.items():
        lines.append(f"  {base}:")
        lines.append("    abstract: true")
        lines.append("    description: " + yq(desc))
    # one class per table
    classes_struct = []
    for t in meta_tables:
        name = t["name"]
        base = K.BASE_CLASS.get(name, "")
        colnames = [cm["field_name"] for cm in t["col_meta"]]
        has_prov = any(c in AUDIT for c in colnames)
        lines.append(f"  {name}:")
        lines.append("    description: " + yq(t["desc"]))
        if base:
            lines.append(f"    is_a: {base}")
        if has_prov:
            lines.append("    mixins: [ProvenanceMixin]")
        lines.append(f"    class_uri: ideas:{name}")
        slot_list = [c for c in colnames if c not in AUDIT]
        lines.append("    slots: [" + ", ".join(slot_list) + "]")
        classes_struct.append({
            "name": name, "base_class": base,
            "base_desc": K.BASE_CLASS_DESC.get(base, ""),
            "table": name, "release": t["release"], "nrows": t["nrows"],
            "n_slots": len(colnames),
            "is_measurement": base == "MeasurementValue",
            "slots": [{"name": cm["field_name"], "range": linkml_range(cm["data_type"]),
                       "is_id": cm["field_name"] == "id",
                       "is_fk": bool(cm["is_foreign_key"]),
                       "unit": cm["field_name"] == "unit",
                       "release": cm["release"]}
                      for cm in t["col_meta"]],
        })

    # ---- slots ----
    lines.append("slots:")
    for s in sorted(slot_range):
        rng = "uriorcurie" if s == "id" else slot_range[s]
        lines.append(f"  {s}:")
        lines.append(f"    range: {rng}")
        if s == "id":
            lines.append("    identifier: true")
            lines.append("    id_prefixes: [SMP, EXP, PROT, RXN, RCT]")
            lines.append("    description: " + yq("Persistent CURIE identifier for the record."))
        elif s == "unit":
            lines.append("    description: " + yq("Unit of the measured value; values are coded per UCUM."))
            lines.append("    annotations:")
            lines.append("      ontology: " + yq("UCUM / UO"))
        elif s == "label":
            lines.append("    description: " + yq("The measured attribute name (EAV attribute)."))
        elif s == "value":
            lines.append("    description: " + yq("The measured value (EAV value)."))
        elif s in AUDIT:
            lines.append("    description: " + yq(K.AUDIT_DESC.get(s, "")))
    yaml_text = "\n".join(lines) + "\n"

    # base-class grouping for the page
    bases = []
    for base, desc in K.BASE_CLASS_DESC.items():
        tbls = [t["name"] for t in meta_tables if K.BASE_CLASS.get(t["name"]) == base]
        if tbls:
            bases.append({"name": base, "desc": desc, "tables": tbls})

    # unit table
    units = []
    for u, code in K.UNIT_UCUM.items():
        units.append({"unit": u, "ucum": code})

    linkml_struct = {
        "schema_id": "https://w3id.org/ideas/ideas-schema",
        "name": "ideas_schema",
        "n_classes": len(classes_struct),
        "n_slots": len(slot_range),
        "bases": bases,
        "classes": classes_struct,
        "units": units,
        "prefixes": [{"prefix": p, "uri": u} for p, u in K.LINKML_PREFIXES.items()],
        "rules": [{"rule": r, "how_ideas_meets": h} for r, h in K.LINKML_RULES],
        "yaml": yaml_text,
        "download": "downloads/ideas.linkml.yaml",
    }
    return yaml_text, linkml_struct


def main():
    os.makedirs(BUILD, exist_ok=True)
    parquet_dir = os.path.join(BUILD, "parquet")
    os.makedirs(parquet_dir, exist_ok=True)
    con = ir.connect()
    con.execute("SET TimeZone='UTC'")

    ice_tables = ir.tables(WAREHOUSE)
    earlier_pq = {os.path.basename(p)[:-8]: p for p in glob.glob(os.path.join(EARLIER_DIR, "*.parquet"))}
    all_tables = sorted(set(ice_tables) | set(earlier_pq))

    fk_all = list(K.FKS) + list(K.FKS_EARLIER)
    fk_children = {(c, f) for (c, f, _, _) in fk_all}
    fk_target = {(c, f): (p, pf) for (c, f, p, pf) in fk_all}

    SRC = {}              # table -> source info
    meta_tables = []
    dd_rows = []
    enriched = []
    sqlite_specs = {}
    sqlite_data = {}
    iceberg_info = []
    curie_prefixes = {}
    rows_new_ct, rows_old_ct = {}, {}

    for t in all_tables:
        in_new = t in ice_tables
        in_old = t in earlier_pq
        release = "both" if (in_new and in_old) else ("tetrad_v1" if in_new else "earlier")

        new_frag = pq(ir.live_data_files(WAREHOUSE, t, con)) if in_new else None
        old_frag = f"read_parquet('{earlier_pq[t]}')" if in_old else None
        new_cols = set(con.sql(f"SELECT * FROM {new_frag}").columns) if in_new else set()
        old_cols = set(con.sql(f"SELECT * FROM {old_frag}").columns) if in_old else set()
        if in_new:
            rows_new_ct[t] = con.execute(f"SELECT count(*) FROM {new_frag}").fetchone()[0]
        if in_old:
            rows_old_ct[t] = con.execute(f"SELECT count(*) FROM {old_frag}").fetchone()[0]

        primary = new_frag if in_new else old_frag
        rel = con.sql(f"SELECT * FROM {primary}")
        cols = list(rel.columns)
        types = [str(x) for x in rel.types]
        nrows = con.execute(f"SELECT count(*) FROM {primary}").fetchone()[0]

        SRC[t] = {"release": release, "primary": primary, "primary_cols": set(cols),
                  "new_frag": new_frag, "old_frag": old_frag,
                  "new_cols": new_cols, "old_cols": old_cols, "nrows": nrows}

        # write per-table parquet (primary data) for download/explore
        con.execute(f"COPY (SELECT * FROM {primary}) TO "
                    f"'{os.path.join(parquet_dir, t + '.parquet')}' (FORMAT PARQUET)")

        rows_raw = con.execute(f"SELECT * FROM {primary}").fetchall()
        rows = [[cell(v) for v in r] for r in rows_raw]

        bclass, desc = K.TABLE_DESC.get(t, ("", t))
        col_meta = []
        filled_cells = 0

        def make_cm(c, ty, frag, col_release, is_removed):
            is_pk = (c == "id")
            is_fk = (t, c) in fk_children
            ftab, ffield = fk_target.get((t, c), ("", ""))
            nonnull, distinct, ex = col_stats(con, frag, c, None)
            n_here = con.execute(f"SELECT count(*) FROM {frag}").fetchone()[0]
            missing = n_here - nonnull
            examples = "; ".join(str(x[0]) for x in ex)
            desc_col = K.COL_DESC.get(f"{t}.{c}") or K.AUDIT_DESC.get(c) or ""
            onto = K.ONTOLOGY_COLS.get(c, "")
            return {
                "table_name": t, "field_name": c,
                "data_type": ty, "short_type": short_type(ty),
                "is_nullable": "no" if (is_pk or missing == 0) else "yes",
                "is_primary_key": "yes" if is_pk else "",
                "is_foreign_key": "yes" if is_fk else "",
                "foreign_table": ftab, "foreign_field": ffield,
                "relationship_status": "", "role": role_of(t, c, is_pk, is_fk, ty),
                "description": desc_col, "scientific_meaning": desc_col,
                "example_values": examples, "unit": "", "ontology": onto,
                "controlled_vocabulary": "", "allowed_values": [],
                "unique_count": distinct, "missing_count": missing,
                "missing_percent": round(100 * missing / n_here, 1) if n_here else 0.0,
                "interpretation_confidence": "high" if desc_col else "medium",
                "is_numeric": ty.upper() in NUMERIC_TYPES,
                "release": col_release, "is_removed": is_removed,
            }, nonnull

        for c, ty in zip(cols, types):
            if release == "both":
                col_release = "both" if c in old_cols else "tetrad_v1"
            else:
                col_release = release
            cm, nonnull = make_cm(c, ty, primary, col_release, False)
            filled_cells += nonnull
            col_meta.append(cm)
            dd_rows.append(cm)
            enriched.append(cm)
            sqlite_specs.setdefault(t, []).append((c, sqlite_type(ty)))
            if cm["is_primary_key"] or cm["is_foreign_key"]:
                for (val,) in con.execute(
                        f"SELECT DISTINCT {c} FROM {primary} WHERE {c} IS NOT NULL LIMIT 6").fetchall():
                    s = str(val)
                    if ":" in s and not s.startswith("http"):
                        pre = s.split(":", 1)[0]
                        if pre and not pre.isdigit() and len(pre) <= 12:
                            d = curie_prefixes.setdefault(pre, {"example": s, "count": 0})
                            d["count"] += 1

        # removed columns (present in earlier but dropped in tetrad_v1) — documented,
        # flagged, with real earlier-release stats, but not merged into the row grid.
        if release == "both":
            removed = [c for c in old_cols if c not in new_cols]
            if removed:
                otypes = {r[0]: str(r[1]) for r in
                          con.execute(f"DESCRIBE SELECT * FROM {old_frag}").fetchall()}
                for c in removed:
                    cm, _ = make_cm(c, otypes.get(c, "VARCHAR"), old_frag, "earlier", True)
                    col_meta.append(cm)
                    dd_rows.append(cm)
                    enriched.append(cm)

        completeness = round(100 * filled_cells / (nrows * len(cols)), 1) if nrows and cols else 0.0
        meta_tables.append({
            "name": t, "group": "populated" if nrows else "empty",
            "bridge_class": bclass, "desc": desc, "release": release,
            "nrows": nrows, "ncols": len(cols),
            "columns": cols, "completeness": completeness,
            "col_meta": col_meta, "rows": rows,
        })
        sqlite_data[t] = rows_raw

        # iceberg snapshot history (new tables only)
        if in_new:
            meta, _ = ir.current_meta(WAREHOUSE, t)
            files = ir.live_data_files(WAREHOUSE, t, con)
            snaps = []
            for s in meta.get("snapshots", []):
                summ = s.get("summary", {})
                snaps.append({
                    "snapshot_id": str(s["snapshot-id"]),
                    "timestamp": dt.datetime.fromtimestamp(
                        s["timestamp-ms"] / 1000, dt.timezone.utc).isoformat().replace("+00:00", "Z"),
                    "operation": summ.get("operation", ""),
                    "records": int(summ.get("total-records", 0) or 0),
                    "data_files": int(summ.get("total-data-files", 0) or 0),
                    "is_current": s["snapshot-id"] == meta.get("current-snapshot-id"),
                })
            data_files_meta = [{"name": os.path.basename(f), "bytes": os.path.getsize(f)} for f in files]
            iceberg_info.append({
                "name": t, "format_version": meta.get("format-version"),
                "current_snapshot": str(meta.get("current-snapshot-id")),
                "n_metadata_versions": len([x for x in os.listdir(os.path.join(WAREHOUSE, t, "metadata"))
                                            if x.endswith(".metadata.json")]),
                "n_snapshots": len(snaps),
                "snapshots": sorted(snaps, key=lambda x: x["timestamp"]),
                "current_data_files": data_files_meta,
                "current_bytes": sum(d["bytes"] for d in data_files_meta),
                "iceberg_version": next(
                    (s.get("summary", {}).get("iceberg-version") for s in meta.get("snapshots", [])
                     if s["snapshot-id"] == meta.get("current-snapshot-id")), ""),
                "schema": [{"id": cid, "name": nm, "type": str(ty), "required": req}
                           for (cid, nm, ty, req) in ir.iceberg_schema(meta)],
            })

    TBL = {t["name"]: t for t in meta_tables}

    # ---- relationships (verify coverage; pick the frag that has the child field) ----
    relationships = []
    for (ct, cf, pt, pf) in fk_all:
        if ct not in TBL or pt not in TBL:
            continue
        s = SRC[ct]
        if cf in s["primary_cols"]:
            cfrag = s["primary"]
        elif s["old_frag"] and cf in s["old_cols"]:
            cfrag = s["old_frag"]
        else:
            continue
        pfrag = SRC[pt]["primary"]
        try:
            n_child = con.execute(f"SELECT count({cf}) FROM {cfrag}").fetchone()[0]
            n_distinct = con.execute(f"SELECT count(DISTINCT {cf}) FROM {cfrag}").fetchone()[0]
            if n_child == 0:
                cov, orphans, status = None, None, "uncertain"
            else:
                matched = con.execute(
                    f"SELECT count(*) FROM {cfrag} c WHERE c.{cf} IS NOT NULL AND "
                    f"CAST(c.{cf} AS VARCHAR) IN (SELECT CAST({pf} AS VARCHAR) FROM {pfrag})"
                ).fetchone()[0]
                cov = round(100 * matched / n_child, 1)
                orphans = n_child - matched
                status = "inferred" if cov >= 100 else "uncertain"
        except Exception:
            cov, orphans, status, n_child, n_distinct = None, None, "uncertain", 0, 0
        cross = (SRC[ct]["release"] != SRC[pt]["release"])
        relationships.append({
            "child_table": ct, "child_field": cf,
            "parent_table": pt, "parent_field": pf,
            "status": status, "declared": False,
            "n_child_values": n_child, "n_distinct_child": n_distinct,
            "coverage_percent": cov, "parent_empty": SRC[pt]["nrows"] == 0,
            "orphans": orphans, "cross_release": cross,
        })
        for cm in TBL[ct]["col_meta"]:
            if cm["field_name"] == cf:
                cm["relationship_status"] = status

    # ---- units used (both releases) ----
    units_used = {}

    def add_units(frag, col):
        for u, n in con.execute(
                f"SELECT {col}, count(*) FROM {frag} WHERE {col} IS NOT NULL AND {col} <> '' "
                f"GROUP BY {col}").fetchall():
            units_used[u] = units_used.get(u, 0) + n

    if "sample_parameter" in SRC:
        add_units(SRC["sample_parameter"]["primary"], "unit")
    if "sample_reactant" in SRC:
        add_units(SRC["sample_reactant"]["primary"], "concentration_unit")
    # earlier measurement units
    if SRC.get("sample_parameter", {}).get("old_frag"):
        add_units(SRC["sample_parameter"]["old_frag"], "unit")
    if "protein_parameter" in SRC:
        add_units(SRC["protein_parameter"]["primary"], "unit")

    # ---- dbxref summary ----
    dbxref_summary = {}
    if "idea_dbxref" in SRC:
        dx = SRC["idea_dbxref"]["primary"]
        for db, acc in con.execute(
                f"SELECT database_name, accession FROM {dx} WHERE accession IS NOT NULL").fetchall():
            dbxref_summary.setdefault(db, [])
            if acc not in dbxref_summary[db]:
                dbxref_summary[db].append(acc)

    # ---- measurement catalogue (events + EAV params from BOTH releases) ----
    meas_events = []
    if "idea_measurement" in SRC:
        im = SRC["idea_measurement"]["primary"]
        for ty, n in con.execute(
                f"SELECT type, count(*) FROM {im} GROUP BY type ORDER BY count(*) DESC").fetchall():
            meas_events.append({"type": ty, "count": n})

    def eav_from(frag, source_table, release, has_vt):
        out = []
        vt = "value_type," if has_vt else "NULL AS value_type,"
        for row in con.execute(f"""
            SELECT label, unit, {vt} count(*) n,
                   min(TRY_CAST(value AS DOUBLE)), median(TRY_CAST(value AS DOUBLE)),
                   max(TRY_CAST(value AS DOUBLE))
            FROM {frag} GROUP BY label, unit, {'value_type' if has_vt else "'x'"}
            ORDER BY n DESC""").fetchall():
            label, unit, vtv, n, mn, md, mx = row
            q, kind, meaning = K.PARAM_DESC.get(label, ("Other", "measurement", ""))
            out.append({
                "label": label, "unit": unit or "", "value_type": vtv, "records": n,
                "min": mn, "median": md, "max": mx,
                "quantity": q, "kind": kind, "meaning": meaning,
                "release": release, "source_table": source_table,
                "ucum": K.UNIT_UCUM.get(unit or "", ""),
            })
        return out

    eav_params = []
    if "sample_parameter" in SRC:
        eav_params += eav_from(SRC["sample_parameter"]["primary"], "sample_parameter",
                               "tetrad_v1" if SRC["sample_parameter"]["release"] != "earlier" else "earlier",
                               "value_type" in SRC["sample_parameter"]["primary_cols"])
        if SRC["sample_parameter"].get("old_frag"):
            eav_params += eav_from(SRC["sample_parameter"]["old_frag"], "sample_parameter (earlier)",
                                   "earlier", False)
    if "protein_parameter" in SRC:
        eav_params += eav_from(SRC["protein_parameter"]["primary"], "protein_parameter", "earlier", False)

    # ---- releases summary (what changed earlier -> tetrad_v1) ----
    only_earlier = sorted(set(earlier_pq) - set(ice_tables))
    only_new = sorted(set(ice_tables) - set(earlier_pq))
    both_t = sorted(set(ice_tables) & set(earlier_pq))
    per_table = []
    for t in all_tables:
        per_table.append({
            "table": t, "release": SRC[t]["release"],
            "rows_earlier": rows_old_ct.get(t), "rows_new": rows_new_ct.get(t),
        })
    added_cols, removed_cols = [], []
    for t in meta_tables:
        for cm in t["col_meta"]:
            if cm["release"] == "tetrad_v1" and cm["field_name"] not in AUDIT:
                added_cols.append(f"{t['name']}.{cm['field_name']}")
            if cm["release"] == "earlier" and cm.get("is_removed"):
                removed_cols.append(f"{t['name']}.{cm['field_name']}")
    releases = {
        "legend": [
            {"state": "both", "symbol": "=", "label": "in both releases"},
            {"state": "tetrad_v1", "symbol": "+", "label": "added in tetrad_v1"},
            {"state": "earlier", "symbol": "−", "label": "only in earlier release (dropped)"},
        ],
        "earlier": {"name": "earlier release (all-text parquet)",
                    "n_tables": len(earlier_pq), "n_rows": sum(rows_old_ct.values())},
        "tetrad_v1": {"name": "tetrad_v1 (typed Iceberg)",
                      "n_tables": len(ice_tables), "n_rows": sum(rows_new_ct.values())},
        "tables_both": both_t, "tables_only_earlier": only_earlier, "tables_only_new": only_new,
        "per_table": per_table,
        "added_columns": added_cols, "removed_columns": removed_cols,
        "audit_note": "tetrad_v1 also added provenance columns (created_at, updated_at, created_by) "
                      "to every shared table, and typed all columns (int / real / date / boolean / "
                      "timestamp) — the earlier release stored everything as text.",
        "essential_missing": [{"item": it, "why": why} for it, why in K.ESSENTIAL_MISSING],
        "summary": [
            f"tetrad_v1 has {len(ice_tables)} tables; the earlier release had {len(earlier_pq)}. "
            f"{len(only_earlier)} tables were dropped: {', '.join(only_earlier)}.",
            f"Row totals: earlier {sum(rows_old_ct.values())} rows, tetrad_v1 "
            f"{sum(rows_new_ct.values())} rows (tetrad_v1 grew the surviving assay tables but lost "
            f"whole categories of data).",
            "tetrad_v1 gained real types, provenance columns and the actual assay readouts "
            "(titer, conversion, mass-spec intensity); it lost the reaction conditions, the computed "
            "protein metrics (protein_parameter) and the design / compute / method / people tables.",
            "This portal shows the UNION: the earlier tables and measurements are restored and every "
            "table / column / parameter is flagged by which release it came from.",
        ],
    }

    # ---- findings ----
    findings = []
    for r in relationships:
        if r["orphans"]:
            findings.append({"severity": "warning", "table": r["child_table"],
                             "finding": f"{r['child_table']}.{r['child_field']} → "
                             f"{r['parent_table']}.{r['parent_field']} has {r['orphans']} value(s) "
                             f"with no matching parent ({r['coverage_percent']}% coverage)."})
    findings.append({"severity": "info", "table": "(releases)",
                     "finding": f"This is the UNION of two releases. {len(only_earlier)} tables and "
                     "the richer measurement parameters come from the earlier release; tetrad_v1 "
                     "supplies typed values and the assay readouts. See the 'What changed' panel on "
                     "the Overview and the release flags throughout."})
    findings.append({"severity": "info", "table": "(warehouse)",
                     "finding": "tetrad_v1 is an Apache Iceberg v2 export; only each table's CURRENT "
                     "snapshot is loaded. Older snapshots are browsable on the Iceberg & Files page."})

    # ---- CURIE / identifier summary ----
    curie_meaning = {"SMP": "IDEAS sample", "EXP": "IDEAS experiment", "PROT": "IDEAS protein",
                     "RXN": "IDEAS reaction", "RCT": "IDEAS reactant", "IDEA_PROT": "IDEAS protein",
                     "IDEA_MUT": "IDEAS variant", "IDEA_RXN": "IDEAS reaction",
                     "IDEA_AI": "IDEAS AI design", "CHEBI": "ChEBI compound"}
    identifiers = {
        "curie_prefixes": [
            {"prefix": p, "example": d["example"], "count": d["count"], "meaning": curie_meaning.get(p, "")}
            for p, d in sorted(curie_prefixes.items(), key=lambda kv: -kv[1]["count"])],
        "dbxref_databases": [
            {"database": db, "n_accessions": len(a), "examples": a[:5]}
            for db, a in sorted(dbxref_summary.items())],
    }

    # ---- ERD mermaid ----
    mer = ["erDiagram"]
    for t in meta_tables:
        mer.append(f"  {t['name']} {{")
        for cm in t["col_meta"][:12]:
            key = "PK" if cm["is_primary_key"] else ("FK" if cm["is_foreign_key"] else "")
            mer.append(f"    {cm['short_type']} {cm['field_name']} {key}".rstrip())
        mer.append("  }")
    for r in relationships:
        mer.append(f'  {r["parent_table"]} ||--o{{ {r["child_table"]} : "{r["child_field"]}"')
    erd_mermaid = "\n".join(mer)

    # ---- LinkML schema ----
    linkml_yaml, linkml_struct = build_linkml(meta_tables)
    with open(os.path.join(BUILD, "ideas.linkml.yaml"), "w") as fh:
        fh.write(linkml_yaml)

    # ---- downloads: zips + earlier sample_parameter parquet ----
    if os.path.exists(WAREHOUSE_ZIP_SRC):
        shutil.copy(WAREHOUSE_ZIP_SRC, os.path.join(BUILD, "tetrad_v1_iceberg.zip"))
    if SRC.get("sample_parameter", {}).get("old_frag"):
        con.execute(f"COPY (SELECT * FROM {SRC['sample_parameter']['old_frag']}) TO "
                    f"'{os.path.join(parquet_dir, 'sample_parameter__earlier.parquet')}' (FORMAT PARQUET)")
    earlier_zip = os.path.join(BUILD, "ideas_earlier_parquet.zip")
    with zipfile.ZipFile(earlier_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for name, path in sorted(earlier_pq.items()):
            z.write(path, arcname=f"earlier_release/{name}.parquet")

    files_inventory = []
    for p in sorted(glob.glob(os.path.join(parquet_dir, "*.parquet"))):
        files_inventory.append({"name": os.path.basename(p), "bytes": os.path.getsize(p)})

    # ---- SQLite (all 21 tables) + dump ----
    dbpath = os.path.join(BUILD, "ideas.db")
    if os.path.exists(dbpath):
        os.remove(dbpath)
    sq = sqlite3.connect(dbpath)
    for t in all_tables:
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
    dd_cols = ["table_name", "field_name", "data_type", "role", "release", "is_primary_key",
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
        "source_format": "Union of tetrad_v1 (Apache Iceberg v2) + earlier parquet release",
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
        "project": K.PROJECT,
        "releases": releases,
        "hackathon": K.HACKATHON,
        "linkml": linkml_struct,
        "iceberg": {
            "format": "Apache Iceberg v2",
            "warehouse": os.path.basename(WAREHOUSE),
            "note": "Each tetrad_v1 table is an Iceberg table with data/*.parquet and metadata/ "
                    "(metadata.json, manifest & snapshot .avro). Only the current snapshot is "
                    "loaded. Earlier-release tables are plain parquet (not shown here).",
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

    print(f"OK  UNION: {len(meta_tables)} tables ({len(both_t)} both, {len(only_earlier)} earlier-only), "
          f"{total_rows} rows, {total_cols} cols")
    print(f"    earlier: {releases['earlier']['n_tables']} tables / {releases['earlier']['n_rows']} rows | "
          f"tetrad_v1: {releases['tetrad_v1']['n_tables']} tables / {releases['tetrad_v1']['n_rows']} rows")
    print(f"    relationships: {len(relationships)} "
          f"({sum(1 for r in relationships if r['status']=='inferred')} inferred)")
    print(f"    measurement params: {len(eav_params)} (across both releases)  events: "
          f"{metadata['measurements']['n_events']}")
    print(f"    LinkML: {linkml_struct['n_classes']} classes / {linkml_struct['n_slots']} slots "
          f"-> build/ideas.linkml.yaml")


if __name__ == "__main__":
    main()
