#!/usr/bin/env bash
# Deploy / (re)start the IDEAS Data Portal on poplar.
#
# Mirrors ~/argo/serve_budget_dashboard.sh and fungi_recon/scripts/poplar_serve.sh:
# rsync the static site to /scratch/janakae/ideas_db_portal on poplar and run a
# stdlib python http.server bound to 0.0.0.0 on $PORT. Idempotent — safe to re-run.
#
#     bash deploy.sh
set -euo pipefail

PORT="${PORT:-37431}"
POPLAR=poplar
LOCAL_SITE="$(cd "$(dirname "$0")" && pwd)/site"
REMOTE_DIR="/scratch/janakae/ideas_db_portal"

echo ">> verifying local site"
test -f "$LOCAL_SITE/index.html"
test -f "$LOCAL_SITE/metadata.json"

echo ">> ensuring remote docroot on $POPLAR"
ssh -o BatchMode=yes "$POPLAR" "mkdir -p '$REMOTE_DIR'"

echo ">> rsyncing site -> $POPLAR:$REMOTE_DIR"
rsync -az --delete -e "ssh -o BatchMode=yes" "$LOCAL_SITE/" "$POPLAR:$REMOTE_DIR/"

echo ">> (re)starting http.server on $POPLAR:$PORT"
ssh -o BatchMode=yes "$POPLAR" bash -s <<EOF
set -e
DIR="$REMOTE_DIR"; PORT=$PORT

# refuse to touch a port owned by someone else's process
if ss -ltnp 2>/dev/null | grep -q ":\$PORT " ; then
  if ! ss -ltnp 2>/dev/null | grep ":\$PORT " | grep -q "users:((\"python3\""; then
    echo "  ERROR: port \$PORT is in use by a non-portal process; aborting."; ss -ltnp | grep ":\$PORT "; exit 2
  fi
  # stop only our own prior portal server on this exact dir/port
  pkill -u "\$USER" -f "http.server \$PORT" >/dev/null 2>&1 || true
  sleep 1
fi

cd "\$DIR"
setsid python3 -m http.server \$PORT --bind 0.0.0.0 </dev/null >/tmp/ideas_db_portal.log 2>&1 &
echo "  spawned PID=\$!"
sleep 2
ss -ltn | grep ":\$PORT " >/dev/null || { echo "  FAILED to bind :\$PORT"; tail -20 /tmp/ideas_db_portal.log; exit 1; }
for p in / /metadata.json /downloads/ideas_dump.sql; do
  code=\$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "http://localhost:\$PORT\$p")
  echo "  localhost:\$PORT\$p -> \$code"
done
EOF

echo
echo "======================================================================"
echo " IDEAS Data Portal is live:"
echo "     http://poplar.cels.anl.gov:$PORT/"
echo "======================================================================"
