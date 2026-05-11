const memorySentences = new Map();

export async function pruneExpiredFindingSentences(env, nowIso = new Date().toISOString()) {
  if (!env.DB) {
    for (const [key, value] of memorySentences.entries()) {
      if (value.expiresAt <= nowIso) memorySentences.delete(key);
    }
    return;
  }

  await env.DB.prepare("delete from finding_sentence_memory where expires_at <= ?")
    .bind(nowIso)
    .run();
}

export async function hasFindingSentence(env, normalizedKey) {
  if (!normalizedKey) return false;
  if (!env.DB) {
    const item = memorySentences.get(normalizedKey);
    return Boolean(item && item.expiresAt > new Date().toISOString());
  }

  const row = await env.DB.prepare(
    "select normalized_key from finding_sentence_memory where normalized_key = ? and expires_at > ?"
  )
    .bind(normalizedKey, new Date().toISOString())
    .first();

  return Boolean(row);
}

export async function rememberFindingSentence(env, input) {
  const normalizedKey = input.normalizedKey || normalizeSentence(input.rawSentence);
  if (!normalizedKey || !input.rawSentence) return null;

  const now = input.firstSeenAt || new Date().toISOString();
  const retentionDays = Number(env.FINDING_SENTENCE_RETENTION_DAYS || 30);
  const expiresAt = input.expiresAt || new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    normalizedKey,
    rawSentence: input.rawSentence,
    sourceUrl: input.sourceUrl || "",
    firstSeenAt: now,
    expiresAt
  };

  if (!env.DB) {
    memorySentences.set(normalizedKey, row);
    return row;
  }

  await env.DB.prepare(
    "insert or ignore into finding_sentence_memory (normalized_key, raw_sentence, source_url, first_seen_at, expires_at) values (?, ?, ?, ?, ?)"
  )
    .bind(row.normalizedKey, row.rawSentence, row.sourceUrl, row.firstSeenAt, row.expiresAt)
    .run();

  return row;
}

export function firstSentenceFromItem(item) {
  const text = [
    item.title,
    item.excerpt,
    item.fullText
  ].filter(Boolean).join(". ").replace(/\s+/g, " ").trim();

  const match = text.match(/^(.{20,}?[\.\!\?。！？])(?:\s|$)/);
  return (match?.[1] || text.slice(0, 240)).trim();
}

export function normalizeSentence(sentence) {
  return String(sentence || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
