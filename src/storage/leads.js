const memoryLeads = new Map();

export async function insertLead(env, leadInput) {
  const lead = {
    id: leadInput.id || crypto.randomUUID().slice(0, 8),
    sourceId: leadInput.sourceId || null,
    sourceUrl: leadInput.sourceUrl,
    author: leadInput.author || "",
    title: leadInput.title || "",
    excerpt: leadInput.excerpt || "",
    topic: leadInput.topic || "",
    score: leadInput.score || 0,
    status: leadInput.status || "new",
    createdAt: leadInput.createdAt || new Date().toISOString()
  };

  if (!env.DB) {
    memoryLeads.set(lead.id, lead);
    return lead;
  }

  await env.DB.prepare(
    "insert or ignore into leads (id, source_id, source_url, author, title, excerpt, topic, score, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(lead.id, lead.sourceId, lead.sourceUrl, lead.author, lead.title, lead.excerpt, lead.topic, lead.score, lead.status, lead.createdAt)
    .run();

  return lead;
}

export async function listLeadsByStatus(env, status) {
  if (!env.DB) return [...memoryLeads.values()].filter((lead) => lead.status === status);

  const { results } = await env.DB.prepare(
    "select * from leads where status = ? order by created_at desc limit 20"
  )
    .bind(status)
    .all();

  return results.map(fromRow);
}

function fromRow(row) {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    author: row.author,
    title: row.title,
    excerpt: row.excerpt,
    topic: row.topic,
    score: row.score,
    status: row.status,
    createdAt: row.created_at
  };
}
