# Platform mock API

A zero-dependency Node HTTP server that mirrors the Phase-0 platform/tenant
contracts consumed by `apps/web-angular`. It exists so the Angular app can be
exercised end-to-end (live HTTP path, not in-memory mocks) without spinning up
the real backend.

## Run

From the repo root:

```bash
node tools/platform-mock-api/server.mjs
```

Or via the Angular workspace:

```bash
cd apps/web-angular
npm run dev:mock          # mock only
npm run dev               # mock + ng serve, prefixed output
npm run dev:web           # ng serve only (assumes mock already running)
```

The server listens on `http://127.0.0.1:5280` by default. Override with
`PORT=6000 node tools/platform-mock-api/server.mjs`.

The Angular dev server proxies `/api` to this port via
`apps/web-angular/proxy.conf.json`, so as long as both processes are up the UI
will hit the mock through same-origin requests.

## Switching the UI to live mode

`apps/web-angular/src/environments/environment.ts` ships with `useMock: true`
(everything in-memory). To exercise this server instead, set:

```ts
useMock: false,
platformApiUrl: '',   // keep empty when using ng serve + proxy.conf.json
```

Then sign in at `/platform/login` with any of the seeded platform users
(see `users` in `server.mjs`) and the password `letmein`.

## What's implemented

- `POST /api/platform/sessions` — login (email + password `letmein`).
- `GET  /api/platform/tenants` — paged list, supports `search`, `status`,
  `plan`, `slug`, `page`, `pageSize`.
- `POST /api/platform/tenants/onboard` — creates a tenant; `409` on slug
  conflict; appends `tenant.onboarded` to the audit log.
- `GET  /api/platform/tenants/{id}` — tenant detail.
- `PATCH /api/platform/tenants/{id}/status` — lifecycle change; requires
  `reason` for `suspended`; appends `tenant.activated` /
  `tenant.suspended` / `tenant.archived` to the audit log.
- `GET  /api/platform/tenants/{id}/documents` — paged list, supports
  `search`, `status`, `page`, `pageSize`.
- `GET  /api/platform/users` — paged list, supports `search`, `page`,
  `pageSize`.
- `GET  /api/platform/audit` — paged list, supports `tenantId`,
  `noTenant=true`, `action`, `actor`, `page`, `pageSize`.
- `GET  /api/tenant/settings` — institution settings for the signed-in tenant.
- `GET  /api/tenants/by-slug/{slug}/settings` — institution settings by slug.

### Institution-side (children)

- `GET  /api/children` — paged roster, supports `search`, `membershipState`,
  `page`, `pageSize`.
- `GET  /api/children/{id}` — full profile (guardians, membership history,
  skills collected). Detail payloads are cached so subsequent writes are
  reflected on read within the same server session.
- `POST /api/children` — stand-in for the parent-facing subscription flow.
  Validates `displayName`, `dateOfBirth` (YYYY-MM-DD), and at least one named
  guardian; returns `400` with `{ code: 'VALIDATION', message }` otherwise.
- `PATCH /api/children/{id}/membership-state` — lifecycle change. `paused` and
  `ended` require a `reason`. Appends an entry to the membership history.
- `POST /api/children/{id}/skills` — log a skill against a child's permanent
  record. Requires `skillName`, `programName`, `occurredAt` (YYYY-MM-DD) and
  `instructorEmail`. The new entry is tagged with the current institution.
  Returns the new entry.

Detail payloads include `currentSubscription` (this institution's view) and
`otherSubscriptions` (read-only summary of subscriptions at sibling
institutions). The list endpoint includes `otherSubscriptionsCount` per row.

### Institution-side (subscription requests)

The other side of `POST /api/children` — when a parent subscribes via the
parent app and staff need to approve.

- `POST /api/subscription-requests` — the parent-side write surface. Requires
  `institutionId`, `childDisplayName`, `childDateOfBirth` (YYYY-MM-DD) and
  `parentEmail`. Optional: `parentDisplayName`, `message`, `classroomRequested`.
  Returns `{ requestId, receivedAt, institutionId, institutionName }`. If the
  parent targets the current institution the request appears in
  `GET /api/subscription-requests`; if they target a sibling institution the
  request still succeeds but is "delivered" to that institution's inbox (which
  the current staff can't see — realistic behaviour).
- `GET  /api/subscription-requests` — paged inbox, supports `status`
  (`pending` / `approved` / `rejected`), `search`, `page`, `pageSize`.
- `POST /api/subscription-requests/{id}/approve` — accepts an optional
  `classroom` override. Materialises a real child + active subscription
  (visible immediately on `/api/children`) and returns
  `{ childId, subscriptionId, approvedAt }`. `409` when already resolved.
- `POST /api/subscription-requests/{id}/reject` — requires `reason`. Returns
  `204`. `409` when already resolved.

State is in-process and resets on every restart. Lifecycle changes,
onboarding, child-skill writes, and subscription-request decisions are
persisted in the in-memory cache so the UI reflects real interactions you
make.
