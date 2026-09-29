-- Take the Edge Functions base URL out of the migrations and into Vault.
--
-- 002 and 010 hardcoded the hosted project's URL into the two places the
-- database calls an Edge Function over pg_net, which tied the schema to one
-- Supabase project: pointing the same database at a self-hosted stack (see
-- docs/self-hosting.md) meant editing history. Both call sites also repeated
-- the same "read a secret from Vault, bail out with a warning if it is
-- missing, POST with it as a bearer token" dance. This moves that into one
-- helper, which reads the base URL from Vault alongside the secret.
--
-- Seed the URL once, by hand, like the other Vault secrets:
--   hosted:       select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'functions_base_url', 'base URL pg_net uses to call Edge Functions');
--   self-hosted:  select vault.create_secret('http://kong:8000/functions/v1', 'functions_base_url', 'base URL pg_net uses to call Edge Functions');
-- The self-hosted value is the internal Docker network address, so the call
-- never leaves the host.
--
-- Until it is seeded, both callers warn and skip — the same behaviour they
-- already had for a missing bearer secret, never a blocked insert.
--
-- Also revokes EXECUTE on the sweep and purge functions from API roles.
-- Postgres grants EXECUTE to PUBLIC by default, and PostgREST exposes every
-- function in `public` as /rest/v1/rpc/<name>, so anyone holding the anon
-- key (which ships in the client bundle) could run these security definer
-- functions on demand. Only pg_cron, running as the owner, needs them.
--
-- Safe to re-run. Leaves the cron schedules from 010 untouched: they call
-- the functions by name, and `create or replace` keeps that name.

create schema if not exists private;
revoke all on schema private from public;

-- POSTs `p_body` to the Edge Function `p_function`, authorised with the Vault
-- secret `p_secret_name`. Returns the pg_net request id, or null (with a
-- warning) when either Vault entry is missing.
create or replace function private.invoke_edge_function(
  p_function text,
  p_secret_name text,
  p_body jsonb,
  p_timeout_ms integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_base_url
  from vault.decrypted_secrets
  where name = 'functions_base_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = p_secret_name;

  if v_base_url is null or v_secret is null then
    raise warning 'vault secret % not found; skipping call to %',
      case when v_base_url is null then 'functions_base_url' else p_secret_name end,
      p_function;
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_base_url, '/') || '/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := p_body,
    timeout_milliseconds := p_timeout_ms
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.invoke_edge_function(text, text, jsonb, integer) from public;

-- Supersedes 002's body.
create or replace function public.handle_account_request_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.invoke_edge_function(
    'notify-account-request',
    'account_request_notify_service_role',
    jsonb_build_object(
      'type', 'INSERT',
      'table', 'account_requests',
      'schema', 'public',
      'record', to_jsonb(new)
    ),
    5000
  );
  return new;
end;
$$;

-- Supersedes 010's body.
create or replace function public.sweep_rest_pushes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  perform private.invoke_edge_function(
    'send-rest-push',
    'rest_push_trigger_secret',
    '{}'::jsonb,
    10000
  );
end;
$$;

revoke all on function public.sweep_rest_pushes() from public, anon, authenticated;
revoke all on function public.purge_old_scheduled_pushes() from public, anon, authenticated;
