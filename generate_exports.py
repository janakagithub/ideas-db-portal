#!/usr/bin/env python3
"""
IDEAS-DB export generator.

Reads the analysis bundle produced by analyze.py (build/metadata.json and
build/data_dictionary.enriched.json) and emits the schema / dictionary /
report / ER-export deliverables:

  build/data_dictionary.tsv
  build/schema.dbml
  build/schema_relationships.json
  build/SCHEMA_RELATIONSHIPS.md
  build/DATA_DICTIONARY.md
  build/units_report.tsv
  build/ontology_report.tsv
  build/data_quality_report.tsv
  build/schema.svg          (static field-level ER diagram)
  build/schema.png          (rasterised from the SVG when a converter exists)

Nothing here re-derives facts: every value is taken from the analysis bundle so
the exports stay consistent with the live portal.  Run analyze.py first.

Run:  python3 generate_exports.py
"""
import json, os, re, csv, subprocess, shutil, datetime

HERE  = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")

M    = json.load(open(os.path.join(BUILD, "metadata.json")))
DICT = json.load(open(os.path.join(BUILD, "data_dictionary.enriched.json")))
TABLES = M["tables"]
TBL    = {t["name"]: t for t in TABLES}
RELS   = M["relationships"]
TODAY  = datetime.date.today().isoformat()

# ------------------------------------------------------------------ reference maps
# Physical quantity + UCUM code for each unit token actually used in the data.
UNIT_REF = {
    "mM":                    ("concentration",              "mmol/L", "mmol/L"),
    "uL":                    ("volume",                     "microlitre", "uL"),
    "C":                     ("temperature",                "degree Celsius", "Cel"),
    "h":                     ("time",                       "hour", "h"),
    "rpm":                   ("rotational frequency",       "revolutions per minute", "{rpm}"),
    "angstrom":              ("length (atomic distance)",   "angstrom", "Ao"),
    "fold":                  ("ratio (fold-change)",        "dimensionless", "{fold}"),
    "relative_abundance":    ("ratio (relative abundance)", "dimensionless", "1"),
    "score":                 ("score",                      "dimensionless", "{score}"),
    "log_likelihood_ratio":  ("log ratio",                  "dimensionless", "{log_LR}"),
    "ratio":                 ("ratio",                      "dimensionless", "1"),
    "%":                     ("fraction",                   "percent", "%"),
    "intensity":             ("signal intensity",           "dimensionless", "{intensity}"),
    "mg/L":                  ("mass concentration",         "milligram per litre", "mg/L"),
}

# External registry home pages for dbxref database_name values.
REGISTRY = {
    "UniProt":      "https://www.uniprot.org",
    "PDB":          "https://www.rcsb.org",
    "NCBI_Protein": "https://www.ncbi.nlm.nih.gov/protein",
    "PubChem":      "https://pubchem.ncbi.nlm.nih.gov",
    "ChEBI":        "https://www.ebi.ac.uk/chebi",
    "KEGG":         "https://www.kegg.jp",
    "MetaCyc":      "https://metacyc.org",
    "ORNL_LIMS":    "(internal ORNL LIMS — no public endpoint)",
}

# Identifier-notation columns: namespace, ID pattern, spec/registry link.
NOTATION = {
    "smiles":            ("SMILES",           "chemical line notation (no fixed regex)",  "http://opensmiles.org/"),
    "inchi":             ("InChI",            r"^InChI=1S?/",                              "https://www.inchi-trust.org/"),
    "inchi_key":         ("InChIKey",         r"^[A-Z]{14}-[A-Z]{10}-[A-Z]$",             "https://www.inchi-trust.org/"),
    "molecular_formula": ("Molecular formula","Hill notation (e.g. C6H12O6)",             "https://en.wikipedia.org/wiki/Chemical_formula#Hill_system"),
    "smarts":            ("SMARTS",           "substructure / reaction pattern",          "https://www.daylight.com/dayhtml/doc/theory/theory.smarts.html"),
    "kb_protein_id":     ("KBase protein",    "KBase workspace object ref",               "https://www.kbase.us/"),
    "kb_genome_id":      ("KBase genome",     "KBase workspace object ref",               "https://www.kbase.us/"),
    "kb_metabolite_id":  ("ModelSEED/KBase compound", r"^cpd\d+ or KBase ref",            "https://modelseed.org/"),
    "kb_reaction_id":    ("ModelSEED/KBase reaction", r"^rxn\d+ or KBase ref",            "https://modelseed.org/"),
    "structure_url":     ("RCSB PDB URL",     "https://www.rcsb.org/structure/<id>",      "https://www.rcsb.org/"),
    "mutations":         ("HGVS-like variant","e.g. A219M (wt-pos-mut)",                  "https://varnomen.hgvs.org/"),
}

