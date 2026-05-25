# WeYell (Wayel repo)

Phase 1 **customer portal only** — web, desktop-first. Structured from the norex-kid monorepo template, then trimmed to match the WeYell build document.

See [docs/WEYELL_PHASE1.md](docs/WEYELL_PHASE1.md) for routes, suite-access rules, and entities.

## Structure

```
Wayel/
├── frontend/
│   ├── apps/customer-portal/   # Angular SPA (WeYell routes)
│   └── packages/shared/
├── backend/api/                # .NET API + Wayel.Bff.Customer
├── deploy/render/
└── docs/WEYELL_PHASE1.md
```

## Removed (out of Phase 1 scope)

- `frontend/apps/mobile-flutter`
- `frontend/apps/admin-portal`
- `Wayel.Bff.Admin`, `Wayel.Bff.External`
- Mobile TestFlight CI workflow

## Git

```bash
git remote add origin https://github.com/mninawa/wayel.git
git push -u origin main
```

Remote: [github.com/mninawa/wayel](https://github.com/mninawa/wayel.git)

## Quick start

**Docker deploy** — from repo root:

```bash
./deploy/up.sh
# → http://localhost:8080 (portal + BFF + API + Mongo)
```

| Service | URL |
|---------|-----|
| **App** | http://localhost:8080 |
| API (debug) | http://localhost:5099 |

Dev split ports: `docker compose up --build` — see [docs/DOCKER.md](docs/DOCKER.md).

**Frontend** (`frontend/`):

```bash
npm ci
npm run dev                # mock API + customer portal
npm run dev:portal:bff     # portal against BFF
```

**Backend** (`backend/api/`):

```bash
dotnet restore Wayel.Api.slnx
dotnet build Wayel.Api.slnx
```

Customer portal (host dev): http://127.0.0.1:4400 or http://localhost:4200 (BFF config).

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [ci.yml](.github/workflows/ci.yml) | PR + `main` | Build, unit tests, Docker image builds |
| [cd.yml](.github/workflows/cd.yml) | `main`, version tags | Publish to `ghcr.io/mninawa/wayel-*` |
