create table if not exists drafts (
  id text primary key,
  topic text not null,
  text text not null,
  status text not null,
  source text not null,
  created_at text not null,
  updated_at text
);

create index if not exists idx_drafts_status_created_at
  on drafts (status, created_at);

create table if not exists sources (
  id text primary key,
  type text not null,
  name text not null,
  url text not null,
  topic text,
  enabled integer not null default 1,
  last_checked_at text
);

create table if not exists leads (
  id text primary key,
  source_id text,
  source_url text not null,
  author text,
  title text,
  excerpt text,
  topic text,
  score real not null default 0,
  status text not null default 'new',
  created_at text not null
);
