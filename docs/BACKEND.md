# WeYell backend

## Projects

| Project | Role |
|---------|------|
| `Wayel.Api` | HTTP API (`/api/v1/auth/*`, `/api/v1/borderbox/*`) |
| `Wayel.Bff.Customer` | Cookie session + reverse proxy for customer portal |
| `Wayel.Application` | MediatR handlers, suite-access rules |
| `Wayel.Domain` | WeYell entities |
| `Wayel.Infrastructure` | MongoDB persistence |

## Domain modules

- `Users`, `Sessions`, `Identities` — auth
- `SuitePlans`, `SuiteSubscriptions` — R100/month, R200/quarter
- `Addresses` — South African suite address
- `Parcels`, `Shipments`, `Quotes` — forwarding workflow

## Suite access (`SuiteAccessEvaluator`)

Implements Phase 1 rules: expired suites can receive parcels and upload invoices but cannot ship out or approve quotes.

## API (authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/borderbox/account` | Customer profile, addresses, journey flags |
| PATCH | `/api/v1/borderbox/account/profile` | Complete / update profile (suite eligibility) |
| PATCH | `/api/v1/borderbox/account/notifications` | Notification preferences |
| POST | `/api/v1/borderbox/account/delivery-addresses` | Add Eswatini delivery address |
| PUT | `/api/v1/borderbox/account/delivery-addresses/{id}` | Update delivery address |
| DELETE | `/api/v1/borderbox/account/delivery-addresses/{id}` | Remove delivery address |
| POST | `/api/v1/borderbox/account/delivery-addresses/{id}/default` | Set default delivery address |
| GET | `/api/v1/borderbox/dashboard` | Dashboard summary |
| GET | `/api/v1/borderbox/suite-plans` | List plans |
| POST | `/api/v1/borderbox/suite-access/checkout` | Activate/renew suite (requires complete profile) |
| GET | `/api/v1/borderbox/parcels` | List parcels |
| POST | `/api/v1/borderbox/shipments` | Create shipment (blocked when expired) |
| POST | `/api/v1/borderbox/quotes/{id}/approve` | Approve quote (blocked when expired) |

## Run locally

```bash
cd backend/api
dotnet restore Wayel.Api.slnx
docker compose up api bff-customer
# API :5099, BFF :5299
```

Mongo database defaults to `borderbox`. Suite plans seed on first startup.
