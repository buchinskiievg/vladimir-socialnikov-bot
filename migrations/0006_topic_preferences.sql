create table if not exists platform_topic_preferences (
  id text primary key,
  platform text not null,
  topic text not null,
  status text not null default 'proposed',
  weight real not null default 1,
  notes text,
  created_at text not null,
  updated_at text
);

create index if not exists idx_platform_topic_preferences_platform_status
  on platform_topic_preferences (platform, status);
