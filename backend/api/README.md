# Wayel API

A .NET 10 / MongoDB / CQRS backend for the Wayel platform.

## Stack

| Concern        | Choice                                         |
| -------------- | ---------------------------------------------- |
| Runtime        | **.NET 10 LTS**                                |
| Style          | **Minimal APIs** + endpoint groups             |
| CQRS           | **MediatR 12** + pipeline behaviors            |
| Validation     | **FluentValidation** (via MediatR pipeline)    |
| Persistence    | **MongoDB.Driver** with explicit class maps    |
| Mapping        | **Mapster**                                    |
| Logging        | **Serilog** (structured)                       |
| Auth           | **Google SSO via per-audience BFF** (cookie ↔ JWT bearer) |
| Errors         | `Result<T, Error>` → RFC 7807 ProblemDetails   |
| Docs           | `Microsoft.AspNetCore.OpenApi` + **Scalar** UI |
| Health         | `/health/live` + `/health/ready` (Mongo probe) |
| Testing        | xUnit + FluentAssertions + NSubstitute + Testcontainers.MongoDb |
| Architecture   | **Clean Architecture** (Domain → Application → Infrastructure → Api) |

## Layout

```
backend/api/
├── Wayel.Api.slnx
├── Directory.Build.props        # shared MSBuild + warnings-as-errors
├── Directory.Packages.props     # Central Package Management (single source for versions)
├── global.json                  # SDK pin
├── Dockerfile                   # multi-stage; builds whichever PROJECT build-arg points at
├── docker-compose.yml           # mongo + api + bff-admin
└── src/
    ├── Wayel.Domain/            # entities, value objects, errors, Result/Error
    │   ├── Identities/          # ExternalIdentity (Google/Microsoft/Password link)
    │   ├── Sessions/            # RefreshToken (rotating, reuse-detected)
    │   └── ...
    ├── Wayel.Application/       # commands/queries, handlers, abstractions, MediatR behaviors
    ├── Wayel.Infrastructure/    # MongoContext, repositories, JWT, BCrypt, system clock,
    │                            #   AuthSessionIssuer, GoogleIdTokenValidator
    ├── Wayel.Api/               # composition root, endpoint groups, middleware (core API)
    ├── Wayel.Bff.Shared/        # cookie+OIDC composition, YARP wiring, token-relay middleware
    ├── REMOVED/         # admin SPA's BFF host    (audience=Admin,    port 5199)
    ├── Wayel.Bff.Customer/        # client SPA's BFF host   (audience=Client,   port 5198)
    └── REMOVED/      # external SPA's BFF host (audience=External, port 5197)
└── tests/
    ├── Wayel.Application.Tests/      # domain + handler unit tests (NSubstitute)
    ├── Wayel.Infrastructure.Tests/   # infra-only unit tests (claim coercion, etc.)
    └── Wayel.Api.IntegrationTests/   # WebApplicationFactory + Testcontainers MongoDB
```

## Run locally

### Option A — Docker Compose (recommended)

Three compose files are shipped:

| File | Use | Build path |
| ---- | --- | ---------- |
| `docker-compose.yml`     | Original parameterised stack — single `Dockerfile` driven by build-args. Kept for back-compat. | `Dockerfile` (`PROJECT=...` arg) |
| `docker-compose.dev.yml` | Recommended local stack — per-host `Dockerfile.<host>`, readiness-aware `depends_on` (waits on `/health/ready`), explicit healthchecks on every service. | `Dockerfile.Api`, `Dockerfile.Bff.Admin`, `Dockerfile.Bff.Customer`, `Dockerfile.Bff.External` |
| `docker-compose.localhost.yml` | **Recommended overlay** — same as proxy stack but **`http://localhost:8081` / `:8082` / `:8083`** (no `/etc/hosts`, **Google OAuth–friendly**). | `Caddyfile.localhost` + `../../frontend/apps/*/Dockerfile` |
| `docker-compose.proxy.yml` | **Overlay** — Caddy + **`http://*.wayel.local`** (:80), plus **nginx SPAs**. Handy for hostnames; **not** for Google SSO over HTTP (see [`DEV-DOMAINS.md`](./DEV-DOMAINS.md)). | `Caddyfile` + `../../frontend/apps/*/Dockerfile` |

> **MongoDB Atlas is the source of truth.** No Mongo container is shipped
> in compose. Copy `.env.example` to `.env` and paste your Atlas SRV
> connection string into `MONGO_CONNECTION_STRING` before bringing the
> stack up. Make sure your laptop's IP is on the Atlas Network Access
> allow-list.

