import { publishToSocials } from "../social/index.js";
import { isDryRun } from "../social/shared.js";
import {
  insertDraft,
  listDraftsByStatus,
  readDraft,
  supersedeAllPendingDrafts,
  supersedePendingDraftsForTarget,
  updateDraftImage,
  updateDraftStatus,
  updateDraftText
} from "../storage/drafts.js";

export async function createDraftFromTopic(topic, context) {
  const id = crypto.randomUUID().slice(0, 8);
  const target = context.target || "all";
  await supersedePendingDraftsForTarget(context.env, { topic, target });
  const text = await generateDraftText(topic, context.env, context.finding || null, target);
  const draft = {
    id,
    topic,
    text,
    status: "pending",
    target,
    source: "telegram",
    createdAt: new Date().toISOString()
  };

  await insertDraft(context.env, draft);
  const image = await generateDraftImage({ id, topic, text, target }, context.env);
  if (image.imageUrl) {
    await updateDraftImage(context.env, id, image);
    return { ...draft, ...image };
  }
  return { ...draft, ...image };
}

export async function listPendingDrafts(env) {
  return listDraftsByStatus(env, "pending");
}

export async function cleanupPendingDrafts(env) {
  const count = await supersedeAllPendingDrafts(env);
  return {
    ok: true,
    message: count
      ? `Removed ${count} obsolete post(s) from approval queue.`
      : "Approval queue is already clean."
  };
}

export async function reviseDraft(id, instruction, context) {
  const draft = await readDraft(context.env, id);
  if (!draft) return { ok: false, message: `Post ${id} not found.` };
  if (draft.status !== "pending") return { ok: false, message: `Post ${id} is ${draft.status}.` };

  const text = await reviseDraftText(draft, instruction, context.env);
  await updateDraftText(context.env, id, text);

  return {
    ok: true,
    draft: { ...draft, text, status: "pending" },
    message: `Post ${id}: updated.`
  };
}

export async function regenerateDraftImage(id, instruction, context) {
  const draft = await readDraft(context.env, id);
  if (!draft) return { ok: false, message: `Post ${id} not found.` };
  if (draft.status !== "pending") return { ok: false, message: `Post ${id} is ${draft.status}.` };

  const image = await generateDraftImage({
    id: draft.id,
    topic: draft.topic,
    text: draft.text,
    target: draft.target || "all",
    imageInstruction: instruction
  }, context.env);

  if (!image.imageUrl) {
    return {
      ok: false,
      message: `Post ${id}: image regeneration failed. ${image.imagePrompt || ""}`.trim()
    };
  }

  await updateDraftImage(context.env, id, image);

  return {
    ok: true,
    draft: { ...draft, ...image, status: "pending" },
    message: `Post ${id}: image updated. Text unchanged.`
  };
}

export async function approveDraft(id, context) {
  let draft = await readDraft(context.env, id);
  if (!draft) return { ok: false, message: `Post ${id} not found.` };
  if (draft.status !== "pending") return { ok: false, message: `Post ${id} is ${draft.status}.` };

  if (!draft.imageUrl && context.env.GENERATE_POST_IMAGES !== "false") {
    const image = await generateDraftImage({
      id: draft.id,
      topic: draft.topic,
      text: draft.text,
      target: draft.target || "all"
    }, context.env);

    if (image.imageUrl) {
      await updateDraftImage(context.env, id, image);
      draft = { ...draft, ...image };
    } else {
      return {
        ok: false,
        message: `Post ${id}: image is missing, so I did not publish it. ${image.imagePrompt || "Image generation failed."}`
      };
    }
  }

  const publishResult = await publishToSocials({
    text: draft.text,
    target: draft.target || "all",
    imageUrl: draft.imageUrl || ""
  }, context.env);
  const dryRun = isDryRun(context.env) && publishResult.dryRun;
  await updateDraftStatus(context.env, id, publishResult.ok ? (dryRun ? "approved_dry_run" : "published") : "publish_failed");

  const lines = [
    `Post ${id}: ${publishResult.ok ? (dryRun ? "approved in dry run; not published" : "published") : "publish failed"}`,
    `Target: ${draft.target || "all"}`
  ];
  for (const item of publishResult.results) {
    lines.push(`${item.network}: ${item.ok ? "ok" : "failed"}${item.message ? ` - ${item.message}` : ""}`);
  }

  return { ok: publishResult.ok, message: lines.join("\n") };
}

export async function rejectDraft(id, env) {
  const draft = await readDraft(env, id);
  if (!draft) return { ok: false, message: `Post ${id} not found.` };
  await updateDraftStatus(env, id, "rejected");
  return { ok: true, message: `Post ${id}: rejected.` };
}

export async function createDraftFromFinding(finding, env) {
  const topic = finding.topic || "industry news";
  const id = crypto.randomUUID().slice(0, 8);
  const target = finding.target || "all";
  await supersedePendingDraftsForTarget(env, { topic, target });
  const text = await generateDraftText(topic, env, finding, target);
  const draft = {
    id,
    topic,
    text,
    status: "pending",
    target,
    source: finding.url || "monitoring",
    createdAt: new Date().toISOString()
  };

  await insertDraft(env, draft);
  const image = await generateDraftImage({ id, topic, text, target }, env);
  if (image.imageUrl) {
    await updateDraftImage(env, id, image);
    return { ...draft, ...image };
  }
  return { ...draft, ...image };
}

async function generateDraftImage({ id, topic, text, target, imageInstruction }, env) {
  try {
    const { generateInfographicForPost } = await import("../ai/images.js");
    return await generateInfographicForPost({ id, topic, text, target, imageInstruction }, env) || {};
  } catch (error) {
    return {
      imagePrompt: `Image generation failed: ${error.message}`
    };
  }
}

async function generateDraftText(topic, env, finding = null, target = "all") {
  if (env.GEMINI_API_KEY) {
    const { generatePostDraft } = await import("../ai/gemini.js");
    return generatePostDraft({ topic, finding, target }, env);
  }

  if (env.OPENAI_API_KEY) {
    const { generatePostDraft } = await import("../ai/openai.js");
    return generatePostDraft({ topic, finding }, env);
  }

  const sourceLine = finding?.url ? `Source: ${finding.url}` : null;
  return [
    `Final post about: ${topic}`,
    sourceLine,
    "",
    "This placeholder will be replaced by an AI-generated post after an LLM provider is connected.",
    "Recommended structure: hook, engineering insight, practical takeaway, and one question for discussion."
  ].filter(Boolean).join("\n");
}

async function reviseDraftText(draft, instruction, env) {
  if (env.GEMINI_API_KEY) {
    const { revisePostDraft } = await import("../ai/gemini.js");
    return revisePostDraft({ draft, instruction }, env);
  }

  return [
    draft.text,
    "",
    `Revision requested: ${instruction}`,
    "Manual edit recommended because no LLM provider is connected."
  ].join("\n");
}
