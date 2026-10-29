-- Link Desk: personal cloud records. Run in Supabase SQL Editor as project owner.
-- Creates a new application table; existing local browser records are untouched.
begin;

create table if not exists public.linkdesk_links (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 200),
  partner text not null check (char_length(btrim(partner)) between 1 and 120),
  offer text not null check (char_length(btrim(offer)) between 1 and 160),
  geo text not null check (char_length(btrim(geo)) between 1 and 50),
  url text not null check (url ~ '^https?://' and char_length(url) <= 100000),
  status text not null default 'Получена'
    check (status in ('Получена', 'Передана', 'Остановлена')),
  sent date,
  source text not null default '' check (char_length(source) <= 500),
  note text not null default '' check (char_length(note) <= 3000),
  favorite boolean not null default false,
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists linkdesk_links_owner_updated_idx
  on public.linkdesk_links (user_id, updated_at desc);

alter table public.linkdesk_links enable row level security;
alter table public.linkdesk_links force row level security;

-- No anonymous access. Only the authenticated role receives CRUD privileges.
revoke all on public.linkdesk_links from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.linkdesk_links to authenticated;

-- Restrictive guard also limits any permissive policies added in the future.
drop policy if exists linkdesk_owner_guard on public.linkdesk_links;
create policy linkdesk_owner_guard on public.linkdesk_links
  as restrictive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists linkdesk_owner_access on public.linkdesk_links;
create policy linkdesk_owner_access on public.linkdesk_links
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.linkdesk_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.created_at = old.created_at;
  return new;
end;
$$;

revoke all on function public.linkdesk_set_updated_at() from public, anon, authenticated;
drop trigger if exists linkdesk_links_updated_at on public.linkdesk_links;
create trigger linkdesk_links_updated_at
  before update on public.linkdesk_links
  for each row execute function public.linkdesk_set_updated_at();

commit;

-- Verification: both values should be true; no card contents are returned.
select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where oid = 'public.linkdesk_links'::regclass;
