-- B3: agent traces (SPEC §4). Run once in the Supabase SQL editor. Realtime goes over Broadcast (channel `traces`),
-- so this table needs no publication.
create table if not exists traces (
  id text primary key,
  agent text not null,
  customer_id text,
  started_at timestamptz not null,
  trace jsonb not null                  -- the full contract AgentTrace
);
create index if not exists traces_customer_started on traces (customer_id, started_at desc);

-- Server-only table: the API uses the service key, which bypasses RLS. No anon access.
alter table traces enable row level security;
