#!/usr/bin/env bash
#
# Packages this directory into an installable .xpi.
set -euo pipefail
cd "$(dirname "$0")"

version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
xpi="odoo-thunderbird-${version}.xpi"

rm -f "$xpi"
zip -qr -X "$xpi" . \
  -x '.git/*' -x '.gitignore' -x '*.DS_Store' -x 'build.sh' -x '*.xpi' \
  -x 'README.md' -x 'HANDBUCH.md' -x 'CHANGELOG.md' -x 'LICENSE'

echo "✓ built ${xpi}"
