-- account_requests was created outside the tracked migration history
-- (via the dashboard, early in the project). This migration exists purely
-- to document its already-live, already-correct configuration in version
-- control — it's written idempotently and is a no-op against the current
-- database (verified: rowsecurity=true, one INSERT-only policy, no
-- SELECT/UPDATE/DELETE policy, so anon can submit requests but never read
-- anyone's, including their own).

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  message text,
  created_at timestamptz not null default now()
);

alter table public.account_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'account_requests' and policyname = 'Anyone can submit an account request'
  ) then
    create policy "Anyone can submit an account request"
      on public.account_requests
      for insert
      to anon
      with check (true);
  end if;
end $$;
