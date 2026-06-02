#!/usr/bin/env sh
# Inject GA4 gtag.js into the built customer-portal index.html when analytics
# is enabled in environment.bff.ts.

set -eu

ENV_FILE="${1:-apps/customer-portal/src/environments/environment.bff.ts}"
INDEX_FILE="${2:-apps/customer-portal/dist/customer-portal/browser/index.html}"

if [ ! -f "$ENV_FILE" ] || [ ! -f "$INDEX_FILE" ]; then
  echo "inject-ga4-snippet: skip (missing env or index)" >&2
  exit 0
fi

if ! grep -q 'googleAnalyticsEnabled: true' "$ENV_FILE"; then
  echo "inject-ga4-snippet: skip (googleAnalyticsEnabled is not true)" >&2
  exit 0
fi

MEAS=$(grep -oE "googleAnalyticsMeasurementId: '[^']+'" "$ENV_FILE" | head -1 | sed -E "s/.*'([^']+)'.*/\1/" || true)
if [ -z "$MEAS" ]; then
  echo "inject-ga4-snippet: skip (no measurement id)" >&2
  exit 0
fi

if grep -q 'googletagmanager.com/gtag/js' "$INDEX_FILE"; then
  echo "inject-ga4-snippet: skip (already present)" >&2
  exit 0
fi

SNIPPET_FILE=$(mktemp)
cat > "$SNIPPET_FILE" <<EOF
<script async src="https://www.googletagmanager.com/gtag/js?id=${MEAS}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${MEAS}', { send_page_view: false });
</script>
EOF

NEXT_FILE="${INDEX_FILE}.next"
if grep -q '<!-- GA4_PLACEHOLDER -->' "$INDEX_FILE"; then
  awk -v snippet="$SNIPPET_FILE" '
    /<!-- GA4_PLACEHOLDER -->/ {
      while ((getline line < snippet) > 0) print line
      close(snippet)
      next
    }
    { print }
  ' "$INDEX_FILE" > "$NEXT_FILE"
else
  awk -v snippet="$SNIPPET_FILE" '
    /<\/head>/ {
      while ((getline line < snippet) > 0) print line
      close(snippet)
    }
    { print }
  ' "$INDEX_FILE" > "$NEXT_FILE"
fi

mv "$NEXT_FILE" "$INDEX_FILE"
rm -f "$SNIPPET_FILE"
echo "inject-ga4-snippet: inserted ${MEAS} into ${INDEX_FILE}"
