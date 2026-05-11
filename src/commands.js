import { publishToSocials } from "./social/index.js";
import { approveDraft, createDraftFromTopic, listPendingDrafts, rejectDraft } from "./workflows/drafts.js";
import { addSource, listSources } from "./storage/sources.js";
import { listLeadsByStatus } from "./storage/leads.js";
import { buildDailyReport } from "./reports/daily.js";
import { handleDialogue } from "./dialogue.js";
import { resetDialogue } from "./dialogue.js";
import {
  listTopicPreferences,
  seedDefaultTopicPreferences,
  setTopicStatus,
  upsertTopicPreference
} from "./storage/topic-preferences.js";

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
      "/reset - clear current dialogue state",
      "/source add <type> <topic> <url> - monitor a source",
      "/sources - list monitored sources",
      "/leads - list new leads",
      "/report - daily monitoring report",
      "/memory - check dialogue memory storage",
      "/topics - show proposed/active topic strategy",
      "/test-publish - dry-run check all configured publishing connectors",
      "/post <text> - draft/publish to connected social networks",
      "",
      "Publishing is in dry-run mode until SOCIAL_DRY_RUN=false and real API credentials are configured."
    ].join("\n");
  }

  if (firstLine === "/status") {
    return buildStatus(context.env);
  }

  if (firstLine === "/reset") {
    await resetDialogue(context.env, context.message?.chat?.id || "default");
    return "Dialogue state cleared.";
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

  if (firstLine === "/memory") {
    return [
      "Memory status:",
      `Fast memory (D1): ${context.env.DB ? "connected" : "not connected"}`,
      `Slow archive (R2): ${context.env.MESSAGE_ARCHIVE ? "connected" : "not connected"}`,
      "Retention target: 180 days"
    ].join("\n");
  }

  if (firstLine === "/topics") {
    await seedDefaultTopicPreferences(context.env, "proposed");
    return formatTopicPreferences(await listTopicPreferences(context.env));
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

  try {
    return await handleNaturalLanguage(trimmed, context);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, job: "natural-language-command", error: error.message }));
    return [
      "Не смог обработать сообщение через AI.",
      `Ошибка: ${error.message}`,
      "",
      "Пока можно использовать короткую команду:",
      "/personal-draft <topic>",
      "/company-draft <topic>"
    ].join("\n");
  }
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
        inline_keyboard: draftButtons(draft.id)
      }
    }
  };
}

function draftButtons(id) {
  return [
    [
      { text: "Approve", callback_data: `approve:${id}` },
      { text: "Reject", callback_data: `reject:${id}` }
    ],
    [
      { text: "Shorter", callback_data: `revise_short:${id}` },
      { text: "More technical", callback_data: `revise_tech:${id}` }
    ],
    [
      { text: "Less salesy", callback_data: `revise_nosales:${id}` },
      { text: "Regenerate", callback_data: `revise_regen:${id}` }
    ]
  ];
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

async function handleNaturalLanguage(message, context) {
  const topicManagement = await handleTopicManagement(message, context.env);
  if (topicManagement) return topicManagement;

  if (context.message?.chat?.id) {
    const dialogueResponse = await handleDialogue(context.message, context);
    if (dialogueResponse === "/status") return buildStatus(context.env);
    if (dialogueResponse === "/report") return { text: await buildDailyReport(context.env), options: { parse_mode: undefined } };
    if (dialogueResponse === "/pending") {
      const drafts = await listPendingDrafts(context.env);
      if (drafts.length === 0) return "No pending drafts.";
      return drafts.map(formatDraftBrief).join("\n\n");
    }
    if (dialogueResponse === "/leads") {
      const leads = await listLeadsByStatus(context.env, "new");
      if (leads.length === 0) return "No new leads.";
      return leads.map(formatLeadBrief).join("\n\n");
    }
    return dialogueResponse;
  }

  const intent = await parseIntent(message, context.env);

  if (intent.intent === "status") return buildStatus(context.env);
  if (intent.intent === "pending") {
    const drafts = await listPendingDrafts(context.env);
    if (drafts.length === 0) return "No pending drafts.";
    return drafts.map(formatDraftBrief).join("\n\n");
  }
  if (intent.intent === "report") {
    return { text: await buildDailyReport(context.env), options: { parse_mode: undefined } };
  }
  if (intent.intent === "leads") {
    const leads = await listLeadsByStatus(context.env, "new");
    if (leads.length === 0) return "No new leads.";
    return leads.map(formatLeadBrief).join("\n\n");
  }

  if (intent.intent === "create_drafts") {
    if (intent.needs_topic || !intent.topic) {
      return [
        "Понял задачу, но не вижу конкретной темы публикации.",
        "",
        "Напиши, например:",
        "Владимир, подготовь публикацию для LinkedIn компании и личного профиля про компенсацию реактивной мощности на промышленных объектах."
      ].join("\n");
    }

    const targets = normalizeTargets(intent.targets);
    const drafts = [];
    for (const target of targets) {
      drafts.push(await createDraftFromTopic(intent.topic, { ...context, target }));
    }
    return formatMultipleDrafts(drafts);
  }

  return "Не понял задачу. Можешь написать обычным языком: что подготовить, для какой соцсети и на какую тему.";
}

async function handleTopicManagement(message, env) {
  const lower = message.toLowerCase();
  if (lower.includes("покажи темы") || lower.includes("список тем") || lower.includes("topics")) {
    await seedDefaultTopicPreferences(env, "proposed");
    return formatTopicPreferences(await listTopicPreferences(env));
  }

  if (lower.includes("утверди темы") || lower.includes("согласуй темы") || lower.includes("approve topics")) {
    const rows = await seedDefaultTopicPreferences(env, "proposed");
    for (const row of rows) await setTopicStatus(env, row.id, "active");
    return "Темы утверждены. Теперь scoring будет использовать их как active-профили площадок.";
  }

  const addMatch = message.match(/(?:добавь|добавить|add)\s+тему\s+(.+?)\s+(?:для|в)\s+(linkedin|reddit|facebook|instagram|threads|forums|форум(?:ы)?)/i);
  if (addMatch) {
    const row = await upsertTopicPreference(env, {
      platform: addMatch[2],
      topic: addMatch[1],
      status: "active",
      weight: 1
    });
    return `Добавил тему ${row.id} для ${row.platform}: ${row.topic}`;
  }

  const disableMatch = message.match(/(?:убери|отключи|disable|remove)\s+тему\s+([a-z0-9-]+)/i);
  if (disableMatch) {
    await setTopicStatus(env, disableMatch[1], "disabled");
    return `Отключил тему ${disableMatch[1]}.`;
  }

  return null;
}

function formatTopicPreferences(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.platform)) grouped.set(row.platform, []);
    grouped.get(row.platform).push(row);
  }

  const lines = ["Topic strategy by platform:"];
  for (const [platform, items] of grouped.entries()) {
    lines.push("", platform.toUpperCase());
    for (const item of items) {
      lines.push(`${item.id} [${item.status}, weight ${item.weight}]: ${item.topic}`);
    }
  }
  lines.push("", "Можно написать: утверди темы; добавь тему arc flash для LinkedIn; отключи тему linkedin-3.");
  return lines.join("\n").slice(0, 3900);
}

