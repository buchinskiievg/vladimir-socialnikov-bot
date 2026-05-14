import { readScanSummary } from "../storage/scan-runs.js";
import { listDraftsByStatus } from "../storage/drafts.js";
import { listLeadsByStatus } from "../storage/leads.js";
import { sendTelegramMessage } from "../telegram-api.js";

export async function sendDailyReport(env) {
  const chatId = env.TELEGRAM_REPORT_CHAT_ID || firstAllowedUser(env);
  if (!chatId) return { ok: false, message: "Missing TELEGRAM_REPORT_CHAT_ID or ALLOWED_TELEGRAM_USER_IDS" };

  const report = await buildDailyReport(env);
  await sendTelegramMessage(env, chatId, report, { parse_mode: undefined });
  return { ok: true, message: "Daily report sent." };
}

export async function buildDailyReport(env) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const summary = await readScanSummary(env, since);
  const newLeads = await listLeadsByStatus(env, "new");
  const pendingDrafts = await listDraftsByStatus(env, "pending");
  const t = summary.totals || {};

  const lines = [
    "Ежедневный отчет по мониторингу",
    "Период: последние 24 часа",
    "",
    "Итоги:",
    `Проверено источников/запусков: ${n(t.scans)}`,
    `Найдено материалов: ${n(t.items_found)}`,
    `Прочитано подробнее: ${n(t.items_enriched)}`,
    `Полезных находок: ${n(t.findings_found)}`,
    `Новых лидов: ${n(t.leads_found)}`,
    `Постов подготовлено: ${n(t.drafts_created)}`,
    `Проблемных источников: ${n(t.errors)}`,
    "",
    "По типам источников:",
    ...formatByType(summary.byType),
    "",
    "Лучшие источники:",
    ...formatTopSources(summary.bySource),
    "",
    "Очередь:",
    `Новые лиды в базе: ${newLeads.length}`,
    `Посты ждут проверки: ${pendingDrafts.length}`
  ];

  if (summary.errors?.length) {
    lines.push("", "Проблемы за период:", ...formatErrorSummary(summary.errors));
  }

  if (newLeads.length) {
    lines.push("", "Последние лиды:", ...newLeads.slice(0, 5).map(formatLead));
  }

  return lines.join("\n").slice(0, 3900);
}

function formatByType(rows = []) {
  if (!rows.length) return ["Пока нет данных сканирования."];
  return rows.map((row) =>
    `${sourceTypeLabel(row.source_type)}: материалов ${n(row.items_found)}, находок ${n(row.findings_found)}, лидов ${n(row.leads_found)}, ошибок ${n(row.errors)}`
  );
}

function formatTopSources(rows = []) {
  if (!rows.length) return ["Пока нет статистики по источникам."];
  return rows.slice(0, 10).map((row, index) =>
    `${index + 1}. ${row.source_name || "unknown"} (${sourceTypeLabel(row.source_type)}): материалов ${n(row.items_found)}, находок ${n(row.findings_found)}, лидов ${n(row.leads_found)}`
  );
}

function formatErrorSummary(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const message = friendlyError(row.error);
    const key = `${message}|${row.source_type || "unknown"}`;
    const current = groups.get(key) || { message, sourceType: row.source_type || "unknown", count: 0, examples: [] };
    current.count += 1;
    if (current.examples.length < 2) current.examples.push(row.source_name || "unknown");
    groups.set(key, current);
  }

  return [...groups.values()].slice(0, 6).map((group) =>
    `- ${sourceTypeLabel(group.sourceType)}: ${group.message}. Источников: ${group.count}. Пример: ${group.examples.join("; ")}`
  );
}

function formatLead(lead) {
  return `- ${lead.title || "Untitled"}\n  ${lead.sourceUrl}`;
}

function friendlyError(error) {
  const text = String(error || "");
  if (text.includes("Too many subrequests")) {
    return "достигнут лимит Cloudflare на один запуск; мониторинг теперь разбивается на меньшие пачки";
  }
  if (text.includes("403")) return "источник не пустил автоматический запрос, нужен RSS/API или другой доступ";
  if (text.includes("404")) return "страница или RSS больше не доступны";
  if (text.includes("login") || text.includes("anti-bot") || text.includes("captcha")) {
    return "источник требует вход или антибот-проверку";
  }
  if (text.includes("Unsupported")) return "формат страницы не подходит для текущего парсера";
  return text.slice(0, 140) || "неизвестная ошибка";
}

function sourceTypeLabel(type) {
  const labels = {
    google_news: "Google News",
    rss: "RSS",
    news: "Новости",
    forum: "Форумы",
    reddit: "Reddit",
    facebook_group: "Facebook",
    classifieds: "Объявления",
    ai_demand: "AI-анализ"
  };
  return labels[type] || type || "unknown";
}

function firstAllowedUser(env) {
  return String(env.ALLOWED_TELEGRAM_USER_IDS || "").split(",").map((id) => id.trim()).find(Boolean);
}

function n(value) {
  return Number(value || 0);
}
