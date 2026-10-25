-- Durable demo state (handoffs, deal packets, offers, Studio agents, audit, AI explanations). Run once in the
-- Supabase SQL editor. One row per object; `data` is the full contract object.
create table if not exists app_store (
  kind text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);
create index if not exists app_store_kind_updated on app_store (kind, updated_at);

-- Keep updated_at current on upserts.
create or replace function app_store_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists app_store_touch on app_store;
create trigger app_store_touch before update on app_store for each row execute function app_store_touch();

-- Server-only table: the API uses the service key, which bypasses RLS. No anon access.
alter table app_store enable row level security;

notify pgrst, 'reload schema';
