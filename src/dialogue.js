import { generateClarifyingQuestion, generateDialogueReply, parseDialogueTurn } from "./ai/gemini.js";
import { cleanupPendingDrafts, createDraftFromTopic, ensureDraftSourceLine, listPendingDrafts, regenerateDraftImage, reviseDraft } from "./workflows/drafts.js";
import { buildRedditDiscoveryMessages, discoverRedditCommunities } from "./workflows/reddit-discovery.js";
import { sendTelegramMessage } from "./telegram-api.js";
import { readTopMaterialFindings } from "./storage/material-findings.js";
import {
  appendChatMessage,
  archiveMessageToSlowMemory,
  listRecentMessages,
  readFastMemory,
  resetFastMemory,
  writeFastMemory
} from "./storage/memory.js";

const REPLY_ASK_TOPIC = "\u041f\u043e\u043d\u044f\u043b. \u0414\u043b\u044f \u043a\u0430\u043a\u043e\u0439 \u0442\u0435\u043c\u044b \u0433\u043e\u0442\u043e\u0432\u0438\u043c \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446\u0438\u044e?";
const REPLY_GENERIC = "\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438. \u041c\u043e\u0436\u0435\u0448\u044c \u043f\u043e\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u043f\u043e\u0441\u0442, \u043f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043e\u0442\u0447\u0435\u0442, \u043b\u0438\u0434\u044b \u0438\u043b\u0438 \u043f\u043e\u0441\u0442\u044b \u043d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443.";
const REPLY_GEMINI_DOWN = "\u041f\u043e\u043d\u044f\u043b \u0441\u043c\u044b\u0441\u043b, \u043d\u043e \u0441\u0435\u0439\u0447\u0430\u0441 \u043c\u043e\u0439 AI-\u043c\u043e\u0437\u0433 \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b. \u042f \u0432\u0441\u0435 \u0440\u0430\u0432\u043d\u043e \u043c\u043e\u0433\u0443 \u0441\u0434\u0435\u043b\u0430\u0442\u044c \u043a\u043e\u043d\u043a\u0440\u0435\u0442\u043d\u043e\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435: \u043f\u043e\u0441\u0442, \u043f\u0440\u0430\u0432\u043a\u0443, \u043e\u0442\u0447\u0435\u0442, \u043b\u0438\u0434\u044b \u0438\u043b\u0438 \u0441\u0442\u0430\u0442\u0443\u0441.";

export async function handleDialogue(message, context) {
  const env = context.env;
  const chatId = message.chat.id;
  const userId = message.from?.id || "";
  const text = message.text || "";
  const createdAt = new Date().toISOString();

  const userMessage = { chatId, userId, role: "user", text, createdAt };
  await appendChatMessage(env, userMessage);
  await archiveMessageToSlowMemory(env, userMessage);

  const fastMemory = await readFastMemory(env, chatId);
  const recentMessages = await listRecentMessages(env, chatId, 16);
  const turn = await parseTurnWithFallback({ message: text, fastMemory, recentMessages }, env);
  return rememberAndReturn(env, chatId, await executeDialogueTurn(turn, { ...context, message, fastMemory, recentMessages }));
}

async function rememberAndReturn(env, chatId, response) {
  const assistantMessage = {
    chatId,
    userId: "bot",
    role: "assistant",
    text: responseToMemoryText(response),
    createdAt: new Date().toISOString()
  };
  await appendChatMessage(env, assistantMessage);
  await archiveMessageToSlowMemory(env, assistantMessage);
  return response;
}

async function parseTurnWithFallback(input, env) {
  try {
    return await parseDialogueTurn(input, env);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, job: "dialogue-fallback", error: error.message }));
    return fallbackDialogueTurn(input.message, input.fastMemory);
  }
}

function fallbackDialogueTurn(message, fastMemory) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  if (hasAny(lower, ["\u0441\u0442\u0430\u0442\u0443\u0441", "status"])) return { intent: "status" };
  if (hasAny(lower, ["\u043e\u0442\u0447\u0435\u0442", "\u043e\u0442\u0447\u0451\u0442", "report"])) return { intent: "report" };
  if (hasAny(lower, ["\u043b\u0438\u0434", "lead"])) return { intent: "leads" };
  if (hasAny(lower, ["\u043f\u0440\u043e\u0432\u0435\u0440\u043a", "pending"])) return { intent: "pending" };
  if (looksLikeCleanupRequest(text)) return { intent: "cleanup_pending" };
  if (looksLikeRedditDiscovery(text)) return { intent: "find_reddit_communities", topic: cleanupFallbackTopic(text) };
  if (looksLikeMonitoringArticleRequest(text) || shouldAutoSelectForDraftRequest(text, "")) {
    return { intent: "auto_select_topic", targets: inferTargets(text) };
  }
  if (fastMemory?.pendingIntent === "create_drafts") {
    return { intent: "provide_topic", topic: text, targets: fastMemory.pendingTargets || ["all"] };
  }
  if (fastMemory?.pendingIntent === "select_material_for_draft") {
    return { intent: "select_material_for_draft", topic: text, targets: fastMemory.pendingTargets || ["all"] };
  }
  if (startsNewDraftRequest(text) || mentionsPlatform(text)) {
    return {
      intent: "create_drafts",
      topic: extractExplicitTopic(text) || cleanupFallbackTopic(text),
      targets: inferTargets(text)
    };
  }
  return { intent: "chat", reply: "" };
}

