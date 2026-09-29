#!/bin/sh
#
# Install or update Peak on a self-hosted Supabase stack.
#
# Copies the overlay, Caddyfile and Edge Functions into the Supabase project
# directory, builds the app against that stack's public URL and anon key,
# and restarts only what changed. Safe to re-run on every release.
#
# Usage (from the repo root, on the homelab host):
#   sh deploy/homelab/deploy.sh /opt/supabase
#
# Reads SUPABASE_PUBLIC_URL, ANON_KEY and VAPID_PUBLIC_KEY from that
# directory's .env, so the client is always built against the stack it is
# deployed to.

set -eu

SUPABASE_DIR="${1:?usage: deploy.sh <supabase project dir>}"
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$REPO_DIR/deploy/homelab"

if [ ! -f "$SUPABASE_DIR/docker-compose.yml" ] || [ ! -f "$SUPABASE_DIR/.env" ]; then
  echo "ERROR: $SUPABASE_DIR is not a Supabase project directory (run upstream setup.sh first)" >&2
  exit 1
fi

# Reads one KEY=value from the stack's .env without sourcing the whole file.
env_value() {
  sed -n "s/^$1=//p" "$SUPABASE_DIR/.env" | tail -n 1 | sed -e 's/^"//' -e 's/"$//'
}

public_url="$(env_value SUPABASE_PUBLIC_URL)"
anon_key="$(env_value ANON_KEY)"
vapid_public_key="$(env_value VAPID_PUBLIC_KEY)"
if [ -z "$public_url" ] || [ -z "$anon_key" ]; then
  echo "ERROR: SUPABASE_PUBLIC_URL and ANON_KEY must be set in $SUPABASE_DIR/.env" >&2
  exit 1
fi

echo "==> Overlay and Caddyfile"
cp "$HERE/docker-compose.peak.yml" "$SUPABASE_DIR/"
mkdir -p "$SUPABASE_DIR/volumes/peak"
cp "$HERE/Caddyfile" "$SUPABASE_DIR/volumes/peak/Caddyfile"

echo "==> Edge Functions"
for fn in request-signin-code notify-account-request send-rest-push; do
  rm -rf "$SUPABASE_DIR/volumes/functions/$fn"
  mkdir -p "$SUPABASE_DIR/volumes/functions/$fn"
  # Tests import Node-only packages; the runtime has no use for them.
  find "$REPO_DIR/supabase/functions/$fn" -maxdepth 1 -type f -name '*.ts' ! -name '*.test.ts' \
    -exec cp {} "$SUPABASE_DIR/volumes/functions/$fn/" \;
done

echo "==> App build"
(
  cd "$REPO_DIR"
  npm ci
  VITE_SUPABASE_URL="$public_url" \
  VITE_SUPABASE_ANON_KEY="$anon_key" \
  VITE_VAPID_PUBLIC_KEY="$vapid_public_key" \
  VITE_LOCAL_PREVIEW=0 \
    npm run build
)
# Swap the whole directory so a half-copied build is never served.
rm -rf "$SUPABASE_DIR/volumes/peak/dist.new"
cp -R "$REPO_DIR/dist" "$SUPABASE_DIR/volumes/peak/dist.new"
rm -rf "$SUPABASE_DIR/volumes/peak/dist.old"
if [ -d "$SUPABASE_DIR/volumes/peak/dist" ]; then
  mv "$SUPABASE_DIR/volumes/peak/dist" "$SUPABASE_DIR/volumes/peak/dist.old"
fi
mv "$SUPABASE_DIR/volumes/peak/dist.new" "$SUPABASE_DIR/volumes/peak/dist"

echo "==> Restart"
(
  cd "$SUPABASE_DIR"
  case "$(env_value COMPOSE_FILE)" in
    *docker-compose.peak.yml*) ;;
    *) sh run.sh config add peak ;;
  esac
  docker compose up -d --wait
  # Functions and Caddy read their files at start; the static files are read
  # per request and need nothing.
  docker compose restart functions caddy
)

echo "Done. Check: curl -fsS $public_url/auth/v1/health -H \"apikey: <anon key>\""
