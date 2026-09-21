#!/usr/bin/env python3
"""
IDEAS-DB deep analysis + build pipeline.

Reads every parquet in SRC, cross-references the SQL DDL and the shipped
data_dictionary.json, computes per-column statistics, infers/validates
relationships (declared vs inferred vs uncertain), detects ontologies /
DB cross-references, and emits:

  build/ideas.db            SQLite database (source-faithful, all TEXT)
  build/ideas_dump.sql      SQL dump (schema + data) for download
  build/data_dictionary.csv comprehensive per-field dictionary
  build/data_dictionary.enriched.json
  build/metadata.json       everything the website renders

Run:  PYTHONPATH=./.pylibs python3 analyze.py
"""
import duckdb, sqlite3, json, os, re, glob, csv, hashlib, datetime, statistics

SRC   = "/home/janakae/claude_projects/Ideas-DB"
HERE  = "/home/janakae/claude_projects/Ideas-DB-portal"
BUILD = os.path.join(HERE, "build")
os.makedirs(BUILD, exist_ok=True)

con = duckdb.connect()

# ---------------------------------------------------------------- inputs
parquets = sorted(glob.glob(os.path.join(SRC, "*.parquet")))
TABLES   = [os.path.basename(p)[:-8] for p in parquets]
PQ       = {os.path.basename(p)[:-8]: p for p in parquets}

with open(os.path.join(SRC, "data_dictionary.json")) as fh:
    DICT = json.load(fh)
with open(os.path.join(SRC, "ideas_min_schema.sql")) as fh:
    DDL = fh.read()

# ---------------------------------------------------------------- DDL parse
# Declared column types, nullability hints, PKs, and FK references.
ddl_types, ddl_pk, ddl_fk = {}, {}, {}   # table -> {...}
for m in re.finditer(r"CREATE TABLE\s+(\w+)\s*\((.*?)\n\);", DDL, re.S):
    tbl, body = m.group(1), m.group(2)
    ddl_types.setdefault(tbl, {}); ddl_pk.setdefault(tbl, set()); ddl_fk.setdefault(tbl, {})
    for raw in body.split("\n"):
        line = raw.strip().rstrip(",")
        if not line or line.startswith("--"):
            continue
        line = line.split("--")[0].strip().rstrip(",")
        parts = line.split()
        if len(parts) < 2:
            continue
        col = parts[0]
        if col.upper() in ("PRIMARY", "FOREIGN", "CONSTRAINT", "CREATE"):
            continue
        typ = parts[1]
        ddl_types[tbl][col] = typ
        if "PRIMARY KEY" in line.upper():
            ddl_pk[tbl].add(col)
        rm = re.search(r"REFERENCES\s+(\w+)\s*\((\w+)\)", line)
        if rm:
            ddl_fk[tbl][col] = (rm.group(1), rm.group(2))

# ---------------------------------------------------------------- FK map (naming)
# column-name -> (target_table, target_field). External KBase ids excluded (dbxref).
NAME_FK = {
    "idea_protein_id":  ("idea_protein", "id"),
    "idea_mutant_id":   ("idea_mutant", "id"),
    "idea_reactant_id": ("idea_reactant", "id"),
    "idea_reaction_id": ("idea_reaction", "id"),
    "sample_id":        ("idea_sample", "id"),
    "experiment_id":    ("idea_experiment", "id"),
    "strain_id":        ("idea_strain", "id"),
    "parent_sample_id": ("idea_sample", "id"),
    "parent_strain_id": ("idea_strain", "id"),
    "measurement_id":   ("idea_measurement", "id"),
    "reference_measurement_id": ("idea_measurement", "id"),
    "computation_id":   ("computation", "id"),
    "ai_design_id":     ("ai_design", "id"),
    "procedure_id":     ("idea_procedure", "id"),
    "protocol_id":      ("idea_protocol", "id"),
    "lab_id":           ("idea_lab", "id"),
    "contact_id":       ("idea_people", "id"),
    "mutant_id":        ("idea_mutant", "id"),
    "reference_mutant_id": ("idea_mutant", "id"),
}
EXTERNAL_ID_COLS = {"kb_protein_id", "kb_genome_id", "kb_metabolite_id",
                    "kb_reaction_id", "entity_id"}