async function executeDialogueTurn(turn, context) {
  const env = context.env;
  const chatId = context.message.chat.id;
  const fastMemory = context.fastMemory;
  const rawText = context.message.text || "";

  if (shouldForceImageRevision(rawText, fastMemory)) {
    return await handleImageRevision(rawText, { ...context, fastMemory, chatId });
  }

  if (shouldForceCurrentPostTextRevision(rawText, fastMemory)) {
    return await handleTextRevision(rawText, { ...context, fastMemory, chatId });
  }

  if (fastMemory.pendingIntent === "select_material_for_draft" && looksLikeNumberChoice(rawText)) {
    return await handleMaterialSelection(rawText, { ...context, fastMemory, chatId });
  }

  if (shouldShowMaterialChoicesForManualPost(rawText)) {
    const targets = overrideTargetsFromText(rawText, normalizeTargets(turn.targets || fastMemory.pendingTargets || ["linkedin_personal"]));
    return await handleExistingMaterialChoices({ ...context, fastMemory: { ...fastMemory, pendingTargets: targets }, chatId });
  }

  if (fastMemory.pendingIntent === "select_material_for_draft") {
    return await handleMaterialSelection(rawText, { ...context, fastMemory, chatId });
  }

  if (turn.intent === "create_drafts") {
    const topic = cleanupFallbackTopic(turn.topic || "");
    const targets = overrideTargetsFromText(context.message.text, normalizeTargets(turn.targets));
    if (shouldAutoSelectForDraftRequest(context.message.text, topic)) {
      await writeFastMemory(env, {
        ...fastMemory,
        chatId,
        updatedAt: new Date().toISOString(),
        pendingIntent: "",
        pendingTargets: targets,
        pendingTopicHint: ""
      });
      return await handleAutoSelectedTopic({ ...context, fastMemory: { ...fastMemory, pendingTargets: targets } });
    }
    if (!topic) {
      await writeFastMemory(env, {
        ...fastMemory,
        chatId,
        updatedAt: new Date().toISOString(),
        pendingIntent: "create_drafts",
        pendingTargets: targets,
        pendingTopicHint: ""
      });
      return await buildClarifyingReply(context, "missing post topic");
    }

    const drafts = [];
    for (const target of targets) {
      drafts.push(await createDraftFromTopic(topic, { ...context, target }));
    }
    await rememberDrafts(env, fastMemory, chatId, drafts);
    return formatDrafts(drafts);
  }

  if (turn.intent === "provide_topic" && fastMemory.pendingIntent === "create_drafts") {
    const topic = cleanupFallbackTopic(turn.topic || context.message.text || "");
    const targets = overrideTargetsFromText(context.message.text, normalizeTargets(fastMemory.pendingTargets));
    const drafts = [];
    for (const target of targets) {
      drafts.push(await createDraftFromTopic(topic, { ...context, target }));
    }
    await rememberDrafts(env, fastMemory, chatId, drafts);
    return formatDrafts(drafts);
  }

  if (turn.intent === "select_material_for_draft" && fastMemory.pendingIntent === "select_material_for_draft") {
    return await handleMaterialSelection(context.message.text || "", { ...context, fastMemory, chatId });
  }

  if (turn.intent === "auto_select_topic") {
    if (!shouldHonorAutoSelectIntent(context.message.text, fastMemory)) {
      return await buildBrainReply(context, turn.reply || "");
    }
    const targets = overrideTargetsFromText(context.message.text, normalizeTargets(turn.targets));
    return await handleAutoSelectedTopic({ ...context, fastMemory: { ...fastMemory, pendingTargets: targets } });
  }

  if (turn.intent === "revise_image") {
    return await handleImageRevision(context.message.text || "", { ...context, fastMemory, chatId });
  }

  if (turn.intent === "revise_text") {
    return await handleTextRevision(context.message.text || "", { ...context, fastMemory, chatId });
  }

  if (turn.intent === "change_topic") {
    const topic = cleanupFallbackTopic(turn.topic || "");
    if (!topic) return await buildClarifyingReply(context, "missing replacement topic");
    const summary = readSummary(fastMemory);
    const targets = overrideTargetsFromText(context.message.text, normalizeTargets(turn.targets?.length ? turn.targets : summary.recentDraftTargets || ["all"]));
    const drafts = [];
    for (const target of targets) {
      drafts.push(await createDraftFromTopic(topic, { ...context, target }));
    }
    await rememberDrafts(env, fastMemory, chatId, drafts);
    return formatDrafts(drafts);
  }

  if (turn.intent === "status") return "/status";
  if (turn.intent === "report") return "/report";
  if (turn.intent === "pending") return "/pending";
  if (turn.intent === "leads") return "/leads";
  if (turn.intent === "cleanup_pending") {
    const result = await cleanupPendingDrafts(env);
    return result.message;
  }
  if (turn.intent === "find_reddit_communities") {
    const topic = turn.topic || context.message.text || "";
    const result = await discoverRedditCommunities(env, { topic });
    return await buildRedditDiscoveryMessages(env, result, { topic });
  }

  if (turn.intent === "chat") {
    return await buildBrainReply(context, turn.reply);
  }

  return await buildBrainReply(context, turn.reply || "");
}

async function buildBrainReply(context, parsedReply) {
  if (context.env.GEMINI_API_KEY) {
    try {
      return await generateDialogueReply({
        message: context.message.text || "",
        fastMemory: context.fastMemory,
        recentMessages: context.recentMessages || []
      }, context.env);
    } catch (error) {
      console.log(JSON.stringify({ ok: false, job: "dialogue-brain", error: error.message }));
    }
  }
  return parsedReply || buildLocalChatReply(context.message.text || "") || REPLY_GEMINI_DOWN || REPLY_GENERIC;
}

function buildLocalChatReply(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("\u043f\u043e\u0438\u0441\u043a") && hasAny(lower, ["\u0442\u044b \u0436\u0435", "\u0441\u0430\u043c", "\u0432\u044b\u043f\u043e\u043b\u043d"])) {
    return "\u0414\u0430, \u043f\u043e\u0438\u0441\u043a \u0443\u0436\u0435 \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u043b\u0441\u044f. \u0415\u0441\u043b\u0438 \u043f\u043e\u0441\u0442 \u043d\u0435 \u043f\u0440\u0438\u0448\u0435\u043b, \u0437\u043d\u0430\u0447\u0438\u0442 \u0432 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u043c \u043f\u0440\u043e\u0433\u043e\u043d\u0435 \u043d\u043e\u0432\u044b\u0435 RSS-\u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u043d\u0435 \u043f\u0440\u043e\u0448\u043b\u0438 \u0444\u0438\u043b\u044c\u0442\u0440 \u0446\u0435\u043d\u043d\u043e\u0441\u0442\u0438 \u0438\u043b\u0438 \u0443\u0436\u0435 \u0431\u044b\u043b\u0438 \u043f\u043e\u043c\u0435\u0447\u0435\u043d\u044b \u043a\u0430\u043a \u0440\u0430\u0437\u043e\u0431\u0440\u0430\u043d\u043d\u044b\u0435. \u041c\u043e\u0433\u0443 \u0432\u0437\u044f\u0442\u044c \u043b\u0443\u0447\u0448\u0438\u0439 \u0438\u0437 \u0443\u0436\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043d\u044b\u0445 \u0441\u0435\u0433\u043e\u0434\u043d\u044f \u0438\u043b\u0438 \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0431\u043e\u043b\u0435\u0435 \u0448\u0438\u0440\u043e\u043a\u0438\u0439 \u043f\u043e\u0438\u0441\u043a.";
  }
  if (hasAny(lower, ["\u043d\u0435 \u043e\u0442\u0432\u0435\u0442", "\u043c\u043e\u043b\u0447", "\u043d\u0438\u0447\u0435\u0433\u043e", "\u043d\u0435 \u043f\u0440\u0438\u0448"])) {
    return "\u0412\u0438\u0436\u0443 \u043f\u0440\u043e\u0431\u043b\u0435\u043c\u0443. \u042f \u0434\u043e\u043b\u0436\u0435\u043d \u0441\u0440\u0430\u0437\u0443 \u0434\u0430\u0432\u0430\u0442\u044c \u043e\u0442\u043a\u043b\u0438\u043a, \u0430 \u0435\u0441\u043b\u0438 \u043f\u043e\u0441\u0442 \u043d\u0435 \u0441\u043e\u0431\u0440\u0430\u043b\u0441\u044f, \u043e\u0431\u044a\u044f\u0441\u043d\u044f\u0442\u044c \u043f\u0440\u0438\u0447\u0438\u043d\u0443, \u0430 \u043d\u0435 \u043c\u043e\u043b\u0447\u0430\u0442\u044c.";
  }
  return "";
}

