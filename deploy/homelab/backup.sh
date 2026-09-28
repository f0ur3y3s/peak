#!/usr/bin/env bash
#
# Nightly off-site backup of Peak's database, into a restic repository.
#
# Backs up two things, because either alone cannot be restored:
#   1. A full pg_dump — public data, auth.users (whose ids every user_id FK and
#      RLS policy depend on), cron jobs and Vault's encrypted secrets.
#   2. The key Vault's secrets are encrypted with. It lives in the db-config
#      volume, not the database, so without it a restored dump has unreadable
#      secrets and pg_net stops calling the Edge Functions.
# The restic repository is itself encrypted, which is what makes it acceptable
# to put the key next to the dump.
#
# Usage (as a systemd timer or cron job on the homelab host):
#   RESTIC_REPOSITORY=... RESTIC_PASSWORD_FILE=... bash deploy/homelab/backup.sh
#
# Restore, into a stack whose db container is up:
#   restic dump latest peak.dump | docker exec -i supabase-db \
#     pg_restore -U supabase_admin -d postgres --clean --if-exists
#   restic dump latest pgsodium_root.key | docker exec -i supabase-db \
#     sh -c 'cat > /etc/postgresql-custom/pgsodium_root.key'   # then restart db

# pipefail: a failed pg_dump must fail the run, not leave a truncated
# snapshot that looks like a good one.
set -euo pipefail

: "${RESTIC_REPOSITORY:?set RESTIC_REPOSITORY}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"

# supabase_admin, not postgres: postgres is not a superuser on current
# images and cannot read the auth or vault schemas in full.
docker exec "$DB_CONTAINER" pg_dump -U supabase_admin -d postgres -Fc \
  | restic backup --stdin --stdin-filename peak.dump --tag peak

docker exec "$DB_CONTAINER" cat /etc/postgresql-custom/pgsodium_root.key \
  | restic backup --stdin --stdin-filename pgsodium_root.key --tag peak-key

restic forget --tag peak --tag peak-key --group-by tags \
  --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
