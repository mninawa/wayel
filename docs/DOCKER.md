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

On first API start, the API seeds **seven demo personas** into `courier_platform` (one per customer-journey stage). Password login is enabled in Docker (`AUTH_ENABLE_PASSWORD_SIGNIN=true`). All password personas use **`demo1234`**.

| Email | Journey stage |
|-------|----------------|
| `new.google@weyell.demo` | Just signed in with Google → complete profile (Google SSO only; no password login) |
| `ready.suite@weyell.demo` | Profile complete → choose suite plan & pay |
| `active@weyell.demo` | Active suite — parcels, invoices, create shipment |
| `expiring@weyell.demo` | Suite expiring soon — renew banner |
| `sabelo@weyell.demo` | Expired suite — locked quote, in-transit shipment, support ticket |
| `quote.done@weyell.demo` | Active suite — quote already approved (payment next) |
| `inbox@weyell.demo` | Active suite — busy parcel list & support history |

To re-seed a persona, delete that user (and related parcels/quotes if needed) in Atlas, then restart the API. To seed all personas from scratch, remove every `*@weyell.demo` user and restart.

### Create Shipment test data (any signed-in customer)

When `SEED_ALLOW_TEST_PARCELS=true` (default in local Docker), the API exposes:

`POST /api/v1/borderbox/dev/seed-shippable-parcels` with body `{ "dataset": "catalog-a" }` or `"catalog-b"` (requires customer session). **Catalog A** — fashion/beauty (Takealot, Zando, etc.). **Catalog B** — electronics/outdoor (Amazon, Garmin, Builders, etc.). Up to 12 shippable parcels if both catalogs are loaded.

This adds **6 ready-to-ship parcels** (~12.4 kg) with invoices for the logged-in user’s suite. On the portal, open **Shipments → Create shipment** and click **Load test parcels** if the list is empty.

Alternatively sign in as `active@weyell.demo` / `demo1234`, which already has parcels.

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
