# Wayel

Multi-app workspace built around an in-memory mock API. Two Angular apps share a single `@wayel/shared` package; a Flutter mobile app lives alongside.

## Repository layout

```text
apps/
  REMOVED/     # Super-admin / platform portal (tenants, users, audit) — Angular, dev port :4200
  client-portal/    # Internal staff + view-as-parent simulator — Angular, dev port :4300
                    #   /staff/*  institution workspace (children, memberships, programs, …)
                    #   /parent/* in-app parent simulator (chooser, roster, archive download)
  customer-portal/  # PUBLIC-FACING app for parents-at-home and contract staff — Angular, dev port :4400
                    #   /              welcome (pick "I'm a parent" / "I'm a staff member")
                    #   /register      real signup with role tabs
                    #   /login         email + password
                    #   /parent/*      authenticated parent: roster + add child
                    #   /staff/*       authenticated staff: my assigned programs
  REMOVED/   # Parent + teacher mobile (mock)
  web-angular/      # DEPRECATED — pre-split combined app, kept for reference until the new split is verified end-to-end. See "Decommissioning" below.
packages/
  shared/           # @wayel/shared — contracts, mock data, api+bridge services, tokens, utils.
                    #   No build step; each app imports via TS path alias `@wayel/shared/*`.
tools/
  platform-mock-api/  # Node mock backend on http://127.0.0.1:5280 (server.mjs)
  dev.mjs             # Legacy two-process orchestration kept for the old web-angular setup.
```

## Quick start (one shell, all four processes)

From the repo root:

```bash
chmod +x start.sh    # one-time, makes the launcher executable
./start.sh           # installs deps if missing, frees stale ports if asked, boots everything
```

Or directly with npm:

```bash
npm install          # workspaces install (root + apps + packages)
npm run dev          # boots mock :5280, admin :4200, client :4300, external :4400 in parallel
```

Then open:

| URL | What |
|---|---|
| `http://127.0.0.1:4200/` | Admin portal — redirects to `/dashboard` (super-admin) |
| `http://127.0.0.1:4300/staff/dashboard` | Internal staff workspace |
| `http://127.0.0.1:4300/parent` | In-app parent simulator (staff "view-as-parent") |
| `http://127.0.0.1:4400/` | **External-client** — public welcome → register / login |
| `http://127.0.0.1:5280/api/parents` | Mock API (used by every app via the dev-server proxy) |

All three Angular apps proxy `/api/*` to the mock server (`proxy.conf.json` in each app), so you can flip a single environment file to swap to a real backend later.

`./start.sh --help` for the launcher's options (`--install`, `--clean`, `--logs`).

## Per-app scripts

```bash
npm run dev:mock        # only mock API
npm run dev:admin       # only REMOVED :4200
npm run dev:client      # only client-portal :4300
npm run dev:external    # only customer-portal :4400

npm run build           # build every workspace that has a build script
npm run build:admin
npm run build:client
npm run build:external
```

## Admin portal (`apps/REMOVED`)

Super-admin / platform-level. Routes are flat (no `/platform/*` prefix anymore — the whole app **is** the platform):

| Route | Notes |
|---|---|
| `/login` | Mock token sign-in (or skip when `environment.skipPlatformAuth = true`) |
| `/dashboard` | Stat tiles, recent activity |
| `/tenants` / `/tenants/new` / `/tenants/:id` / `/tenants/:id/documents` | Tenant registry + lifecycle |
| `/users` / `/users/:id` | Platform user roster |
| `/audit` | Cross-tenant audit log |

The legacy URL `/platform/login` still works (redirects to `/login`) so old bookmarks don't break.

### Tenant data source

`PlatformTenantBridgeService` picks one of three back-ends at bootstrap:

| Mode | When | What it talks to |
|---|---|---|
| `useMock: true` | `npm run dev:admin` (default) | `MockPlatformTenantService` — rich in-memory catalogue with branding, plan, status, SSO, etc. |
| `useWayelAdminApi: true` (and `useMock: false`) | `npm run dev:admin:bff` and production builds | `WayelAdminTenantsService` → `/api/v1/admin/tenants` via `REMOVED` (cookie + antiforgery). |
| neither | legacy fallback | `PlatformTenantApiService` (Phase-0 `/api/platform/tenants` contract). |

The Wayel.Api surface is intentionally narrower than the rich mock UI (id / name / slug / kind / createdOnUtc only). `wayel-admin-tenant-mappers` projects API rows into `MockPlatformTenant` with sensible defaults (`plan: 'starter'`, `status: 'active'`); mutations the API doesn't model yet (status, branding, SSO, settings, profile) still fall back to the mock service. The `bff` configuration is wired to the new `environment.bff.ts` via `angular.json`.

## Client portal (`apps/client-portal`)

Two first-class surfaces in one shell:

### `/staff/*` — institution workspace

| Area | Route |
|---|---|
| Dashboard | `/staff/dashboard` |
| Children | `/staff/children`, `/staff/children/subscribe`, `/staff/children/:id` |
| Subscriptions inbox + simulator | `/staff/memberships`, `/staff/memberships/simulate-parent` |
| Staff invites | `/staff/invitations` |
| Parent invites | `/staff/parent-invitations` |
| Programs / Events / Attendance | `/staff/programs`, `/staff/events`, `/staff/attendance` |
| Daily reports | `/staff/reports`, `/staff/reports/new` |
| Milestones | `/staff/milestones` |
| Tags / Audit / Consents / Settings | `/staff/reference`, `/staff/audit`, `/staff/consents`, `/staff/settings` |

### `/parent/*` — parent surface

| Area | Route |
|---|---|
| Home (parent chooser) | `/parent` |
| My children (roster + archives) | `/parent/children?parentId=...` |
| Subscribe to an institution | `/parent/subscribe` (reuses the same wizard as the staff-side simulator) |

The parent roster surfaces every child's full **subscription timeline** across every institution they've ever attended, with per-period **Archive & download** buttons (plus a **Download full lifetime** export). Archived periods are sealed (`archivedAt` stamped server-side) and the JSON is yours to keep.

A "Switch view" pill in the top bar of each shell flips between staff and parent without leaving the app.

## External-client (`apps/customer-portal`)

Public-facing surface for users *outside* the institution: parents at home and contract staff who haven't been issued an internal account. Distinct from `client-portal` (which is for on-premise institutional use).

| Route | Notes |
|---|---|
| `/` | Welcome — pick "I'm a parent" / "I'm a staff member" |
| `/register?role=parent\|staff` | Real signup form (email + password + role tabs) |
| `/login` | Email + password, with seeded demo accounts listed inline in mock mode |
| `/parent/children` | Authenticated parent: roster + inline "add child" form |
| `/staff/programs` | Authenticated staff: programs assigned to you by your institution |
| `/staff/programs/:id` | Program detail (placeholder for upcoming roster + attendance + daily reports) |

### Auth model

Mock mode runs against `tools/platform-mock-api/server.mjs`:
- `POST /api/accounts/register` — creates an account; for parents it also mints a `parent_*` identity so the roster is immediately addressable.
- `POST /api/accounts/login` — returns `{account, sessionToken, expiresAt}`.
- `GET  /api/accounts/me` and `GET /api/staff/me/programs` — bearer-token authenticated.
- Sessions are random opaque tokens kept in-memory in the mock server and in `localStorage` on the client (`AccountSessionService`).

Seeded demo accounts (mock mode, password `demo1234` for all):

| Email | Role | What they see |
|---|---|---|
| `thandi.mavuso@example.com` | parent | The pre-existing roster used by the in-app simulator |
| `amara.lopez@example.com` | parent | A second parent profile |
| `jane@littlestars.test` | staff | Toddlers A + Aftercare |
| `kabelo@littlestars.test` | staff | Pre-K B |

When the real backend lands, only `tools/platform-mock-api/server.mjs` and the live API services change — the contracts in `packages/shared/src/core/contracts/accounts.phase0.ts` and the bridge/session/interceptor wiring stay put.

## `@wayel/shared`

Single source of truth for everything cross-app: Phase 0 contracts, mock data, api/bridge services, http error util, the platform & customer-portal auth interceptors, the `PLATFORM_API_URL` injection token, and the `AccountSessionService`. No build step — each app pulls the sources in via TS path alias:

```jsonc
// in apps/{REMOVED,client-portal,customer-portal}/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@wayel/shared/*": ["../../packages/shared/src/*"],
      "@app/environment": ["src/environments/environment.ts"]
    }
  }
}
```

Bridge services import `import { environment } from '@app/environment'`, which each app maps to its own concrete `environment.ts` / `environment.prod.ts`. That keeps app-specific flags independent while letting shared services stay app-agnostic. Edit a contract or bridge service in `packages/shared/src/` and both apps pick it up on the next build.

See `packages/shared/README.md` for the full layout.

## Decommissioning `apps/web-angular`

The old combined app is still in the tree for safety while the split is being verified. Once you've smoke-tested both new apps end-to-end (especially the parent archive flow and the platform auth flow), delete it:

```bash
rm -rf apps/web-angular
```

Nothing else in the repo depends on it.

## Mobile (Flutter)

Unchanged by the split.

```bash
cd apps/REMOVED
flutter pub get
flutter create . --project-name wayel_kids_mobile   # if ios/android missing
flutter run
```

**Parent:** bottom nav — Home, Vault, Children, Messages, Profile. More: Join code, Events, Pre-day notes, Consent, Settings (from Home). **Teacher:** Home, Reports, Attendance, Roster, Profile; plus session report, institution events. Child detail: **Overview / Reports / Vault** tabs.

Mock join code: `STAR-2026`.

## Workflow

Plan → review plan → execute → review execution. Backend replaces mocks incrementally; the Phase 0 contracts in `packages/shared/src/core/contracts/` are the source of truth for the eventual ASP.NET Core API surface.
