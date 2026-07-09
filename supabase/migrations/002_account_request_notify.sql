-- Notify the admin by email whenever someone submits an account request.
--
-- Pattern used: pg_net + Supabase Vault, which is the current documented
-- approach for calling an Edge Function from a Postgres trigger
-- (https://supabase.com/docs/guides/database/extensions/pg_net,
-- https://supabase.com/docs/guides/functions/schedule-functions).
-- This project does not have the `supabase_functions` schema / `http_request`
-- helper provisioned (that's only auto-created when a Database Webhook is
-- first created via the Dashboard UI), so we call net.http_post directly.
--
-- The service_role key needed to authorize the call to the Edge Function is
-- NOT hardcoded here. It was stored ahead of time via:
--   select vault.create_secret(
--     '<service_role key>',
--     'account_request_notify_service_role',
--     'service_role key used by account_requests INSERT trigger to authorize
--      calls to the notify-account-request Edge Function'
--   );
-- and this migration only ever reads it back out of vault.decrypted_secrets
-- at trigger-execution time. Run that `vault.create_secret` call once,
-- manually, in the SQL editor (or via the CLI) before/after applying this
-- migration — it is intentionally not part of the migration file itself so
-- the secret value never has to pass through a committed file.

create extension if not exists pg_net with schema extensions;

create or replace function public.handle_account_request_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_role_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'account_request_notify_service_role';

  if v_service_role_key is null then
    -- Secret hasn't been seeded yet; don't block the insert, just skip
    -- the notification.
    raise warning 'account_request_notify_service_role vault secret not found; skipping notification';
    return new;
  end if;

  select net.http_post(
    url := 'https://krewmybpxzmcgbfihefd.supabase.co/functions/v1/notify-account-request',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'account_requests',
      'schema', 'public',
      'record', to_jsonb(new)
    ),
    timeout_milliseconds := 5000
  ) into v_request_id;

  return new;
end;
$$;

drop trigger if exists on_account_request_created on public.account_requests;

create trigger on_account_request_created
  after insert on public.account_requests
  for each row
  execute function public.handle_account_request_notify();