```bash
cd backend/api
cp .env.example .env   # then fill in MONGO_CONNECTION_STRING
docker compose -f docker-compose.dev.yml up --build

# Full stack on loopback (admin UI at http://localhost:8081 — best for Google SSO):
docker compose -f docker-compose.dev.yml -f docker-compose.localhost.yml up --build

# Or custom hostnames on :80 (http://admin.wayel.local — needs /etc/hosts):
docker compose -f docker-compose.dev.yml -f docker-compose.proxy.yml up --build
```

The API listens on <http://localhost:5099>. Visit:

- <http://localhost:5099/health/live>     — liveness only (host process answering)
- <http://localhost:5099/health/ready>    — Atlas + outbox-dispatcher heartbeat
- <http://localhost:5099/docs>            — Scalar API explorer (always on outside Production)
- <http://localhost:5099/openapi/v1.json> — raw OpenAPI document

Each per-audience BFF also self-documents the cookie-bearing surface
(`/bff/auth/*` plus the YARP-proxied `/api/*` upstream). Compose maps
them to host ports `5199` / `5299` / `5399`; the dev-time `dotnet run`
ports are `5199` / `5198` / `5197`:

| BFF                   | Health (compose)                                             | Docs                              |
| --------------------- | ------------------------------------------------------------ | --------------------------------- |
| `REMOVED`     | <http://localhost:5199/health/live> · <http://localhost:5199/health/ready> | <http://localhost:5199/docs>      |
| `Wayel.Bff.Customer`    | <http://localhost:5299/health/live> · <http://localhost:5299/health/ready> | <http://localhost:5299/docs>      |
| `REMOVED`  | <http://localhost:5399/health/live> · <http://localhost:5399/health/ready> | <http://localhost:5399/docs>      |

OpenAPI / Scalar is on by default in every environment **except**
`Production`. Operators can flip the kill-switch by setting
`OpenApi:Enabled=false` (env var: `OpenApi__Enabled=false`) on any host
to hide both `/docs` and `/openapi/v1.json` regardless of environment.

Each BFF readiness probe transitively pings the API's `/health/live`, so a
fresh `docker compose up` only flips the BFFs to "healthy" once the API is
actually reachable.

#### Port matrix

| Service        | Container | Host  | Notes                                                |
| -------------- | --------- | ----- | ---------------------------------------------------- |
| MongoDB        | —         | —     | Atlas (managed). Configured via `.env`               |
| Wayel.Api      | 8080      | 5099  |                                                      |
| Bff.Admin      | 8080      | 5199  | Pairs with REMOVED SPA on `localhost:4200/4201` |
| Bff.Customer     | 8080      | 5299  | Pairs with client-portal SPA on `localhost:4202`     |
| Bff.External   | 8080      | 5399  | Pairs with customer-portal SPA on `localhost:4203`   |

#### Env-var matrix (compose)

| Service     | Variable                                | Required | Default                                           |
| ----------- | --------------------------------------- | -------- | ------------------------------------------------- |
| `api`       | `Mongo__ConnectionString`               | yes      | from `.env` `MONGO_CONNECTION_STRING` (Atlas SRV) |
| `api`       | `Mongo__DatabaseName`                   | yes      | from `.env` `MONGO_DATABASE_NAME`, default `wayel`|
| `api`       | `Jwt__SigningKey`                       | yes      | dev placeholder (32+ chars; **rotate for prod**)  |
| `api`       | `Jwt__Issuer` / `Jwt__Audience`         | yes      | `wayel-api` / `wayel-clients`                     |
| `api`       | `AuthSession__RefreshTokenLifetimeMinutes` | no    | `20160` (14 days)                                 |
| `api`       | `GoogleAuth__ClientIds__0..N`           | no       | unset → SSO disabled                              |
| `api`       | `Auth__Sso__BootstrapSuperAdmins__0..N` | no       | unset                                             |
| `bff-*`     | `Bff__Audience`                         | yes      | `admin` / `client` / `external`                   |
| `bff-*`     | `Bff__SpaBaseUri`                       | yes      | `http://localhost:4200` / `:4202` / `:4203`       |
| `bff-*`     | `Bff__ApiBaseUri`                       | yes      | `http://api:8080` (intra-compose hostname)        |
| `bff-*`     | `Bff__SessionLifetimeMinutes`           | no       | `20160`                                           |
| `bff-*`     | `Bff__RequireHttpsCookie`               | no       | `false` in compose; **must be `true` in prod**    |
| `bff-*`     | `Bff__CookieName`                       | no       | `.Wayel.Bff.<Audience>`                           |
| `bff-*`     | `GoogleOidc__ClientId`                  | for SSO  | unset → SSO disabled                              |
| `bff-*`     | `GoogleOidc__ClientSecret`              | for SSO  | unset → SSO disabled                              |

### Option B — `dotnet run` against MongoDB Atlas

