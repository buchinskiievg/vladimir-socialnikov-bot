const memoryFindings = new Map();

export async function upsertMaterialFinding(env, input) {
  const url = String(input.url || "").trim();
  if (!url) return null;
  const now = input.seenAt || new Date().toISOString();
  const row = {
    url,
    title: cleanText(input.title || "Untitled material"),
    excerpt: cleanText(input.excerpt || "").slice(0, 2400),
    sourceId: input.sourceId || "",
    sourceName: input.sourceName || "",
    sourceType: input.sourceType || "",
    topic: input.topic || "",
    score: Number(input.score || 0),
    scoringJson: JSON.stringify(input.scoring || {}),
    publishedAt: input.publishedAt || "",
    firstSeenAt: now,
    lastSeenAt: now,
    status: input.status || "new"
  };

  if (!env.DB) {
    const existing = memoryFindings.get(url);
    memoryFindings.set(url, existing ? { ...existing, ...row, firstSeenAt: existing.firstSeenAt } : row);
    return row;
  }

  await env.DB.prepare(
    "insert into material_findings (url, title, excerpt, source_id, source_name, source_type, topic, score, scoring_json, published_at, first_seen_at, last_seen_at, status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(url) do update set title = excluded.title, excerpt = excluded.excerpt, source_id = excluded.source_id, source_name = excluded.source_name, source_type = excluded.source_type, topic = excluded.topic, score = excluded.score, scoring_json = excluded.scoring_json, published_at = excluded.published_at, last_seen_at = excluded.last_seen_at, status = case when material_findings.status = 'used' then material_findings.status else excluded.status end"
  )
    .bind(row.url, row.title, row.excerpt, row.sourceId, row.sourceName, row.sourceType, row.topic, row.score, row.scoringJson, row.publishedAt, row.firstSeenAt, row.lastSeenAt, row.status)
    .run();

  return row;
}

export async function readBestMaterialFinding(env, { sinceIso = "", includeUsed = false } = {}) {
  if (!env.DB) {
    return [...memoryFindings.values()]
      .filter((row) => (includeUsed || row.status !== "used") && (!sinceIso || row.lastSeenAt >= sinceIso))
      .sort((a, b) => b.score - a.score || String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))[0] || null;
  }

  const row = await env.DB.prepare(
    `select * from material_findings
     where url like 'http%' and (? = '' or last_seen_at >= ?) and (? = 1 or status != 'used')
     order by score desc, last_seen_at desc
     limit 1`
  )
    .bind(sinceIso, sinceIso, includeUsed ? 1 : 0)
    .first();
  return row ? fromRow(row) : null;
}

export async function readTopMaterialFindings(env, { sinceIso = "", includeUsed = false, limit = 5 } = {}) {
  const count = Math.max(1, Math.min(10, Number(limit || 5)));
  if (!env.DB) {
    return [...memoryFindings.values()]
      .filter((row) => (includeUsed || row.status !== "used") && (!sinceIso || row.lastSeenAt >= sinceIso))
      .sort((a, b) => b.score - a.score || String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))
      .slice(0, count);
  }

  const { results } = await env.DB.prepare(
    `select * from material_findings
     where url like 'http%' and (? = '' or last_seen_at >= ?) and (? = 1 or status != 'used')
     order by score desc, last_seen_at desc
     limit ?`
  )
    .bind(sinceIso, sinceIso, includeUsed ? 1 : 0, count)
    .all();

  return (results || []).map(fromRow);
}

export async function markMaterialFindingUsed(env, url) {
  if (!url) return;
  if (!env.DB) {
    const row = memoryFindings.get(url);
    if (row) memoryFindings.set(url, { ...row, status: "used" });
    return;
  }
  await env.DB.prepare("update material_findings set status = 'used', last_seen_at = ? where url = ?")
    .bind(new Date().toISOString(), url)
    .run();
}

function fromRow(row) {
  return {
    url: row.url,
    title: cleanText(row.title),
    excerpt: cleanText(row.excerpt || ""),
    sourceId: row.source_id || "",
    sourceName: row.source_name || "",
    sourceType: row.source_type || "",
    topic: row.topic || "",
    score: Number(row.score || 0),
    scoring: parseJson(row.scoring_json),
    publishedAt: row.published_at || "",
    firstSeenAt: row.first_seen_at || "",
    lastSeenAt: row.last_seen_at || "",
    status: row.status || "new"
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/&#038;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, "\"")
    .replace(/&#8221;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
