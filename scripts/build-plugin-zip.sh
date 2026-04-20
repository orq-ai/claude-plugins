#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="$REPO_ROOT/orq-mcp.zip"

cd "$REPO_ROOT"

rm -f "$OUTPUT"
zip -r "$OUTPUT" plugins/mcp/ --exclude "plugins/mcp/orq-mcp.zip" --exclude "*/.DS_Store" --exclude "*/__MACOSX/*"

echo "Created $OUTPUT"