```bash
# 1. Stash secrets in user-secrets (don't commit them to appsettings).
cd backend/api
dotnet user-secrets --project src/Wayel.Api init
dotnet user-secrets --project src/Wayel.Api set "Mongo:ConnectionString" \
  "mongodb+srv://<username>:<password>@<cluster-host>/?retryWrites=true&w=majority&appName=Wayel"
dotnet user-secrets --project src/Wayel.Api set "Mongo:DatabaseName" "wayel"
dotnet user-secrets --project src/Wayel.Api set "Jwt:SigningKey" "$(openssl rand -base64 48)"

# 2. Run.
dotnet run --project src/Wayel.Api
```

> Make sure your machine's egress IP is on the Atlas Network Access
> allow-list, otherwise the driver will quietly time out during the
> initial replica-set discovery and `/health/ready` will stay red.

### Option C — Full SPA → BFF → API loop (Google SSO end-to-end)

When you want to drive a real Angular SPA through its BFF and into the API, three
processes need to come up together. The defaults here match what
`frontend/apps/REMOVED/package.json` ships and what the BFF expects in
user-secrets:

| Process                              | Bind                       | Started by                                                |
| ------------------------------------ | -------------------------- | --------------------------------------------------------- |
| `Wayel.Api` (core API)               | `http://localhost:5099`    | `dotnet run --project src/Wayel.Api`                      |
| `REMOVED`    (admin BFF)     | `http://localhost:5199`    | `dotnet run --project src/REMOVED`                |
| `Wayel.Bff.Customer`   (client BFF)    | `http://localhost:5198`    | `dotnet run --project src/Wayel.Bff.Customer`               |
| `REMOVED` (external BFF)  | `http://localhost:5197`    | `dotnet run --project src/REMOVED`             |
| `REMOVED`    (Angular SPA)      | `http://localhost:4201`    | `npm run dev:admin:bff`    (from `frontend/`)             |
| `client-portal`   (Angular SPA)      | `http://localhost:4202`    | `npm run dev:client:bff`   (from `frontend/`)             |
| `customer-portal` (Angular SPA)      | `http://localhost:4203`    | `npm run dev:external:bff` (from `frontend/`)             |

**The dev wiring rules that bit us — please don't relearn them:**

1. **Bind the SPA to `localhost`, not `127.0.0.1`.** Cookies are scoped per host
   and browsers treat `localhost` and `127.0.0.1` as different hosts. The BFF
   sets its session cookie for `localhost:5199`; if the SPA runs on
   `127.0.0.1:4201` the proxied request originates from a different host and the
   cookie never gets sent. The npm script enforces this with
   `ng serve --host localhost --port 4201`.
2. **The Angular dev-server proxy must set `changeOrigin: true`.** Without it,
   the proxy forwards the SPA's `Host: localhost:4201` header to the BFF, and
   the BFF then builds the OIDC `redirect_uri` as
   `http://localhost:4201/signin-oidc` — which Google rejects with
   `redirect_uri_mismatch` because only `http://localhost:5199/signin-oidc` is
   registered. See `frontend/apps/REMOVED/proxy.conf.bff.json`.
3. **`Bff:SpaBaseUri` must equal the SPA origin exactly.** The BFF only redirects
   back to URIs whose origin matches `SpaBaseUri`. For the REMOVED that's
   `http://localhost:4201`. Mismatch → silent fallback to `/`.
4. **Google OAuth client registration must list every redirect URI you'll hit.**
   Each BFF gets its own client. For `REMOVED`, register
   `http://localhost:5199/signin-oidc` (Authorized redirect URI) and
   `http://localhost:4201` (Authorized JavaScript origin).

User-secrets each BFF needs in dev (one-time per BFF, one Google OAuth client per
audience). Each BFF has its own `UserSecretsId`, so the same key (e.g.
`GoogleOidc:ClientSecret`) doesn't collide across audiences.

```bash
cd backend/api

# admin BFF (5199 ↔ REMOVED on 4201)
dotnet user-secrets --project src/REMOVED init
dotnet user-secrets --project src/REMOVED set "Bff:SpaBaseUri" "http://localhost:4201"
dotnet user-secrets --project src/REMOVED set "Bff:ApiBaseUri" "http://localhost:5099"
dotnet user-secrets --project src/REMOVED set "GoogleOidc:ClientId"     "<admin client id>"
dotnet user-secrets --project src/REMOVED set "GoogleOidc:ClientSecret" "<admin client secret>"

# client BFF (5198 ↔ client-portal on 4202)
dotnet user-secrets --project src/Wayel.Bff.Customer init
dotnet user-secrets --project src/Wayel.Bff.Customer set "Bff:SpaBaseUri" "http://localhost:4202"
dotnet user-secrets --project src/Wayel.Bff.Customer set "Bff:ApiBaseUri" "http://localhost:5099"
dotnet user-secrets --project src/Wayel.Bff.Customer set "GoogleOidc:ClientId"     "<client client id>"
dotnet user-secrets --project src/Wayel.Bff.Customer set "GoogleOidc:ClientSecret" "<client client secret>"

# external BFF (5197 ↔ customer-portal on 4203)
dotnet user-secrets --project src/REMOVED init
dotnet user-secrets --project src/REMOVED set "Bff:SpaBaseUri" "http://localhost:4203"
dotnet user-secrets --project src/REMOVED set "Bff:ApiBaseUri" "http://localhost:5099"
dotnet user-secrets --project src/REMOVED set "GoogleOidc:ClientId"     "<external client id>"
dotnet user-secrets --project src/REMOVED set "GoogleOidc:ClientSecret" "<external client secret>"
```

