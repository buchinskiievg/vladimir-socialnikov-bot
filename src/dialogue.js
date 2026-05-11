import { parseDialogueTurn } from "./ai/gemini.js";
import { createDraftFromTopic } from "./workflows/drafts.js";
import {
  appendChatMessage,
  archiveMessageToSlowMemory,
  listRecentMessages,
  readFastMemory,
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
  const turn = await parseDialogueTurn({ message: text, fastMemory, recentMessages }, env);
  const response = await executeDialogueTurn(turn, { ...context, message, fastMemory });

  const assistantMessage = { chatId, userId: "bot", role: "assistant", text: response.text || response, createdAt: new Date().toISOString() };
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
    await clearPending(env, fastMemory, chatId);
    return formatDrafts(drafts);
  }

  if (turn.intent === "provide_topic" && fastMemory.pendingIntent === "create_drafts") {
    const topic = (turn.topic || context.message.text || "").trim();
    const targets = normalizeTargets(fastMemory.pendingTargets);
    const drafts = [];
    for (const target of targets) {
      drafts.push(await createDraftFromTopic(topic, { ...context, target }));
    }
    await clearPending(env, fastMemory, chatId);
    return formatDrafts(drafts);
  }

  if (turn.intent === "status") return "/status";
  if (turn.intent === "report") return "/report";
  if (turn.intent === "pending") return "/pending";
  if (turn.intent === "leads") return "/leads";

  return turn.reply || "Я на связи. Можешь попросить подготовить публикацию, показать отчёт, лиды или pending drafts.";
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

function normalizeTargets(targets) {
  const valid = new Set(["linkedin_personal", "linkedin_company", "all"]);
  const normalized = [...new Set((targets || []).filter((target) => valid.has(target)))];
  if (normalized.includes("all")) return ["all"];
  return normalized.length ? normalized : ["all"];
}

function formatDrafts(drafts) {
  return {
    messages: [
      `Готово: подготовил ${drafts.length} черновик(а).`,
      ...drafts.map((draft) => ({
        text: [
          `Draft ${draft.id}`,
          `Topic: ${draft.topic}`,
          `Target: ${draft.target || "all"}`,
          "",
          draft.text,
          "",
          `Approve: /approve ${draft.id}`,
          `Reject: /reject ${draft.id}`
        ].join("\n"),
        options: {
          reply_markup: {
            inline_keyboard: [[
              { text: "Approve", callback_data: `approve:${draft.id}` },
              { text: "Reject", callback_data: `reject:${draft.id}` }
            ]]
          }
        }
      }))
    ]
  };
}
