import { handleTelegramWebhook } from "./telegram.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, bot: env.BOT_NAME || "telegram-worker-bot" });
    }

    if (request.method === "POST" && url.pathname === "/telegram/webhook") {
      return handleTelegramWebhook(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    if (event.cron === "0 4 * * *") {
      const { sendDailyReport } = await import("./reports/daily.js");
      ctx.waitUntil(sendDailyReport(env));
      return;
    }

    const { runMonitoringCycle } = await import("./monitoring/index.js");
    ctx.waitUntil(runMonitoringCycle(env, event));
  }
};
