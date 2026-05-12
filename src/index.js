import { handleTelegramWebhook } from "./telegram.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, bot: env.BOT_NAME || "telegram-worker-bot" });
    }

    if (request.method === "GET" && url.pathname.startsWith("/media/")) {
      const { handleMediaRequest } = await import("./media.js");
      return handleMediaRequest(request, env);
    }

    if (request.method === "GET" && url.pathname === "/linkedin/auth") {
      const { handleLinkedInAuth } = await import("./oauth/linkedin.js");
      return handleLinkedInAuth(request, env);
    }

    if (request.method === "GET" && url.pathname === "/linkedin/callback") {
      const { handleLinkedInCallback } = await import("./oauth/linkedin.js");
      return handleLinkedInCallback(request, env);
    }

    if (request.method === "POST" && url.pathname === "/telegram/webhook") {
      return handleTelegramWebhook(request, env, ctx);
    }

    if (request.method === "POST" && url.pathname === "/admin/run-monitoring") {
      if (!isValidAdminSecret(request, env)) return new Response("Unauthorized", { status: 401 });
      const { runMonitoringCycle } = await import("./monitoring/index.js");
      const result = await runMonitoringCycle(env, {
        cron: "manual",
        scheduledTime: Date.now(),
        sourceTypes: parseCsv(url.searchParams.get("types")),
        limit: Number(url.searchParams.get("limit") || 0),
        offset: Number(url.searchParams.get("offset") || 0)
      });
      return Response.json(result);
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

function isValidAdminSecret(request, env) {
  if (!env.WEBHOOK_SECRET) return false;
  return request.headers.get("x-telegram-bot-api-secret-token") === env.WEBHOOK_SECRET;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