In Google Cloud Console (one OAuth client per BFF), register:

| BFF                  | Authorized redirect URI                  | Authorized JavaScript origin    |
| -------------------- | ---------------------------------------- | ------------------------------- |
| `REMOVED`    | `http://localhost:5199/signin-oidc`      | `http://localhost:4201`         |
| `Wayel.Bff.Customer`   | `http://localhost:5198/signin-oidc`      | `http://localhost:4202`         |
| `REMOVED` | `http://localhost:5197/signin-oidc`      | `http://localhost:4203`         |

User-secrets the API needs (auth + Mongo + Google):

```bash
dotnet user-secrets --project src/Wayel.Api init
dotnet user-secrets --project src/Wayel.Api set "Jwt:SigningKey"             "$(openssl rand -base64 48)"
dotnet user-secrets --project src/Wayel.Api set "GoogleAuth:ClientIds:0"     "<admin client id>"
dotnet user-secrets --project src/Wayel.Api set "GoogleAuth:ClientIds:1"     "<client client id>"     # add as you spin BFFs up
dotnet user-secrets --project src/Wayel.Api set "GoogleAuth:ClientIds:2"     "<external client id>"
dotnet user-secrets --project src/Wayel.Api set "Auth:Sso:BootstrapSuperAdmins:0" "you@example.com"
```

#### Troubleshooting the SSO loop

| Symptom                                                                                          | Cause                                                                                                                                            | Fix                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google: `redirect_uri=http://localhost:4201/signin-oidc` rejected                                | Angular proxy forwarding the SPA's `Host` header                                                                                                 | Set `"changeOrigin": true` in `proxy.conf.bff.json` (and re-register only `5199/signin-oidc` in Google Cloud Console)                              |
| `/bff/auth/me` returns `302` to `accounts.google.com` instead of `401`                           | `DefaultChallengeScheme` defaulted to `OpenIdConnect`                                                                                            | `BffHostBuilder` sets `DefaultChallengeScheme = Cookies`. Only the explicit `/bff/auth/login` triggers OIDC.                                       |
| Sign-in succeeds but SPA still sees 401s on `/api/...`                                           | SPA bound to `127.0.0.1:4201`, cookie scoped to `localhost`                                                                                      | `ng serve --host localhost`. Update `Bff:SpaBaseUri` to match.                                                                                     |
| `Missing id_token from upstream provider.`                                                       | Reading `ProtocolMessage.IdToken` in code-flow OIDC                                                                                              | `BffAuthEndpoints.OnTokenValidated` reads `TokenEndpointResponse?.IdToken ?? ProtocolMessage?.IdToken`                                             |
| `Failed to read parameter "SsoSignInGoogleRequest body" from the request body as JSON.`          | `System.Text.Json` doesn't string→enum by default; the BFF sends `Audience: "Admin"`                                                             | `Wayel.Api/Program.cs` calls `ConfigureHttpJsonOptions` and adds `JsonStringEnumConverter`                                                         |
| Every Google account silently rejected with `identity.email_not_verified`                        | `JwtSecurityTokenHandler.ValidateTokenAsync(...)` returns `email_verified` as a boxed `bool`; old code did `value as string` → always `null`     | Centralized in `GoogleClaimReader`; covered by `Wayel.Infrastructure.Tests/Security/GoogleClaimReaderTests.cs`                                     |
| BFF crashes on macOS with `TypeLoadException: Microsoft.AspNetCore.Server.HttpSys.IServerDelegationFeature` | `Yarp.ReverseProxy` 2.2.0 incompatible with .NET 10 on non-Windows                                                                               | Pinned to `2.3.0` in `Directory.Packages.props`                                                                                                    |

## Tests

```bash
cd backend/api

# Unit tests (no external deps)
dotnet test tests/Wayel.Application.Tests
dotnet test tests/Wayel.Infrastructure.Tests

# Full suite (integration tests need Docker; auto-skip if not available)
dotnet test
```

## CQRS conventions

Every feature lives in `src/Wayel.Application/Features/<Aggregate>/<Verb>/` and is made up of:

