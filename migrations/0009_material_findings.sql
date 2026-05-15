create table if not exists material_findings (
  url text primary key,
  title text not null,
  excerpt text,
  source_id text,
  source_name text,
  source_type text,
  topic text,
  score integer not null default 0,
  scoring_json text,
  published_at text,
  first_seen_at text not null,
  last_seen_at text not null,
  status text not null default 'new'
);

create index if not exists idx_material_findings_score_seen
  on material_findings (status, score, last_seen_at);
