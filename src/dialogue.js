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
    const response = await handleDraftRevision(text, { ...context, fastMemory, chatId });
    const assistantMessage = { chatId, userId: "bot", role: "assistant", text: responseToMemoryText(response), createdAt: new Date().toISOString() };
    await appendChatMessage(env, assistantMessage);
    await archiveMessageToSlowMemory(env, assistantMessage);
    return response;
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

    const response = "Понял. Для каких тем готовим публикации?";
    const assistantMessage = { chatId, userId: "bot", role: "assistant", text: response, createdAt: new Date().toISOString() };
    await appendChatMessage(env, assistantMessage);
    await archiveMessageToSlowMemory(env, assistantMessage);
    return response;
  }

  const effectiveMemory = newDraftRequest
    ? { ...fastMemory, pendingIntent: "", pendingTargets: [], pendingTopicHint: "" }
    : fastMemory;
  const turn = await parseDialogueTurn({ message: text, fastMemory: effectiveMemory, recentMessages }, env);
  const response = await executeDialogueTurn(turn, { ...context, message, fastMemory: effectiveMemory });

  const assistantMessage = { chatId, userId: "bot", role: "assistant", text: responseToMemoryText(response), createdAt: new Date().toISOString() };
  await appendChatMessage(env, assistantMessage);
  await archiveMessageToSlowMemory(env, assistantMessage);

  return response;
}

async function executeDialogueTurn(turn, context) {
  const env = context.env;
  const chatId = context.message.chat.id;
  const fastMemory = context.fastMemory;

  if (turn.intent === "create_drafts") {
    const topic = (turn.topic || "").trim();
    const targets = normalizeTargets(turn.targets);

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
    const topic = (turn.topic || context.message.text || "").trim();
    const targets = normalizeTargets(fastMemory.pendingTargets);
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

  return turn.reply || "Я на связи. Можешь попросить подготовить публикацию, показать отчёт, лиды или посты на проверку.";
}

async function clearPending(env, fastMemory, chatId) {
  await writeFastMemory(env, {
    ...fastMemory,
    chatId,
    updatedAt: new Date().toISOString(),
    pendingIntent: "",
    pendingTargets: [],
    pendingTopicHint: ""
  });
}

async function rememberDrafts(env, fastMemory, chatId, drafts) {
  const existingSummary = readSummary(fastMemory);
  const recentDraftIds = drafts.map((draft) => draft.id);
  const recentDraftTargets = drafts.map((draft) => draft.target || "all");
  await writeFastMemory(env, {
    ...fastMemory,
    chatId,
    updatedAt: new Date().toISOString(),
    pendingIntent: "",
    pendingTargets: [],
    pendingTopicHint: "",
    summary: JSON.stringify({
      ...existingSummary,
      recentDraftIds,
      recentDraftTargets,
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
    "переведи",
    "translate",
    "rewrite",
    "revise",
    "shorter",
    "more technical",
    "less sales"
  ].some((marker) => lower.includes(marker));
}

function extractDraftIds(text) {
  const ids = [];
  const matches = String(text || "").matchAll(/\b(?:draft|черновик)?\s*([a-f0-9]{8})\b/gi);
  for (const match of matches) ids.push(match[1]);
  return [...new Set(ids)];
}

function extractChangedTopic(text) {
  const match = String(text || "").match(/(?:смени|замени|поменяй)\s+тему\s+(?:на|про|о)\s+(.+)$/i);
  const topic = match?.[1]?.trim() || "";
  return topic.length >= 8 ? topic : "";
}

function readSummary(fastMemory) {
  try {
    return JSON.parse(fastMemory?.summary || "{}");
  } catch {
    return {};
  }
}

function normalizeTargets(targets) {
  const valid = new Set(["linkedin_personal", "linkedin_company", "all"]);
  const normalized = [...new Set((targets || []).filter((target) => valid.has(target)))];
  if (normalized.includes("all")) return ["all"];
  return normalized.length ? normalized : ["all"];
}

function formatDrafts(drafts) {
  return {
    messages: [
      `Готово: подготовил ${drafts.length} финальный пост(а) на проверку.`,
      ...drafts.map((draft) => ({
        text: [
          `Post ${draft.id} - ready for approval`,
          `Topic: ${draft.topic}`,
          `Target: ${draft.target || "all"}`,
          draft.imageUrl ? `Image: ${draft.imageUrl}` : null,
          "",
          draft.text,
          "",
          `Approve: /approve ${draft.id}`,
          `Reject: /reject ${draft.id}`
        ].filter((line) => line !== null).join("\n"),
        options: {
          photoUrl: draft.imageUrl || undefined,
          reply_markup: {
            inline_keyboard: draftButtons(draft.id)
          }
        }
      }))
    ]
  };
}

function draftButtons(id) {
  return [
    [
      { text: "Approve", callback_data: `approve:${id}` },
      { text: "Reject", callback_data: `reject:${id}` }
    ]
  ];
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

function startsNewDraftRequest(text) {
  const lower = String(text || "").toLowerCase();
  return [
    "подготовь",
    "сделай пост",
    "сделай публикац",
    "напиши пост",
    "draft",
    "prepare",
    "write a post"
  ].some((marker) => lower.includes(marker));
}

function extractExplicitTopic(text) {
  const match = String(text || "").match(/(?:по теме|на тему|про|about)\s+(.+)$/i);
  const topic = match?.[1]?.trim() || "";
  return topic.length >= 8 ? topic : "";
}

function inferTargets(text) {
  const lower = String(text || "").toLowerCase();
  const targets = [];
  if (lower.includes("личн") || lower.includes("персональн") || lower.includes("personal")) targets.push("linkedin_personal");
  if (lower.includes("компан") || lower.includes("организац") || lower.includes("страниц") || lower.includes("company") || lower.includes("ieccalc")) targets.push("linkedin_company");
  if (!targets.length && lower.includes("linkedin")) return ["all"];
  return targets.length ? targets : ["all"];
}

export async function resetDialogue(env, chatId) {
  await resetFastMemory(env, chatId);
}
