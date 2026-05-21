# Local dev: Docker + Caddy

## All-in-Docker on `localhost` (recommended)

No custom DNS. **Google OAuth works** with plain `http://localhost` redirect URIs.

```bash
cd backend/api
docker compose -f docker-compose.dev.yml -f docker-compose.localhost.yml up --build
```

| URL | What |
| --- | --- |
| http://localhost:8081 | Admin portal (SPA + BFF) |
| http://localhost:8082 | External client |
| http://localhost:8083 | Client BFF (SPA TBD) |
| http://localhost:5099 | Raw API |

In Google Cloud Console → OAuth Web client → **Authorized redirect URIs**, add:

- `http://localhost:8081/signin-oidc`
- `http://localhost:8082/signin-oidc`
- `http://localhost:8083/signin-oidc`

Do **not** combine `docker-compose.localhost.yml` with `docker-compose.proxy.yml`
(two Caddy stacks).

---

## Custom hostnames (`*.wayel.local`)

This stack ships with an opt-in reverse-proxy overlay that gives every
host a friendly hostname on **`http://*.wayel.local:80`** instead of
remembering `localhost` ports. **TLS is off** for simpler local dev (no
cert trust step).

**Google Sign-In:** `http://admin.wayel.local` is **not** an allowed OAuth
redirect host (Google only allows `http://` on loopback). Use the
**localhost** compose file above for SSO, or use HTTPS on `*.wayel.local`.

## Topology

With **`docker-compose.proxy.yml`**, everything runs in Docker: API,
BFFs, **production-built Angular apps** (nginx), and Caddy.

```
   http://admin.wayel.local       ─► caddy ─►  bff-admin  +  spa-admin (nginx)
   http://external.wayel.local    ─► caddy ─►  bff-external + spa-external (nginx)
   http://client.wayel.local      ─► caddy ─►  bff-client  (SPA TBD)
   http://api.wayel.local         ─► caddy ─►  api
```

Dockerfiles live under `frontend/apps/*/Dockerfile`; build context is the
`frontend/` workspace.

Caddy forwards **`X-Forwarded-Proto: http`** so BFFs and the API see the
same scheme the browser used.

## One-time setup

```bash
cd backend/api

# 1. Atlas connection string — see .env.example
cp .env.example .env
$EDITOR .env

# 2. /etc/hosts entries (sudo prompt)
sudo ./scripts/setup-dev-domains.sh hosts

# 3. Bring the full stack up
docker compose -f docker-compose.dev.yml -f docker-compose.proxy.yml up --build -d
```

You do **not** need `./scripts/setup-dev-domains.sh trust` for HTTP-only
Caddy (that script is only useful if you switch the `Caddyfile` back to
HTTPS / `tls internal`).

### Google OAuth (why “doesn’t comply with Google’s OAuth 2.0 policy”)

Google **does not allow `http://` redirect URIs** except on **true loopback**
hosts (`localhost`, `127.0.0.1`, and similar).  
So **`http://admin.wayel.local/signin-oidc` is invalid** — Google will block
sign-in even if you add it in the console. That matches errors like *“doesn’t
comply with Google’s OAuth 2.0 policy for keeping apps secure.”*

**Ways to fix it:**

1. **Use localhost for Google sign-in (works with current HTTP Caddy stack)**  
   - In [Google Cloud Console](https://console.cloud.google.com/) → APIs &
     Services → Credentials → your **Web client** → **Authorized redirect URIs**,
     add exactly:
     - `http://localhost:5199/signin-oidc` (admin BFF)
     - `http://localhost:5399/signin-oidc` (external BFF), etc.  
   - Open the app at **`http://localhost:4201`** with
     `npm run dev:admin:bff` (or the matching port) so the OIDC callback host
     is **localhost**, not `admin.wayel.local`.  
   - **OAuth consent screen:** if the app is in **Testing**, add
     `mninawa@gmail.com` under **Test users**.

2. **Keep pretty hostnames (`*.wayel.local`) and use Google SSO**  
   You need **HTTPS** on those hosts (e.g. Caddy `tls internal` + trust the
   local CA, or mkcert). Redirect URIs must be **`https://admin.wayel.local/signin-oidc`**
   (scheme, host, path, no trailing slash — must match what the BFF sends).

ASP.NET Core OpenID Connect uses **`/signin-oidc`** as the callback path by
default (already allowed through Caddy in our `Caddyfile`).

## Day-to-day workflow

```bash
cd backend/api
docker compose -f docker-compose.dev.yml -f docker-compose.proxy.yml up --build
```

Then open:

- http://admin.wayel.local — admin / platform portal
- http://external.wayel.local — external client
- http://api.wayel.local/health/ready — raw API
- http://client.wayel.local/api/v1/health — client BFF (SPA TBD)

### Optional: local SPAs with HMR

Use `http://localhost:4201` + BFF `5199` with `npm run dev:admin:bff` from
`frontend/` when you want hot reload instead of the static nginx builds.

## Switching back to plain localhost

`http://localhost:5099` (API) and `http://localhost:5199`/`5299`/`5399`
(BFFs) still work when you omit `docker-compose.proxy.yml`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `getaddrinfo ENOTFOUND admin.wayel.local` | `/etc/hosts` missing. `sudo ./scripts/setup-dev-domains.sh hosts`. |
| `502 Bad Gateway` on `/` | `spa-admin` / `spa-external` unhealthy. `docker compose logs spa-admin`. |
| `502` on `/api/*` or `/bff/*` | BFF or API unhealthy. `docker compose ps`, `docker logs wayel-api`. |
| `/health/ready` red on API | Atlas connection / IP allow-list. Check `.env` and Atlas Network Access. |
