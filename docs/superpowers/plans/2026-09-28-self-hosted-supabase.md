# Self-Hosted Supabase on the Homelab — Implementation Plan

> **Status (2026-09-28):** Tasks 1–2 done (repo side). Tasks 3–9 are the operator runbook, condensed in `docs/self-hosting.md`.

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1–2 are repo changes; Tasks 3–9 are operations on the homelab host and are done by hand (or by an agent with shell access to that host).

**Goal:** Move Peak's backend off Supabase's free tier — which pauses the project after a week of inactivity — onto the same Supabase software running in Docker on the homelab, with **no changes to the app's code under `src/`**.

**Why self-host Supabase rather than switch databases:** the client never talks to Postgres directly. It talks to three Supabase HTTP services — GoTrue (auth: `verifyOtp`, sessions, refresh), PostgREST (`supabase.from(...)` in `src/lib/sync.ts`, raw `/rest/v1/` calls in `src/lib/restPush.ts`) and Edge Functions (`supabase.functions.invoke("request-signin-code")`). Running those same services ourselves removes the pausing without rewriting sync or auth. Swapping databases (e.g. PocketBase/SQLite) would mean rewriting all of that to solve what is really a hosting-policy problem.

**Architecture:**

```
Phone / browser
   │  HTTPS (real, publicly trusted certificate — required for the service
   │  worker, Web Push, and Add to Home Screen on iOS)
   ▼
Cloudflare Tunnel  (or port-forwarded 443)
   ▼
Caddy
 ├── peak.<domain>       → static files from `npm run build` (dist/)
 └── api.peak.<domain>   → api-gw :8000 (Envoy upstream; also answers as `kong`)
                            ├── /auth/v1/*       → GoTrue (auth)
                            ├── /rest/v1/*       → PostgREST
                            └── /functions/v1/*  → edge-runtime (Deno)
Postgres (supabase/postgres image: pg_net, pg_cron ≥ 1.5, Vault)
   └── pg_cron / triggers ──► http://kong:8000/functions/v1/…  (Docker network only)
Studio (dashboard) — LAN / VPN only, never exposed publicly
Resend — stays as the email provider (outbound only)
```

**Tech stack:** Docker + Docker Compose, the official `supabase/supabase` repo's `docker/` directory, Caddy, Cloudflare Tunnel (`cloudflared`), restic (backups).

## Global Constraints

- **No changes under `src/`.** The client is configured purely by the build-time `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_VAPID_PUBLIC_KEY`.
- **Migrations must keep working against hosted Supabase too.** The hardcoded project URL gets replaced by a configured value, never by a different hardcoded one.
- **No secret values in committed files.** Secrets live in Vault, in the self-hosted `.env`, or in the Compose environment — the same rule migrations 002 and 010 already follow.
- **Only `/auth/v1`, `/rest/v1` and `/functions/v1` are public.** Studio, Postgres (5432) and the pooler stay on the LAN/VPN.
- **TLS must be publicly trusted.** A self-signed certificate breaks installing the PWA and Web Push on iOS.
- **Keep Resend.** Sending mail directly from a residential IP lands in spam or is blocked outright.

---

## What the stack actually depends on (audit)

