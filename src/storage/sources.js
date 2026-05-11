const memorySources = new Map();

export async function addSource(env, sourceInput) {
  const source = {
    id: crypto.randomUUID().slice(0, 8),
    type: sourceInput.type,
    name: sourceInput.name || sourceInput.topic || sourceInput.url,
    url: sourceInput.url,
    topic: sourceInput.topic || "",
    enabled: 1,
    lastCheckedAt: null
  };

  if (!env.DB) {
    memorySources.set(source.id, source);
    return source;
  }

  await env.DB.prepare(
    "insert into sources (id, type, name, url, topic, enabled, last_checked_at) values (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(source.id, source.type, source.name, source.url, source.topic, source.enabled, source.lastCheckedAt)
    .run();

  return source;
}

export async function listSources(env) {
  if (!env.DB) return [...memorySources.values()];

  const { results } = await env.DB.prepare(
    "select * from sources where enabled = 1 order by name limit 500"
  ).all();

  return results.map(fromRow);
}

export async function updateSourceCheckedAt(env, id, checkedAt) {
  if (!env.DB) {
    const source = memorySources.get(id);
    if (source) memorySources.set(id, { ...source, lastCheckedAt: checkedAt });
    return;
  }

  await env.DB.prepare("update sources set last_checked_at = ? where id = ?")
    .bind(checkedAt, id)
    .run();
}

function fromRow(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    url: row.url,
    topic: row.topic,
    enabled: row.enabled,
    lastCheckedAt: row.last_checked_at
  };
}
