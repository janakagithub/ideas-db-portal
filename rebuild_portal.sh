#!/usr/bin/env bash
# Rebuild the IDEAS Data Portal end-to-end from the typed Iceberg source and redeploy.
#
#   1. read the typed tetrad_v1 Iceberg warehouse -> build/                    (analyze_iceberg.py)
#   2. refresh the site's data + downloads/ (metadata, db, parquet, iceberg zip)
#   3. smoke-test every view headlessly                                        (domtest.js)
#   4. push to poplar and (re)start the http.server                            (deploy.sh)
#
# Usage:  ./rebuild_portal.sh            # full rebuild + deploy
#         SKIP_DEPLOY=1 ./rebuild_portal.sh   # rebuild only, no redeploy
set -euo pipefail
cd "$(dirname "$0")"

echo "==> [1/4] analyze typed Iceberg warehouse -> build/"
PYTHONPATH=./.pylibs python3 analyze_iceberg.py

echo "==> [2/4] refresh site data + downloads/"
cp build/metadata.json site/
mkdir -p site/downloads site/downloads/parquet
cp build/ideas.db build/ideas_dump.sql build/metadata.json \
   build/data_dictionary.csv build/data_dictionary.enriched.json build/data_dictionary.tsv \
   build/tetrad_v1_iceberg.zip \
   site/downloads/
cp build/parquet/*.parquet site/downloads/parquet/

echo "==> [3/4] headless render smoke-test"
node domtest.js

if [ "${SKIP_DEPLOY:-0}" = "1" ]; then
  echo "==> [4/4] SKIP_DEPLOY=1 set — not deploying. Rebuild complete."
  exit 0
fi

echo "==> [4/4] deploy to poplar"
bash deploy.sh
echo "==> Rebuild + deploy complete."