| Dependency | Where | Self-hosting impact |
|---|---|---|
| `auth.users`, `auth.uid()` | FKs + RLS in `001`, `010`; seed in `008` | Provided by GoTrue on the `supabase/postgres` image — no change |
| `pg_net` | `002` (account-request trigger), `010` (rest-push sweep) | Included in the image — no change |
| `pg_cron` with `'5 seconds'` | `010` | Needs pg_cron ≥ 1.5; the image ships 1.6 — verify in Task 5 |
| Vault (`vault.decrypted_secrets`) | `002`, `010` | Included in the image — secrets must be re-seeded (Task 5) |
| **Hardcoded project URL** | `002_account_request_notify.sql:49`, `010_rest_push.sql:119` | **Must change** — Task 1 |
| Function secrets via `supabase secrets set` | `docs/rest-push.md` step 4 | CLI command doesn't apply — secrets go in Compose env (Task 4) |
| Functions authenticated by a custom shared secret, not a JWT | `notify-account-request`, `send-rest-push` | `FUNCTIONS_VERIFY_JWT` must stay `false` (the upstream default) |
| Admin API `generate_link` | `request-signin-code` | Works against GoTrue — no change |
| Hardcoded `ADMIN_EMAIL`, sender `noreply@peak.foursight.one` | `notify-account-request/index.ts:19`, `:105`; `FROM_EMAIL` in `request-signin-code` | No change needed; sender domain must stay verified in Resend |
| Realtime, Storage, imgproxy | — | **Unused** — drop those containers |

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/011_configurable_functions_url.sql` | Create — redefines `handle_account_request_notify()` and `sweep_rest_pushes()` to read the functions base URL from Vault (`functions_base_url`) instead of a hardcoded project URL |
| `deploy/homelab/docker-compose.peak.yml` | Create — overlay enabled with `run.sh config add peak`: drops unused services, binds Postgres/Studio to loopback, passes function secrets, adds Caddy and an optional Cloudflare Tunnel |
| `deploy/homelab/Caddyfile` | Create — static app + API reverse proxy, SPA fallback, service-worker cache headers |
| `deploy/homelab/.env.peak.example` | Create — Peak's additions to the stack's `.env`, no values |
| `deploy/homelab/deploy.sh` | Create — installs/updates overlay, Caddyfile, functions and the app build on the stack |
| `deploy/homelab/backup.sh` | Create — nightly `pg_dump` → restic |
| `docs/self-hosting.md` | Create — the operator runbook (Tasks 3–9 condensed) |
| `docs/rest-push.md` | Modify — note the self-hosted equivalent of steps 3–4 |
| `README.md` | Modify — link to `docs/self-hosting.md` |

---

## Task 1: Make the functions URL configurable (repo) — done

The only thing that tied the database to the hosted project was the two `net.http_post` URLs.

- [x] `supabase/migrations/011_configurable_functions_url.sql` adds `private.invoke_edge_function(function, secret_name, body, timeout)`, which reads `functions_base_url` and the bearer secret from Vault and POSTs. `handle_account_request_notify()` and `sweep_rest_pushes()` are redefined on top of it — one copy of the Vault/warn/POST logic instead of two.
- [x] Missing Vault entries warn and skip, never block the insert — unchanged behaviour.
- [x] Header documents the value to seed (hosted `https://<project-ref>.supabase.co/functions/v1`, self-hosted `http://kong:8000/functions/v1`).
- [x] Also revokes EXECUTE on `sweep_rest_pushes()` / `purge_old_scheduled_pushes()` from `public`, `anon`, `authenticated`. PostgREST exposes `public` functions as `/rest/v1/rpc/…`, so the anon key could run these security definer functions on demand.
- [x] Safe to re-run; 002 and 010 untouched; cron schedules untouched.
- [ ] Seed `functions_base_url` in the **hosted** project when applying 011 there, so production keeps sending notifications until cutover.

**Verified** against Postgres 16 with stub `auth`/`vault`/`net`/`cron` schemas: migrations apply (re-run too); missing URL or secret → warning, insert succeeds, no call; seeded → correct URL, bearer and payload for both callers (a trailing slash on the base URL is tolerated); `anon`/`authenticated` get permission denied on the sweep, the purge and the `private` schema; an anon insert into `account_requests` still fires the trigger.

Found on the way (fresh installs only): `002` needs the table `004` creates, and `008` raises when no account exists yet. The runbook gives a working order rather than rewriting history.

## Task 2: Deployment files and runbook (repo) — done

Built against the current upstream `supabase/supabase` `docker/` directory, which differs from what this plan first assumed: the gateway service is `api-gw` (Envoy by default, network aliases `kong`/`envoy`), overlays are layered through `COMPOSE_FILE` with `sh run.sh config add <name>`, `setup.sh` generates every secret, and `FUNCTIONS_VERIFY_JWT` already defaults to `false`.

