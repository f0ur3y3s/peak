# Self-hosting Peak

Runs Peak's backend on your own machine with the official self-hosted
Supabase stack, instead of Supabase's hosted free tier (which pauses a
project after a week without activity). The app code under `src/` does not
change: it talks to the same three Supabase APIs, just at your address.

```
Phone ──HTTPS──► Cloudflare Tunnel or forwarded 443 ──► Caddy (peak-caddy)
                                        ├── peak.<domain>      → built app (volumes/peak/dist)
                                        └── api.peak.<domain>  → api-gw :8000, only
                                                                 /auth/v1, /rest/v1, /functions/v1
Postgres ── pg_cron / pg_net ──► http://kong:8000/functions/v1/…   (Docker network only)
Studio ── via api-gw on 127.0.0.1:8000 (SSH tunnel) or a LAN address, never public
```

| File | What it is |
| --- | --- |
| `deploy/homelab/docker-compose.peak.yml` | Overlay on the upstream stack: drops Realtime/Storage/imgproxy, binds Postgres and Studio to loopback, passes function secrets, adds Caddy and an optional tunnel |
| `deploy/homelab/Caddyfile` | Serves the app and the three API prefixes; caching headers for the service worker |
| `deploy/homelab/.env.peak.example` | The settings to append to the stack's `.env` |
| `deploy/homelab/deploy.sh` | Installs or updates Peak on the stack: overlay, functions, app build, restart |
| `deploy/homelab/backup.sh` | Nightly database + Vault-key backup into restic |
| `supabase/migrations/011_configurable_functions_url.sql` | Reads the Edge Functions URL from Vault instead of a hardcoded hosted project |

The step-by-step reasoning and task list are in
`docs/superpowers/plans/2026-09-28-self-hosted-supabase.md`.

## 1. Host and exposure

- A VM or LXC with Docker Engine and Compose 2.24.4 or newer. 2 GB RAM and
  20 GB disk are enough for the trimmed stack.
- Two DNS names: `peak.<domain>` for the app and `api.peak.<domain>` for the API.
- The certificate must be publicly trusted — iOS will not install the PWA or
  deliver Web Push with a self-signed one. Pick one:
  - **Cloudflare Tunnel** (recommended): no open ports. Create a tunnel,
    route both hostnames to `http://caddy:80`, put its token in
    `CLOUDFLARE_TUNNEL_TOKEN`, set `COMPOSE_PROFILES=tunnel`, and use
    `http://` site addresses in `PEAK_APP_SITE` / `PEAK_API_SITE`.
  - **Forward 80 and 443** to the host: use bare hostnames and Caddy obtains
    certificates itself.

## 2. Supabase stack

```sh
curl -fsSL https://raw.githubusercontent.com/supabase/supabase/master/docker/setup.sh | sh -s -- --project-dir /opt/supabase
```

`setup.sh` installs Docker if needed, checks out the latest self-hosted
release and generates every secret and API key. Then, in `/opt/supabase/.env`:

1. Set `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL`, `SITE_URL`,
   `DISABLE_SIGNUP=true`, `ENABLE_EMAIL_SIGNUP=true`,
   `ENABLE_PHONE_SIGNUP=false`, and leave `FUNCTIONS_VERIFY_JWT=false` —
   the comment block at the top of `.env.peak.example` explains each.
2. Append `deploy/homelab/.env.peak.example` and fill it in. Generate the two
   shared secrets with `openssl rand -hex 32`. Reuse the hosted project's
   VAPID key pair so existing push subscriptions keep working.

`FUNCTIONS_VERIFY_JWT=false` applies to every function. That is safe for
Peak because each function checks its own caller — `notify-account-request`
and `send-rest-push` require their shared secret, and `request-signin-code`
only ever emails accounts that already exist. Any function added later must
do the same.

## 3. Deploy Peak

```sh
git clone https://github.com/f0ur3y3s/peak && cd peak
sh deploy/homelab/deploy.sh /opt/supabase
```

Re-run the same command for every release. It builds the app against the
stack's own `SUPABASE_PUBLIC_URL` and `ANON_KEY`, so the two cannot drift.

## 4. Database

Open a SQL session with
`docker exec -it supabase-db psql -U supabase_admin -d postgres`.

**Moving from the hosted project** (restore it from the dashboard first if
it is paused):

1. Dump with the Supabase CLI against the hosted database's direct
   connection string: `supabase db dump --db-url "$HOSTED_DB_URL" -f schema.sql`,
   then `--data-only -f data.sql`. Add
   `pg_dump "$HOSTED_DB_URL" --data-only --table=auth.users --table=auth.identities -f auth.sql`,
   because the default dump leaves `auth` data out.
2. Restore `schema.sql`, then `auth.sql`, then `data.sql`.
3. Apply `011_configurable_functions_url.sql` if the hosted project did not
   have it yet.

Keeping `auth.users.id` unchanged is what keeps every `user_id` and RLS
policy valid. The new JWT secret signs everyone out once; each device signs
back in and sync resumes from where it was, because the data on the device
is the source of truth.

**Starting fresh** — apply the migrations in this order. `002` depends on
the table `004` creates, and `008` needs at least one account to exist:

```
001 003 004 002 005 006 007 009 010 011     then, after creating your account, 008
```

**Either way**, seed Vault. Encrypted secrets do not survive a dump from a
different instance, so this is needed after a migration too:

```sql
select vault.create_secret('http://kong:8000/functions/v1', 'functions_base_url', 'base URL pg_net uses to call Edge Functions');
select vault.create_secret('<NOTIFY_TRIGGER_SECRET>', 'account_request_notify_service_role', 'authorizes the account_requests trigger');
select vault.create_secret('<REST_PUSH_SECRET>', 'rest_push_trigger_secret', 'authorizes the rest-push sweep');
```

Then check:

```sql
select extversion from pg_extension where extname = 'pg_cron';  -- 1.5 or newer
select jobname, schedule from cron.job;                          -- sweep-rest-pushes, purge-scheduled-pushes
```

Create accounts from Studio (Authentication → Add user) — signup is off.

## 5. Check it end to end

On a phone with Peak installed to the Home Screen:

- **Sign in:** request a code, the email arrives, the code signs you in.
- **Sync:** log a set, open Peak on a second device, the set is there.
- **Account request:** submit one while signed out, the admin email arrives.
- **Rest push:** see `docs/rest-push.md`, step 5.
- **Exposure:** from outside your network, `https://api.peak.<domain>/`
  returns 404, and ports 5432 and 8000 are closed.
- **Offline:** airplane mode still opens the app and logs sets; sync catches
  up on reconnect.

If a call from the database never arrives,
`select * from net._http_response order by created desc limit 5;` shows what
pg_net got back.

## 6. Keep it running

- **Backups:** run `deploy/homelab/backup.sh` nightly (systemd timer or
  cron) with `RESTIC_REPOSITORY` and `RESTIC_PASSWORD_FILE` set. It backs up
  the database and Vault's encryption key together — either alone cannot be
  restored. Test a restore once before relying on it.
- **Monitoring:** an uptime check (e.g. Uptime Kuma) on the app URL and
  `/auth/v1/health`.
- **Updates:** in `/opt/supabase`, `sh update.sh --dry-run`, then
  `sh update.sh` and `sh run.sh pull`, per the upstream release notes; then
  run `deploy.sh` again.
- **Outages:** Peak works offline, so a down homelab only stops sign-in,
  sync and the locked-screen rest alert until it is back.
