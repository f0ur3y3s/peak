-- Adds manual drag-to-reorder ordering for templates. Named "position"
-- rather than "order" since ORDER is a reserved SQL keyword — the client
-- maps its Template.order field to/from this column in src/lib/sync.ts.

alter table public.templates
  add column if not exists position integer not null default 0;
