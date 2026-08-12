#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node --check js/db.js
node --check js/utils.js
node --check js/app.js
for f in index.html manifest.json assets/css/app.css assets/icons/icon.svg js/db.js js/utils.js js/app.js sw.js; do test -s "$f"; done
python3 -m json.tool manifest.json >/dev/null
printf 'OK: JavaScript syntax, manifest JSON, and required assets validated.\n'
