#!/usr/bin/env bash
#
# Boot script for the WeYell customer edge container.
#
# 1. Prefer an explicit Bff__SpaBaseUri (set in render.yaml for production).
#    Fall back to $RENDER_EXTERNAL_URL only when unset (ephemeral Render
#    hostnames before a custom domain is wired).
# 2. Start the .NET BFF bound to 127.0.0.1:8080 — only nginx can reach it.
# 3. Wait for the BFF TCP port to come up before exposing nginx (otherwise
#    health checks would race and the first few requests would 502).
# 4. envsubst the nginx template with $PORT and launch nginx in the
#    foreground so the container's PID 1 is nginx and Render's signal
#    propagation works.

set -euo pipefail

if [[ -z "${Bff__SpaBaseUri:-}" && -n "${RENDER_EXTERNAL_URL:-}" ]]; then
  export Bff__SpaBaseUri="${RENDER_EXTERNAL_URL}"
fi

# $PORT is injected by Render. Default for local docker runs is 10000.
export PORT="${PORT:-10000}"

# BFF listens on a fixed loopback port. Don't change without also updating
# nginx.customer-edge.conf.template.
export ASPNETCORE_URLS="http://127.0.0.1:8080"
export ASPNETCORE_ENVIRONMENT="${ASPNETCORE_ENVIRONMENT:-Production}"

cd /app/bff
dotnet "./${BFF_ASSEMBLY}" &
BFF_PID=$!

cleanup() {
  kill "${BFF_PID}" 2>/dev/null || true
}
trap cleanup EXIT

# Wait up to 60s for the BFF to start listening so the first browser hit
# doesn't bounce off nginx with a 502. The BFF normally comes up in
# 4-10s on a Standard plan.
for _ in $(seq 1 60); do
  if bash -c "exec 3<>/dev/tcp/127.0.0.1/8080" 2>/dev/null; then
    break
  fi
  sleep 1
done

envsubst '${PORT}' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