- `<Verb>Command.cs` (or `Query.cs`) — the request DTO + response DTO.
- `<Verb>CommandValidator.cs` — FluentValidation rules; auto-discovered & wired by the pipeline behavior.
- `<Verb>CommandHandler.cs` — implements `ICommandHandler<,>` (or `IQueryHandler<,>`); returns `Result<TResponse>`.

Endpoints sit in `src/Wayel.Api/Endpoints/<Aggregate>Endpoints.cs`, implementing `IEndpointGroup`. The host discovers them via assembly scan and mounts them under `/api/v1`.

## Errors

Handlers never throw for control flow. They return `Result<T>`. The API layer maps `Error.Type` to the right HTTP status and emits an RFC 7807 ProblemDetails body:

| `ErrorType`     | HTTP status |
| --------------- | ----------- |
| `Validation`    | 400         |
| `Unauthorized`  | 401         |
| `Forbidden`     | 403         |
| `NotFound`      | 404         |
| `Conflict`      | 409         |
| `Unexpected`    | 500         |

## Adding a new feature (5-minute walkthrough)

1. Create `src/Wayel.Application/Features/<Aggregate>/<Verb>/<Verb>Command.cs` (record implementing `ICommand<TResponse>`).
2. Add `<Verb>CommandValidator.cs` (extending `AbstractValidator<TCommand>`).
3. Add `<Verb>CommandHandler.cs` (returning `Result<TResponse>`).
4. Map an endpoint in the matching `*Endpoints.cs` group, sending the command via `IMediator`.
5. Add a unit test against the handler with `NSubstitute` mocks.
6. (Optional) Add a `[DockerFact]` integration test that hits the endpoint end-to-end through `WebApplicationFactory<Program>`.

## Configuration

Bound from `appsettings.{env}.json`, env vars (`__` separator), and user-secrets in development.

### Core API (`Wayel.Api`)

| Section        | Key                              | Notes                                                       |
| -------------- | -------------------------------- | ----------------------------------------------------------- |
| `Mongo`        | `ConnectionString`               | Mongo URI                                                   |
| `Mongo`        | `DatabaseName`                   |                                                             |
| `Jwt`          | `SigningKey`                     | **Min 32 chars**; never commit                              |
| `Jwt`          | `Issuer` / `Audience`            |                                                             |
| `Jwt`          | `AccessTokenLifetimeMinutes`     | 1–1440 (default 60)                                         |
| `AuthSession`  | `RefreshTokenLifetimeMinutes`    | Sliding refresh-token window (default 14 days)              |
| `GoogleAuth`   | `ClientIds[]`                    | Google OAuth client ids permitted to mint id_tokens (BFFs, mobile). Empty = SSO disabled |
| `Cors`         | `AllowedOrigins[]`               | SPA + BFF origins (defaults to `localhost:4200/4201/4202`)  |
| `Auth`         | `EnablePasswordSignIn`           | `false` by default. Production runs Google-SSO-only. Dev hosts auto-enable. Integration tests opt-in. |
| `Auth:Sso`     | `BootstrapSuperAdmins[]`         | Emails auto-promoted to `SuperAdmin` on first sign-in. Idempotent. Use sparingly. |
| `Auth:Sso`     | `AdminPortal:AllowedEmails[]`    | Per-email allowlist for the admin portal audience           |
| `Auth:Sso`     | `AdminPortal:AllowedDomains[]`   | Per-domain allowlist for the admin portal audience          |
| `Notifications`| `AcceptUrlBase`                  | Default landing page for invitation links (token appended as `?token=`) |
| `Notifications`| `AcceptUrlBaseByRole{}`          | Per-role overrides keyed by `UserRole` (case-insensitive: `SuperAdmin` / `TenantAdmin` / `Staff` / `Parent`) |
| `Audit`        | `Retention`                      | TimeSpan; how long audit rows live before TTL eviction (default `180.00:00:00`) |
| `Outbox`       | `Enabled`                        | Master switch for the dispatcher hosted service (default `true`) |
| `Outbox`       | `PollInterval`                   | TimeSpan between dispatch loops (default `00:00:02`)         |
| `Outbox`       | `BatchSize`                      | Max rows fetched per loop (default 50)                       |
| `Outbox`       | `MaxAttempts`                    | Failed dispatches before a row is dead-lettered (default 5)  |
| `Outbox`       | `RetentionAfterTerminal`         | TTL after dispatch / dead-letter (default `14.00:00:00`)     |
| `Outbox:Archive` | `Enabled`                      | Long-term archive sink switch (default `false`)              |
| `Outbox:Archive` | `PollInterval`                 | TimeSpan between archive scans (default `00:05:00`)          |
| `Outbox:Archive` | `ArchiveAfter`                 | Only ship terminal rows older than this (default `6.00:00:00`); keep < `Outbox:RetentionAfterTerminal` |
| `Outbox:Archive` | `BatchSize`                    | Cap on rows shipped per scan (default 200)                   |
| `Outbox:Archive` | `RootPath`                     | Filesystem path used by the bundled `FilesystemOutboxArchiveSink`. Production deployments swap in S3/SIEM by re-registering `IOutboxArchiveSink`. |
| `OpenApi`     | `Enabled`                        | Master switch for `/docs` (Scalar) and `/openapi/v1.json`. Defaults to `true` outside Production, `false` in Production. |

