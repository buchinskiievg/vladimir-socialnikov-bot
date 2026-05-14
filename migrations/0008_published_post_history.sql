create table if not exists published_post_history (
  id text primary key,
  draft_id text,
  target text not null,
  topic text not null,
  normalized_key text not null,
  source_url text,
  networks text,
  published_at text not null
);

create unique index if not exists idx_published_post_history_normalized_key
  on published_post_history (normalized_key);

create index if not exists idx_published_post_history_published_at
  on published_post_history (published_at);