# analyze.py status -> confidence taxonomy requested in the spec
STATUS_MAP = {"declared": "DECLARED", "inferred": "STRONGLY_INFERRED",
              "uncertain": "WEAKLY_INFERRED"}

def rel_status(r):
    if r["status"] == "uncertain" and r.get("parent_empty"):
        return "UNKNOWN"
    return STATUS_MAP.get(r["status"], "UNKNOWN")

def intended_type(dt):
    m = re.search(r"/\s*(.*?)\s*\(intended\)", dt or "")
    t = (m.group(1) if m else "").strip()
    if not t or t == "n/a":
        return "text"
    return t.lower().split("(")[0].strip()

# ------------------------------------------------------------------ 1. data_dictionary.tsv
CSV_COLS = ["table_name","field_name","data_type","is_nullable","is_primary_key",
            "is_foreign_key","foreign_table","foreign_field","relationship_status","role",
            "description","scientific_meaning","example_values","unit","ontology",
            "controlled_vocabulary","unique_count","missing_count","missing_percent",
            "interpretation_confidence","notes"]
with open(os.path.join(BUILD, "data_dictionary.tsv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=CSV_COLS, extrasaction="ignore",
                       delimiter="\t")
    w.writeheader()
    for d in DICT:
        row = {k: (str(d.get(k, "")).replace("\t", " ").replace("\n", " ")) for k in CSV_COLS}
        w.writerow(row)

# ------------------------------------------------------------------ 2. schema.dbml
def dbml():
    out = [f"// IDEAS-DB schema — generated {TODAY}",
           "// Paste into https://dbdiagram.io/ (DBML). Source columns are TEXT;",
           "// types below are the intended ANSI types from ideas_min_schema.sql.",
           "// Relationship notes: DECLARED = SQL FK; *_INFERRED = naming + value match; UNKNOWN = unverifiable.",
           ""]
    rel_by = {}
    for r in RELS:
        rel_by.setdefault((r["child_table"], r["child_field"]), r)
    for t in TABLES:
        out.append(f"Table {t['name']} {{")
        for d in [c for c in DICT if c["table_name"] == t["name"]]:
            col = d["field_name"]; typ = intended_type(d["data_type"])
            settings = []
            if d["is_primary_key"] == "yes":
                settings.append("pk")
            r = rel_by.get((t["name"], col))
            if r:
                settings.append(f"ref: > {r['parent_table']}.{r['parent_field']}")
                settings.append(f"note: '{rel_status(r)}"
                                + (f" {r['coverage_percent']}% match'" if r.get("coverage_percent") is not None else "'"))
            note = d.get("description", "").replace("'", "").replace("\n", " ")[:80]
            if note and not r:
                settings.append(f"note: '{note}'")
            s = f" [{', '.join(settings)}]" if settings else ""
            out.append(f"  {col} {typ}{s}")
        out.append("}")
        out.append(f"Note: table {t['name']} row_count is {t['nrows']}")
        out.append("")
    return "\n".join(out)
open(os.path.join(BUILD, "schema.dbml"), "w").write(dbml())

# ------------------------------------------------------------------ 3. schema_relationships.json
rel_json = []
for r in RELS:
    rel_json.append({
        "source_table": r["child_table"],
        "source_field": r["child_field"],
        "target_table": r["parent_table"],
        "target_field": r["parent_field"],
        "relationship_type": "many-to-one",
        "status": rel_status(r),
        "declared_sql_fk": bool(r["declared"]),
        "non_null_source_values": r["n_child_values"],
        "distinct_source_values": r["n_distinct_child"],
        "match_rate": (round(r["coverage_percent"] / 100.0, 4)
                       if r.get("coverage_percent") is not None else None),
        "orphans": r["orphans"],
        "target_table_empty": bool(r.get("parent_empty")),
    })
json.dump(rel_json, open(os.path.join(BUILD, "schema_relationships.json"), "w"), indent=1)

# ------------------------------------------------------------------ 4. SCHEMA_RELATIONSHIPS.md
def schema_rel_md():
    out = ["# IDEAS-DB — Schema Relationships", "",
           f"_Generated {TODAY}. {len(RELS)} relationships "
           f"({sum(1 for r in RELS if r['status']=='declared')} declared, "
           f"{sum(1 for r in RELS if r['status']=='inferred')} strongly inferred, "
           f"{sum(1 for r in RELS if r['status']=='uncertain')} weakly inferred / unknown)._",
           "",
           "Status: **DECLARED** = SQL foreign key in `ideas_min_schema.sql`; "
           "**STRONGLY_INFERRED** = column-name match with 100% of values resolving to the parent; "
           "**WEAKLY_INFERRED** = partial value match; **UNKNOWN** = parent table empty, unverifiable.",
           "", "## Reference tree (grouped by parent)", ""]
    by_parent = {}
    for r in RELS:
        by_parent.setdefault(r["parent_table"], []).append(r)
    for parent in sorted(by_parent):
        out.append(f"### {parent}")
        for r in sorted(by_parent[parent], key=lambda x: (x["child_table"], x["child_field"])):
            cov = f"{r['coverage_percent']}%" if r.get("coverage_percent") is not None else "n/a"
            out.append(f"- `{r['child_table']}.{r['child_field']}` → "
                       f"`{r['parent_table']}.{r['parent_field']}` "
                       f"— {rel_status(r)}, match {cov}"
                       + (f", {r['orphans']} orphan(s)" if r.get("orphans") else ""))
        out.append("")
    out += ["## Full relationship table", "",
            "| Source | Target | Type | Status | Match | Orphans |",
            "|--------|--------|------|--------|-------|---------|"]
    for r in RELS:
        cov = f"{r['coverage_percent']}%" if r.get("coverage_percent") is not None else "n/a"
        out.append(f"| `{r['child_table']}.{r['child_field']}` | "
                   f"`{r['parent_table']}.{r['parent_field']}` | many-to-one | "
                   f"{rel_status(r)} | {cov} | {r['orphans'] if r['orphans'] is not None else 'n/a'} |")
    return "\n".join(out) + "\n"
open(os.path.join(BUILD, "SCHEMA_RELATIONSHIPS.md"), "w").write(schema_rel_md())

# ------------------------------------------------------------------ 5. DATA_DICTIONARY.md
def data_dict_md():
    out = ["# IDEAS-DB — Data Dictionary", "",
           f"_Generated {TODAY}. {M['n_tables']} tables, {M['total_rows']} rows, "
           f"{M['total_columns']} columns. Source columns are all TEXT; the "
           "\"intended\" ANSI type is recorded per field._", ""]
    for t in TABLES:
        cm = [c for c in DICT if c["table_name"] == t["name"]]
        pk = [c["field_name"] for c in cm if c["is_primary_key"] == "yes"] or ["(none declared)"]
        fks = [(c["field_name"], c["foreign_table"], c["foreign_field"], c["relationship_status"])
               for c in cm if c["is_foreign_key"] == "yes"]
        out.append(f"## {t['name']}")
        out.append("")
        out.append(f"**Purpose:** {t['desc'] or 'UNKNOWN / NOT DOCUMENTED'}")
        out.append("")
        out.append(f"**Rows:** {t['nrows']} · **Fields:** {t['ncols']} · "
                   f"**Completeness:** {t['completeness']}%")
        out.append("")
        out.append(f"**Primary key:** {', '.join(pk)}")
        out.append("")
        if fks:
            out.append("**Foreign keys:**")
            for f, ft, ff, st in fks:
                out.append(f"- `{f}` → `{ft}.{ff}` ({st})")
            out.append("")
        out.append("| Field | Type | Role | PK/FK | Related | Ontology | Missing % | Meaning |")
        out.append("|-------|------|------|-------|---------|----------|-----------|---------|")
        for c in cm:
            key = "PK" if c["is_primary_key"] == "yes" else ("FK" if c["is_foreign_key"] == "yes" else "")
            rel = f"{c['foreign_table']}.{c['foreign_field']}" if c["is_foreign_key"] == "yes" else ""
            meaning = (c["description"] or "UNKNOWN / NOT DOCUMENTED").replace("|", "\\|").replace("\n", " ")
            out.append(f"| `{c['field_name']}` | {intended_type(c['data_type'])} | {c['role']} | "
                       f"{key} | {rel} | {c['ontology'] or ''} | {c['missing_percent']}% | {meaning} |")
        out.append("")
    return "\n".join(out)
open(os.path.join(BUILD, "DATA_DICTIONARY.md"), "w").write(data_dict_md())

# ------------------------------------------------------------------ 6. units_report.tsv
# EAV model: unit lives in a `unit` column keyed by `label`. Report every
# (table, parameter label, unit) actually observed, plus a units summary.
unit_rows = []
for tn in ("sample_parameter", "protein_parameter"):
    t = TBL.get(tn)
    if not t:
        continue
    cols = t["columns"]
    li, vi = cols.index("label"), cols.index("value")
    ui = cols.index("unit")
    agg = {}
    for r in t["rows"]:
        label, unit, val = r[li], r[ui], r[vi]
        if not unit:
            continue
        k = (label, unit)
        a = agg.setdefault(k, {"n": 0, "ex": []})
        a["n"] += 1
        if val and len(a["ex"]) < 3:
            a["ex"].append(val)
    for (label, unit), a in sorted(agg.items()):
        q = UNIT_REF.get(unit, ("UNKNOWN / NOT DOCUMENTED", "", ""))
        unit_rows.append([tn, label, q[0], unit, q[2], ", ".join(a["ex"]), str(a["n"])])
with open(os.path.join(BUILD, "units_report.tsv"), "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["source_table", "parameter_label", "physical_quantity",
                "unit", "ucum_code", "example_values", "occurrences"])
    w.writerows(unit_rows)
    w.writerow([])
    w.writerow(["# UNIT SUMMARY (unit -> total occurrences across the dataset)"])
    w.writerow(["unit", "physical_quantity", "ucum_code", "total_occurrences"])
    for unit, n in sorted(M["units_used"].items(), key=lambda x: -x[1]):
        q = UNIT_REF.get(unit, ("UNKNOWN / NOT DOCUMENTED", "", ""))
        w.writerow([unit, q[0], q[2], n])

