#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# setup-dev-domains.sh
# -----------------------------------------------------------------------------
# Wires up the *.wayel.local custom domains used by docker-compose.proxy.yml.
#
# Two phases:
#
#   1. hosts        Append the four *.wayel.local entries to /etc/hosts.
#                   Idempotent — re-running is a no-op once the lines exist.
#                   Requires sudo because /etc/hosts is root-owned.
#
#   2. trust        (Optional) Only if you use HTTPS in the Caddyfile. With
#                   the default HTTP-only stack, skip this.
#
# Usage:
#   ./scripts/setup-dev-domains.sh             # runs both phases (default)
#   ./scripts/setup-dev-domains.sh hosts       # only /etc/hosts
#   ./scripts/setup-dev-domains.sh trust       # only TLS trust
#   ./scripts/setup-dev-domains.sh print       # show what we'd add to /etc/hosts
#
# Linux note: the keychain command is macOS-specific. On Linux, the script
# prints the cert path so you can install it via your distro's CA store.
# -----------------------------------------------------------------------------
set -euo pipefail

DOMAINS=(
  "admin.wayel.local"
  "client.wayel.local"
  "external.wayel.local"
  "api.wayel.local"
)

HOSTS_FILE="/etc/hosts"
HOSTS_MARKER="# >>> wayel local-dev domains >>>"
HOSTS_END_MARKER="# <<< wayel local-dev domains <<<"

CADDY_SERVICE="caddy"
COMPOSE_FILES=(-f docker-compose.dev.yml -f docker-compose.proxy.yml)
CERT_OUT="/tmp/wayel-caddy-root.crt"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  • %s\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$(dirname "$0")/.."  # repo-relative working dir = backend/api

phase_print() {
  bold "Suggested /etc/hosts entries"
  printf '%s\n' "$HOSTS_MARKER"
  for d in "${DOMAINS[@]}"; do
    printf '127.0.0.1 %s\n' "$d"
  done
  printf '%s\n' "$HOSTS_END_MARKER"
}

phase_hosts() {
  bold "Updating $HOSTS_FILE"
  if grep -q "$HOSTS_MARKER" "$HOSTS_FILE" 2>/dev/null; then
    info "marker already present — skipping (run 'sudo ./scripts/setup-dev-domains.sh hosts --force' to rewrite)"
    return 0
  fi
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "needs sudo: re-run as 'sudo $0 hosts'"
  fi
  {
    echo ""
    echo "$HOSTS_MARKER"
    for d in "${DOMAINS[@]}"; do
      echo "127.0.0.1 $d"
    done
    echo "$HOSTS_END_MARKER"
  } >> "$HOSTS_FILE"
  for d in "${DOMAINS[@]}"; do
    info "added $d"
  done
}

phase_trust() {
  bold "Trusting Caddy local CA"
  command -v docker >/dev/null 2>&1 || die "docker not found on PATH"

  if ! docker compose "${COMPOSE_FILES[@]}" ps --status running --services 2>/dev/null | grep -qx "$CADDY_SERVICE"; then
    die "the '$CADDY_SERVICE' service isn't running. Start the stack first:
       docker compose ${COMPOSE_FILES[*]} up -d"
  fi

  info "extracting root cert from caddy container"
  docker compose "${COMPOSE_FILES[@]}" exec -T "$CADDY_SERVICE" \
    cat /data/caddy/pki/authorities/local/root.crt > "$CERT_OUT" 2>/dev/null || \
      die "couldn't read /data/caddy/pki/authorities/local/root.crt — is Caddy fully booted?"

  case "$(uname -s)" in
    Darwin)
      info "installing into the macOS system keychain (asks for your password)"
      sudo security add-trusted-cert \
        -d -r trustRoot \
        -k /Library/Keychains/System.keychain \
        "$CERT_OUT"
      info "done. Restart browsers to pick up the new root."
      ;;
    Linux)
      warn "Linux detected. Install $CERT_OUT into your distro's CA store, e.g.:"
      warn "  sudo cp $CERT_OUT /usr/local/share/ca-certificates/wayel-caddy.crt"
      warn "  sudo update-ca-certificates"
      ;;
    *)
      warn "unknown OS — root cert lives at $CERT_OUT. Install it manually."
      ;;
  esac
}

main() {
  local cmd="${1:-all}"
  case "$cmd" in
    print)  phase_print ;;
    hosts)  phase_hosts ;;
    trust)  phase_trust ;;
    all|"") phase_hosts && phase_trust ;;
    *)      die "unknown command: $cmd. Use one of: print | hosts | trust | all" ;;
  esac
}

main "$@"
