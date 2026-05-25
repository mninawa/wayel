#!/usr/bin/env bash
#
# Boot script for the WeYell ops-dashboard edge container.
#
# Renders the nginx template with the runtime env vars (PORT +
# API_UPSTREAM_HOST) so the same image can target stage and prod by
# just changing the env on the Render service.

set -euo pipefail

export PORT="${PORT:-10000}"
export API_UPSTREAM_HOST="${API_UPSTREAM_HOST:-wayel-api.onrender.com}"

envsubst '${PORT} ${API_UPSTREAM_HOST}' \
  < /etc/nginx/templates/nginx.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
