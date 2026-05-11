create table if not exists finding_sentence_memory (
  normalized_key text primary key,
  raw_sentence text not null,
  source_url text,
  first_seen_at text not null,
  expires_at text not null
);

create index if not exists idx_finding_sentence_memory_expires_at
  on finding_sentence_memory (expires_at);
