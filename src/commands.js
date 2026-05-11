import { publishToSocials } from "./social/index.js";
import { approveDraft, createDraftFromTopic, listPendingDrafts, rejectDraft } from "./workflows/drafts.js";
import { addSource, listSources } from "./storage/sources.js";
import { listLeadsByStatus } from "./storage/leads.js";
import { buildDailyReport } from "./reports/daily.js";

export async function routeCommand(text, context) {
  const trimmed = text.trim();
  const firstLine = trimmed.split(/\r?\n/)[0].trim();

  if (firstLine === "/start" || firstLine === "/help") {
    return [
      "Bot is online.",
      "",
      "Commands:",
      "/status - check configuration",
      "/draft <topic> - prepare a post draft",
      "/personal-draft <topic> - prepare a LinkedIn personal profile draft",
      "/company-draft <topic> - prepare a LinkedIn company page draft",
      "/pending - list drafts waiting for approval",
      "/approve <id> - publish an approved draft",
      "/reject <id> - reject a draft",
      "/source add <type> <topic> <url> - monitor a source",
      "/sources - list monitored sources",
      "/leads - list new leads",
      "/report - daily monitoring report",
      "/test-publish - dry-run check all configured publishing connectors",
      "/post <text> - draft/publish to connected social networks",
      "",
      "Publishing is in dry-run mode until SOCIAL_DRY_RUN=false and real API credentials are configured."
    ].join("\n");
  }

  if (firstLine === "/status") {
    return buildStatus(context.env);
  }

  if (firstLine.startsWith("/draft ")) {
    const topic = firstLine.slice("/draft ".length).trim();
    if (!topic) return "Topic is empty.";
    const draft = await createDraftFromTopic(topic, context);
    return formatDraft(draft);
  }

  if (firstLine.startsWith("/personal-draft ")) {
    const topic = firstLine.slice("/personal-draft ".length).trim();
    if (!topic) return "Topic is empty.";
    const draft = await createDraftFromTopic(topic, { ...context, target: "linkedin_personal" });
    return formatDraft(draft);
  }

  if (firstLine.startsWith("/company-draft ")) {
    const topic = firstLine.slice("/company-draft ".length).trim();
    if (!topic) return "Topic is empty.";
    const draft = await createDraftFromTopic(topic, { ...context, target: "linkedin_company" });
    return formatDraft(draft);
  }

  if (firstLine.startsWith("/source add ")) {
    const args = firstLine.slice("/source add ".length).trim().split(/\s+/);
    const [type, topic, ...urlParts] = args;
    const url = urlParts.join(" ");
    if (!type || !topic || !url) return "Usage: /source add <rss|forum|news> <topic> <url>";
    const source = await addSource(context.env, { type, topic, url, name: topic });
    return `Source added: ${source.id}\n${source.type} ${source.topic}\n${source.url}`;
  }

  if (firstLine === "/sources") {
    const sources = await listSources(context.env);
    if (sources.length === 0) return "No monitored sources yet.";
    return sources.map((source) => `${source.id} ${source.type} ${source.topic}\n${source.url}`).join("\n\n");
  }

  if (firstLine === "/leads") {
    const leads = await listLeadsByStatus(context.env, "new");
    if (leads.length === 0) return "No new leads.";
    return leads.map(formatLeadBrief).join("\n\n");
  }

  if (firstLine === "/report") {
    return { text: await buildDailyReport(context.env), options: { parse_mode: undefined } };
  }

  if (firstLine === "/test-publish") {
    const result = await publishToSocials({ text: "Connector test from Vladimir Socialnikov Bot. Dry-run should be enabled." }, context.env);
    return formatPublishResult(result);
  }

  if (firstLine === "/pending") {
    const drafts = await listPendingDrafts(context.env);
    if (drafts.length === 0) return "No pending drafts.";
    return drafts.map(formatDraftBrief).join("\n\n");
  }

  if (firstLine.startsWith("/approve ")) {
    const id = firstLine.slice("/approve ".length).trim();
    if (!id) return "Draft id is empty.";
    const result = await approveDraft(id, context);
    return result.message;
  }

  if (firstLine.startsWith("/reject ")) {
    const id = firstLine.slice("/reject ".length).trim();
    if (!id) return "Draft id is empty.";
    const result = await rejectDraft(id, context.env);
    return result.message;
  }

  if (firstLine.startsWith("/post ")) {
    const content = trimmed.slice("/post ".length).trim();
    if (!content) return "Post text is empty.";

    const result = await publishToSocials({ text: content }, context.env);
    return formatPublishResult(result);
  }

  return "Unknown command. Send /help.";
}

function buildStatus(env) {
  const dryRun = env.SOCIAL_DRY_RUN !== "false";
  const connectors = [
    ["LinkedIn", Boolean(env.LINKEDIN_ACCESS_TOKEN)],
    ["Reddit", Boolean(env.REDDIT_CLIENT_ID)],
    ["Facebook", Boolean(env.FACEBOOK_PAGE_ACCESS_TOKEN)],
    ["Instagram", Boolean(env.INSTAGRAM_ACCESS_TOKEN)],
    ["Threads", Boolean(env.THREADS_ACCESS_TOKEN)]
  ];

  return [
    "Status:",
    `Dry run: ${dryRun ? "on" : "off"}`,
    `D1 database: ${env.DB ? "connected" : "not connected"}`,
    ...connectors.map(([name, enabled]) => `${name}: ${enabled ? "configured" : "not configured"}`)
  ].join("\n");
}

function formatPublishResult(result) {
  const lines = ["Publish result:"];
  for (const item of result.results) {
    lines.push(`${item.network}: ${item.ok ? "ok" : "failed"}${item.message ? ` - ${item.message}` : ""}`);
  }
  return lines.join("\n");
}

function formatDraft(draft) {
  return {
    text: [
    `Draft ${draft.id}`,
    `Topic: ${draft.topic}`,
    `Target: ${draft.target || "all"}`,
    "",
    draft.text,
    "",
    `Approve: /approve ${draft.id}`,
    `Reject: /reject ${draft.id}`
    ].join("\n"),
    options: {
      reply_markup: {
        inline_keyboard: [[
          { text: "Approve", callback_data: `approve:${draft.id}` },
          { text: "Reject", callback_data: `reject:${draft.id}` }
        ]]
      }
    }
  };
}

function formatDraftBrief(draft) {
  return [`Draft ${draft.id}`, `Topic: ${draft.topic}`, draft.text.slice(0, 300)].join("\n");
}

function formatLeadBrief(lead) {
  return [
    `Lead ${lead.id} | score ${lead.score}`,
    lead.title || "Untitled",
    lead.sourceUrl,
    lead.excerpt || ""
  ].join("\n");
}