# ------------------------------------------------------------------ 7. ontology_report.tsv
onto_rows = []
# (a) identifier-notation columns present in the data
for t in TABLES:
    cm = {c["field_name"]: c for c in DICT if c["table_name"] == t["name"]}
    for col in t["columns"]:
        if col in NOTATION:
            ns, patt, link = NOTATION[col]
            c = cm.get(col, {})
            cov = round(100 - float(c.get("missing_percent", 0)), 1)
            ex = (c.get("example_values", "").split(" | ")[0]) if c.get("example_values") else ""
            onto_rows.append([t["name"], col, c.get("description", "") or ns,
                              ns, patt, ex, f"{cov}%", link])
# (b) external cross-references via idea_dbxref (long format)
dbx = TBL.get("idea_dbxref")
if dbx:
    cols = dbx["cols"] if "cols" in dbx else dbx["columns"]
    di = cols.index("database_name"); ai = cols.index("accession")
    et = cols.index("entity_type")
    agg = {}
    for r in dbx["rows"]:
        db = r[di]
        a = agg.setdefault(db, {"n": 0, "ex": "", "ent": set()})
        a["n"] += 1
        a["ent"].add(r[et])
        if not a["ex"]:
            a["ex"] = r[ai]
    for db, a in sorted(agg.items()):
        onto_rows.append(["idea_dbxref", f"accession[{db}]",
                          "external cross-reference (" + ", ".join(sorted(a["ent"])) + ")",
                          db, "registry accession", a["ex"], f"{a['n']} record(s)",
                          REGISTRY.get(db, "")])
