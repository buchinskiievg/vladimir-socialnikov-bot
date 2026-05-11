create table if not exists chat_fast_memory (
  chat_id text primary key,
  updated_at text not null,
  pending_intent text,
  pending_targets text,
  pending_topic_hint text,
  summary text
);

create table if not exists chat_messages (
  id text primary key,
  chat_id text not null,
  user_id text,
  role text not null,
  text text not null,
  created_at text not null
);

create index if not exists idx_chat_messages_chat_created
  on chat_messages (chat_id, created_at);
