-- Deliver the rest-timer alert to a phone that is locked or put away.
--
-- The in-app alert (vibration, tone, a Notification) only fires while the
-- page's JavaScript is still running. iOS suspends a backgrounded PWA's JS
-- outright, so the one moment the timer exists for — phone in a pocket
-- between sets — is the one moment it could not reach you. Web Push does
-- reach a suspended installed PWA (iOS 16.4+), but a push has to be SENT at
-- the right second by something that is awake. That something is here.
--
-- Shape: the client stores its push subscription, and whenever it is
-- backgrounded mid-rest it writes one row saying "wake this device at T".
-- A pg_cron job sweeps for rows that are due and hands them to the
-- send-rest-push Edge Function, which does the VAPID signing and encryption
-- Postgres cannot.
--
-- Deliberately one pending row per device (the unique constraint below): a
-- device only ever has one rest running, so re-backgrounding during the same
-- rest updates the row rather than queueing a second buzz.
--
-- Safe to re-run.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- Defaulted from the caller's JWT so a client never has to look its own id
  -- up first. The RLS check below still enforces it.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The push service's URL for this device. Unique per device per account.
  endpoint text not null,
  -- The subscription's public key and auth secret, base64url as the browser
  -- hands them over. The Edge Function needs both to encrypt a payload.
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.scheduled_pushes (
  id uuid primary key default gen_random_uuid(),
  -- As above. This one matters: the row is written from a visibilitychange
  -- handler moments before the OS may freeze the page, with no time to await
  -- a lookup of anything.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  due_at timestamptz not null,
  title text not null,
  body text not null,
  delivered_at timestamptz,
  -- Gives up rather than retrying a dead subscription forever.
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (subscription_id)
);

create index if not exists scheduled_pushes_due_idx
  on public.scheduled_pushes (due_at)
  where delivered_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.scheduled_pushes enable row level security;

-- A device may only ever see and change its own account's rows. The Edge
-- Function reads across accounts with the service_role key, which bypasses
-- RLS by design.
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own scheduled pushes" on public.scheduled_pushes;
create policy "own scheduled pushes"
  on public.scheduled_pushes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The sweep.
--
-- Reads the shared secret the same way 002 does, out of Vault rather than
-- out of this file. Seed it once, by hand:
--   select vault.create_secret(
--     '<the same value as the function''s REST_PUSH_SECRET>',
--     'rest_push_trigger_secret',
--     'shared secret authorizing the rest-push sweep to call send-rest-push'
--   );
create or replace function public.sweep_rest_pushes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  -- Costs one index lookup when there is nothing to send, which is almost
  -- always. Without it this would invoke the Edge Function every few seconds
  -- around the clock for no reason.
  if not exists (
    select 1 from public.scheduled_pushes
    where delivered_at is null and attempts < 3 and due_at <= now()
  ) then
    return;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'rest_push_trigger_secret';

  if v_secret is null then
    raise warning 'rest_push_trigger_secret vault secret not found; skipping rest push sweep';
    return;
  end if;

  select net.http_post(
    url := 'https://krewmybpxzmcgbfihefd.supabase.co/functions/v1/send-rest-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into v_request_id;
end;
$$;

-- Every five seconds, because a rest alert a minute late is not a rest
-- alert. pg_cron 1.5+ accepts this interval form; on an older pg_cron use
-- '* * * * *' instead and accept up-to-a-minute lateness.
select cron.unschedule('sweep-rest-pushes')
where exists (select 1 from cron.job where jobname = 'sweep-rest-pushes');

select cron.schedule('sweep-rest-pushes', '5 seconds', $$select public.sweep_rest_pushes()$$);

-- Housekeeping: delivered and abandoned rows are of no further interest.
create or replace function public.purge_old_scheduled_pushes()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.scheduled_pushes
  where due_at < now() - interval '1 day';
$$;

select cron.unschedule('purge-scheduled-pushes')
where exists (select 1 from cron.job where jobname = 'purge-scheduled-pushes');

select cron.schedule('purge-scheduled-pushes', '17 4 * * *', $$select public.purge_old_scheduled_pushes()$$);
