# WeYell Ops — Parcel Receiving Module

Internal operations microfrontend for **parcel receiving & warehouse operations**, per the WeYell Ops build document.

**Route prefix:** `/ops/receiving`

## Run locally

```bash
cd frontend && npm install && npm run dev:ops-dash
```

Open **http://127.0.0.1:4500/ops/receiving**

Ops key: `weyell-local-kyc-ops` (or `KYC_OPS_API_KEY` from `.env`)

### Docker (portal profile)

**http://localhost:8081/ops/receiving**

```bash
docker compose -f docker-compose.yml -f docker-compose.deploy.yml --profile local-mongo --profile portal up -d --build
```

## Screens (build document)

| Route | Screen |
|-------|--------|
| `/ops/receiving` | Receiving dashboard — KPIs + queue |
| `/ops/receiving/queue` | Receiving queue |
| `/ops/receiving/new` | Receive new parcel (scan → match → capture → confirm) |
| `/ops/receiving/matching/:parcelId` | Parcel matching |
| `/ops/receiving/parcels/:parcelId` | Parcel details |
| `/ops/receiving/parcels/:parcelId/inspection` | Inspection checklist |
| `/ops/receiving/parcels/:parcelId/invoice` | Invoice verification |
| `/ops/receiving/exceptions` | Exceptions queue |
| `/ops/receiving/ready-for-quote` | Ready for quote + handoff |

Platform modules: `/ops/kyc`, `/ops/shipments`, `/ops/settings`

## API (`X-Wayel-Ops-Key`)

Base: `/api/v1/borderbox/ops/receiving`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/dashboard` | KPIs + receiving queue |
| GET | `/exceptions` | Exception queue (derived) |
| GET | `/ready-for-quote` | Quote-ready parcels |
| POST | `/parcels/intake` | Register new parcel |
| GET | `/parcels/{id}` | Parcel detail + readiness |
| POST | `/parcels/{id}/invoice/verify` | Approve/reject invoice |
| POST | `/parcels/{id}/inspection` | Save inspection |
| POST | `/quote-queue` | Send parcels to quote queue |

Legacy parcel ops paths under `/borderbox/ops/parcels` remain for compatibility.

## Readiness rules (MVP)

Parcel is **READY** when: suite matched, weight & dimensions captured, inspection completed, invoice verified, declared value set. Ops can send READY parcels to the quote queue (`ReadyToShip` status).

## Scope

Separate from the customer portal. Customer users cannot access ops routes (ops API key required).