async function buildClarifyingReply(context, missing) {
  if (context.env.GEMINI_API_KEY) {
    try {
      return await generateClarifyingQuestion({
        message: context.message.text || "",
        missing,
        fastMemory: context.fastMemory,
        recentMessages: context.recentMessages || []
      }, context.env);
    } catch (error) {
      console.log(JSON.stringify({ ok: false, job: "dialogue-clarify", error: error.message }));
    }
  }
  return REPLY_ASK_TOPIC;
}

async function rememberDrafts(env, fastMemory, chatId, drafts) {
  const existingSummary = readSummary(fastMemory);
  await writeFastMemory(env, {
    ...fastMemory,
    chatId,
    updatedAt: new Date().toISOString(),
    pendingIntent: "",
    pendingTargets: [],
    pendingTopicHint: "",
    summary: JSON.stringify({
      ...existingSummary,
      recentDraftIds: drafts.map((draft) => draft.id),
      recentDraftTargets: drafts.map((draft) => draft.target || "all"),
      recentDraftTopic: drafts[0]?.topic || ""
    })
  });
}

async function handleDraftRevision(text, context) {
  const env = context.env;
  const fastMemory = context.fastMemory;
  const summary = readSummary(fastMemory);
  const topicChange = extractChangedTopic(text);

  if (topicChange) {
    const targets = normalizeTargets(summary.recentDraftTargets || ["all"]);
    const drafts = [];
    for (const target of targets) {
      drafts.push(await createDraftFromTopic(topicChange, { ...context, target }));
    }
    await rememberDrafts(env, fastMemory, context.chatId, drafts);
    return formatDrafts(drafts);
  }

  const ids = extractDraftIds(text);
  const targetIds = ids.length ? ids : await inferDraftIdsForRevision(env, text, summary);
  if (!targetIds.length) {
    return "\u041f\u043e\u043d\u044f\u043b \u043f\u0440\u0430\u0432\u043a\u0443, \u043d\u043e \u043d\u0435 \u0432\u0438\u0436\u0443 \u043f\u043e\u0441\u0442\u0430 \u043d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443. \u041d\u0430\u043f\u0438\u0448\u0438, \u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u043f\u0435\u0440\u0435\u043f\u0438\u0448\u0438 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u043f\u043e\u0441\u0442 \u043a\u043e\u0440\u043e\u0447\u0435.";
  }

  if (looksLikeImageRevision(text) && !looksLikeTextRevision(text)) {
    const updated = [];
    for (const id of targetIds) {
      const result = await regenerateDraftImage(id, text, { env });
      if (result.ok && result.draft) updated.push(result.draft);
    }

    if (!updated.length) return "\u041d\u0435 \u0441\u043c\u043e\u0433 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443 \u0434\u043b\u044f \u043f\u043e\u0441\u0442\u0430 \u043d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443.";
    await rememberDrafts(env, fastMemory, context.chatId, updated);
    return formatImageUpdates(updated);
  }

  const updated = [];
  for (const id of targetIds) {
    const result = await reviseDraft(id, text, { env });
    if (result.ok && result.draft) updated.push(result.draft);
  }

  if (!updated.length) return "\u041d\u0435 \u0441\u043c\u043e\u0433 \u043d\u0430\u0439\u0442\u0438 \u043f\u043e\u0434\u0445\u043e\u0434\u044f\u0449\u0438\u0439 \u043f\u043e\u0441\u0442 \u043d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443 \u0434\u043b\u044f \u043f\u0440\u0430\u0432\u043a\u0438.";
  await rememberDrafts(env, fastMemory, context.chatId, updated);
  return formatDrafts(updated);
}

async function handleImageRevision(text, context) {
  const env = context.env;
  const fastMemory = context.fastMemory;
  const summary = readSummary(fastMemory);
  const ids = extractDraftIds(text);
  const targetIds = ids.length ? ids : await inferDraftIdsForRevision(env, text, summary);
  if (!targetIds.length) {
    return "\u041f\u043e\u043d\u044f\u043b, \u043d\u0443\u0436\u043d\u043e \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443, \u043d\u043e \u044f \u043d\u0435 \u0432\u0438\u0436\u0443 \u043f\u043e\u0441\u0442\u0430 \u043d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443.";
  }

  const updated = [];
  const failures = [];
  for (const id of targetIds) {
    const result = await regenerateDraftImage(id, text, { env });
    if (result.ok && result.draft) updated.push(result.draft);
    if (!result.ok) failures.push(result.message || `Post ${id}: image update failed.`);
  }

  if (!updated.length) return failures.join("\n") || "\u041d\u0435 \u0441\u043c\u043e\u0433 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443 \u0434\u043b\u044f \u043f\u043e\u0441\u0442\u0430 \u043d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443.";
  await rememberDrafts(env, fastMemory, context.chatId, updated);
  return formatImageUpdates(updated);
}

