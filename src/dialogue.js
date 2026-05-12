import { parseDialogueTurn } from "./ai/gemini.js";
import { createDraftFromTopic, listPendingDrafts, reviseDraft } from "./workflows/drafts.js";
import {
  appendChatMessage,
  archiveMessageToSlowMemory,
  listRecentMessages,
  readFastMemory,
  resetFastMemory,
  writeFastMemory
} from "./storage/memory.js";

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
  const newDraftRequest = startsNewDraftRequest(text);
  const explicitTopic = extractExplicitTopic(text);

  if (!newDraftRequest && looksLikeDraftRevision(text)) {
    return rememberAndReturn(
      env,
      chatId,
      await handleDraftRevision(text, { ...context, fastMemory, chatId })
    );
  }

  if (newDraftRequest && !explicitTopic) {
    const targets = inferTargets(text);
    await writeFastMemory(env, {
      ...fastMemory,
      chatId,
      updatedAt: new Date().toISOString(),
      pendingIntent: "create_drafts",
      pendingTargets: targets,
      pendingTopicHint: ""
    });
    return rememberAndReturn(env, chatId, "Понял. Для каких тем готовим публикации?");
  }

  if (newDraftRequest && explicitTopic) {
    const turn = {
      intent: "create_drafts",
      topic: explicitTopic,
      targets: inferTargets(text)
    };
    return rememberAndReturn(
      env,
      chatId,
      await executeDialogueTurn(turn, {
        ...context,
        message,
        fastMemory: { ...fastMemory, pendingIntent: "", pendingTargets: [], pendingTopicHint: "" }
      })
    );
  }

  const turn = await parseTurnWithFallback({ message: text, fastMemory, recentMessages }, env);
  return rememberAndReturn(env, chatId, await executeDialogueTurn(turn, { ...context, message, fastMemory }));
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
  if (lower.includes("статус") || lower.includes("status")) return { intent: "status" };
  if (lower.includes("отчет") || lower.includes("отчёт") || lower.includes("report")) return { intent: "report" };
  if (lower.includes("лид") || lower.includes("lead")) return { intent: "leads" };
  if (lower.includes("проверк") || lower.includes("pending")) return { intent: "pending" };
  if (fastMemory?.pendingIntent === "create_drafts") {
    return { intent: "provide_topic", topic: text, targets: fastMemory.pendingTargets || ["all"] };
  }
  if (startsNewDraftRequest(text) || mentionsPlatform(text)) {
    return {
      intent: "create_drafts",
      topic: extractExplicitTopic(text) || cleanupFallbackTopic(text),
      targets: inferTargets(text)
    };
  }
  return { intent: "chat", reply: "Я на связи. Можешь попросить подготовить пост, показать отчет, лиды или посты на проверку." };
}

