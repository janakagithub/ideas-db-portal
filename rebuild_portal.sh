#!/usr/bin/env bash
# Rebuild the IDEAS Data Portal end-to-end from the source dataset and redeploy.
#
#   1. re-scan source parquet + schema and rebuild SQLite/SQL-dump/metadata   (analyze.py)
#   2. regenerate DBML, relationship JSON/MD, dictionary MD/TSV, reports, ERD  (generate_exports.py)
#   3. refresh the site's data + downloads/
#   4. smoke-test every view headlessly                                        (domtest.js)
#   5. push to poplar and (re)start the http.server                            (deploy.sh)
#
# Usage:  ./rebuild_portal.sh            # full rebuild + deploy
#         SKIP_DEPLOY=1 ./rebuild_portal.sh   # rebuild only, no redeploy
set -euo pipefail
cd "$(dirname "$0")"

echo "==> [1/5] analyze source dataset -> build/"
PYTHONPATH=./.pylibs python3 analyze.py

echo "==> [2/5] generate schema / dictionary / report / ERD exports"
python3 generate_exports.py

echo "==> [3/5] refresh site data + downloads/"
cp build/metadata.json site/
mkdir -p site/downloads
cp build/ideas.db build/ideas_dump.sql build/metadata.json \
   build/data_dictionary.csv build/data_dictionary.enriched.json build/data_dictionary.tsv \
   build/schema.dbml build/schema_relationships.json build/SCHEMA_RELATIONSHIPS.md \
   build/DATA_DICTIONARY.md build/units_report.tsv build/ontology_report.tsv \
   build/data_quality_report.tsv build/schema.svg build/schema.png \
   site/downloads/
# top-level human-readable docs
cp build/SCHEMA_RELATIONSHIPS.md build/DATA_DICTIONARY.md .

echo "==> [4/5] headless render smoke-test"
node domtest.js

if [ "${SKIP_DEPLOY:-0}" = "1" ]; then
  echo "==> [5/5] SKIP_DEPLOY=1 set — not deploying. Rebuild complete."
  exit 0
fi

echo "==> [5/5] deploy to poplar"
bash deploy.sh
echo "==> Rebuild + deploy complete."