async function handleAutoSelectedTopic(context) {
  if (context.ctx && !context.runInlineAutoSelect) {
    context.ctx.waitUntil(runMaterialSelectionAndNotify(context));
    return "\u041f\u0440\u0438\u043d\u044f\u043b. \u0418\u0449\u0443 \u0441\u0432\u0435\u0436\u0438\u0435 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u0438 \u043f\u0440\u0438\u0448\u043b\u044e 5 \u043b\u0443\u0447\u0448\u0438\u0445 \u0441\u0441\u044b\u043b\u043e\u043a \u043f\u043e \u0431\u0430\u043b\u043b\u0430\u043c. \u041f\u043e\u0442\u043e\u043c \u043f\u0440\u043e\u0441\u0442\u043e \u043d\u0430\u043f\u0438\u0448\u0438 \u043d\u043e\u043c\u0435\u0440: 1, 2, 3, 4 \u0438\u043b\u0438 5.";
  }

  const env = context.env;
  await runMonitoringForAutoPost(env);
  const findings = await readTopMaterialFindings(env, { sinceIso: daysAgoIso(14), limit: 5 });
  if (findings.length) return await rememberAndFormatMaterialChoices(findings, context, context.fastMemory);

  return "\u041d\u0435 \u043d\u0430\u0448\u0435\u043b \u0441\u0432\u0435\u0436\u0438\u0439 \u0441\u0438\u043b\u044c\u043d\u044b\u0439 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b \u0438\u0437 \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433\u0430 \u0441 URL-\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u043e\u043c. \u041c\u043e\u0436\u0435\u0448\u044c \u0434\u0430\u0442\u044c \u043a\u043e\u043d\u043a\u0440\u0435\u0442\u043d\u0443\u044e \u0441\u0441\u044b\u043b\u043a\u0443 \u0438\u043b\u0438 \u0442\u0435\u043c\u0443.";
}

async function handleExistingMaterialChoices(context) {
  const findings = await readTopMaterialFindings(context.env, { sinceIso: daysAgoIso(14), limit: 5 });
  if (findings.length) return await rememberAndFormatMaterialChoices(findings, context, context.fastMemory);
  return "\u041f\u043e\u043a\u0430 \u043d\u0435 \u0432\u0438\u0436\u0443 5 \u0441\u0432\u0435\u0436\u0438\u0445 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u043e\u0432 \u0432 \u0431\u0430\u0437\u0435. \u041c\u043e\u0436\u0435\u0448\u044c \u0434\u0430\u0442\u044c \u0441\u0432\u043e\u044e \u0442\u0435\u043c\u0443, \u0438\u043b\u0438 \u044f \u0437\u0430\u043f\u0443\u0449\u0443 \u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433 \u0438 \u043f\u043e\u0434\u0431\u0435\u0440\u0443 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b.";
}

async function handleMaterialSelection(text, context) {
  const summary = readSummary(context.fastMemory);
  const choices = Array.isArray(summary.materialChoices) ? summary.materialChoices : [];
  const number = Number(String(text || "").trim().match(/^\d+/)?.[0] || 0);
  const selected = number >= 1 && number <= choices.length ? choices[number - 1] : null;

  if (selected?.url) {
    return await createDraftsFromBestFinding(selected, context, context.fastMemory);
  }

  const topic = cleanupFallbackTopic(text);
  if (!topic) return "\u041d\u0430\u043f\u0438\u0448\u0438 \u043d\u043e\u043c\u0435\u0440 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u0430: 1, 2, 3, 4 \u0438\u043b\u0438 5. \u0418\u043b\u0438 \u0434\u0430\u0439 \u0441\u0432\u043e\u044e \u0442\u0435\u043c\u0443 \u0442\u0435\u043a\u0441\u0442\u043e\u043c.";

  const targets = overrideTargetsFromText(context.message.text, normalizeTargets(context.fastMemory.pendingTargets));
  const drafts = [];
  for (const target of targets) {
    drafts.push(await createDraftFromTopic(topic, { ...context, target }));
  }
  await rememberDrafts(context.env, context.fastMemory, context.chatId, drafts);
  return formatDrafts(drafts);
}

async function rememberAndFormatMaterialChoices(findings, context, fastMemory) {
  const targets = normalizeTargets(fastMemory.pendingTargets?.length ? fastMemory.pendingTargets : ["linkedin_personal"]);
  const choices = findings.map((finding) => ({
    title: finding.title,
    excerpt: finding.excerpt,
    url: finding.url,
    topic: finding.topic,
    score: finding.score,
    scoring: finding.scoring,
    publishedAt: finding.publishedAt,
    sourceName: finding.sourceName,
    sourceType: finding.sourceType,
    lastSeenAt: finding.lastSeenAt
  }));
  const existingSummary = readSummary(fastMemory);
  await writeFastMemory(context.env, {
    ...fastMemory,
    chatId: context.message.chat.id,
    updatedAt: new Date().toISOString(),
    pendingIntent: "select_material_for_draft",
    pendingTargets: targets,
    pendingTopicHint: "",
    summary: JSON.stringify({
      ...existingSummary,
      materialChoices: choices,
      materialChoicesCreatedAt: new Date().toISOString()
    })
  });
  return formatMaterialChoices(choices);
}

function formatMaterialChoices(findings) {
  const lines = [
    "\u0412\u043e\u0442 5 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u043e\u0432 \u0441 \u043b\u0443\u0447\u0448\u0438\u043c\u0438 \u0431\u0430\u043b\u043b\u0430\u043c\u0438. \u041d\u0430\u043f\u0438\u0448\u0438 \u043d\u043e\u043c\u0435\u0440, \u043f\u043e \u043a\u0430\u043a\u043e\u043c\u0443 \u0434\u0435\u043b\u0430\u0442\u044c \u043f\u043e\u0441\u0442:",
    ""
  ];
  findings.forEach((finding, index) => {
    lines.push(`${index + 1} - ${finding.title}`);
    lines.push(`Score: ${Math.round(Number(finding.score || 0))}`);
    if (finding.sourceName) lines.push(`Source: ${finding.sourceName}`);
    lines.push(finding.url);
    lines.push("");
  });
  lines.push("\u0418\u043b\u0438 \u043d\u0430\u043f\u0438\u0448\u0438 \u0441\u0432\u043e\u044e \u0442\u0435\u043c\u0443 \u0442\u0435\u043a\u0441\u0442\u043e\u043c.");
  return lines.join("\n").trim();
}