ONTOLOGY_HINTS = {
    "smiles": "SMILES (Daylight chemical line notation)",
    "inchi": "InChI (IUPAC International Chemical Identifier)",
    "inchi_key": "InChIKey (hashed InChI)",
    "molecular_formula": "Molecular formula (Hill notation)",
    "smarts": "SMARTS (reaction/substructure pattern)",
    "kb_protein_id": "KBase protein identifier",
    "kb_genome_id": "KBase genome identifier",
    "kb_metabolite_id": "KBase / ModelSEED compound identifier",
    "kb_reaction_id": "KBase / ModelSEED reaction identifier",
    "structure_url": "RCSB PDB structure reference",
    "mutations": "HGVS-like protein variant notation (e.g. A219M)",
}

# ---------------------------------------------------------------- load SQLite
sqlite_path = os.path.join(BUILD, "ideas.db")
if os.path.exists(sqlite_path):
    os.remove(sqlite_path)
sq = sqlite3.connect(sqlite_path)

def q(name):  # safe identifier
    return '"' + name.replace('"', '""') + '"'

table_meta = {}
for t in TABLES:
    rows = con.execute(f"SELECT * FROM read_parquet('{PQ[t]}')").fetchall()
    cols = [c[0] for c in con.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{PQ[t]}')").fetchall()]
    # create source-faithful TEXT table
    ddl_cols = ", ".join(f"{q(c)} TEXT" for c in cols)
    sq.execute(f"CREATE TABLE {q(t)} ({ddl_cols});")
    if rows:
        ph = ",".join("?" * len(cols))
        sq.executemany(f"INSERT INTO {q(t)} VALUES ({ph})",
                       [tuple("" if v is None else str(v) for v in r) for r in rows])
    table_meta[t] = {"cols": cols, "nrows": len(rows), "rows": rows}
sq.commit()

# ---------------------------------------------------------------- parent id sets
id_sets = {}
for t in TABLES:
    cols = table_meta[t]["cols"]
    if "id" in cols:
        i = cols.index("id")
        id_sets[t] = {str(r[i]) for r in table_meta[t]["rows"] if r[i] not in (None, "")}
    else:
        id_sets[t] = set()

# ---------------------------------------------------------------- column stats
NUM_RE = re.compile(r"^-?\d+(\.\d+)?([eE][-+]?\d+)?$")

def col_stats(t, col):
    cols = table_meta[t]["cols"]; idx = cols.index(col)
    vals = [r[idx] for r in table_meta[t]["rows"]]
    nrows = len(vals)
    present = [str(v) for v in vals if v not in (None, "")]
    missing = nrows - len(present)
    uniq = sorted(set(present))
    numeric = [float(v) for v in present if NUM_RE.match(v)]
    is_numeric = len(present) > 0 and len(numeric) == len(present)
    st = {
        "missing_count": missing,
        "missing_percent": round(100 * missing / nrows, 1) if nrows else 0.0,
        "unique_count": len(uniq),
        "example_values": present[:6],
        "is_numeric": is_numeric,
    }
    if is_numeric and numeric:
        st["min"] = min(numeric); st["max"] = max(numeric)
        st["mean"] = round(statistics.fmean(numeric), 4)
    # categorical if low cardinality relative to rows
    st["is_categorical"] = (0 < len(uniq) <= 12 and (nrows == 0 or len(uniq) <= max(2, nrows/2))
                            and not is_numeric)
    if st["is_categorical"]:
        st["allowed_values"] = uniq
    return st

# ---------------------------------------------------------------- relationships
relationships = []   # dicts: child_table/col -> parent_table/field, status, coverage
for t in TABLES:
    cols = table_meta[t]["cols"]
    for col in cols:
        if col == "id" or not (col.endswith("_id") or col in NAME_FK):
            continue
        if col in EXTERNAL_ID_COLS:
            continue
        target = None
        declared = col in ddl_fk.get(t, {})
        if declared:
            target = ddl_fk[t][col]
        elif col in NAME_FK:
            target = NAME_FK[col]
        if not target:
            continue
        ptbl, pfield = target
        idx = cols.index(col)
        childvals = {str(r[idx]) for r in table_meta[t]["rows"] if r[idx] not in (None, "")}
        parent = id_sets.get(ptbl, set())
        matched = len([v for v in childvals if v in parent]) if parent else 0
        coverage = round(100 * matched / len(childvals), 1) if childvals else None
        if declared:
            status = "declared"
        elif parent and childvals and coverage == 100.0:
            status = "inferred"
        else:
            status = "uncertain"
        relationships.append({
            "child_table": t, "child_field": col,
            "parent_table": ptbl, "parent_field": pfield,
            "status": status, "declared": declared,
            "n_child_values": len(childvals),
            "n_distinct_child": len(childvals),
            "coverage_percent": coverage,
            "parent_empty": len(parent) == 0,
            "orphans": (len(childvals) - matched) if parent else None,
        })

# ---------------------------------------------------------------- data dictionary
dict_rows = []
for t in TABLES:
    cols = table_meta[t]["cols"]
    ddesc = DICT.get(t, {}).get("desc", "")
    coldesc = DICT.get(t, {}).get("cols", {})
    fk_by_col = {r["child_field"]: r for r in relationships if r["child_table"] == t}
    for col in cols:
        st = col_stats(t, col)
        is_pk = (col == "id")
        is_declared_pk = col in ddl_pk.get(t, set())
        fk = fk_by_col.get(col)
        ont = ONTOLOGY_HINTS.get(col, "")
        # confidence heuristic
        conf = "high" if (col in coldesc or is_pk) else "medium"
        if fk and fk["status"] == "uncertain":
            conf = "low"
        # scientific meaning: reuse dict description
        desc = coldesc.get(col, "")
        # classify role
        if is_pk:
            role = "identifier (primary key)"
        elif fk:
            role = "identifier (foreign key)"
        elif col in EXTERNAL_ID_COLS:
            role = "identifier (external cross-reference)"
        elif col in ("created_at", "updated_at", "created_by", "timestamp", "run_date", "start_date"):
            role = "metadata (audit/provenance)"
        elif st["is_numeric"]:
            role = "measurement / numeric"
        elif st["is_categorical"]:
            role = "category"
        elif col in ("value",) :
            role = "measurement (EAV value)"
        else:
            role = "descriptive / free-text"
        dict_rows.append({
            "table_name": t,
            "field_name": col,
            "data_type": "TEXT (source) / " + ddl_types.get(t, {}).get(col, "n/a") + " (intended)",
            "is_nullable": "yes" if st["missing_count"] > 0 or not is_pk else "no",
            "is_primary_key": "yes" if is_pk else "",
            "is_foreign_key": "yes" if fk else "",
            "foreign_table": fk["parent_table"] if fk else "",
            "foreign_field": fk["parent_field"] if fk else "",
            "relationship_status": fk["status"] if fk else "",
            "role": role,
            "description": desc,
            "scientific_meaning": desc,
            "example_values": " | ".join(st["example_values"]),
            "unit": "",  # units live in the data (unit column); filled below for value tables
            "ontology": ont,
            "controlled_vocabulary": ", ".join(st.get("allowed_values", [])) if st.get("is_categorical") else "",
            "allowed_values": st.get("allowed_values", []),
            "unique_count": st["unique_count"],
            "missing_count": st["missing_count"],
            "missing_percent": st["missing_percent"],
            "interpretation_confidence": conf,
            "notes": ("external DB id" if col in EXTERNAL_ID_COLS else ""),
            **{k: st[k] for k in ("min", "max", "mean") if k in st},
            "is_numeric": st["is_numeric"],
            "is_categorical": st["is_categorical"],
        })

# units actually used (from unit / concentration_unit columns)
units_used = {}
for t in TABLES:
    cols = table_meta[t]["cols"]
    for uc in ("unit", "concentration_unit"):
        if uc in cols:
            idx = cols.index(uc)
            for r in table_meta[t]["rows"]:
                v = r[idx]
                if v not in (None, ""):
                    units_used[str(v)] = units_used.get(str(v), 0) + 1

# ontologies / dbxref summary
dbx = table_meta.get("idea_dbxref", {})
dbxref_summary = {}
if dbx:
    cols = dbx["cols"]; di = cols.index("database_name"); ai = cols.index("accession")
    for r in dbx["rows"]:
        db = str(r[di])
        dbxref_summary.setdefault(db, []).append(str(r[ai]))

# ---------------------------------------------------------------- integrity findings
findings = []
# 1. empty tables
for t in TABLES:
    if table_meta[t]["nrows"] == 0:
        findings.append({"severity": "info", "table": t,
                         "finding": "Table is empty in this release (provenance/platform backbone)."})
# 2. schema-design features absent from delivered parquet
sp_cols = table_meta["sample_parameter"]["cols"]
if "idea_reactant_id" not in sp_cols:
    findings.append({"severity": "warning", "table": "sample_parameter",
        "finding": "Design decision G1 (add analyte FK idea_reactant_id) is NOT present in the delivered parquet — product-scoped values are disambiguated only via the free-text 'label'."})
if "value_type" not in sp_cols:
    findings.append({"severity": "info", "table": "sample_parameter",
        "finding": "v9 field 'value_type' (real|int|text discriminator) absent from delivered parquet; value stored as TEXT."})
if "protein_comparison" not in TABLES:
    findings.append({"severity": "warning", "table": "protein_comparison",
        "finding": "Documented in data_dictionary.json but NO parquet delivered — fold-change-to-WT comparisons are absent (or folded into protein_parameter)."})
# 3. columns in parquet not documented in data_dictionary.json
for t in TABLES:
    documented = set(DICT.get(t, {}).get("cols", {}).keys())
    for c in table_meta[t]["cols"]:
        if c not in documented:
            findings.append({"severity": "info", "table": t,
                "finding": f"Column '{c}' present in data but not described in data_dictionary.json."})
# 4. FK orphans / uncertain
for r in relationships:
    if r["status"] == "uncertain" and not r["parent_empty"] and r["orphans"]:
        findings.append({"severity": "warning", "table": r["child_table"],
            "finding": f"{r['child_field']} → {r['parent_table']}.{r['parent_field']}: {r['orphans']} value(s) with no matching parent (coverage {r['coverage_percent']}%)."})
    if r["status"] == "uncertain" and r["parent_empty"]:
        findings.append({"severity": "info", "table": r["child_table"],
            "finding": f"{r['child_field']} references {r['parent_table']} but that table is empty — relationship unverifiable."})

# ---------------------------------------------------------------- completeness per table
completeness = {}
for t in TABLES:
    cols = table_meta[t]["cols"]; nrows = table_meta[t]["nrows"]
    cells = nrows * len(cols)
    filled = 0
    for col in cols:
        idx = cols.index(col)
        filled += len([1 for r in table_meta[t]["rows"] if r[idx] not in (None, "")])
    completeness[t] = round(100 * filled / cells, 1) if cells else 0.0

# ---------------------------------------------------------------- SQL dump
dump_path = os.path.join(BUILD, "ideas_dump.sql")
with open(dump_path, "w") as fh:
    fh.write("-- IDEAS-DB SQL dump (SQLite dialect) — generated %s\n" % datetime.date.today())
    fh.write("-- Source: %d parquet tables from %s\n" % (len(TABLES), SRC))
    fh.write("-- Columns are TEXT (source is all-string); intended ANSI types are in the DDL comments below.\n")
    fh.write("BEGIN TRANSACTION;\n")
    for line in sq.iterdump():
        fh.write(line + "\n")
    fh.write("COMMIT;\n")

# ---------------------------------------------------------------- metadata bundle
tables_out = []
for t in TABLES:
    cols = table_meta[t]["cols"]
    coldicts = [d for d in dict_rows if d["table_name"] == t]
    tables_out.append({
        "name": t,
        "group": ("empty" if table_meta[t]["nrows"] == 0 else "populated"),
        "desc": DICT.get(t, {}).get("desc", ""),
        "nrows": table_meta[t]["nrows"],
        "ncols": len(cols),
        "columns": cols,
        "completeness": completeness[t],
        "col_meta": coldicts,
        "rows": [[("" if v is None else str(v)) for v in r] for r in table_meta[t]["rows"]],
    })

metadata = {
    "generated": datetime.datetime.now().isoformat(timespec="seconds"),
    "source_dir": SRC,
    "n_tables": len(TABLES),
    "n_populated": sum(1 for t in TABLES if table_meta[t]["nrows"] > 0),
    "total_rows": sum(table_meta[t]["nrows"] for t in TABLES),
    "total_columns": sum(len(table_meta[t]["cols"]) for t in TABLES),
    "tables": tables_out,
    "relationships": relationships,
    "units_used": units_used,
    "dbxref_summary": dbxref_summary,
    "ontology_hints": ONTOLOGY_HINTS,
    "findings": findings,
    "files": [{"name": os.path.basename(p), "bytes": os.path.getsize(p)}
              for p in parquets] + [
        {"name": "ideas_min_schema.sql", "bytes": os.path.getsize(os.path.join(SRC, "ideas_min_schema.sql"))},
        {"name": "data_dictionary.json", "bytes": os.path.getsize(os.path.join(SRC, "data_dictionary.json"))},
        {"name": "SCHEMA_DESIGN.md", "bytes": os.path.getsize(os.path.join(SRC, "SCHEMA_DESIGN.md"))},
        {"name": "README.txt", "bytes": os.path.getsize(os.path.join(SRC, "README.txt"))},
    ],
    "erd_mermaid": re.search(r"```mermaid(.*?)```", open(os.path.join(SRC, "SCHEMA_DESIGN.md")).read(), re.S).group(1).strip(),
}

with open(os.path.join(BUILD, "metadata.json"), "w") as fh:
    json.dump(metadata, fh, indent=1)

# data dictionary CSV
csv_cols = ["table_name","field_name","data_type","is_nullable","is_primary_key",
            "is_foreign_key","foreign_table","foreign_field","relationship_status","role",
            "description","scientific_meaning","example_values","unit","ontology",
            "controlled_vocabulary","unique_count","missing_count","missing_percent",
            "interpretation_confidence","notes"]
with open(os.path.join(BUILD, "data_dictionary.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=csv_cols, extrasaction="ignore")
    w.writeheader()
    for d in dict_rows:
        w.writerow(d)
with open(os.path.join(BUILD, "data_dictionary.enriched.json"), "w") as fh:
    json.dump(dict_rows, fh, indent=1)

sq.close()
print("Tables:", len(TABLES), "| populated:", metadata["n_populated"],
      "| total rows:", metadata["total_rows"])
print("Relationships:", len(relationships),
      "(declared %d, inferred %d, uncertain %d)" % (
          sum(1 for r in relationships if r["status"]=="declared"),
          sum(1 for r in relationships if r["status"]=="inferred"),
          sum(1 for r in relationships if r["status"]=="uncertain")))
print("Findings:", len(findings), "| units:", list(units_used), "| dbxref DBs:", list(dbxref_summary))
print("Wrote:", os.listdir(BUILD))
