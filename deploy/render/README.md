# WeYell — Render Deployment Runbook

This folder owns the Docker images and nginx templates that ship WeYell to
[Render](https://render.com/). The matching Blueprint (`render.yaml` at the
repo root) declares three Docker web services + an external MongoDB Atlas
cluster.

```
            Browser  ──HTTPS──▶  wayel-customer.onrender.com
                                  ├─ /            Angular customer-portal SPA
                                  ├─ /bff/*       \
                                  ├─ /api/*        ─→  Wayel.Bff.Customer (loopback :8080)
                                  └─ /signin-oidc /

            Browser  ──HTTPS──▶  wayel-ops.onrender.com
                                  ├─ /            Angular ops dashboard SPA
                                  └─ /api/*       ─→  wayel-api.onrender.com

            Wayel.Bff.Customer  ──HTTPS──▶  wayel-api.onrender.com
                                                   .NET Wayel.Api → MongoDB Atlas
                                                                  → S3 (invoices, KYC, photos)
                                                                  → Paystack / MTN MoMo
                                                                  → Postmark / Resend / SES
```

The "edges" exist so the customer SPA + BFF stay on **one origin** (cookies
must not cross subdomains) and so the ops SPA never has to make CORS calls.

---

## 1. Prerequisites — provision before the first deploy

| What                       | How / where                                                                                                       |
|----------------------------|-------------------------------------------------------------------------------------------------------------------|
| MongoDB Atlas cluster      | Free or M2/M10 tier. Add Render's static outbound IPs under **Network Access** (or `0.0.0.0/0` for a sandbox).    |
| AWS IAM user               | Least privilege on the target S3 bucket: `s3:Get/Put/Head/Delete` on `arn:aws:s3:::<bucket>/*` + `s3:List*` on the bucket itself. Capture the access key id + secret. |
| Paystack secret + public   | Dashboard → Settings → API Keys & Webhooks → copy Test (or Live) `sk_*` and `pk_*`.                               |
| MTN MoMo subscription key  | Developer portal → Products → Collections → copy the Primary Key. Disbursements key optional.                     |
| Google OAuth Web client    | Cloud Console → Credentials → "Web application". Used for both the BFF cookie flow *and* the API admission check. |
| Google Identity Services   | Separate "Web application" client for the ops dashboard. Origins only — no redirect URI needed.                   |
| Postmark server token      | Postmark dashboard → Servers → API Tokens. Server-scoped, NOT account-scoped.                                     |

You can skip Postmark / WhatsApp / KYC providers at first deploy — those
features fall back to "console only" sends and remain reachable from the
admin tooling.

---

## 2. First deploy via Render Blueprint

1. Push your branch to GitHub (or the matching Git remote configured in
   Render).
2. Render dashboard → **New +** → **Blueprint** → pick this repo.
3. Render parses `render.yaml`, lists the three services, and prompts you
   for every `sync: false` value. Paste them in:
   * `wayel-api` — Mongo, AWS, Paystack, MoMo, Postmark, Google client ids.
   * `wayel-customer` — Jwt__SigningKey (paste the value Render generated
     for wayel-api), GoogleOidc client id + secret.
   * `wayel-ops` — nothing required beyond defaults.
4. Click **Apply**. Render builds all three Docker images in parallel —
   expect ~7–10 minutes for the first build (the .NET SDK layer caches
   after that).
5. While the build runs, jump into Google Cloud Console:
   * **Customer OAuth client** → Authorized JS origins
     `https://wayel-customer.onrender.com` + Authorized redirect
     `https://wayel-customer.onrender.com/signin-oidc`.
   * **Ops Identity Services client** → Authorized JS origin
     `https://wayel-ops.onrender.com`.
6. Once builds complete, hit each service URL:
   * `https://wayel-api.onrender.com/health/live` → `200`
   * `https://wayel-customer.onrender.com/` → SPA loads
   * `https://wayel-ops.onrender.com/` → ops shell loads
7. Sign in via Google on the customer portal. For ops, the first email on
   `OpsAuth__BootstrapLeadEmails__0` receives a bootstrap invite — check the
   `wayel-api` deploy logs for `/?invite=…` and open that link on
   `https://wayel-ops.onrender.com` before signing in.

---

## 3. Service map cheat sheet

| Service           | Image                                              | Public URL                              | Listens on |
|-------------------|----------------------------------------------------|-----------------------------------------|------------|
| `wayel-api`       | `backend/api/Dockerfile`                           | `https://wayel-api.onrender.com`        | `$PORT`    |
| `wayel-customer`  | `deploy/render/Dockerfile.customer-edge`           | `https://wayel-customer.onrender.com`   | `$PORT`    |
| `wayel-ops`       | `deploy/render/Dockerfile.ops-edge`                | `https://wayel-ops.onrender.com`        | `$PORT`    |

If Render assigns a suffix to your hostname (collisions across accounts),
update three pointers and redeploy:

* `wayel-api`'s `BorderBox__CustomerPortalBaseUrl`, `Cors__AllowedOrigins__0/1`
* `wayel-customer`'s `Bff__ApiBaseUri`
* `wayel-ops`'s `API_UPSTREAM_HOST`

---

## 3a. Custom domains — `weyell.co.za` (Route 53)

`render.yaml` declares these custom hostnames. After the next blueprint
sync / deploy, open each service in Render → **Settings → Custom Domains**
and confirm they show **Verified** (add them manually first if the blueprint
has not run yet).

| Hostname | Render service | Route 53 record type | Value |
|----------|----------------|----------------------|-------|
| `www.weyell.co.za` | `wayel-customer` | **CNAME** | `wayel-customer.onrender.com` |
| `weyell.co.za` (apex) | `wayel-customer` | **A** | `216.24.57.1` |
| `ops.weyell.co.za` | `wayel-ops` | **CNAME** | `wayel-ops.onrender.com` |
| `api.weyell.co.za` | `wayel-api` | **CNAME** | `wayel-api.onrender.com` |

**Route 53 tips**

1. Create records in the **weyell.co.za** hosted zone (not the registrar UI).
2. Do **not** add AAAA records for these names — Render uses IPv4 only.
3. For the apex (`weyell.co.za`), use an **A** record to Render's load
   balancer (`216.24.57.1`). In Render, add **both** `www.weyell.co.za`
   and `weyell.co.za` on `wayel-customer`, then set **Redirect** so the
   apex forwards to `www` (keeps one canonical origin for cookies/OAuth).
4. DNS can take a few minutes; TLS certificates issue automatically once
   DNS verifies.

**Google Cloud Console** (after DNS is live)

| Client | Authorized JS origin | Redirect URI (customer only) |
|--------|----------------------|------------------------------|
| Customer OAuth (BFF) | `https://www.weyell.co.za` | `https://www.weyell.co.za/signin-oidc` |
| Ops GIS | `https://ops.weyell.co.za` | — |

Keep the old `*.onrender.com` origins during cutover if you still need them.

**Google Maps JavaScript API key** (customer portal maps — parcels, addresses)

In Google Cloud Console → **APIs & Services** → **Credentials** → your browser Maps key →
**Application restrictions** → **HTTP referrers**, add:

| Referrer | Used by |
|----------|---------|
| `https://www.weyell.co.za/*` | Production customer portal |
| `https://weyell.co.za/*` | Apex redirect |
| `https://wayel-customer.onrender.com/*` | Render default hostname |
| `http://localhost:*/*` | Local dev |

Enable **Maps JavaScript API** on the project. The same key is set in
`environment.googleMapsApiKey` / `environment.prod.ts` for the customer portal build.

If the browser console shows `RefererNotAllowedMapError`, the current page origin is
missing from this list.

**Google Analytics 4** (customer portal page views)

Analytics is gated by two build-time flags in `environment.bff.ts`:

| Flag | Purpose |
|------|---------|
| `googleAnalyticsEnabled` | Master on/off switch (enabled in `environment.bff.ts` for Render) |
| `googleAnalyticsMeasurementId` | GA4 stream id (`G-TBGNM7R6F0`) — ignored when disabled |

To turn it on:

1. In [Google Analytics](https://analytics.google.com/) create a **Web** data stream for
   `https://www.weyell.co.za` and copy the **Measurement ID** (`G-XXXXXXXX`).
2. In `frontend/apps/customer-portal/src/environments/environment.bff.ts` set:
   ```ts
   googleAnalyticsEnabled: true,
   googleAnalyticsMeasurementId: 'G-XXXXXXXX',
   ```
   **Or** pass Docker build args when building `wayel-customer`:
   ```bash
   docker build -f deploy/render/Dockerfile.customer-edge \
     --build-arg GOOGLE_ANALYTICS_ENABLED=true \
     --build-arg GOOGLE_ANALYTICS_MEASUREMENT_ID=G-XXXXXXXX .
   ```
3. Redeploy `wayel-customer`. The Docker build injects the gtag snippet into
   `index.html` so it appears in page source and loads before the Angular bundle.

**Verify in the browser:** View source on `https://www.weyell.co.za` — you should
see `gtag/js?id=G-TBGNM7R6F0`. In GA4 open **Reports → Realtime** (allow ~30s after
a page visit; disable ad blockers for the test).

**Google Analytics admin:** the Web data stream must use `https://www.weyell.co.za`
as the site URL (add `https://weyell.co.za` too if you serve the apex without redirect).

**Env vars** (already in `render.yaml` for blueprint sync)

* `BorderBox__TrialAccess__Enabled` → `true` (early adopter offer: first 14 days free)
* `BorderBox__TrialAccess__DurationDays` → `14`
* `BorderBox__CustomerPortalBaseUrl` → `https://www.weyell.co.za`
* `Cors__AllowedOrigins__0/1/2` → `www`, apex, and `ops` hostnames
* `Billing__MtnMomo__CallbackHost` → `api.weyell.co.za`

`Bff__ApiBaseUri` on `wayel-customer` can stay on
`https://wayel-api.onrender.com` (server-to-server). Set
`Bff__SpaBaseUri` to your canonical customer hostname
(`https://www.weyell.co.za`) — **not** `RENDER_EXTERNAL_URL`, which
stays on `*.onrender.com` even after a custom domain is verified and
will send users back to `wayel-customer.onrender.com` after Google sign-in.

**BFF session persistence (Mongo Data Protection)**

The customer BFF encrypts its session cookie with ASP.NET Data Protection keys
stored in Mongo (`data_protection_keys` collection). Without this, every
`wayel-customer` redeploy logs every signed-in customer out.

On `wayel-customer`, paste the **same** values as `wayel-api`:

| Env var | Notes |
|---------|-------|
| `Mongo__ConnectionString` | Atlas SRV URI (sync: false in Render) |
| `Mongo__DatabaseName` | `courier_platform` (default in blueprint) |

**Forwarded headers (rate-limit / IP trust)**

Both `wayel-api` and the colocated BFF in `wayel-customer` honour
`X-Forwarded-For` only from configured trusted proxies — not from arbitrary
clients hitting `api.weyell.co.za` directly.

| Service | Default trust | Config section |
|---------|---------------|----------------|
| `wayel-api` | Render internal LB ranges (`10/8`, `172.16/12`, `192.168/16`) | `ForwardedHeaders` in `appsettings.json` |
| `wayel-customer` BFF | Colocated nginx (`127.0.0.1`, `::1`) | `ForwardedHeaders` in Bff appsettings |

Local dev sets `ForwardedHeaders:TrustAllProxies=true` in Development overlays.

**nginx security headers (customer edge)**

The customer edge Docker image adds defensive headers on every response
(CSP, `X-Frame-Options`, `Referrer-Policy`, etc.) via
`deploy/render/nginx-security-headers.conf`. CSP allows Google Maps, GA4,
and Google Fonts used by the Angular portal.

---

## 4. Local smoke test of the Render images

Before pushing, you can build the same images locally to catch nginx-
template or build-context typos:

```bash
# From the repo root
docker build -f deploy/render/Dockerfile.customer-edge -t wayel-customer-edge .
docker build -f deploy/render/Dockerfile.ops-edge      -t wayel-ops-edge .

# Run the customer edge alone (BFF will fail Google OIDC without secrets,
# but the SPA should serve and /api/health/live should 502 in a clean way).
docker run --rm -p 10000:10000 \
  -e Bff__ApiBaseUri=https://wayel-api.onrender.com \
  -e Jwt__SigningKey=local-dev-signing-key-must-be-at-least-32-chars \
  -e GoogleOidc__ClientId=dev \
  -e GoogleOidc__ClientSecret=dev \
  wayel-customer-edge

curl -I http://localhost:10000/                # → 200 (SPA shell)
curl -I http://localhost:10000/api/health/live # → 502 until BFF reaches API
```

---

## 5. Rotating secrets

* **Jwt__SigningKey** — rotates the API issuer key. Set the same new
  value on **both** `wayel-api` and `wayel-customer` in one Render
  deploy; rolling out one service first will invalidate the cookie
  session of every in-flight customer.
* **Paystack keys** — rotate in the Paystack dashboard, paste new
  values into `Billing__Paystack__SecretKey` / `__PublicKey`. The API
  picks them up at the next deploy.
* **AWS keys** — rotate in IAM, paste into `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY`. The S3 client reads them at startup.
* **Postmark token** — rotate in Postmark, paste into
  `Notifications__Postmark__ServerToken`.

After any rotation, redeploy the service from the Render dashboard
(env var changes do **not** trigger an auto-deploy).

---

## 6. Troubleshooting

| Symptom                                              | Likely cause                                                                                                                         |
|------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `502 Bad Gateway` on `/api/*` from the ops dashboard | `API_UPSTREAM_HOST` is wrong, or the API container is restarting. Check `https://wayel-api.onrender.com/health/live`.                |
| `OIDC redirect_uri does not match` from Google       | The customer service's URL changed but Google Cloud Console still has the old URI registered. Add the new URI in Authorized redirects.|
| Cookie set but `/api/*` calls 401                    | `Jwt__SigningKey` on `wayel-customer` differs from `wayel-api`. Both services must share the exact same value.                       |
| Every customer logged out after a redeploy           | `Mongo__ConnectionString` missing on `wayel-customer`. Paste the same Atlas URI as `wayel-api`.                                      |
| `MTN MoMo: failed to acquire access token`           | Primary subscription key wrong on `Billing__MtnMomo__SubscriptionKey`, OR sandbox auto-provision is off and ApiUser/ApiKey are blank.|
| Invoices `404` after restart                         | `MediaStorage__Provider` is still `in-memory` (i.e. S3 not configured). Set it to `s3` and provide the bucket + AWS credentials.     |

For everything else: Render's **Logs** tab is the source of truth — both
nginx and the .NET host print to stdout, so a single tail covers the full
request path.
