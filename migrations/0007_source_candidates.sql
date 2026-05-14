create table if not exists source_candidates (
  id text primary key,
  type text not null,
  name text not null,
  url text not null,
  topic text,
  status text not null default 'pending',
  score real not null default 0,
  reason text,
  created_at text not null,
  reviewed_at text
);

create index if not exists idx_source_candidates_status_created_at
  on source_candidates (status, created_at);
