create table if not exists source_scan_runs (
  id text primary key,
  source_id text,
  source_name text,
  source_type text,
  checked_at text not null,
  items_found integer not null default 0,
  items_enriched integer not null default 0,
  findings_found integer not null default 0,
  leads_found integer not null default 0,
  drafts_created integer not null default 0,
  error text
);

create index if not exists idx_source_scan_runs_checked_at
  on source_scan_runs (checked_at);

create index if not exists idx_source_scan_runs_source_id_checked_at
  on source_scan_runs (source_id, checked_at);
