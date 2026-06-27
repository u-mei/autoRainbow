#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT/pipeline/python/agent"

PYINST_DATA=""
PYINST_DATA="$PYINST_DATA --add-data $PROJECT_ROOT/pipeline/jsx:jsx"
PYINST_DATA="$PYINST_DATA --add-data $PROJECT_ROOT/pipeline/python/docx_list_to_json.py:python"
PYINST_DATA="$PYINST_DATA --add-data $PROJECT_ROOT/pipeline/python/compare_snapshot.py:python"

pyinstaller --onefile --name autorainbow-agent $PYINST_DATA server.py

echo "Build complete: dist/autorainbow-agent"
