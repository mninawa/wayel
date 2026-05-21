#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${RENDER_EXTERNAL_URL:-}" ]]; then
  export Bff__SpaBaseUri="${RENDER_EXTERNAL_URL}"
fi

if [[ -z "${Bff__ApiBaseUri:-}" && -n "${NOREX_API_INTERNAL_HOSTPORT:-}" ]]; then
  export Bff__ApiBaseUri="http://${NOREX_API_INTERNAL_HOSTPORT}"
fi

export ASPNETCORE_URLS="http://127.0.0.1:8080"
export ASPNETCORE_ENVIRONMENT="${ASPNETCORE_ENVIRONMENT:-Production}"

# Run the BFF with its content root at /app/bff so ASP.NET picks up
# appsettings.json / appsettings.{Env}.json sitting next to the DLL.
# Without this the process inherits /app as CWD and the Options
# validator crashes with 'The Audience field is required' because the
# Bff section in /app/bff/appsettings.json never gets bound.
cd /app/bff
dotnet "./${BFF_ASSEMBLY}" &
BFF_PID=$!

cleanup() {
  kill "${BFF_PID}" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if bash -c "exec 3<>/dev/tcp/127.0.0.1/8080" 2>/dev/null; then
    break
  fi
  sleep 1
done

export PORT="${PORT:-8080}"
envsubst '${PORT}' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