### Admin BFF (`REMOVED`)

| Section       | Key                                 | Notes                                                          |
| ------------- | ----------------------------------- | -------------------------------------------------------------- |
| `Bff`         | `Audience`                          | Logical name (e.g. `admin`); used for cookie naming + logs    |
| `Bff`         | `SpaBaseUri`                        | Where the SPA lives — gated for safe redirects                |
| `Bff`         | `ApiBaseUri`                        | Reverse-proxy target (Wayel.Api)                              |
| `Bff`         | `SessionLifetimeMinutes`            | Cookie session window (default 14 days, sliding)              |
| `Bff`         | `RefreshIfExpiringWithinSeconds`    | Trigger access-token refresh this far before expiry (default `120`; per-session contention is handled by `BffRefreshCoordinator`) |
| `Bff`         | `CookieName`                        | Per-audience to avoid cross-BFF cookie collisions             |
| `Bff`         | `RequireHttpsCookie`                | `true` in prod; `false` for local plain-http dev              |
| `GoogleOidc`  | `ClientId` / `ClientSecret`         | OAuth client used for the OIDC challenge — store secret in user-secrets / env vars |
| `GoogleOidc`  | `Authority`                         | `https://accounts.google.com` by default                      |
| `GoogleOidc`  | `AllowedHostedDomains[]`            | Optional GSuite hosted-domain allowlist; empty = any domain   |
| `OpenApi`     | `Enabled`                           | Same kill-switch as the API: defaults to on outside Production, set `false` to hide `/docs` + `/openapi/v1.json`. |

The same `Bff` / `GoogleOidc` shape applies to **`Wayel.Bff.Customer`** (audience `client`, default cookie `.Wayel.Bff.Customer`, default SPA port `4202`) and **`REMOVED`** (audience `external`, default cookie `.REMOVED`, default SPA port `4203`). Each BFF's `GoogleOidc.ClientId` must also appear in the API's `GoogleAuth.ClientIds[]` list.

## Auth flows

> **Production posture:** Google SSO is the only sign-in path. The password
> endpoint is gated behind `Auth:EnablePasswordSignIn=true` (auto-enabled in
> the `Development` environment) and is strictly an offline / outage / test
> escape hatch.

### Google SSO via per-audience BFF (production path)

```
SPA → GET  http://bff/bff/auth/login?returnUrl=/dashboard
BFF → 302  Google OIDC challenge (authorization code + PKCE)
Google → callback → BFF receives id_token
BFF → POST /api/v1/auth/sso/google {idToken, audience: "Admin"|"Client"|"External"}
       ← AuthSession (encrypted into the BFF cookie)
BFF → 302  http://localhost:4200/dashboard          (cookie set; no token in JS)
SPA → GET  /api/...                                 (cookie travels)
BFF →      forwards to Wayel.Api with Authorization: Bearer <accessToken>
           refreshes the access token transparently when within 60s of expiry
SPA → POST /bff/auth/logout                         → revokes session, clears cookie
```

The `audience` field tells `Wayel.Api` which **admission policy** to apply
(see [`ConfigBackedSsoAdmissionPolicy`](src/Wayel.Application/Security/ConfigBackedSsoAdmissionPolicy.cs)):

| Audience   | Who's allowed in                                                                 | Default provisioned role |
| ---------- | -------------------------------------------------------------------------------- | ------------------------ |
| `Admin`    | Email/domain on `Auth:Sso:AdminPortal` allowlist **OR** active pending invitation | `Staff` (or `SuperAdmin` if email is on `Auth:Sso:BootstrapSuperAdmins`) |
| `Client`   | Any verified Google account (open auto-provision; tenant binding via invite)     | `Staff`                  |
| `External` | Any verified Google account                                                      | `Parent`                 |

Bootstrap super-admins (`Auth:Sso:BootstrapSuperAdmins`) are auto-promoted on
every successful sign-in — idempotent, so dropping the email from config later
won't demote them.

### Password sign-in (development / integration tests only)

```
SPA → GET  /api/v1/auth/config                        # { passwordSignInEnabled: bool }
SPA → POST /api/v1/auth/login {email,password}        # 200 only when passwordSignInEnabled=true
      ← AuthSession {accessToken, refreshToken, sessionId, ...}
                                                       # otherwise 403 ProblemDetails
                                                       # type: https://wayel.dev/errors/auth.password_login_disabled
SPA → POST /api/v1/auth/refresh {refreshToken}        # rotated; old token consumed
SPA → POST /api/v1/auth/logout {refreshToken}         # revokes whole session chain
```