- [x] `deploy/homelab/docker-compose.peak.yml`: Realtime/Storage/imgproxy behind an unused profile; `api-gw` (and so Studio) on `${STUDIO_BIND_ADDRESS:-127.0.0.1}:8000`; the pooler on loopback; the six function secrets; `caddy` (mounts `volumes/peak/`, not `dist/` itself, so the deploy's rename-swap is picked up); `cloudflared` behind the `tunnel` profile.
- [x] `deploy/homelab/Caddyfile`: app with SPA fallback, `immutable` on `/assets/*`, `no-cache` on everything else (including `index.html` served for deep links); API site proxies only `/auth/v1`, `/rest/v1`, `/functions/v1`, 404 otherwise.
- [x] `deploy/homelab/.env.peak.example`.
- [x] `deploy/homelab/deploy.sh`: copies overlay/Caddyfile/functions (minus `*.test.ts`), builds the app from the stack's own `SUPABASE_PUBLIC_URL`/`ANON_KEY`, swaps `dist/` atomically, registers the overlay once, restarts.
- [x] `deploy/homelab/backup.sh`: `pg_dump -Fc` as `supabase_admin` plus Vault's root key into restic, `pipefail` so a failed dump fails the run, 7/4/6 retention.
- [x] `docs/self-hosting.md`; linked from `README.md` and `docs/rest-push.md`.

**Verified:** `docker compose config` on upstream + overlay resolves (9 services, ports bound as intended, secrets and `VERIFY_JWT=false` reach `functions`, `cloudflared` only with the profile); `caddy validate` passes for both HTTPS and `http://` (tunnel) addresses, `caddy fmt` clean; Caddy serving a stand-in build returns the intended headers, SPA fallback and 404s; `deploy.sh` dry-run with stubbed `docker`/`npm` copies the right files, builds with the right env, and is idempotent. Not verified: the stack actually running — no Docker daemon in the environment this was built in.

## Task 3: Host, domain and exposure (ops)

- [ ] A VM or LXC (e.g. Proxmox) with Docker. Sizing: **2 GB RAM / 2 vCPU / 20 GB disk** for the trimmed stack; 4 GB if keeping analytics/vector.
- [ ] Two DNS names: `peak.<domain>` (app) and `api.peak.<domain>` (API).
- [ ] Exposure — pick one:
  - **Cloudflare Tunnel (recommended):** no open ports, publicly trusted certificate, and the account-request form stays reachable for people who aren't approved yet. `cloudflared` routes both hostnames to Caddy.
  - **Port-forward 443** to Caddy with automatic Let's Encrypt. Needs a static IP or DDNS.
  - **Tailscale only:** most private (`tailscale cert` gives real certificates), but every user needs Tailscale on their phone and nobody new can request access. Single-user only.

## Task 4: Bring up the stack (ops)

- [ ] Run upstream `setup.sh --project-dir /opt/supabase` (installs Docker if needed, checks out the latest self-hosted release, generates secrets and keys).
- [ ] Fill `.env`:
  - `POSTGRES_PASSWORD`, `JWT_SECRET` (≥ 32 chars), then **generate** `ANON_KEY` and `SERVICE_ROLE_KEY` signed with that `JWT_SECRET` (per Supabase's self-hosting guide) — never reuse the example keys
  - `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` (Studio)
  - `SITE_URL=https://peak.<domain>`, `API_EXTERNAL_URL=https://api.peak.<domain>`, `SUPABASE_PUBLIC_URL=https://api.peak.<domain>`
  - `DISABLE_SIGNUP=true` — matches Peak's model: accounts are created by the admin, never self-serve (`AuthScreen` requests access; `request-signin-code` only sends to existing users)
  - SMTP can point at Resend's SMTP relay, or stay unset: sign-in codes are delivered by `request-signin-code`, not GoTrue's mailer
  - Function secrets: `RESEND_API_KEY`, `NOTIFY_TRIGGER_SECRET`, `REST_PUSH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — reuse the **existing** VAPID pair so current push subscriptions stay valid
- [ ] `sh deploy/homelab/deploy.sh /opt/supabase` — installs the overlay, Caddyfile and functions, builds the app, starts everything.
- [ ] Caddy + tunnel up; `curl https://api.peak.<domain>/auth/v1/health` returns OK from outside the LAN.

## Task 5: Schema, extensions and secrets (ops)

Skip the migrations here if Task 6 restores a full dump — the dump already contains the schema. Run them only for a fresh start.

- [ ] Fresh start only: apply migrations in the order `001 003 004 002 005 006 007 009 010 011`, then `008` once an account exists.
- [ ] Check pg_cron supports interval schedules: `select extversion from pg_extension where extname = 'pg_cron';` → must be ≥ 1.5.
- [ ] Seed Vault (values must match the Compose env from Task 4):

  ```sql
  select vault.create_secret('http://kong:8000/functions/v1', 'functions_base_url', 'base URL pg_net uses to call Edge Functions');
  select vault.create_secret('<NOTIFY_TRIGGER_SECRET>', 'account_request_notify_service_role', 'authorizes the account_requests trigger → notify-account-request');
  select vault.create_secret('<REST_PUSH_SECRET>', 'rest_push_trigger_secret', 'authorizes the rest-push sweep → send-rest-push');
  ```

- [ ] `select jobname, schedule from cron.job;` lists `sweep-rest-pushes` (`5 seconds`) and `purge-scheduled-pushes`.

## Task 6: Migrate data from the hosted project (ops)

- [ ] If the hosted project is paused, restore it from the Supabase dashboard first.
- [ ] Dump from hosted with the Supabase CLI against its direct connection string: roles (`supabase db dump --role-only`), schema (`supabase db dump`), and data (`supabase db dump --data-only`) — plus the `auth` schema's data (`auth.users`, `auth.identities`), which the default dump excludes.
- [ ] Restore into the self-hosted Postgres in that order, then re-run Task 5's Vault seeding (Vault secrets are encrypted with a per-instance key and **do not survive a dump/restore**) and Task 1's migration 011 if it wasn't in the dump.
- [ ] Sanity-check row counts per table against hosted: `templates`, `exercise_library`, `workout_sessions`, `active_workout_draft`, `account_requests`, `push_subscriptions`, `auth.users`.

Keeping `auth.users.id` unchanged is what keeps every `user_id` FK and RLS policy valid. The new `JWT_SECRET` invalidates existing sessions — each device signs in once more, and because IndexedDB is the source of truth, sync simply resumes from its watermarks.

## Task 7: Rebuild and deploy the client (ops)

- [ ] `deploy.sh` (Task 4) already builds against the stack's URL and anon key and installs `dist/`; re-run it for each release.
- [ ] Optional: keep the frontend on Vercel instead and only change its env vars — the frontend is stateless, so either works.

## Task 8: End-to-end verification (ops)

On a phone, with Peak installed to the Home Screen:

- [ ] **Sign-in:** request a code → email arrives from Resend → `verifyOtp` succeeds → app loads.
- [ ] **Sync:** log a set on the phone, open on a second device, confirm it appears; delete a template on one, confirm the tombstone propagates.
- [ ] **Account request:** submit from a signed-out browser → admin email arrives (`notify-account-request` via the pg_net trigger).
- [ ] **Rest push:** Profile → Rest alert → Sound; start a rest, lock the phone; the buzz arrives within seconds of zero (`docs/rest-push.md` step 5 has the troubleshooting order).
- [ ] **Exposure:** from outside the LAN, `https://api.peak.<domain>/` paths other than the three API prefixes return 404; Studio and 5432 are unreachable.
- [ ] **Offline:** airplane mode → app still opens and logs; reconnect → sync catches up.

## Task 9: Operations and cutover (ops)

- [ ] Install `backup.sh` as a nightly systemd timer or cron job; **do one test restore** into a scratch container before relying on it.
- [ ] Uptime check (e.g. Uptime Kuma) on `/auth/v1/health` and the app URL.
- [ ] Update policy: monthly `sh update.sh --dry-run` → `sh update.sh` → `sh run.sh pull`, per upstream release notes, then `deploy.sh`.
- [ ] Cutover: once Task 8 passes, stop using the hosted project. Keep it (paused is fine) for ~30 days as a fallback, then delete it.

---

## Risks

| Risk | Mitigation |
|---|---|
| Homelab outage | Peak is offline-first: logging keeps working; only sign-in, sync and locked-screen rest push stop until it's back |
| Data loss | Nightly off-site restic backups with a tested restore (Task 9) |
| Public exposure of admin surfaces | Caddy only proxies the three API prefixes; Studio/Postgres bound to LAN |
| `FUNCTIONS_VERIFY_JWT=false` is global | All three functions do their own authorization (shared secret, or they only act on already-approved emails); anything added later must too |
| Vault secrets lost on restore | Explicit re-seed step in Task 6 |
| Upstream Compose changes break the overlay | `setup.sh` pins a release tag; `update.sh --dry-run` before upgrading, then re-validate with `run.sh compose-config` |
