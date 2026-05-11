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
    "Daily monitoring report",
    `Period: last 24h`,
    "",
    "Totals:",
    `Scanned sources/runs: ${n(t.scans)}`,
    `Items found: ${n(t.items_found)}`,
    `Threads enriched: ${n(t.items_enriched)}`,
    `Relevant findings: ${n(t.findings_found)}`,
    `New leads: ${n(t.leads_found)}`,
    `Drafts created: ${n(t.drafts_created)}`,
    `Errors: ${n(t.errors)}`,
    "",
    "By source type:",
    ...formatByType(summary.byType),
    "",
    "Top sources:",
    ...formatTopSources(summary.bySource),
    "",
    "Current queues:",
    `New leads in DB: ${newLeads.length}`,
    `Pending drafts: ${pendingDrafts.length}`
  ];

  if (summary.errors?.length) {
    lines.push("", "Recent errors:", ...summary.errors.map(formatError));
  }

  if (newLeads.length) {
    lines.push("", "Latest leads:", ...newLeads.slice(0, 5).map(formatLead));
  }

  return lines.join("\n").slice(0, 3900);
}

function formatByType(rows = []) {
  if (!rows.length) return ["No scan data yet."];
  return rows.map((row) =>
    `${row.source_type || "unknown"}: items ${n(row.items_found)}, findings ${n(row.findings_found)}, leads ${n(row.leads_found)}, errors ${n(row.errors)}`
  );
}

function formatTopSources(rows = []) {
  if (!rows.length) return ["No source stats yet."];
  return rows.slice(0, 10).map((row, index) =>
    `${index + 1}. ${row.source_name || "unknown"} (${row.source_type || "unknown"}): items ${n(row.items_found)}, findings ${n(row.findings_found)}, leads ${n(row.leads_found)}, errors ${n(row.errors)}`
  );
}

function formatError(row) {
  return `- ${row.source_name || "unknown"} (${row.source_type || "unknown"}): ${String(row.error || "").slice(0, 140)}`;
}

function formatLead(lead) {
  return `- ${lead.title || "Untitled"}\n  ${lead.sourceUrl}`;
}

function firstAllowedUser(env) {
  return String(env.ALLOWED_TELEGRAM_USER_IDS || "").split(",").map((id) => id.trim()).find(Boolean);
}

function n(value) {
  return Number(value || 0);
}
