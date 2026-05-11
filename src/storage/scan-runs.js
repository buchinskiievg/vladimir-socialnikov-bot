const memoryScanRuns = [];

export async function insertScanRun(env, run) {
  const scanRun = {
    id: run.id || crypto.randomUUID().slice(0, 12),
    sourceId: run.sourceId || null,
    sourceName: run.sourceName || "",
    sourceType: run.sourceType || "",
    checkedAt: run.checkedAt || new Date().toISOString(),
    itemsFound: run.itemsFound || 0,
    itemsEnriched: run.itemsEnriched || 0,
    findingsFound: run.findingsFound || 0,
    leadsFound: run.leadsFound || 0,
    draftsCreated: run.draftsCreated || 0,
    error: run.error || ""
  };

  if (!env.DB) {
    memoryScanRuns.push(scanRun);
    return scanRun;
  }

  await env.DB.prepare(
    "insert into source_scan_runs (id, source_id, source_name, source_type, checked_at, items_found, items_enriched, findings_found, leads_found, drafts_created, error) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      scanRun.id,
      scanRun.sourceId,
      scanRun.sourceName,
      scanRun.sourceType,
      scanRun.checkedAt,
      scanRun.itemsFound,
      scanRun.itemsEnriched,
      scanRun.findingsFound,
      scanRun.leadsFound,
      scanRun.draftsCreated,
      scanRun.error
    )
    .run();

  return scanRun;
}

export async function readScanSummary(env, sinceIso) {
  if (!env.DB) {
    const rows = memoryScanRuns.filter((run) => run.checkedAt >= sinceIso);
    return summarize(rows);
  }

  const totals = await env.DB.prepare(
    "select count(*) as scans, coalesce(sum(items_found), 0) as items_found, coalesce(sum(items_enriched), 0) as items_enriched, coalesce(sum(findings_found), 0) as findings_found, coalesce(sum(leads_found), 0) as leads_found, coalesce(sum(drafts_created), 0) as drafts_created, sum(case when error != '' then 1 else 0 end) as errors from source_scan_runs where checked_at >= ?"
  )
    .bind(sinceIso)
    .first();

  const bySource = await env.DB.prepare(
    "select source_name, source_type, count(*) as scans, coalesce(sum(items_found), 0) as items_found, coalesce(sum(items_enriched), 0) as items_enriched, coalesce(sum(findings_found), 0) as findings_found, coalesce(sum(leads_found), 0) as leads_found, coalesce(sum(drafts_created), 0) as drafts_created, sum(case when error != '' then 1 else 0 end) as errors from source_scan_runs where checked_at >= ? group by source_id, source_name, source_type order by leads_found desc, findings_found desc, items_found desc limit 25"
  )
    .bind(sinceIso)
    .all();

  const byType = await env.DB.prepare(
    "select source_type, count(*) as scans, coalesce(sum(items_found), 0) as items_found, coalesce(sum(findings_found), 0) as findings_found, coalesce(sum(leads_found), 0) as leads_found, sum(case when error != '' then 1 else 0 end) as errors from source_scan_runs where checked_at >= ? group by source_type order by items_found desc"
  )
    .bind(sinceIso)
    .all();

  const errors = await env.DB.prepare(
    "select source_name, source_type, error from source_scan_runs where checked_at >= ? and error != '' order by checked_at desc limit 10"
  )
    .bind(sinceIso)
    .all();

  return {
    totals,
    bySource: bySource.results || [],
    byType: byType.results || [],
    errors: errors.results || []
  };
}

function summarize(rows) {
  const totals = {
    scans: rows.length,
    items_found: rows.reduce((sum, row) => sum + row.itemsFound, 0),
    items_enriched: rows.reduce((sum, row) => sum + row.itemsEnriched, 0),
    findings_found: rows.reduce((sum, row) => sum + row.findingsFound, 0),
    leads_found: rows.reduce((sum, row) => sum + row.leadsFound, 0),
    drafts_created: rows.reduce((sum, row) => sum + row.draftsCreated, 0),
    errors: rows.filter((row) => row.error).length
  };

  return { totals, bySource: rows.slice(0, 25), byType: [], errors: rows.filter((row) => row.error).slice(0, 10) };
}
