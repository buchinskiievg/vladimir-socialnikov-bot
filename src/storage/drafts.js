const memoryDrafts = new Map();

export async function insertDraft(env, draft) {
  if (!env.DB) {
    memoryDrafts.set(draft.id, draft);
    return;
  }

  await env.DB.prepare(
    "insert into drafts (id, topic, text, status, source, created_at) values (?, ?, ?, ?, ?, ?)"
  )
    .bind(draft.id, draft.topic, draft.text, draft.status, draft.source, draft.createdAt)
    .run();
}

export async function readDraft(env, id) {
  if (!env.DB) return memoryDrafts.get(id) || null;

  const row = await env.DB.prepare("select * from drafts where id = ?").bind(id).first();
  return row ? fromRow(row) : null;
}

export async function listDraftsByStatus(env, status) {
  if (!env.DB) {
    return [...memoryDrafts.values()].filter((draft) => draft.status === status);
  }

  const { results } = await env.DB.prepare(
    "select * from drafts where status = ? order by created_at desc limit 10"
  )
    .bind(status)
    .all();

  return results.map(fromRow);
}

export async function updateDraftStatus(env, id, status) {
  if (!env.DB) {
    const draft = memoryDrafts.get(id);
    if (draft) memoryDrafts.set(id, { ...draft, status });
    return;
  }

  await env.DB.prepare("update drafts set status = ?, updated_at = ? where id = ?")
    .bind(status, new Date().toISOString(), id)
    .run();
}

function fromRow(row) {
  return {
    id: row.id,
    topic: row.topic,
    text: row.text,
    status: row.status,
    source: row.source,
    createdAt: row.created_at
  };
}
