# WeYell — Phase 1 Customer Portal

Source: `WeYell_SA_Phase1_Customer_Portal_Cursor_Build_Document.docx`

## Scope

- **In:** Desktop web customer portal (Eswatini → South Africa shopping corridor)
- **Out:** Mobile app, admin portal, multi-tenant institution platform (legacy from template)

## Suite access (core rule)

| State | Receive parcels | Upload invoices | Ship out |
|-------|-----------------|-----------------|----------|
| PENDING_PAYMENT | No | No | No |
| ACTIVE | Yes | Yes | Yes |
| EXPIRING_SOON | Yes | Yes | Yes |
| EXPIRED | Yes | Yes | **No** (suite reserved; renew to unlock) |
| SUSPENDED | Manual | Manual | No |

**Locked when expired:** create shipment, ship-out, consolidation, quote approval.  
**Still allowed when expired:** receive parcels, upload invoices.  
**Primary CTA when expired:** Renew Suite Access (R100/month or R200/quarter).

## Frontend routes (`apps/customer-portal`)

| Route | Screen |
|-------|--------|
| `/sign-in` | Sign In |
| `/onboarding/choose-suite-plan` | Create account / choose plan |
| `/dashboard` | Dashboard |
| `/my-address` | My Address & Profile |
| `/received-parcels` | Received Parcels |
| `/parcels/:id` | Parcel Details |
| `/suite-access/checkout` | Renew Suite Access |
| `/shipments/create` | Create Shipment |
| `/shipping/quote/:id` | Shipping Quote |
| `/tracking-support` | Tracking & Support |

## Backend entities (to implement in `Wayel.Domain`)

- `User`, `SuitePlan`, `SuiteSubscription`, `Address`, `Parcel`, `Invoice`
- `Shipment`, `Quote`, `Payment`, `Notification`, `SupportTicket`

Legacy modules under `Wayel.Domain` (children, schools, tenants, etc.) are **template residue** — remove as WeYell features land.

## Repo layout after trim

```
Wayel/
├── frontend/
│   ├── apps/customer-portal/   # only SPA
│   └── packages/shared/        # design system + API clients (trim over time)
├── backend/api/
│   ├── src/Wayel.Api
│   ├── src/Wayel.Bff.Customer    # single BFF for customer portal
│   └── src/Wayel.Bff.Shared
└── deploy/render/              # customer edge only (admin/external removed)
```