async function executeDialogueTurn(turn, context) {
  const env = context.env;
  const chatId = context.message.chat.id;
  const fastMemory = context.fastMemory;

  if (turn.intent === "create_drafts") {
    const topic = cleanupFallbackTopic(turn.topic || "");
    const targets = overrideTargetsFromText(context.message.text, normalizeTargets(turn.targets));

    if (!topic) {
      await writeFastMemory(env, {
        ...fastMemory,
        chatId,
        updatedAt: new Date().toISOString(),
        pendingIntent: "create_drafts",
        pendingTargets: targets,
        pendingTopicHint: ""
      });
      return "Понял. Для каких тем готовим публикации?";
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

  if (turn.intent === "status") return "/status";
  if (turn.intent === "report") return "/report";
  if (turn.intent === "pending") return "/pending";
  if (turn.intent === "leads") return "/leads";

  return turn.reply || "Я на связи. Можешь попросить подготовить публикацию, показать отчет, лиды или посты на проверку.";
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
    return "Понял правку, но не вижу поста на проверку. Напиши, например: перепиши последний пост короче.";
  }

  const updated = [];
  for (const id of targetIds) {
    const result = await reviseDraft(id, text, { env });
    if (result.ok && result.draft) updated.push(result.draft);
  }

  if (!updated.length) return "Не смог найти подходящий пост на проверку для правки.";
  await rememberDrafts(env, fastMemory, context.chatId, updated);
  return formatDrafts(updated);
}

async function inferDraftIdsForRevision(env, text, summary) {
  const recentIds = Array.isArray(summary.recentDraftIds) ? summary.recentDraftIds.filter(Boolean) : [];
  const lower = String(text || "").toLowerCase();
  if (recentIds.length && (lower.includes("оба") || lower.includes("все") || lower.includes("их") || lower.includes("both") || lower.includes("all"))) {
    return recentIds.slice(0, 4);
  }
  if (recentIds.length) return [recentIds[0]];

  const pending = await listPendingDrafts(env);
  if (!pending.length) return [];
  if (lower.includes("оба") || lower.includes("все") || lower.includes("их") || lower.includes("both") || lower.includes("all")) {
    return pending.slice(0, 4).map((draft) => draft.id);
  }
  return [pending[0].id];
}

function looksLikeDraftRevision(text) {
  const lower = String(text || "").toLowerCase();
  return [
    "перепиши",
    "переделай",
    "измени",
    "сделай короче",
    "укороти",
    "длиннее",
    "подробнее",
    "техничес",
    "без маркет",
    "меньше продаж",
    "смени тему",
    "замени тему",
    "поменяй тему",
    "переведи",
    "translate",
    "rewrite",
    "revise",
    "shorter",
    "more technical",
    "less sales"
  ].some((marker) => lower.includes(marker));
}

function startsNewDraftRequest(text) {
  const lower = String(text || "").toLowerCase();
  return [
    "подготов",
    "сделай пост",
    "сделай публикац",
    "напиши пост",
    "напиши публикац",
    "пост для",
    "публикац",
    "draft",
    "prepare",
    "write a post"
  ].some((marker) => lower.includes(marker));
}

function extractExplicitTopic(text) {
  const match = String(text || "").match(/(?:по теме|на тему|про|about)\s*[-:—]?\s*(.+)$/i);
  const topic = match?.[1]?.trim() || "";
  return topic.length >= 4 ? cleanupFallbackTopic(topic) : "";
}

function cleanupFallbackTopic(text) {
  return String(text || "")
    .replace(/^.*?(?:по теме|на тему|про|about)\s*[-:—]?\s*/i, "")
    .replace(/\b(?:пока|ничего|не|публикуй|опубликовывай).*$/i, "")
    .replace(/\bwith a .*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractChangedTopic(text) {
  const match = String(text || "").match(/(?:смени|замени|поменяй)\s+тему\s+(?:на|про|о)\s+(.+)$/i);
  const topic = match?.[1]?.trim() || "";
  return topic.length >= 8 ? cleanupFallbackTopic(topic) : "";
}

function extractDraftIds(text) {
  const ids = [];
  const matches = String(text || "").matchAll(/\b(?:draft|черновик)?\s*([a-f0-9]{8})\b/gi);
  for (const match of matches) ids.push(match[1]);
  return [...new Set(ids)];
}

function mentionsPlatform(text) {
  const lower = String(text || "").toLowerCase();
  return ["linkedin", "линкедин", "facebook", "фейсбук", "instagram", "инстаграм", "threads", "reddit"].some((item) => lower.includes(item));
}

function inferTargets(text) {
  const lower = String(text || "").toLowerCase();
  const targets = [];
  const mentionsLinkedIn = lower.includes("linkedin") || lower.includes("линкедин") || lower.includes("linked in");

  if (mentionsLinkedIn) {
    const wantsCompany = lower.includes("компани") || lower.includes("организац") || lower.includes("страниц") || lower.includes("company") || lower.includes("ieccalc");
    const wantsPersonal = lower.includes("личн") || lower.includes("персонал") || lower.includes("personal");
    if (wantsCompany) targets.push("linkedin_company");
    if (wantsPersonal) targets.push("linkedin_personal");
    if (!wantsCompany && !wantsPersonal) targets.push("linkedin_personal", "linkedin_company");
  }

  if (lower.includes("facebook") || lower.includes("фейсбук")) targets.push("facebook");
  if (lower.includes("instagram") || lower.includes("инстаграм")) targets.push("instagram");
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

function formatDrafts(drafts) {
  return {
    messages: drafts.map((draft) => ({
      text: draft.text,
      options: {
        photoUrl: draft.imageUrl || undefined,
        reply_markup: {
          inline_keyboard: draftButtons(draft.id)
        }
      }
    }))
  };
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

export async function resetDialogue(env, chatId) {
  await resetFastMemory(env, chatId);
}
