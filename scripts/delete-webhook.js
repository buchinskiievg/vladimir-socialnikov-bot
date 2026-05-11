const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN before running this script.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
  method: "POST"
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));
