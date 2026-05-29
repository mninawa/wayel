# Wayel — Security & Threat Model

This document captures (a) where Wayel secrets live across environments, (b)
how they're rotated, and (c) the project-level threat model: what we're
defending against, what we're not, and which controls map to which threats.

It is intentionally conservative — it is meant to be a checklist for the next
operator, not a marketing document.

## 1. Secrets inventory

| Secret                                          | Owner project        | Used for                                                  | Rotation |
| ----------------------------------------------- | -------------------- | --------------------------------------------------------- | -------- |
| `Jwt:SigningKey`                                | `Wayel.Api`          | Signs all access tokens issued to BFFs                    | 90 days  |
| `Mongo:ConnectionString`                        | `Wayel.Api`          | DB connection (auth + tenant data)                        | On compromise / staff change |
| `GoogleAuth:ClientIds[]`                        | `Wayel.Api`          | Allowlist of Google OAuth clients permitted to mint id_tokens | On client rotation |
| `GoogleOidc:ClientId` / `GoogleOidc:ClientSecret` | each `Wayel.Bff.*`  | OIDC code-flow with Google                                 | 90 days, or immediately on suspected leak |
| `Auth:Sso:BootstrapSuperAdmins[]`               | `Wayel.Api`          | Emails auto-promoted to `SuperAdmin` on first sign-in     | Out-of-band: drop from config once a real admin exists |
| ASP.NET Core `DataProtection` keys              | each `Wayel.Bff.*`   | Encrypts the BFF session cookie                            | Auto-rotated; persist the key ring per host (file or KMS) |

> **Never** commit any of the above to source control. CI will fail if a key
> ending in `_KEY`, `_SECRET`, or matching `mongodb+srv://` shows up in a diff.

## 2. Where secrets live, by environment

### Development (one developer's box)

- **.NET User Secrets** (`dotnet user-secrets`) per project. Each project has
  its own `UserSecretsId` so e.g. `GoogleOidc:ClientSecret` for the admin BFF
  doesn't collide with the client BFF.
- See the README §"Run locally → Option C" for the exact `user-secrets set`
  commands.
- `appsettings.Development.json` is allowed to contain *non-secret*
  development overrides only (logging levels, sample tenant ids).

### Staging / preview

- Secrets live in **Azure Key Vault** (or AWS Secrets Manager — pick one per
  cloud), referenced from app config via the `AddAzureKeyVault` configuration
  provider. The CI pipeline's deploy job has read-only access; humans cannot
  read them through the portal without an approved JIT request.
- The DataProtection key ring for each BFF is persisted to a per-environment
  Azure Storage container with KMS encryption.

### Production

- Same model as staging: **Key Vault per environment** (no shared secrets
  across envs).
- Mongo connection string is scoped to a per-environment Atlas database user
  with the *minimum* set of roles (`readWrite` on the app database, `read` on
  `local` for the change stream when we wire it up).
- JWT signing key is generated at provisioning time (`openssl rand -base64 48`),
  written to Key Vault, and never read by a human.

### Local CI (GitHub Actions)

- Each test job exports just enough config to run integration tests against an
  ephemeral Mongo container started by Testcontainers. No production secrets
  are exposed to PR builds.
- Release jobs reach production secrets through a federated Key Vault binding
  scoped by `environment:` in the workflow file.

## 3. Rotation playbook

1. **Generate** the replacement secret in Key Vault (don't reuse the old slot
   yet — you want both available simultaneously).
2. **Deploy** the new secret to staging; verify with the smoke tests under
   `tests/Wayel.Api.IntegrationTests`.
3. **Cut over** production by swapping the Key Vault reference in the
   environment's app settings.
4. **Disable** the old secret after one full session lifetime
   (`Bff:SessionLifetimeMinutes`, default 14 days) so any in-flight cookies
   keep working through the rotation.

For the JWT signing key the API supports key-id rollover via
`Jwt:SigningKey`'s `kid` field (currently fixed). When we add multi-key
support the playbook above stays the same; the only addition is updating the
Authorization Server's `jwks_uri`.

## 4. Threat model (STRIDE)

The system perimeter we're modelling is "the SPAs talk to per-audience BFFs;
BFFs talk to one Wayel.Api which talks to MongoDB Atlas; Google is the only
identity provider."

### Spoofing — pretending to be another identity

| Threat                                                          | Control                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Forged Google id_token                                          | `GoogleIdTokenValidator` validates issuer + signature + audience against `GoogleAuth:ClientIds[]` |
| BFF cookie replay across tabs/users                             | Cookie is `HttpOnly`, `SameSite=Lax`, `Secure` outside Dev; bound to the BFF host's data-protection key |
| Cross-BFF cookie reuse (e.g. admin cookie sent to client BFF)   | Each BFF uses its own `CookieName` and its own `DataProtection` application name |
| Forged JWT to Wayel.Api                                         | API validates `iss`/`aud`/`kid`/`exp` against `Jwt:Issuer/Audience/SigningKey` |
| Compromised refresh token                                       | One-time-use rotation + reuse detection: any reuse revokes the entire session chain |

### Tampering — modifying data in transit/at rest

