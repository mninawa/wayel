# Docker — WeYell local stack

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Optional: copy root `.env.example` → `.env` for Google SSO and Atlas Mongo

## Deploy (recommended — one URL)

Runs API + BFF + production portal (nginx proxies `/bff` and `/api`). Uses **MongoDB Atlas** when `MONGO_CONNECTION_STRING` in `.env` is an `mongodb+srv://` URL; otherwise starts bundled Mongo on `localhost:27017`.

```bash
cp .env.example .env   # set Atlas URI + MONGO_DATABASE_NAME=courier_platform
./deploy/up.sh
# open http://localhost:8080
```

### Demo data toggle

Demo personas and dev test-parcel helpers are **on by default in Development** (local `dotnet run` and Docker when the API runs as `Development`). In **Production**, they stay off unless you explicitly opt in via env vars.

| Toggle | Env var (Docker `.env`) | API config key | What it controls |
|--------|-------------------------|----------------|------------------|
| Demo personas | `SEED_DEMO_DATA=true\|false` | `Seed__DemoData__Enabled` | Seven `*@weyell.demo` users seeded on startup (password `demo1234`) |
| Test parcels | `SEED_ALLOW_TEST_PARCELS=true\|false` | `Seed__TestParcels__Enabled` | `POST /api/v1/borderbox/dev/seed-shippable-parcels` for signed-in customers |

Check effective flags at runtime: `GET /api/v1/auth/config` → `{ demoDataEnabled, testParcelsEnabled }`.

When demo personas are enabled, these accounts are inserted on first API boot (skipped if the email already exists):

| Email | Journey stage |
|-------|----------------|
| `new.google@weyell.demo` | Just signed in with Google → complete profile (Google SSO only; no password login) |
| `ready.suite@weyell.demo` | Profile complete → choose suite plan & pay |
| `active@weyell.demo` | Active suite — parcels, invoices, create shipment |
| `expiring@weyell.demo` | Suite expiring soon — renew banner |
| `sabelo@weyell.demo` | Expired suite — locked quote, in-transit shipment, support ticket |
| `quote.done@weyell.demo` | Active suite — quote already approved (payment next) |
| `inbox@weyell.demo` | Active suite — busy parcel list & support history |

To turn demo data **off** locally, set `SEED_DEMO_DATA=false` and `SEED_ALLOW_TEST_PARCELS=false` in `.env`, then restart the API. On Render (`wayel-api`), set `Seed__DemoData__Enabled=false` (already the blueprint default).

Atlas-only compose override (no local `mongo` container):

```bash
docker compose -f docker-compose.yml -f docker-compose.atlas.yml --profile portal up -d --build
```

Stop: `./deploy/down.sh`

### Parcel invoice storage (S3)

Configured via `.env` (defaults in `docker-compose.yml`):

| Variable | Value |
|----------|--------|
| `MEDIA_STORAGE_BUCKET` | `we-yell-courier-platform` |
| `MEDIA_STORAGE_CDN_HOST` | `d1uqzemvshg76c.cloudfront.net` |
| `MEDIA_STORAGE_REGION` | `eu-west-1` |

Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env` for uploads from Docker. Use `MEDIA_STORAGE_PROVIDER=in-memory` to skip S3 locally.

### Suite checkout (Paystack)

Renewal at `/suite-access/checkout` redirects to **Paystack** hosted checkout, then returns to `/suite-access/checkout/complete` to activate the suite.

| Variable | Purpose |
|----------|---------|
| `PAYSTACK_SECRET_KEY` | `sk_test_…` / `sk_live_…` from Paystack dashboard (required) |
| `PAYSTACK_PUBLIC_KEY` | `pk_test_…` / `pk_live_…` (required for inline checkout) |

Both keys are required — the API refuses to start without `PAYSTACK_SECRET_KEY`,
and the SPA inline checkout needs `PAYSTACK_PUBLIC_KEY` to open the payment widget.

### Google SSO (`redirect_uri_mismatch`)

When using the portal at **http://localhost:8080**, register this OAuth **Web client** in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (same client id as `GOOGLEOIDC__CLIENTID` in `.env`):

| Field | Value |
|-------|--------|
| **Authorized JavaScript origins** | `http://localhost:8080` |
| **Authorized redirect URIs** | `http://localhost:8080/signin-oidc` |

Also add `http://localhost:5299/signin-oidc` if you hit the BFF directly on port 5299. URIs must match **exactly** (scheme, host, port, path).

Ensure `BFF__SPA_BASE_URI=http://localhost:8080` in `.env` and that `mninawa@gmail.com` is a **test user** on the OAuth consent screen while the app is in Testing mode.

## Run the stack (dev / split ports)

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