async function parseIntent(message, env) {
  if (env.GEMINI_API_KEY) {
    try {
      const { parseNaturalIntent } = await import("./ai/gemini.js");
      return normalizeIntent(await parseNaturalIntent(message, env));
    } catch (error) {
      console.log(JSON.stringify({ ok: false, job: "natural-intent", error: error.message }));
    }
  }

  return heuristicIntent(message);
}

function normalizeIntent(intent) {
  return {
    intent: intent.intent || "unknown",
    topic: String(intent.topic || "").trim(),
    targets: Array.isArray(intent.targets) ? intent.targets : [],
    needs_topic: Boolean(intent.needs_topic)
  };
}

function heuristicIntent(message) {
  const lower = message.toLowerCase();
  if (lower.includes("статус") || lower.includes("status")) return { intent: "status", topic: "", targets: [], needs_topic: false };
  if (lower.includes("отчет") || lower.includes("отчёт") || lower.includes("report")) return { intent: "report", topic: "", targets: [], needs_topic: false };
  if (lower.includes("лид")) return { intent: "leads", topic: "", targets: [], needs_topic: false };
  if (lower.includes("чернов") || lower.includes("публикац") || lower.includes("пост") || lower.includes("linkedin")) {
    const targets = [];
    if (lower.includes("личн") || lower.includes("персональн") || lower.includes("personal")) targets.push("linkedin_personal");
    if (lower.includes("компан") || lower.includes("организац") || lower.includes("company") || lower.includes("ieccalc")) targets.push("linkedin_company");
    const topic = extractTopicHeuristic(message);
    return { intent: "create_drafts", topic, targets: targets.length ? targets : ["all"], needs_topic: !topic };
  }
  return { intent: "unknown", topic: "", targets: [], needs_topic: false };
}

function extractTopicHeuristic(message) {
  const match = message.match(/(?:по теме|на тему|про|about)\s+(.+)$/i);
  if (match) return cleanupTopic(match[1]);
  return "";
}

function cleanupTopic(topic) {
  return topic
    .replace(/\b(?:через|прогоняй|прогони)\s+(?:ai|ии|al)\b.*$/i, "")
    .replace(/[.。]+$/g, "")
    .trim();
}

function normalizeTargets(targets) {
  const valid = new Set(["linkedin_personal", "linkedin_company", "all"]);
  const result = [...new Set((targets || []).filter((target) => valid.has(target)))];
  if (result.includes("all")) return ["all"];
  return result.length ? result : ["all"];
}

function formatMultipleDrafts(drafts) {
  const lines = [`Prepared ${drafts.length} draft${drafts.length === 1 ? "" : "s"}.`];
  for (const draft of drafts) {
    lines.push(
      "",
      `Draft ${draft.id}`,
      `Topic: ${draft.topic}`,
      `Target: ${draft.target || "all"}`,
      "",
      draft.text,
      "",
      `Approve: /approve ${draft.id}`,
      `Reject: /reject ${draft.id}`
    );
  }
  return lines.join("\n");
}
