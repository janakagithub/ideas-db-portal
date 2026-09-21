# IDEAS Data Portal

An interactive, searchable, scientist-friendly data portal for the **IDEAS**
enzyme-engineering dataset (AI-guided amide synthesis — nylon / N66 activity and
diad/triad/tetrad oligoamide synthesis), built from the source in
`/home/janakae/claude_projects/Ideas-DB/`.

## 🌐 Live URL / port

> **http://poplar.cels.anl.gov:37431/**

- **Chosen port: `37431`** — selected dynamically after checking `ss -ltn` on poplar.
  It was confirmed free (bind test) and sits alongside the user's existing
  dashboards (37428 fungi-recon, 37429 Argo budget, 37430) **without disturbing them**.
- Served by a stdlib `python3 -m http.server` on poplar, docroot
  `/scratch/janakae/ideas_db_portal/`, launched with `setsid` (survives logout).
- To change the port: `PORT=NNNNN bash deploy.sh`.

## What the portal shows

| View | Answers |
|------|---------|
| **Overview** | What data are present; dataset provenance; full source-file inventory |
| **Schema & ERD** | Field-level, dbdiagram.io-style ER diagram — every table box lists its columns with **PK / FK** markers and intended types; each relationship is drawn from the exact FK field to the PK it references (`child.field → parent.id`), coloured DECLARED / INFERRED / UNCERTAIN. Draggable tables, pan, zoom, click-to-spotlight; Mermaid ER source below |
| **Tables** | Per-table column definitions **and** the actual data — searchable & sortable, CSV export |
| **Data Dictionary** | Every field: type, keys, plain-language + scientific meaning, examples, units, ontology, distinct/missing counts, interpretation confidence. Filter by table/role/confidence |
| **Relationships** | How records connect — **DECLARED / INFERRED / UNCERTAIN** with FK coverage % and orphan counts |
| **Ontologies & Units** | **Measured-parameters catalogue** (every quantity → unit → physical quantity → source field); **UCUM-coded unit reference** (name, dimension, UCUM code, and which parameters use each unit); external cross-references (PubChem, PDB, UniProt, ChEBI, KEGG, MetaCyc, ORNL LIMS) with live accession + registry links; **chemical/biological identifier notations** (SMILES, InChI/InChIKey, SMARTS, molecular formula, ModelSEED/KBase IDs, HGVS-like variants) each linked to its spec/registry and the fields that carry it, with example-value resolvers |
| **Data Quality** | Per-table completeness; consistency findings (data vs DDL vs data dictionary) |
| **Download** | SQL dump, SQLite DB, data dictionary (CSV/JSON), full metadata, original source ZIP |

## Dataset at a glance

- **21 tables**, **715 rows**, 145 columns (source is all-`TEXT` — a raw Hive→Iceberg lift).
- **34 relationships**: 12 declared (SQL DDL) · 17 inferred (naming + 100 % value match) · 5 uncertain.
- **8 external databases** cross-referenced; 15 distinct measurement units.

### Key consistency findings (surfaced in the portal)
- `sample_parameter` **lacks the G1 analyte FK** (`idea_reactant_id`) that the design
  doc marks as *resolved/adopted* — product-scoped values are disambiguated only via
  the free-text `label`.
- `protein_comparison` is **documented but has no parquet** (fold-change-to-WT missing).
- `protein_parameter.measurement_id` (27) and `.computation_id` (5) have **0 % coverage**
  — the referenced ids don't resolve to `idea_measurement` / `computation` rows.
- Several KBase cross-ref columns (`kb_protein_id`, `kb_metabolite_id`, …) are present
  in the data but undocumented in `data_dictionary.json`.

## Repository layout

```
Ideas-DB-portal/
├── analyze.py        # deep analysis pipeline: parquet → SQLite + SQL dump + metadata bundle
├── deploy.sh         # rsync site to poplar + (re)start http.server on :37431
├── domtest.js        # headless render smoke-test for the web app (node domtest.js)
├── build/            # generated: ideas.db, ideas_dump.sql, data_dictionary.{csv,json}, metadata.json
└── site/             # the deployed static site (index.html, app.js, metadata.json, downloads/)
```

## Rebuild & redeploy

```bash
cd /home/janakae/claude_projects/Ideas-DB-portal
PYTHONPATH=./.pylibs python3 analyze.py          # regenerate build/ from source parquet
cp build/{metadata.json} site/                   # refresh site data
cp build/{ideas.db,ideas_dump.sql,data_dictionary.csv,data_dictionary.enriched.json,metadata.json} site/downloads/
node domtest.js                                   # verify all views render
bash deploy.sh                                    # push + restart on poplar:37431
```

## How the data connects (quick reference)

`idea_sample` is the hub: it links to `idea_experiment`, `idea_strain`, and — via the
junction tables `sample_protein` / `sample_reactant` / `sample_reaction` — to the enzyme
(or `idea_mutant`), the substrate chemicals, and the reactions. Measured values hang off
samples in `sample_parameter`; enzyme/variant-level summaries live in `protein_parameter`.
`idea_stoichiometry` gives each reaction's substrate/product membership, and `idea_dbxref`
points every entity out to authoritative external databases.

---
*Generated by deep inspection of the source dataset. Notes: source columns are all TEXT;
the SQLite build preserves that fidelity while the data dictionary records the intended
ANSI types from `ideas_min_schema.sql`.*
