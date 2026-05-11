import { PLATFORM_TOPICS } from "../topic-strategy.js";

const memoryTopics = new Map();

export async function listTopicPreferences(env) {
  if (!env.DB) return memoryRows();

  const { results } = await env.DB.prepare(
    "select * from platform_topic_preferences order by platform, status, weight desc, created_at"
  ).all();

  const rows = (results || []).map(fromRow);
  return rows.length ? rows : defaultRows("proposed");
}

export async function listTopicsForPlatform(env, platform) {
  const active = await listTopicsByStatus(env, platform, "active");
  if (active.length) return active;
  const proposed = await listTopicsByStatus(env, platform, "proposed");
  return proposed.length ? proposed : defaultRows("proposed").filter((row) => row.platform === platform);
}

export async function upsertTopicPreference(env, input) {
  const row = {
    id: input.id || crypto.randomUUID().slice(0, 10),
    platform: normalizePlatform(input.platform),
    topic: String(input.topic || "").trim(),
    status: input.status || "active",
    weight: Number(input.weight || 1),
    notes: input.notes || "",
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!row.topic) return null;

  if (!env.DB) {
    memoryTopics.set(row.id, row);
    return row;
  }

  await env.DB.prepare(
    "insert into platform_topic_preferences (id, platform, topic, status, weight, notes, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set platform = excluded.platform, topic = excluded.topic, status = excluded.status, weight = excluded.weight, notes = excluded.notes, updated_at = excluded.updated_at"
  )
    .bind(row.id, row.platform, row.topic, row.status, row.weight, row.notes, row.createdAt, row.updatedAt)
    .run();

  return row;
}

export async function setTopicStatus(env, id, status) {
  if (!env.DB) {
    const row = memoryTopics.get(id);
    if (row) memoryTopics.set(id, { ...row, status, updatedAt: new Date().toISOString() });
    return;
  }

  await env.DB.prepare("update platform_topic_preferences set status = ?, updated_at = ? where id = ?")
    .bind(status, new Date().toISOString(), id)
    .run();
}

export async function seedDefaultTopicPreferences(env, status = "proposed") {
  const existing = await listStoredTopics(env);
  if (existing.length) return listTopicPreferences(env);

  const rows = defaultRows(status);
  for (const row of rows) await upsertTopicPreference(env, row);
  return rows;
}

async function listTopicsByStatus(env, platform, status) {
  if (!env.DB) return memoryRows().filter((row) => row.platform === platform && row.status === status);

  const { results } = await env.DB.prepare(
    "select * from platform_topic_preferences where platform = ? and status = ? order by weight desc, created_at"
  )
    .bind(platform, status)
    .all();

  return (results || []).map(fromRow);
}

async function listStoredTopics(env) {
  if (!env.DB) return memoryRows();
  const { results } = await env.DB.prepare("select * from platform_topic_preferences limit 1").all();
  return (results || []).map(fromRow);
}

function memoryRows() {
  const rows = [...memoryTopics.values()];
  return rows.length ? rows : defaultRows("proposed");
}

function defaultRows(status) {
  const rows = [];
  for (const [platform, topics] of Object.entries(PLATFORM_TOPICS)) {
    topics.forEach((topic, index) => {
      rows.push({
        id: `${platform}-${index + 1}`,
        platform,
        topic,
        status,
        weight: 1,
        notes: "default proposal",
        createdAt: new Date().toISOString(),
        updatedAt: ""
      });
    });
  }
  return rows;
}

function fromRow(row) {
  return {
    id: row.id,
    platform: row.platform,
    topic: row.topic,
    status: row.status,
    weight: row.weight,
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at || ""
  };
}

function normalizePlatform(platform) {
  const value = String(platform || "").toLowerCase().trim();
  if (value.includes("reddit")) return "reddit";
  if (value.includes("facebook") || value === "fb") return "facebook";
  if (value.includes("instagram") || value === "insta") return "instagram";
  if (value.includes("thread")) return "threads";
  if (value.includes("forum") || value.includes("форум")) return "forums";
  return "linkedin";
}
