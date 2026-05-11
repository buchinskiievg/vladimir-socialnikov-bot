const memoryFast = new Map();
const memoryMessages = new Map();

export async function appendChatMessage(env, message) {
  const row = {
    id: message.id || crypto.randomUUID(),
    chatId: String(message.chatId),
    userId: message.userId ? String(message.userId) : "",
    role: message.role,
    text: message.text,
    createdAt: message.createdAt || new Date().toISOString()
  };

  if (!env.DB) {
    const rows = memoryMessages.get(row.chatId) || [];
    rows.push(row);
    memoryMessages.set(row.chatId, rows.slice(-50));
    return row;
  }

  await env.DB.prepare(
    "insert into chat_messages (id, chat_id, user_id, role, text, created_at) values (?, ?, ?, ?, ?, ?)"
  )
    .bind(row.id, row.chatId, row.userId, row.role, row.text, row.createdAt)
    .run();

  return row;
}

export async function listRecentMessages(env, chatId, limit = 20) {
  const id = String(chatId);
  if (!env.DB) return (memoryMessages.get(id) || []).slice(-limit);

  const { results } = await env.DB.prepare(
    "select * from chat_messages where chat_id = ? order by created_at desc limit ?"
  )
    .bind(id, limit)
    .all();

  return (results || []).reverse().map(fromMessageRow);
}

export async function readFastMemory(env, chatId) {
  const id = String(chatId);
  if (!env.DB) return memoryFast.get(id) || emptyFastMemory(id);

  const row = await env.DB.prepare("select * from chat_fast_memory where chat_id = ?")
    .bind(id)
    .first();

  return row ? fromFastRow(row) : emptyFastMemory(id);
}

export async function writeFastMemory(env, memory) {
  const row = {
    chatId: String(memory.chatId),
    updatedAt: memory.updatedAt || new Date().toISOString(),
    pendingIntent: memory.pendingIntent || "",
    pendingTargets: JSON.stringify(memory.pendingTargets || []),
    pendingTopicHint: memory.pendingTopicHint || "",
    summary: memory.summary || ""
  };

  if (!env.DB) {
    memoryFast.set(row.chatId, {
      chatId: row.chatId,
      updatedAt: row.updatedAt,
      pendingIntent: row.pendingIntent,
      pendingTargets: JSON.parse(row.pendingTargets),
      pendingTopicHint: row.pendingTopicHint,
      summary: row.summary
    });
    return;
  }

  await env.DB.prepare(
    "insert into chat_fast_memory (chat_id, updated_at, pending_intent, pending_targets, pending_topic_hint, summary) values (?, ?, ?, ?, ?, ?) on conflict(chat_id) do update set updated_at = excluded.updated_at, pending_intent = excluded.pending_intent, pending_targets = excluded.pending_targets, pending_topic_hint = excluded.pending_topic_hint, summary = excluded.summary"
  )
    .bind(row.chatId, row.updatedAt, row.pendingIntent, row.pendingTargets, row.pendingTopicHint, row.summary)
    .run();
}

export async function resetFastMemory(env, chatId) {
  await writeFastMemory(env, {
    chatId: String(chatId),
    updatedAt: new Date().toISOString(),
    pendingIntent: "",
    pendingTargets: [],
    pendingTopicHint: "",
    summary: ""
  });
}

export async function archiveMessageToSlowMemory(env, message) {
  if (!env.MESSAGE_ARCHIVE) return;

  const date = (message.createdAt || new Date().toISOString()).slice(0, 10);
  const chatId = String(message.chatId);
  const key = `telegram/${chatId}/${date}.jsonl`;
  const existing = await env.MESSAGE_ARCHIVE.get(key);
  const previous = existing ? await existing.text() : "";
  const line = `${JSON.stringify(message)}\n`;
  await env.MESSAGE_ARCHIVE.put(key, previous + line, {
    httpMetadata: { contentType: "application/x-ndjson; charset=utf-8" }
  });
}

export async function pruneOldMessages(env) {
  if (!env.DB) return;
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("delete from chat_messages where created_at < ?").bind(cutoff).run();
}

function emptyFastMemory(chatId) {
  return {
    chatId: String(chatId),
    updatedAt: "",
    pendingIntent: "",
    pendingTargets: [],
    pendingTopicHint: "",
    summary: ""
  };
}

function fromFastRow(row) {
  return {
    chatId: row.chat_id,
    updatedAt: row.updated_at,
    pendingIntent: row.pending_intent || "",
    pendingTargets: safeJson(row.pending_targets, []),
    pendingTopicHint: row.pending_topic_hint || "",
    summary: row.summary || ""
  };
}

function fromMessageRow(row) {
  return {
    id: row.id,
    chatId: row.chat_id,
    userId: row.user_id,
    role: row.role,
    text: row.text,
    createdAt: row.created_at
  };
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}
