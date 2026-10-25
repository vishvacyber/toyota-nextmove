-- B2: SerpApi response cache (CLAUDE.md rule 9). Run once in the Supabase SQL editor.
create table if not exists serpapi_cache (
  key text primary key,                 -- sha256 of engine + sorted params (API key excluded)
  engine text not null,
  params jsonb not null,
  response jsonb not null,
  source text not null,
  fetched_at timestamptz not null default now()
);

-- Server-only table: the API uses the service key, which bypasses RLS. No anon access.
alter table serpapi_cache enable row level security;