async function createDraftsFromBestFinding(bestFinding, context, fastMemory) {
  const targets = normalizeTargets(fastMemory.pendingTargets?.length ? fastMemory.pendingTargets : ["linkedin_personal"]);
  const drafts = [];
  for (const target of targets) {
    drafts.push(await createDraftFromTopic(bestFinding.title, {
      ...context,
      target,
      finding: {
        title: bestFinding.title,
        excerpt: buildBestFindingExcerpt(bestFinding),
        url: bestFinding.url
      }
    }));
  }
  await rememberDrafts(context.env, fastMemory, context.message.chat.id, drafts);
  return formatDrafts(drafts);
}

function buildBestFindingExcerpt(finding) {
  return [
    finding.excerpt || finding.title,
    "",
    `Selection score: ${finding.score}`,
    finding.scoring?.components ? `Score components: ${JSON.stringify(finding.scoring.components)}` : ""
  ].filter(Boolean).join("\n").trim();
}

function daysAgoIso(days) {
  return new Date(Date.now() - Number(days || 0) * 24 * 60 * 60 * 1000).toISOString();
}

async function runAutoSelectedTopicAndNotify(context) {
  try {
    const result = await handleAutoSelectedTopic({ ...context, runInlineAutoSelect: true, ctx: null });
    const messages = Array.isArray(result?.messages) ? result.messages : [result];
    for (const item of messages) {
      await sendTelegramMessage(context.env, context.message.chat.id, item.text || item, item.options || {});
    }
  } catch (error) {
    console.log(JSON.stringify({ ok: false, job: "auto-select-notify", error: error.message }));
    await sendTelegramMessage(
      context.env,
      context.message.chat.id,
      `\u041d\u0435 \u0441\u043c\u043e\u0433 \u0434\u043e\u0432\u0435\u0441\u0442\u0438 \u0430\u0432\u0442\u043e\u043f\u043e\u0434\u0431\u043e\u0440 \u0434\u043e \u043a\u043e\u043d\u0446\u0430: ${error.message}`
    );
  }
}

async function runMaterialSelectionAndNotify(context) {
  try {
    const result = await handleAutoSelectedTopic({ ...context, runInlineAutoSelect: true, ctx: null });
    await sendTelegramMessage(context.env, context.message.chat.id, result.text || result, result.options || {});
  } catch (error) {
    console.log(JSON.stringify({ ok: false, job: "material-selection-notify", error: error.message }));
    await sendTelegramMessage(
      context.env,
      context.message.chat.id,
      `\u041d\u0435 \u0441\u043c\u043e\u0433 \u043f\u043e\u0434\u043e\u0431\u0440\u0430\u0442\u044c 5 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u043e\u0432: ${error.message}`
    );
  }
}

async function runMonitoringForAutoPost(env) {
  const { runMonitoringCycle } = await import("./monitoring/index.js");
  const autoEnv = { ...env, MAX_DEMAND_TOPICS_PER_MONITORING_RUN: "0", MAX_DRAFTS_PER_MONITORING_RUN: "0" };
  return runMonitoringCycle(autoEnv, {
    cron: "manual",
    notify: false,
    sourceTypes: ["rss"],
    limit: Number(env.AUTO_SELECT_MONITORING_LIMIT || 4),
    offset: 0
  });
}

async function handleTextRevision(text, context) {
  const env = context.env;
  const fastMemory = context.fastMemory;
  const summary = readSummary(fastMemory);
  const ids = extractDraftIds(text);
  const targetIds = ids.length ? ids : await inferDraftIdsForRevision(env, text, summary);
  if (!targetIds.length) {
    return "\u041f\u043e\u043d\u044f\u043b, \u043d\u0443\u0436\u043d\u043e \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0442\u0435\u043a\u0441\u0442, \u043d\u043e \u044f \u043d\u0435 \u0432\u0438\u0436\u0443 \u043f\u043e\u0441\u0442\u0430 \u043d\u0430 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443.";
  }

  const updated = [];
  for (const id of targetIds) {
    const result = await reviseDraft(id, text, { env });
    if (result.ok && result.draft) updated.push(result.draft);
  }

  if (!updated.length) return "\u041d\u0435 \u0441\u043c\u043e\u0433 \u043d\u0430\u0439\u0442\u0438 \u043f\u043e\u0441\u0442 \u0434\u043b\u044f \u043f\u0440\u0430\u0432\u043a\u0438.";
  await rememberDrafts(env, fastMemory, context.chatId, updated);
  return formatDrafts(updated, { includePhoto: false });
}

async function inferDraftIdsForRevision(env, text, summary) {
  const recentIds = Array.isArray(summary.recentDraftIds) ? summary.recentDraftIds.filter(Boolean) : [];
  const lower = String(text || "").toLowerCase();
  if (recentIds.length && hasAny(lower, ["\u043e\u0431\u0430", "\u0432\u0441\u0435", "\u0438\u0445", "both", "all"])) return recentIds.slice(0, 4);
  if (recentIds.length) return [recentIds[0]];

  const pending = await listPendingDrafts(env);
  if (!pending.length) return [];
  if (hasAny(lower, ["\u043e\u0431\u0430", "\u0432\u0441\u0435", "\u0438\u0445", "both", "all"])) return pending.slice(0, 4).map((draft) => draft.id);
  return [pending[0].id];
}

function looksLikeDraftRevision(text) {
  const lower = String(text || "").toLowerCase();
  return hasAny(lower, [
    "\u043f\u0435\u0440\u0435\u043f\u0438\u0448\u0438",
    "\u043f\u0435\u0440\u0435\u0434\u0435\u043b\u0430\u0439",
    "\u0438\u0437\u043c\u0435\u043d\u0438",
    "\u0441\u0434\u0435\u043b\u0430\u0439 \u043a\u043e\u0440\u043e\u0447\u0435",
    "\u0443\u043a\u043e\u0440\u043e\u0442\u0438",
    "\u0434\u043b\u0438\u043d\u043d\u0435\u0435",
    "\u043f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435",
    "\u0442\u0435\u0445\u043d\u0438\u0447",
    "\u0431\u0435\u0437 \u043c\u0430\u0440\u043a\u0435\u0442",
    "\u0441\u043c\u0435\u043d\u0438 \u0442\u0435\u043c\u0443",
    "\u0437\u0430\u043c\u0435\u043d\u0438 \u0442\u0435\u043c\u0443",
    "\u043f\u043e\u043c\u0435\u043d\u044f\u0439 \u0442\u0435\u043c\u0443",
    "\u043f\u0435\u0440\u0435\u0432\u0435\u0434\u0438",
    "\u043a\u0430\u0440\u0442\u0438\u043d",
    "\u0438\u0437\u043e\u0431\u0440\u0430\u0436",
    "\u0438\u043d\u0444\u043e\u0433\u0440\u0430\u0444",
    "\u0444\u043e\u043d",
    "\u0446\u0432\u0435\u0442",
    "\u044f\u0440\u0447\u0435",
    "\u0433\u043b\u044f\u043d\u0446",
    "translate",
    "rewrite",
    "revise",
    "shorter",
    "more technical",
    "less sales"
  ]);
}

