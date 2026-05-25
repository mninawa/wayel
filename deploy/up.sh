#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "→ No .env found; copying .env.example (edit GOOGLEAUTH__CLIENTIDS__0 for real Google SSO)"
  cp .env.example .env
fi

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.deploy.yml)
if grep -q 'mongodb+srv://' .env 2>/dev/null; then
  COMPOSE_FILES+=(-f docker-compose.atlas.yml)
  MONGO_NOTE="MongoDB Atlas (see MONGO_DATABASE_NAME in .env)"
else
  COMPOSE_FILES+=(--profile local-mongo)
  MONGO_NOTE="MongoDB local: localhost:27017"
fi

echo "→ Building and starting WeYell (API + BFF + portal)…"
docker compose "${COMPOSE_FILES[@]}" --profile portal up -d --build

echo ""
echo "✓ Deployed"
echo "  App (portal + BFF proxy): http://localhost:${PORTAL_PORT:-8080}"
echo "  API (debug):              http://localhost:5099"
echo "  Database:                 ${MONGO_NOTE}"
echo "  Demo personas:            *@weyell.demo / demo1234 (see docs/DOCKER.md; seeded per missing email)"
echo ""
echo "Logs:  docker compose ${COMPOSE_FILES[*]} --profile portal logs -f"
echo "Stop:  ./deploy/down.sh"
