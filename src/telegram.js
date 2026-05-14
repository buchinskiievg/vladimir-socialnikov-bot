import { routeCommand } from "./commands.js";
import { approveDraft, rejectDraft } from "./workflows/drafts.js";
import { approveSourceCandidate, rejectSourceCandidate } from "./storage/source-candidates.js";
import { sendTelegramAction, sendTelegramMessage, sendTelegramReaction, sendTelegramTextOnly } from "./telegram-api.js";

export async function handleTelegramWebhook(request, env, ctx) {
  if (!isValidWebhookSecret(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await request.json();
  const callbackQuery = update.callback_query;

  if (callbackQuery) {
    return handleCallbackQuery(callbackQuery, env, ctx);
  }

  const message = update.message || update.edited_message;

  if (!message?.chat?.id) {
    return Response.json({ ok: true, ignored: true });
  }

  if (!isAllowedUser(message.from?.id, env)) {
    ctx.waitUntil(sendTelegramMessage(env, message.chat.id, "Access denied."));
    return Response.json({ ok: true });
  }

  ctx.waitUntil(handleTelegramMessageAsync(message, { env, update }));
  return Response.json({ ok: true });
}

async function handleTelegramMessageAsync(message, context) {
  try {
    const text = message.text || "";
    if (shouldAcknowledgeWithReaction(text)) {
      await acknowledgeIncomingMessage(message, context);
    }

    const reply = await routeCommand(text, { ...context, message });
    const replies = Array.isArray(reply?.messages) ? reply.messages : [reply];
    for (const item of replies) {
      await sendTelegramMessage(context.env, message.chat.id, item.text || item, item.options || {});
    }
  } catch (error) {
    await sendTelegramMessage(
      context.env,
      message.chat.id,
      `Не смог обработать сообщение.\nОшибка: ${error.message}`
    );
  }
}

async function acknowledgeIncomingMessage(message, context) {
  try {
    await sendTelegramReaction(context.env, message.chat.id, message.message_id);
    await sendTelegramAction(context.env, message.chat.id, "typing");
    if (looksLongRunning(message.text || "")) {
      await sendTelegramTextOnly(context.env, message.chat.id, "Принял, готовлю. Если понадобится уточнение, спрошу.");
    }
  } catch (error) {
    console.log(JSON.stringify({ ok: false, job: "telegram-acknowledge", chatId: message.chat.id, error: error.message }));
  }
}

function looksLongRunning(text) {
  const lower = String(text || "").toLowerCase();
  return [
    "пост",
    "публикац",
    "linkedin",
    "линкедин",
    "картин",
    "изображ",
    "инфограф",
    "найди",
    "подбери",
    "составь",
    "сделай"
  ].some((marker) => lower.includes(marker));
}

async function handleCallbackQuery(callbackQuery, env, ctx) {
  if (!isAllowedUser(callbackQuery.from?.id, env)) {
    ctx.waitUntil(answerCallbackQuery(env, callbackQuery.id, "Access denied."));
    return Response.json({ ok: true });
  }

  const [action, id] = String(callbackQuery.data || "").split(":");
  const chatId = callbackQuery.message?.chat?.id;

  if (!chatId || !id) {
    ctx.waitUntil(answerCallbackQuery(env, callbackQuery.id, "Invalid action."));
    return Response.json({ ok: true });
  }

  const result = action === "approve"
    ? await approveDraft(id, { env })
    : action === "reject"
      ? await rejectDraft(id, env)
      : action === "source_approve"
        ? await approveSourceCandidate(env, id)
        : action === "source_reject"
          ? await rejectSourceCandidate(env, id)
          : { ok: false, message: "Unknown action." };

  ctx.waitUntil(answerCallbackQuery(env, callbackQuery.id, result.ok ? "Done" : "Failed"));
  ctx.waitUntil(sendTelegramMessage(env, chatId, result.message));
  return Response.json({ ok: true });
}

function shouldAcknowledgeWithReaction(text) {
  const trimmed = String(text || "").trim();
  return Boolean(trimmed && !trimmed.startsWith("/"));
}

async function answerCallbackQuery(env, callbackQueryId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text })
  });
}

function isValidWebhookSecret(request, env) {
  if (!env.WEBHOOK_SECRET) return true;
  return request.headers.get("x-telegram-bot-api-secret-token") === env.WEBHOOK_SECRET;
}

function isAllowedUser(userId, env) {
  const allowed = (env.ALLOWED_TELEGRAM_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (allowed.length === 0) return true;
  return userId && allowed.includes(String(userId));
}
