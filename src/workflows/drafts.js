import { publishToSocials } from "../social/index.js";
import { insertDraft, listDraftsByStatus, readDraft, updateDraftStatus } from "../storage/drafts.js";

export async function createDraftFromTopic(topic, context) {
  const draft = {
    id: crypto.randomUUID().slice(0, 8),
    topic,
    text: await generateDraftText(topic, context.env),
    status: "pending",
    source: "telegram",
    createdAt: new Date().toISOString()
  };

  await insertDraft(context.env, draft);
  return draft;
}

export async function listPendingDrafts(env) {
  return listDraftsByStatus(env, "pending");
}

export async function approveDraft(id, context) {
  const draft = await readDraft(context.env, id);
  if (!draft) return { ok: false, message: `Draft ${id} not found.` };
  if (draft.status !== "pending") return { ok: false, message: `Draft ${id} is ${draft.status}.` };

  const publishResult = await publishToSocials({ text: draft.text }, context.env);
  await updateDraftStatus(context.env, id, publishResult.ok ? "published" : "publish_failed");

  const lines = [`Draft ${id}: ${publishResult.ok ? "published" : "publish failed"}`];
  for (const item of publishResult.results) {
    lines.push(`${item.network}: ${item.ok ? "ok" : "failed"}${item.message ? ` - ${item.message}` : ""}`);
  }

  return { ok: publishResult.ok, message: lines.join("\n") };
}

export async function rejectDraft(id, env) {
  const draft = await readDraft(env, id);
  if (!draft) return { ok: false, message: `Draft ${id} not found.` };
  await updateDraftStatus(env, id, "rejected");
  return { ok: true, message: `Draft ${id}: rejected.` };
}

export async function createDraftFromFinding(finding, env) {
  const topic = finding.topic || "industry news";
  const draft = {
    id: crypto.randomUUID().slice(0, 8),
    topic,
    text: await generateDraftText(topic, env, finding),
    status: "pending",
    source: finding.url || "monitoring",
    createdAt: new Date().toISOString()
  };

  await insertDraft(env, draft);
  return draft;
}

async function generateDraftText(topic, env, finding = null) {
  if (env.GEMINI_API_KEY) {
    const { generatePostDraft } = await import("../ai/gemini.js");
    return generatePostDraft({ topic, finding }, env);
  }

  if (env.OPENAI_API_KEY) {
    const { generatePostDraft } = await import("../ai/openai.js");
    return generatePostDraft({ topic, finding }, env);
  }

  const sourceLine = finding?.url ? `Source: ${finding.url}` : null;
  return [
    `Draft post about: ${topic}`,
    sourceLine,
    "",
    "This placeholder will be replaced by an AI-generated post after an LLM provider is connected.",
    "Recommended structure: hook, engineering insight, practical takeaway, and one question for discussion."
  ].filter(Boolean).join("\n");
}
