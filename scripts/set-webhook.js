const token = process.env.TELEGRAM_BOT_TOKEN;
const workerUrl = process.env.PUBLIC_WORKER_URL;
const secret = process.env.WEBHOOK_SECRET;

if (!token || !workerUrl) {
  console.error("Set TELEGRAM_BOT_TOKEN and PUBLIC_WORKER_URL before running this script.");
  process.exit(1);
}

const webhookUrl = new URL("/telegram/webhook", workerUrl).toString();
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret || undefined,
    allowed_updates: ["message", "edited_message", "callback_query"]
  })
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));
