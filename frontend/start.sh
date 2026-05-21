#!/usr/bin/env bash
# WeYell dev launcher — mock API + customer portal.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DO_INSTALL=0
DO_CLEAN=0

while (( "$#" )); do
  case "$1" in
    --install) DO_INSTALL=1; shift ;;
    --clean)   DO_CLEAN=1;   shift ;;
    -h|--help)
      echo "Usage: ./start.sh [--install] [--clean]"
      echo "  MOCK   → http://127.0.0.1:5280"
      echo "  PORTAL → http://127.0.0.1:4400"
      exit 0
      ;;
    *) echo "Unknown: $1" >&2; exit 64 ;;
  esac
done

command -v node >/dev/null || { echo "node required" >&2; exit 1; }
command -v npm  >/dev/null || { echo "npm required" >&2; exit 1; }

[[ "$DO_INSTALL" -eq 1 || ! -d node_modules ]] && npm install

DEV_PORTS=(5280 4400)
if [[ "$DO_CLEAN" -eq 1 ]]; then
  for port in "${DEV_PORTS[@]}"; do
    pids=$(lsof -t -nP -i ":${port}" 2>/dev/null || true)
    [[ -n "${pids:-}" ]] && kill ${pids} 2>/dev/null || true
  done
fi

npm run dev