Both `/auth/login` and `/auth/register` are always mapped so OpenAPI documents
the routes; the handler short-circuits with the typed 403 above when
`Auth:EnablePasswordSignIn=false` (production default). SPAs probe
`/auth/config` at boot and hide the email/password form when the flag is off
so the user only sees Google / SSO buttons.

### Stale-password cleanup (`SsoOnlyPasswordSentinelMigration`)

A one-shot, idempotent hosted migration runs on every API boot
(after `MongoIndexInitializer`, before the seeders) and replaces the
stored `PasswordHash` with `User.SsoOnlyPasswordSentinel` (`"!"`) for
every user that already has at least one row in `ExternalIdentities`
(Google, Microsoft, …). Once a user can SSO, leaving a real BCrypt hash
behind is dead weight that becomes a credential-stuffing surface the
moment an operator flips `Auth:EnablePasswordSignIn` back on for an
emergency debug session. The filter excludes already-sentinel rows, so
re-runs are no-ops and log `0 stripped`. Users that have **not** yet
completed an SSO sign-in are deliberately left alone — that preserves
the dev seed roster (`lead@codecubs.test` and friends) and any
operator-only password account that hasn't yet linked an IdP.

### Refresh-token rotation + reuse detection

`RefreshToken` aggregate stores SHA-256(token), an `expiresOnUtc`, a `consumedOnUtc`, and a `sessionId` shared by every token in the chain. Each refresh:

1. Looks up the row by hash.
2. Rejects if revoked, expired, or already consumed (— in which case it revokes the **whole session chain** as suspected theft).
3. Issues a new access + refresh pair tied to the same `sessionId`.
4. Marks the previous row as `Consumed` and links `ReplacedByTokenId`.

The Mongo collection has a TTL index on `ExpiresOnUtc` so old rows self-clean.

## Observability & hardening

- **Audit log.** Every call to `/auth/login`, `/auth/sso/google`, `/auth/refresh`, `/auth/logout`, plus all
  staff-invitation lifecycle operations (issue/resend/revoke/accept), writes one row to the Mongo
  `audit_log` collection via `IAuditLogger` — action, outcome, actor, audience, IP, UA, and a short `reason`
  code on failure. Writes are best-effort: a Mongo outage will never abort the business op. Rows are pruned
  by a TTL index whose retention is configured by `Audit:Retention` (default 180 days).
- **Audit query API.** `GET /api/v1/admin/audit` (SuperAdmin only) pages through the durable log with
  cursor-based pagination (`continuationToken`), and supports filters on action, actor email/id, outcome,
  and time window. Page size is clamped to 1–200.
- **Outbox inspector.** `GET /api/v1/admin/outbox` (SuperAdmin only) returns a one-shot snapshot of pending /
  dispatched-in-window / dead-lettered counts, the oldest pending row's age, and a small recent-DLQ window
  with truncated error previews — enough to power a single dashboard tile without exposing payloads.
- **Tenant catalog API.** `/api/v1/admin/tenants` (SuperAdmin only) is the canonical surface for listing,
  fetching, creating, and renaming tenants. `GET /` is cursor-paged (newest-first) with optional `search`
  (case-insensitive substring over name + slug) and `kind` filters; `POST /` validates the slug pattern
  (`^[a-z0-9]+(-[a-z0-9]+)*$`), checks slug uniqueness, and is backstopped by the `ux_tenants_slug` unique
  index so a race becomes a typed `tenant.slug_taken` conflict instead of a 500. `PATCH /{id}` updates the
  display name only — slugs are immutable so existing audit references and links never break. Every write
  emits an `AuditEntry` (`tenant.created` / `tenant.renamed`) and the aggregate raises `TenantCreated` /
  `TenantRenamed` domain events into the outbox for downstream consumers.
- **Dispatcher health probe.** `OutboxDispatcherHeartbeat` is updated after every successful poll. The
  `/health/ready` endpoint reports `Unhealthy` if the heartbeat is older than `PollInterval × 5` (floored
  at 10s to absorb GC pauses), `Degraded` before the first tick, and `Healthy` when the dispatcher is
  disabled — so test hosts that turn it off don't fail readiness.
- **Notifications.** `INotificationSender` is invoked best-effort *after* a unit-of-work commit, so a dead
  transport never rolls back the underlying business action. `ConsoleNotificationSender` is the default
  (renders the invitation link + token in the host log); production hosts should re-register a real
  transport (SMTP / SES / SendGrid / Twilio) after `AddInfrastructure`. The accept link is templated from
  `Notifications:AcceptUrlBase` with optional per-role overrides under `Notifications:AcceptUrlBaseByRole`,
  so `TenantAdmin` invitations can land on the admin portal while `Staff` / `Parent` invitations route into
  the client / external SPAs respectively. All three SPAs serve the post-SSO accept screen at
  `/invitations/accept?token=...` (shared `WayelAcceptInvitationComponent`), which drives the OIDC handshake
  if the user isn't signed in yet.
