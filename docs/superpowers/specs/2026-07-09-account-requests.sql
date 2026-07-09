create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.account_requests enable row level security;

drop policy if exists "Anyone can request account" on public.account_requests;

create policy "Anyone can request account"
on public.account_requests
for insert
to anon
with check (true);
