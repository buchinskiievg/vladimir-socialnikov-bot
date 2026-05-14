import { addSource } from "./sources.js";

const memoryCandidates = new Map();

export async function addSourceCandidate(env, input) {
  const candidate = {
    id: crypto.randomUUID().slice(0, 8),
    type: input.type,
    name: input.name,
    url: input.url,
    topic: input.topic || "",
    status: "pending",
    score: Number(input.score || 0),
    reason: input.reason || "",
    createdAt: new Date().toISOString(),
    reviewedAt: null
  };

  if (!env.DB) {
    memoryCandidates.set(candidate.id, candidate);
    return candidate;
  }

  await env.DB.prepare(
    "insert into source_candidates (id, type, name, url, topic, status, score, reason, created_at, reviewed_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(candidate.id, candidate.type, candidate.name, candidate.url, candidate.topic, candidate.status, candidate.score, candidate.reason, candidate.createdAt, candidate.reviewedAt)
    .run();

  return candidate;
}

export async function approveSourceCandidate(env, id) {
  const candidate = await getSourceCandidate(env, id);
  if (!candidate) return { ok: false, message: "Source candidate not found." };
  if (candidate.status !== "pending") return { ok: false, message: `Source candidate already ${candidate.status}.` };

  const existing = await findSourceByUrl(env, candidate.url);
  const source = existing || await addSource(env, {
    type: candidate.type,
    name: candidate.name,
    url: candidate.url,
    topic: candidate.topic
  });

  await markSourceCandidate(env, id, "approved");
  return {
    ok: true,
    source,
    message: existing
      ? `Already in monitoring base: ${existing.name}`
      : `Added to monitoring base: ${source.name}`
  };
}

export async function rejectSourceCandidate(env, id) {
  const candidate = await getSourceCandidate(env, id);
  if (!candidate) return { ok: false, message: "Source candidate not found." };
  await markSourceCandidate(env, id, "rejected");
  return { ok: true, message: `Rejected source candidate: ${candidate.name}` };
}

async function getSourceCandidate(env, id) {
  if (!env.DB) return memoryCandidates.get(id) || null;

  const row = await env.DB.prepare("select * from source_candidates where id = ?")
    .bind(id)
    .first();

  return row ? fromRow(row) : null;
}

async function markSourceCandidate(env, id, status) {
  const reviewedAt = new Date().toISOString();
  if (!env.DB) {
    const candidate = memoryCandidates.get(id);
    if (candidate) memoryCandidates.set(id, { ...candidate, status, reviewedAt });
    return;
  }

  await env.DB.prepare("update source_candidates set status = ?, reviewed_at = ? where id = ?")
    .bind(status, reviewedAt, id)
    .run();
}

async function findSourceByUrl(env, url) {
  if (!env.DB) return null;

  const row = await env.DB.prepare("select * from sources where url = ? and enabled = 1 limit 1")
    .bind(url)
    .first();

  if (!row) return null;
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

function fromRow(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    url: row.url,
    topic: row.topic,
    status: row.status,
    score: row.score,
    reason: row.reason,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at
  };
}
