const memoryDrafts = new Map();

export async function insertDraft(env, draft) {
  if (!env.DB) {
    memoryDrafts.set(draft.id, draft);
    return;
  }

  await env.DB.prepare(
    "insert into drafts (id, topic, text, status, source, created_at, target, image_url, image_key, image_prompt) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      draft.id,
      draft.topic,
      draft.text,
      draft.status,
      draft.source,
      draft.createdAt,
      draft.target || "all",
      draft.imageUrl || null,
      draft.imageKey || null,
      draft.imagePrompt || null
    )
    .run();
}

export async function supersedePendingDraftsForTarget(env, { topic, target }) {
  if (!env.DB) {
    for (const [id, draft] of memoryDrafts.entries()) {
      if (draft.status === "pending" && draft.topic === topic && (draft.target || "all") === (target || "all")) {
        memoryDrafts.set(id, { ...draft, status: "superseded", updatedAt: new Date().toISOString() });
      }
    }
    return 0;
  }

  const result = await env.DB.prepare(
    "update drafts set status = 'superseded', updated_at = ? where status = 'pending' and topic = ? and coalesce(target, 'all') = ?"
  )
    .bind(new Date().toISOString(), topic, target || "all")
    .run();

  return result.meta?.changes || 0;
}

export async function supersedeAllPendingDrafts(env) {
  if (!env.DB) {
    let count = 0;
    for (const [id, draft] of memoryDrafts.entries()) {
      if (draft.status === "pending") {
        memoryDrafts.set(id, { ...draft, status: "superseded", updatedAt: new Date().toISOString() });
        count += 1;
      }
    }
    return count;
  }

  const result = await env.DB.prepare(
    "update drafts set status = 'superseded', updated_at = ? where status = 'pending'"
  )
    .bind(new Date().toISOString())
    .run();

  return result.meta?.changes || 0;
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

export async function updateDraftText(env, id, text) {
  if (!env.DB) {
    const draft = memoryDrafts.get(id);
    if (draft) memoryDrafts.set(id, { ...draft, text, updatedAt: new Date().toISOString() });
    return;
  }

  await env.DB.prepare("update drafts set text = ?, status = ?, updated_at = ? where id = ?")
    .bind(text, "pending", new Date().toISOString(), id)
    .run();
}

export async function updateDraftImage(env, id, image) {
  if (!env.DB) {
    const draft = memoryDrafts.get(id);
    if (draft) {
      memoryDrafts.set(id, {
        ...draft,
        imageUrl: image.imageUrl || "",
        imageKey: image.imageKey || "",
        imagePrompt: image.imagePrompt || draft.imagePrompt || "",
        updatedAt: new Date().toISOString()
      });
    }
    return;
  }

  await env.DB.prepare("update drafts set image_url = ?, image_key = ?, image_prompt = ?, updated_at = ? where id = ?")
    .bind(image.imageUrl || null, image.imageKey || null, image.imagePrompt || null, new Date().toISOString(), id)
    .run();
}

function fromRow(row) {
  return {
    id: row.id,
    topic: row.topic,
    text: row.text,
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
    target: row.target || "all",
    imageUrl: row.image_url || "",
    imageKey: row.image_key || "",
    imagePrompt: row.image_prompt || ""
  };
}
