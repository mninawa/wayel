# Docker — WeYell local stack

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Optional: copy root `.env.example` → `.env` for Google SSO and Atlas Mongo

## Run the stack

From the repository root:

```bash
cp .env.example .env   # optional
docker compose up --build
```

| Service | URL | Notes |
|---------|-----|--------|
| API | http://localhost:5099 | .NET `Wayel.Api` |
| BFF | http://localhost:5299 | Cookie session + proxy to API |
| MongoDB | localhost:27017 | Data volume `mongo-data` |

### Customer portal (nginx)

```bash
docker compose --profile portal up --build
```

Portal: http://localhost:8080

For BFF-mode dev on the host (hot reload), keep API/BFF in Docker and run:

```bash
cd frontend && npm run dev:portal:bff:docker
```

## Backend-only compose

The legacy file under `backend/api/docker-compose.yml` targets Atlas Mongo and omits the bundled database. Prefer the **root** `docker-compose.yml` for a self-contained local setup.

## CI

GitHub Actions builds the same images on every push/PR (`ci.yml` → **Docker — build images**). On `main`, `cd.yml` publishes to GitHub Container Registry (`ghcr.io/mninawa/wayel-*`).