function looksLikeImageRevision(text) {
  const lower = String(text || "").toLowerCase();
  return hasAny(lower, [
    "\u043a\u0430\u0440\u0442\u0438\u043d",
    "\u0438\u0437\u043e\u0431\u0440\u0430\u0436",
    "\u0438\u043d\u0444\u043e\u0433\u0440\u0430\u0444",
    "\u0444\u043e\u0442\u043e",
    "\u0432\u0438\u0437\u0443\u0430\u043b",
    "\u0444\u043e\u043d",
    "\u0446\u0432\u0435\u0442",
    "image",
    "picture",
    "visual",
    "infographic"
  ]);
}

function shouldForceImageRevision(text, fastMemory) {
  const lower = String(text || "").toLowerCase();
  const hasRecentDraft = Boolean(readSummary(fastMemory).recentDraftIds?.length);
  if (!hasRecentDraft) return false;
  if (looksLikeImageRevision(text) && hasAny(lower, [
    "\u043f\u0435\u0440\u0435\u0434\u0435\u043b",
    "\u0437\u0430\u043c\u0435\u043d",
    "\u0438\u0437\u043c\u0435\u043d",
    "\u043d\u0435 \u0442\u043e\u0447",
    "\u043d\u0435\u0442\u043e\u0447",
    "\u043d\u0435 \u043f\u043e\u0434\u0445",
    "\u0434\u0440\u0443\u0433",
    "\u043d\u043e\u0432",
    "replace",
    "change",
    "different",
    "regenerate"
  ])) return true;
  return hasAny(lower, [
    "\u0442\u0430\u043a\u0443\u044e \u0436\u0435",
    "\u0442\u0430 \u0436\u0435",
    "\u043e\u0434\u0438\u043d\u0430\u043a\u043e\u0432",
    "\u043d\u0435 \u0438\u0437\u043c\u0435\u043d\u0438\u043b",
    "same image",
    "same picture"
  ]);
}

function shouldForceCurrentPostTextRevision(text, fastMemory) {
  const lower = String(text || "").toLowerCase();
  const hasRecentDraft = Boolean(readSummary(fastMemory).recentDraftIds?.length);
  if (!hasRecentDraft) return false;
  if (looksLikeImageRevision(text)) return false;
  return hasAny(lower, [
    "подправь в посте",
    "исправь в посте",
    "исправь текущ",
    "улучши этот текст",
    "перепиши этот пост",
    "перепиши текст",
    "добавь источник",
    "добавь ссылк",
    "сделай текст",
    "сократи",
    "расширь",
    "rewrite this post",
    "revise this post",
    "fix this post",
    "improve this text",
    "add source"
  ]);
}

function looksLikeTextRevision(text) {
  const lower = String(text || "").toLowerCase();
  return hasAny(lower, [
    "\u0442\u0435\u043a\u0441\u0442",
    "\u043f\u0435\u0440\u0435\u043f\u0438\u0448\u0438",
    "\u0434\u043b\u0438\u043d\u043d\u0435\u0435",
    "\u043a\u043e\u0440\u043e\u0447\u0435",
    "\u043f\u0435\u0440\u0435\u0432\u0435\u0434\u0438",
    "\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a",
    "\u0441\u0441\u044b\u043b\u043a",
    "text",
    "caption",
    "source",
    "reference",
    "rewrite",
    "translate",
    "shorter",
    "longer"
  ]);
}

function startsNewDraftRequest(text) {
  const lower = String(text || "").toLowerCase();
  return hasAny(lower, [
    "\u0437\u0430\u043c\u0443\u0442\u0438",
    "\u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432",
    "\u0441\u0433\u0435\u043d\u0435\u0440",
    "\u0441\u043e\u0437\u0434\u0430\u0439 \u043f\u043e\u0441\u0442",
    "\u0441\u0434\u0435\u043b\u0430\u0439 \u043f\u043e\u0441\u0442",
    "\u0441\u0434\u0435\u043b\u0430\u0439 \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446",
    "\u043d\u0430\u043f\u0438\u0448\u0438 \u043f\u043e\u0441\u0442",
    "\u043d\u0430\u043f\u0438\u0448\u0438 \u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446",
    "\u043f\u043e\u0441\u0442 \u0434\u043b\u044f",
    "\u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446",
    "draft",
    "generate post",
    "create post",
    "prepare",
    "write a post"
  ]);
}

function extractExplicitTopic(text) {
  const match = String(text || "").match(/(?:\u043f\u043e \u0442\u0435\u043c\u0435|\u043d\u0430 \u0442\u0435\u043c\u0443|\u043f\u0440\u043e|about)\s*[-:—]?\s*(.+)$/i);
  const topic = match?.[1]?.trim() || "";
  return topic.length >= 4 ? cleanupFallbackTopic(topic) : "";
}