- **Transactional outbox.** `IOutboxStore` + `OutboxDispatcherHostedService` give the app an at-least-once
  delivery story for domain events. Mongo repositories push freshly-raised events into the scoped
  `IDomainEventCollector`; `MongoUnitOfWork.SaveChangesAsync` drains the collector into the
  `domain_events_outbox` collection; the hosted service polls every 2s (configurable via `Outbox:PollInterval`
  / `Outbox:BatchSize`) and republishes each event wrapped in a `DomainEventNotification<T>` through MediatR.
  Set `Outbox:Enabled=false` to keep rows queued without dispatching (useful inside tests).
  - **Poison messages.** After `Outbox:MaxAttempts` failed dispatches (default 5) the row is dead-lettered:
    a `DeadLetteredOnUtc` timestamp is stamped and the row stops returning from `GetPendingAsync`. Operators
    can inspect / replay via the raw collection.
  - **TTL / archival.** Both dispatched and dead-lettered rows are reaped after `Outbox:RetentionAfterTerminal`
    (default 14 days) by Mongo's TTL monitor. Pending rows are never auto-deleted.
  - **Long-term archive sink.** Optional `IOutboxArchiveSink` lets a host ship terminal rows to durable
    storage *before* TTL eviction. The bundled `FilesystemOutboxArchiveSink` writes JSON-Lines under
    `Outbox:Archive:RootPath` (one file per UTC day) and is intended for dev / smoke tests; production
    deployments should swap in an S3 / blob / SIEM implementation by re-registering `IOutboxArchiveSink`
    after `AddInfrastructure`. Enable via `Outbox:Archive:Enabled=true`; the hosted service runs every
    `Outbox:Archive:PollInterval` (5 min default), pulls terminal rows older than `Outbox:Archive:ArchiveAfter`
    (6 days default), hands them to the sink, and stamps `ArchivedOnUtc` so subsequent ticks skip them.
    Sink failures roll back the stamp so the row replays at-least-once on the next tick.
- **Rate limiting.** The `auth` policy is a per-IP fixed window limiter (10 req/min). It's applied to the
  three unauthenticated sign-in entry points so a single abusive client cannot grind the auth surface down
  for everyone else.
- **OpenAPI / Scalar.** Every host (the API + each per-audience BFF) self-documents at `/docs` (Scalar) and
  `/openapi/v1.json` (raw OpenAPI 3.x). The API document advertises the `Bearer` security scheme and tags
  every `[Authorize]` operation with the matching requirement, so Scalar's "Try it" panel forwards the
  pasted access token; the BFF documents instead describe the cookie + `X-XSRF-TOKEN` posture so consumers
  see exactly what the SPA already sends. Endpoints carry `.Produces<T>()` / `.ProducesProblem()` metadata
  so the generated schemas include both success bodies and the RFC 7807 ProblemDetails error shape. Docs
  are off by default in `Production`; flip via `OpenApi:Enabled` per host.
- **BFF cookie + CSRF posture.** The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` whenever the
  host is not `Development` (regardless of `Bff:RequireHttpsCookie` — the dev-only opt-out doesn't unlock
  production). State-changing requests under `/bff/...` and `/api/...` are guarded by an antiforgery
  middleware that validates the SPA-supplied `X-XSRF-TOKEN` header against the BFF-issued (non-HttpOnly)
  `XSRF-TOKEN` cookie. The OIDC handshake paths (`/bff/auth/login`, `/signin-oidc`, `/signout-callback-oidc`)
  bypass the check — those rely on the OIDC handler's own state/nonce protection.
- **Per-BFF Docker images.** `docker-compose.yml` now stands up `bff-admin` (5199), `bff-client` (5299), and
  `bff-external` (5399) alongside `api` and `mongo` — same Dockerfile, different `PROJECT` build-arg.

See [`SECURITY.md`](SECURITY.md) for the secrets-management story (where keys live in dev / staging / prod)
and the project-level threat model.

## What's intentionally not here yet

- **Microsoft / Apple SSO.** The `IdentityProvider` enum + `ExternalIdentity` aggregate are ready; only
  Google validator is implemented.
- **Domain claiming.** Tenants cannot yet auto-attach SSO users by email domain — Sprint 2.
- **Outbox archive sink.** Dispatched + dead-lettered rows are TTL-pruned today. A long-term sink (S3 / Azure
  Blob) for compliance retention beyond `Outbox:RetentionAfterTerminal` is still TODO.