with open(os.path.join(BUILD, "ontology_report.tsv"), "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["table", "field", "meaning", "ontology_namespace",
                "id_pattern", "example", "coverage", "external_link"])
    w.writerows(onto_rows)

# ------------------------------------------------------------------ 8. data_quality_report.tsv
SEV = {"warning": "HIGH", "info": "INFO"}
ACTION = {
    "warning": "Review source; document or reconcile before downstream use.",
    "info": "Informational — no action required unless the field is needed.",
}
with open(os.path.join(BUILD, "data_quality_report.tsv"), "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["severity", "table", "field", "issue", "explanation", "suggested_action"])
    for f in M["findings"]:
        sev = SEV.get(f["severity"], f["severity"].upper())
        w.writerow([sev, f["table"], "", f["finding"], f["finding"],
                    ACTION.get(f["severity"], "Review.")])

# ------------------------------------------------------------------ 9. schema.svg  (static field-level ER)
def category(name):
    if name in ("sample_protein", "sample_reactant", "sample_reaction", "idea_stoichiometry"):
        return "link"
    if name in ("sample_parameter", "protein_parameter", "idea_measurement", "computation", "ai_design"):
        return "measure"
    if name in ("idea_lab", "idea_people", "idea_procedure", "idea_protocol", "idea_dbxref"):
        return "prov"
    if name in ("idea_experiment", "idea_sample", "idea_protein", "idea_mutant",
                "idea_reactant", "idea_reaction", "idea_strain"):
        return "entity"
    return "opt"

CATCOL = {"entity": "#2563eb", "measure": "#0891b2", "link": "#7c3aed",
          "prov": "#64748b", "opt": "#059669"}
ORDER = ["measure", "link", "entity", "prov", "opt"]

def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

def build_svg():
    RH, HH, TW, COLGAP, VGAP, PAD = 20, 26, 250, 90, 34, 40
    # assign each table to its category column
    bycat = {c: [] for c in ORDER}
    for t in TABLES:
        bycat[category(t["name"])].append(t)
    rel_by = {}
    for r in RELS:
        rel_by.setdefault((r["child_table"], r["child_field"]), r)
    L = {}   # name -> box geom + field y positions
    x = PAD
    maxb = 0
    for cat in ORDER:
        y = PAD
        col_tables = bycat[cat]
        if not col_tables:
            continue
        for t in col_tables:
            cm = [c for c in DICT if c["table_name"] == t["name"]]
            h = HH + RH * len(cm)
            L[t["name"]] = {"x": x, "y": y, "w": TW, "h": h, "cm": cm, "t": t,
                            "cat": cat, "fy": {}}
            for i, c in enumerate(cm):
                L[t["name"]]["fy"][c["field_name"]] = y + HH + RH * i + RH / 2
            y += h + VGAP
        maxb = max(maxb, y)
        x += TW + COLGAP
    W, Hgt = x + PAD, maxb + PAD

    def field_anchor(tname, field, side):
        b = L[tname]; yy = b["fy"].get(field, b["y"] + b["h"] / 2)
        return (b["x"] + (b["w"] if side == "r" else 0), yy)

    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{Hgt}" '
             f'viewBox="0 0 {W} {Hgt}" font-family="ui-monospace,Menlo,Consolas,monospace">']
    parts.append(f'<rect width="{W}" height="{Hgt}" fill="#ffffff"/>')
    ecol = {"declared": "#2563eb", "inferred": "#0891b2", "uncertain": "#d97706"}
    # edges first (under boxes)
    for r in RELS:
        if r["child_table"] not in L or r["parent_table"] not in L:
            continue
        cb, pb = L[r["child_table"]], L[r["parent_table"]]
        cside = "r" if pb["x"] >= cb["x"] else "l"
        pside = "l" if pb["x"] >= cb["x"] else "r"
        x1, y1 = field_anchor(r["child_table"], r["child_field"], cside)
        x2, y2 = field_anchor(r["parent_table"], r["parent_field"], pside)
        dx = max(40, abs(x2 - x1) * 0.4)
        c1 = x1 + (dx if cside == "r" else -dx)
        c2 = x2 + (-dx if pside == "l" else dx)
        col = ecol.get(r["status"], "#d97706")
        dash = ' stroke-dasharray="5 4"' if r["status"] != "declared" else ""
        parts.append(f'<path d="M{x1:.0f},{y1:.0f} C{c1:.0f},{y1:.0f} {c2:.0f},{y2:.0f} {x2:.0f},{y2:.0f}" '
                     f'fill="none" stroke="{col}" stroke-width="1.4" opacity="0.75"{dash}/>')
        parts.append(f'<circle cx="{x2:.0f}" cy="{y2:.0f}" r="3" fill="{col}"/>')
    # boxes
    for name, b in L.items():
        cc = CATCOL[b["cat"]]
        parts.append(f'<rect x="{b["x"]}" y="{b["y"]}" width="{b["w"]}" height="{b["h"]}" '
                     f'rx="7" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>')
        parts.append(f'<path d="M{b["x"]},{b["y"]+7} q0,-7 7,-7 h{b["w"]-14} q7,0 7,7 v{HH-7} h-{b["w"]} z" fill="{cc}"/>')
        parts.append(f'<text x="{b["x"]+10}" y="{b["y"]+18}" fill="#fff" font-size="12.5" '
                     f'font-weight="700">{esc(name)}</text>')
        parts.append(f'<text x="{b["x"]+b["w"]-8}" y="{b["y"]+18}" fill="#e2e8f0" font-size="10" '
                     f'text-anchor="end">{b["t"]["nrows"]} rows</text>')
        for i, c in enumerate(b["cm"]):
            yy = b["y"] + HH + RH * i
            if i % 2:
                parts.append(f'<rect x="{b["x"]+1}" y="{yy}" width="{b["w"]-2}" height="{RH}" fill="#f8fafc"/>')
            key = "PK" if c["is_primary_key"] == "yes" else ("FK" if c["is_foreign_key"] == "yes" else "")
            kc = "#b45309" if key == "PK" else ("#2563eb" if key == "FK" else "")
            if key:
                parts.append(f'<text x="{b["x"]+8}" y="{yy+14}" fill="{kc}" font-size="8.5" '
                             f'font-weight="700">{key}</text>')
            fw = "700" if key == "PK" else "400"
            parts.append(f'<text x="{b["x"]+30}" y="{yy+14}" fill="#0f172a" font-size="10.5" '
                         f'font-weight="{fw}">{esc(c["field_name"][:22])}</text>')
            parts.append(f'<text x="{b["x"]+b["w"]-8}" y="{yy+14}" fill="#94a3b8" font-size="9" '
                         f'text-anchor="end">{esc(intended_type(c["data_type"])[:8])}</text>')
    # legend
    ly = Hgt - 22
    parts.append(f'<text x="{PAD}" y="{ly}" font-size="11" fill="#475569">'
                 f'IDEAS-DB field-level ER · generated {TODAY} · '
                 f'edges: blue=declared, teal=strongly-inferred, amber=weakly/unknown</text>')
    parts.append("</svg>")
    return "\n".join(parts)