function cleanupFallbackTopic(text) {
  return String(text || "")
    .replace(/^.*?(?:\u043f\u043e \u0442\u0435\u043c\u0435|\u043d\u0430 \u0442\u0435\u043c\u0443|\u043f\u0440\u043e|about)\s*[-:—]?\s*/i, "")
    .replace(/\b(?:\u043f\u043e\u043a\u0430|\u043d\u0438\u0447\u0435\u0433\u043e|\u043d\u0435|\u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0439|\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u044b\u0432\u0430\u0439).*$/i, "")
    .replace(/\bwith a .*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractChangedTopic(text) {
  const match = String(text || "").match(/(?:\u0441\u043c\u0435\u043d\u0438|\u0437\u0430\u043c\u0435\u043d\u0438|\u043f\u043e\u043c\u0435\u043d\u044f\u0439)\s+\u0442\u0435\u043c\u0443\s+(?:\u043d\u0430|\u043f\u0440\u043e|\u043e)\s+(.+)$/i);
  const topic = match?.[1]?.trim() || "";
  return topic.length >= 8 ? cleanupFallbackTopic(topic) : "";
}

function extractDraftIds(text) {
  const ids = [];
  const matches = String(text || "").matchAll(/\b(?:draft|\u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a)?\s*([a-f0-9]{8})\b/gi);
  for (const match of matches) ids.push(match[1]);
  return [...new Set(ids)];
}

function mentionsPlatform(text) {
  const lower = String(text || "").toLowerCase();
  return hasAny(lower, ["linkedin", "\u043b\u0438\u043d\u043a\u0435\u0434\u0438\u043d", "facebook", "\u0444\u0435\u0439\u0441\u0431\u0443\u043a", "instagram", "\u0438\u043d\u0441\u0442\u0430\u0433\u0440\u0430\u043c", "threads", "reddit"]);
}

function looksLikeRedditDiscovery(text) {
  const lower = String(text || "").toLowerCase();
  return hasAny(lower, ["reddit", "subreddit", "\u0441\u0430\u0431\u0440\u0435\u0434\u0434\u0438\u0442"])
    && hasAny(lower, ["\u043d\u0430\u0439\u0434", "\u043f\u043e\u0434\u0431\u0435\u0440", "\u043f\u043e\u0438\u0449", "\u0440\u0435\u043b\u0435\u0432\u0430\u043d\u0442", "find", "search", "discover", "relevant"]);
}

function looksLikeCleanupRequest(text) {
  const lower = String(text || "").toLowerCase();
  return hasAny(lower, ["\u0443\u0434\u0430\u043b", "\u0443\u0431\u0435\u0440", "\u043e\u0447\u0438\u0441\u0442", "\u0441\u043d\u0438\u043c\u0438", "delete", "remove", "clean"])
    && hasAny(lower, ["\u043d\u0435\u0430\u043a\u0442\u0443\u0430\u043b", "\u0441\u0442\u0430\u0440", "pending", "\u043e\u0447\u0435\u0440\u0435\u0434", "\u043f\u043e\u0441\u0442", "\u043f\u0443\u0431\u043b\u0438\u043a"]);
}

function looksLikeGenericPostRequest(text, topic) {
  const lower = String(text || "").toLowerCase();
  if (!startsNewDraftRequest(text) && !mentionsPlatform(text)) return false;
  if (hasAny(lower, ["\u043f\u043e \u0442\u0435\u043c\u0435", "\u043d\u0430 \u0442\u0435\u043c\u0443", "\u043f\u0440\u043e ", "about "])) return false;
  if (looksLikeMonitoringArticleRequest(text)) return true;
  if (isOnlyPostAndPlatformRequest(lower)) return true;
  const cleanTopic = String(topic || "").trim().toLowerCase();
  return !cleanTopic
    || cleanTopic === "linkedin"
    || cleanTopic === "\u043b\u0438\u043d\u043a\u0435\u0434\u0438\u043d"
    || cleanTopic.length < 8;
}

function shouldAutoSelectForDraftRequest(text, topic) {
  const cleanTopic = String(topic || "").trim().toLowerCase();
  if (looksLikeMonitoringArticleRequest(text)) return true;
  if (["auto_select", "autoselect", "choose", "choose yourself", "self", "\u0432\u044b\u0431\u0435\u0440\u0438 \u0441\u0430\u043c"].includes(cleanTopic)) return true;
  if (isOnlyPostAndPlatformRequestFixed(String(text || "").toLowerCase())) return true;
  if (!cleanTopic && (startsNewDraftRequest(text) || mentionsPlatform(text))) return true;
  return false;
}

function shouldShowMaterialChoicesForManualPost(text) {
  const lower = String(text || "").toLowerCase();
  if (!startsNewDraftRequest(text) && !mentionsPlatform(text)) return false;
  if (hasAny(lower, ["\u0434\u0440\u0443\u0433\u043e\u0439 \u043f\u043e\u0441\u0442", "\u0434\u0440\u0443\u0433\u0443\u044e \u043f\u0443\u0431\u043b\u0438\u043a", "\u043d\u043e\u0432\u044b\u0439 \u043f\u043e\u0441\u0442", "\u0435\u0449\u0435 \u043f\u043e\u0441\u0442", "\u0435\u0449\u0451 \u043f\u043e\u0441\u0442", "another post", "new post"])) return true;
  if (extractExplicitTopic(text)) return false;
  return isOnlyPostAndPlatformRequestFixed(lower) || hasAny(lower, ["\u043f\u043e\u0434\u0431\u0435\u0440\u0438", "\u0432\u044b\u0431\u0435\u0440\u0438", "\u0441\u0430\u043c", "\u043f\u043e\u043f\u0443\u043b\u044f\u0440", "\u043b\u0443\u0447\u0448", "\u043d\u0430\u0439\u0434\u0438"]);
}

function looksLikeNumberChoice(text) {
  return /^\s*[1-5]\s*$/i.test(String(text || ""));
}

function shouldHonorAutoSelectIntent(text, fastMemory) {
  if (fastMemory?.pendingIntent === "create_drafts") return true;
  return startsNewDraftRequest(text)
    || looksLikeMonitoringArticleRequest(text)
    || (mentionsPlatform(text) && hasAny(String(text || "").toLowerCase(), ["post", "draft", "article", "material", "\u043f\u043e\u0441\u0442", "\u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446", "\u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b", "\u0441\u0442\u0430\u0442"]));
}

function isOnlyPostAndPlatformRequestFixed(lower) {
  const remainder = String(lower || "")
    .replace(/\u0432\u043b\u0430\u0434\u0438\u043c\u0438\u0440/g, " ")
    .replace(/\u0437\u0430\u043c\u0443\u0442\u0438/g, " ")
    .replace(/\u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u044c|\u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c|\u0441\u0434\u0435\u043b\u0430\u0439|\u0441\u043e\u0437\u0434\u0430\u0439|\u043d\u0430\u043f\u0438\u0448\u0438|\u0441\u043e\u0441\u0442\u0430\u0432\u044c|\u0434\u0435\u043b\u0430\u0439/g, " ")
    .replace(/\u043f\u043e\u0441\u0442|\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438[ея]|\u043f\u0443\u0431\u043b\u0438\u043a\u0430\u0446(?:\u0438\u044e|\u0438\u044f|\u0438\u0438)?|\u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b/g, " ")
    .replace(/\u0434\u043b\u044f|\u0432|\u043d\u0430/g, " ")
    .replace(/linkedin|linked in|\u043b\u0438\u043d\u043a\u0435\u0434\u0438\u043d/g, " ")
    .replace(/\u0432\u044b\u0431\u0435\u0440\u0438|\u043f\u043e\u0434\u0431\u0435\u0440\u0438|\u0441\u0430\u043c|\u0441\u0430\u043c\u0430|\u0441\u0430\u043c\u043e\u0439|\u0442\u0435\u043c[уы]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return remainder.length < 4;
}

function isOnlyPostAndPlatformRequest(lower) {
  const remainder = String(lower || "")
    .replace(/владимир/g, " ")
    .replace(/подготовь|сделай|создай|напиши|составь|делай/g, " ")
    .replace(/пост|публикац(?:ию|ия|ии)?|материал/g, " ")
    .replace(/для|в|на/g, " ")
    .replace(/linkedin|linked in|линкедин/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return remainder.length < 4;
}

function looksLikeMonitoringArticleRequest(text) {
  const lower = String(text || "").toLowerCase();
  return hasAny(lower, ["\u0441\u0430\u043c\u043e\u0439 \u0441\u0438\u043b\u044c\u043d", "\u0441\u0430\u043c\u043e\u0439 \u043f\u043e\u043f\u0443\u043b", "\u043e\u0442\u043e\u0431\u0440\u0430\u043d", "\u043c\u043e\u043d\u0438\u0442\u043e\u0440\u0438\u043d\u0433", "\u043d\u0430\u0439\u0434\u0435\u043d\u043d", "strongest", "popular", "selected", "monitoring"])
    && hasAny(lower, ["\u0441\u0442\u0430\u0442", "\u043d\u043e\u0432\u043e\u0441", "\u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b", "article", "news", "material"]);
}

function inferTargets(text) {
  const lower = String(text || "").toLowerCase();
  const targets = [];
  const mentionsLinkedIn = hasAny(lower, ["linkedin", "\u043b\u0438\u043d\u043a\u0435\u0434\u0438\u043d", "linked in"]);

  if (mentionsLinkedIn) {
    const wantsCompany = hasAny(lower, ["\u043a\u043e\u043c\u043f\u0430\u043d\u0438", "\u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446", "\u0441\u0442\u0440\u0430\u043d\u0438\u0446", "company", "ieccalc"]);
    const wantsPersonal = hasAny(lower, ["\u043b\u0438\u0447\u043d", "\u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b", "personal"]);
    if (wantsCompany) targets.push("linkedin_company");
    if (wantsPersonal) targets.push("linkedin_personal");
    if (!wantsCompany && !wantsPersonal) targets.push("linkedin_personal");
  }

  if (hasAny(lower, ["facebook", "\u0444\u0435\u0439\u0441\u0431\u0443\u043a"])) targets.push("facebook");
  if (hasAny(lower, ["instagram", "\u0438\u043d\u0441\u0442\u0430\u0433\u0440\u0430\u043c"])) targets.push("instagram");
  if (lower.includes("threads")) targets.push("threads");
  if (lower.includes("reddit")) targets.push("reddit");

  return targets.length ? [...new Set(targets)] : ["all"];
}

function normalizeTargets(targets) {
  const valid = new Set(["linkedin_personal", "linkedin_company", "facebook", "instagram", "threads", "reddit", "all"]);
  const normalized = [...new Set((targets || []).filter((target) => valid.has(target)))];
  if (normalized.includes("all")) return ["all"];
  return normalized.length ? normalized : ["all"];
}

function overrideTargetsFromText(text, targets) {
  const inferred = inferTargets(text);
  if (inferred.length && !(inferred.length === 1 && inferred[0] === "all")) return inferred;
  return targets;
}

function formatDrafts(drafts, { includePhoto = true } = {}) {
  return {
    messages: drafts.map((draft) => ({
      text: `${formatApprovalHeader(draft)}\n\n${ensureDraftSourceLine(draft.text, draft)}`,
      options: {
        photoUrl: includePhoto ? draft.imageUrl || undefined : undefined,
        reply_markup: {
          inline_keyboard: draftButtons(draft.id)
        }
      }
    }))
  };
}

function formatImageUpdates(drafts) {
  return {
    messages: drafts.map((draft) => ({
      text: [
        `${formatApprovalHeader(draft)}`,
        "",
        "\u041e\u0431\u043d\u043e\u0432\u0438\u043b \u0442\u043e\u043b\u044c\u043a\u043e \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443. \u0422\u0435\u043a\u0441\u0442 \u043f\u043e\u0441\u0442\u0430 \u043d\u0435 \u043c\u0435\u043d\u044f\u043b."
      ].join("\n"),
      options: {
        photoUrl: draft.imageUrl || undefined,
        reply_markup: {
          inline_keyboard: draftButtons(draft.id)
        }
      }
    }))
  };
}

function formatApprovalHeader(draft) {
  return [
    "FOR APPROVAL",
    `Channel: ${formatTargetLabel(draft.target)}`,
    `Account: ${formatAccountLabel(draft.target)}`
  ].join("\n");
}

function formatTargetLabel(target) {
  const labels = {
    linkedin_personal: "LinkedIn personal profile",
    linkedin_company: "LinkedIn company page",
    facebook: "Facebook page",
    instagram: "Instagram account",
    threads: "Threads account",
    reddit: "Reddit",
    all: "All connected channels"
  };
  return labels[target || "all"] || target || "All connected channels";
}

function formatAccountLabel(target) {
  const labels = {
    linkedin_personal: "Evgenii Buchinskii",
    linkedin_company: "IECCalc",
    facebook: "ieccalc.com",
    instagram: "IECCalc engineering account",
    threads: "Threads via connected account",
    reddit: "connected Reddit account",
    all: "configured accounts"
  };
  return labels[target || "all"] || "configured account";
}

function draftButtons(id) {
  return [[
    { text: "Approve", callback_data: `approve:${id}` },
    { text: "Reject", callback_data: `reject:${id}` }
  ]];
}

function readSummary(fastMemory) {
  try {
    return JSON.parse(fastMemory?.summary || "{}");
  } catch {
    return {};
  }
}

function responseToMemoryText(response) {
  if (typeof response === "string") return response;
  if (response?.text) return String(response.text);
  if (Array.isArray(response?.messages)) {
    return response.messages
      .map((message) => typeof message === "string" ? message : message?.text || "")
      .filter(Boolean)
      .join("\n\n");
  }
  return JSON.stringify(response || "");
}

function hasAny(text, markers) {
  return markers.some((marker) => text.includes(marker));
}

export async function resetDialogue(env, chatId) {
  await resetFastMemory(env, chatId);
}
