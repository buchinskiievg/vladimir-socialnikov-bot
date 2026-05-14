const memoryHistory = new Map();

export async function rememberPublishedPost(env, input) {
  const target = input.target || "all";
  const topic = String(input.topic || "").trim();
  const normalizedKey = input.normalizedKey || normalizePublishedPostKey({ target, topic });
  if (!topic || !normalizedKey) return null;

  const row = {
    id: crypto.randomUUID().slice(0, 8),
    draftId: input.draftId || "",
    target,
    topic,
    normalizedKey,
    sourceUrl: input.sourceUrl || "",
    networks: JSON.stringify(input.networks || []),
    publishedAt: input.publishedAt || new Date().toISOString()
  };

  if (!env.DB) {
    if (!memoryHistory.has(normalizedKey)) memoryHistory.set(normalizedKey, row);
    return row;
  }

  await env.DB.prepare(
    "insert or ignore into published_post_history (id, draft_id, target, topic, normalized_key, source_url, networks, published_at) values (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(row.id, row.draftId, row.target, row.topic, row.normalizedKey, row.sourceUrl, row.networks, row.publishedAt)
    .run();

  return row;
}

export async function hasPublishedPost(env, input) {
  const normalizedKey = input.normalizedKey || normalizePublishedPostKey(input);
  if (!normalizedKey) return false;

  if (!env.DB) return memoryHistory.has(normalizedKey);

  const row = await env.DB.prepare(
    "select normalized_key from published_post_history where normalized_key = ? limit 1"
  )
    .bind(normalizedKey)
    .first();

  return Boolean(row);
}

export function normalizePublishedPostKey({ target = "all", topic = "" }) {
  const normalizedTopic = String(topic || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  if (!normalizedTopic) return "";
  return `${target || "all"}::${normalizedTopic}`;
}
