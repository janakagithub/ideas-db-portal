# IDEAS Data Portal (`ideas-db-portal`)

An interactive, searchable, scientist-friendly data portal for the **IDEAS**
enzyme-engineering dataset (AI-guided amide / oligoamide synthesis — Argonne's
contribution to the DOE **BRIDGE** project). It is a dependency-free, single-page
web app that renders everything from one `metadata.json` generated from the typed
source data.

The dataset ships as an **Apache Iceberg v2** warehouse (`tetrad_v1`), so every
column keeps its **real type** (integers, reals, dates, booleans, timestamps) and
every record carries a stable **CURIE** identifier (`SMP:1`, `EXP:…`).

## 🌐 Live

- **GitHub Pages:** https://janakagithub.github.io/ideas-db-portal/ (auto-published from `site/` by GitHub Actions)
- **Lab mirror:** http://poplar.cels.anl.gov:37431/ (stdlib `http.server` on poplar, docroot `/scratch/janakae/ideas_db_portal/`)

## What the portal shows

| View | Answers |
|------|---------|
| **Overview** | What data are present; provenance; source-file inventory |
| **The Project** | Plain-language BRIDGE orientation: what it is, goals, the shared data model, progress, next steps — distilled from the team's meeting notes |
| **Schema & ERD** | Field-level, draggable ER diagram with PK/FK markers and **real types**; each relationship drawn field→field, coloured by evidence |
| **Tables** | Per-table column definitions **and** the actual typed data — searchable, sortable, CSV export |
| **Data Dictionary** | Every field: real type, keys, role, meaning, examples, ontology, distinct/missing counts, confidence |
| **Relationships** | How records connect — coverage % and orphan counts for each foreign key |
| **Measurements & observations** | Measurement **events** (`idea_measurement`) + measured **values** (`sample_parameter`, label/value/unit) with numeric min/median/max, grouped by physical quantity. *The project's current focus.* |
| **Ontologies & Units** | UCUM-coded unit reference, external cross-references (PubChem, PDB, UniProt…), chemical/biological identifier notations |
| **Data Quality** | Per-table completeness; consistency findings |
| **Iceberg & Files** | Snapshot history per table; download the **full Iceberg warehouse** or **per-table Parquet**; how to read it (DuckDB / PyIceberg) |
| **Download** | Iceberg ZIP, typed SQLite DB, SQL dump, data dictionary (CSV/TSV/JSON), full metadata |

## Dataset at a glance

- **12 tables**, **3,247 rows**, 111 columns — typed (`BIGINT`, `VARCHAR`, `DOUBLE`, `DATE`, `BOOLEAN`, `TIMESTAMP WITH TIME ZONE`).
- **14 foreign keys**, 13 resolving at 100 % coverage.
- **3 measured units** (mass-spec intensity, mg/L titer, % conversion); **4 external databases** cross-referenced.
- Source is an **Apache Iceberg v2** export; only each table's current snapshot is loaded, but full snapshot history is browsable and downloadable.

## Repository layout

```
ideas-db-portal/
├── analyze_iceberg.py    # pipeline: typed Iceberg warehouse -> build/ (metadata.json, SQLite, SQL dump, per-table parquet, iceberg zip, data dictionary)
├── iceberg_read.py       # offline Iceberg reader (resolves the current snapshot's parquet files locally)
├── schema_knowledge.py   # curated table/column descriptions, logical foreign keys, and the BRIDGE project narrative
├── rebuild_portal.sh     # one command: analyze -> refresh site + downloads -> smoke-test -> deploy
├── deploy.sh             # rsync site to poplar + (re)start http.server on :37431
├── domtest.js            # headless render smoke-test (node domtest.js)
├── site/                 # the deployed static site (index.html, app.js, metadata.json, downloads/)
└── .github/workflows/pages.yml  # publishes site/ to GitHub Pages
```

## Rebuild

```bash
# needs a local duckdb install (pip install --target .pylibs duckdb) — no deps in the base venv
PYTHONPATH=./.pylibs python3 analyze_iceberg.py   # typed Iceberg warehouse -> build/
./rebuild_portal.sh                                # analyze -> refresh site + downloads -> smoke-test -> deploy
SKIP_DEPLOY=1 ./rebuild_portal.sh                  # rebuild artefacts only, no redeploy
```

Committing to `main` re-publishes the GitHub Pages site automatically.

## How the data connects (quick reference)

`idea_sample` is the hub: it links to `idea_experiment` and — via the junction
tables `sample_protein` / `sample_reactant` / `sample_reaction` — to the enzyme,
the substrate chemicals, and the reactions. Measurement **events** are recorded in
`idea_measurement`; the measured **values** hang off samples in `sample_parameter`
as label / value / unit rows. `idea_stoichiometry` gives each reaction's
substrate/product membership, and `idea_dbxref` points entities out to external
databases (PubChem, PDB, UniProt, GenBank).
