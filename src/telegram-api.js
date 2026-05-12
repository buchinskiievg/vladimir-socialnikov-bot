export async function sendTelegramMessage(env, chatId, text, options = {}) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  if (options.photoUrl) {
    await sendTelegramPhoto(env, chatId, options.photoUrl, "Image preview");
    const { photoUrl: _photoUrl, ...messageOptions } = options;
    return sendTelegramMessage(env, chatId, text, messageOptions);
  }

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
}