svg = build_svg()
open(os.path.join(BUILD, "schema.svg"), "w").write(svg)

# ------------------------------------------------------------------ 10. schema.png (best-effort raster)
png_ok = False
conv = shutil.which("rsvg-convert") or shutil.which("inkscape") or shutil.which("convert")
if conv:
    src = os.path.join(BUILD, "schema.svg"); dst = os.path.join(BUILD, "schema.png")
    try:
        if conv.endswith("rsvg-convert"):
            subprocess.run([conv, "-o", dst, src], check=True, timeout=120)
        elif conv.endswith("inkscape"):
            subprocess.run([conv, src, "--export-type=png", f"--export-filename={dst}"],
                           check=True, timeout=120)
        else:  # ImageMagick convert
            subprocess.run([conv, "-density", "144", "-background", "white",
                            src, dst], check=True, timeout=120)
        png_ok = os.path.exists(dst) and os.path.getsize(dst) > 2000
    except Exception as e:
        print("PNG rasterisation failed:", e)

print("Wrote exports:")
for f in ("data_dictionary.tsv", "schema.dbml", "schema_relationships.json",
          "SCHEMA_RELATIONSHIPS.md", "DATA_DICTIONARY.md", "units_report.tsv",
          "ontology_report.tsv", "data_quality_report.tsv", "schema.svg"):
    p = os.path.join(BUILD, f)
    print(f"  {f:32} {os.path.getsize(p):>8} bytes")
print(f"  schema.png                       {'OK' if png_ok else 'SKIPPED (no working converter)'}")
print(f"  unit rows: {len(unit_rows)} · onto rows: {len(onto_rows)} · rels: {len(rel_json)}")
