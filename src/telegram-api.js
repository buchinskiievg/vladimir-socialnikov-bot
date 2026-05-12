export async function sendTelegramMessage(env, chatId, text, options = {}) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  if (options.photoUrl) {
    const { photoUrl: _photoUrl, ...messageOptions } = options;
    await sendTelegramText(env, chatId, text, messageOptions);
    try {
      if (String(options.photoUrl).toLowerCase().includes(".svg")) {
        await sendTelegramDocument(env, chatId, options.photoUrl, "");
      } else {
        await sendTelegramPhoto(env, chatId, options.photoUrl, "");
      }
    } catch (error) {
      console.log(JSON.stringify({ ok: false, job: "telegram-send-photo", chatId, error: error.message }));
      await sendTelegramText(env, chatId, `Image: ${options.photoUrl}`, {});
    }
    return;
  }

  return sendTelegramText(env, chatId, text, options);
}

export async function sendTelegramAction(env, chatId, action = "typing") {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.log(JSON.stringify({ ok: false, job: "telegram-send-action", chatId, error: body }));
  }
}

async function sendTelegramText(env, chatId, text, options = {}) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...options
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
  }
  const body = await response.json();
  console.log(JSON.stringify({ ok: true, job: "telegram-send-message", chatId, messageId: body.result?.message_id || null }));
}

async function sendTelegramPhoto(env, chatId, photoUrl, caption) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption: String(caption || "").slice(0, 1024)
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendPhoto failed: ${response.status} ${body}`);
  }
  const body = await response.json();
  console.log(JSON.stringify({ ok: true, job: "telegram-send-photo", chatId, messageId: body.result?.message_id || null }));
}

async function sendTelegramDocument(env, chatId, documentUrl, caption) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const documentResponse = await fetch(documentUrl);
  if (!documentResponse.ok) {
    throw new Error(`Telegram document fetch failed: ${documentResponse.status}`);
  }

  const contentType = documentResponse.headers.get("content-type") || "application/octet-stream";
  const extension = contentType.includes("svg") ? "svg" : "bin";
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", String(caption || "").slice(0, 1024));
  form.append("document", await documentResponse.blob(), `infographic.${extension}`);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendDocument failed: ${response.status} ${body}`);
  }
  const body = await response.json();
  console.log(JSON.stringify({ ok: true, job: "telegram-send-document", chatId, messageId: body.result?.message_id || null }));
}