| Threat                                                          | Control                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| MITM on SPA ↔ BFF / BFF ↔ API                                   | HSTS in non-Dev environments; cookie `Secure` enforced server-side regardless of operator config |
| Tampering with the BFF session cookie                           | DataProtection encrypt+sign with rotating key ring                      |
| Replay/manipulation of OIDC flow                                | OIDC code flow + PKCE + state + nonce (handled by Microsoft middleware) |
| Tampering with audit log rows                                   | `audit_log` collection is append-only via `IAuditLogger`; no update path is exposed; SuperAdmin read API does not allow mutations |

### Repudiation — denying an action

| Threat                                          | Control                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| User denies they performed an action            | `audit_log` records actor (user id + email), audience, IP, UA, outcome, and reason for every auth + invitation action |
| Operator denies a config change in production   | Out of scope for this codebase — owned by the deployment pipeline (signed CI runs) |

### Information disclosure

| Threat                                                          | Control                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Bearer token landing in browser JS / `localStorage`             | The SPA never sees the token. JWT is server-relayed by `AccessTokenRelayMiddleware` from the BFF cookie session. |
| Refresh token landing in JS                                     | Refresh token only lives inside the encrypted BFF cookie payload, never in a header or response body to the SPA |
| Verbose error details leaking internals                         | All handler errors map to RFC 7807 ProblemDetails; stack traces only surface in `Development` |
| Missing security headers on API responses                       | `ApiSecurityMiddleware` sets `X-Content-Type-Options`, `X-Frame-Options`, `CSP`, `Cache-Control: no-store`, etc. |
| HSTS absent on public API host                                  | `UseHsts()` in non-Development environments |
| Audit log containing PII at rest                                | Email + IP are PII; mitigated by 180-day TTL, role-gated read endpoint (SuperAdmin only), and Atlas at-rest encryption |
| Logs containing tokens                                          | `Serilog` enrichers redact `Authorization` header; never log refresh tokens (handlers receive them by hash) |

### Denial of service

| Threat                                          | Control                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Credential-stuffing on password endpoint        | Per-IP rate limiter (`auth` policy, 10/min). Endpoint is also disabled by default — `Auth:EnablePasswordSignIn=false` outside Dev. |
| Token-validation flood on `/auth/sso/google`    | Same `auth` rate limit policy                                          |
| Refresh-token grinding                          | Same rate limit policy + reuse detection that revokes the chain        |
| API abuse / volumetric scans on `/api/v1`       | Per-IP `api` rate limiter (240/min default) on the whole API group; `auth` (10/min) and `webhook` (120/min) policies on sensitive surfaces |
| Automated scanner probes (`/.env`, `/wp-admin`, …) | `ApiSecurityMiddleware` returns 404 for known exploit paths; dangerous verbs (TRACE/TRACK) return 405 |
| Oversized request bodies                        | Kestrel `MaxRequestBodySize` capped via `ApiSecurity:MaxRequestBodyBytes` (12 MiB default) |
| Outbox poisoned by a faulty event handler       | `Outbox:MaxAttempts` (default 5) dead-letters the row; pending poll skips DLQ rows so the dispatcher can't busy-loop |
| Mongo overwhelmed by audit writes               | Audit writes are best-effort and TTL-pruned; Mongo index for query side keeps reads cheap |

### Elevation of privilege

| Threat                                                          | Control                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| User issues invitations for tenants they don't own              | `TenantAdminOrAbove` policy on `/staff-invitations` group; `CreateStaffInvitationCommandHandler` enforces tenant scope from `ICurrentUser` |
| User accepts an invitation issued to a different email          | `AcceptStaffInvitationCommandHandler` requires `currentUser.Email` (case-insensitive) to equal `invitation.Email` |
| Audience confusion (admin token used against client portal)     | `Wayel.Application/Security/ConfigBackedSsoAdmissionPolicy` enforces per-audience admission rules; BFF cookie is per-host |
| CSRF against state-changing BFF/API routes                      | `BffAntiforgeryMiddleware` validates double-submit `X-XSRF-TOKEN` for POST/PUT/PATCH/DELETE under `/bff` + `/api` |
| Bootstrap super-admin self-service                              | `Auth:Sso:BootstrapSuperAdmins[]` is a config-only list; not exposed via any API |

## 5. Out of scope (today)

- **Mobile / first-party native clients.** No public `/api/v1/auth/sso/google`
  rate limiting beyond IP — the policy assumes a small number of trusted BFFs.
  Add a per-OAuth-client policy when we ship a mobile app.
- **Tenant-scoped audit RBAC.** Today the audit query endpoint is
  SuperAdmin-only; tenant admins cannot see "what happened in my tenant?". A
  scoped read endpoint with tenant filtering is on the roadmap.
- **Field-level encryption / PII tokenisation.** We rely on Atlas at-rest
  encryption + role-scoped DB users. A field-level encryption pass for free-text
  parent / child notes will land with the parent-portal slice.
- **Hardware-backed key store for `Jwt:SigningKey`.** Currently a Key Vault
  secret. HSM-backed signing (KMS or Azure Managed HSM) is on the security
  roadmap but blocked on tenant volume justifying the cost.

## 6. Reporting a vulnerability

Email `security@wayel.dev` (PGP key on the website). Please do not file public
GitHub issues for security problems — we aim to acknowledge within one business
day and ship a fix within seven.
