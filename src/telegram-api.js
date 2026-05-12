export async function sendTelegramMessage(env, chatId, text, options = {}) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  if (options.photoUrl) {
    const { photoUrl: _photoUrl, ...messageOptions } = options;
    try {
      await sendTelegramPhoto(env, chatId, options.photoUrl, "");
      return sendTelegramMessage(env, chatId, text, messageOptions);
    } catch (error) {
      console.log(JSON.stringify({ ok: false, job: "telegram-send-photo", chatId, error: error.message }));
      return sendTelegramMessage(
        env,
        chatId,
        `${text}\n\nImage: ${options.photoUrl}`,
        messageOptions
      );
    }
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
