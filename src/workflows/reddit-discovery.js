import { executeComposioTool } from "../social/composio.js";
import { addSourceCandidate } from "../storage/source-candidates.js";

const DEFAULT_QUERIES = [
  "electrical engineering",
  "power systems",
  "substation engineering",
  "transmission grid",
  "protection relay",
  "IEC 61850",
  "ETAP power system",
  "DIgSILENT PowerFactory",
  "HVDC transmission",
  "solar PV grid interconnection"
];

const STRONG_TERMS = [
  "electrical engineering",
  "power system",
  "power systems",
  "substation",
  "transmission",
  "distribution",
  "grid",
  "utility",
  "utilities",
  "protection relay",
  "relay",
  "iec 61850",
  "hvdc",
  "switchgear",
  "transformer",
  "solar",
  "renewable",
  "etap",
  "powerfactory",
  "digSilent"
].map((term) => term.toLowerCase());

const WEAK_OR_BROAD_TERMS = [
  "diy",
  "homework",
  "memes",
  "career advice",
  "programming",
  "electronics repair",
  "askreddit"
];

export async function discoverRedditCommunities(env, { topic = "", limit = 12 } = {}) {
  if (!env.COMPOSIO_API_KEY || !env.COMPOSIO_REDDIT_ACCOUNT_ID) {
    return {
      ok: false,
      message: "Reddit через Composio еще не подключен или не виден Worker."
    };
  }

  const queries = buildQueries(topic);
  const found = new Map();
  const errors = [];

  for (const query of queries.slice(0, 8)) {
    const result = await executeComposioTool(env, "REDDIT_GET_SUBREDDITS_SEARCH", env.COMPOSIO_REDDIT_ACCOUNT_ID, {
      q: query,
      limit: 15,
      sort: "relevance",
      sr_detail: true,
      show: "all"
    });

    if (!result.ok) {
      errors.push(`${query}: ${result.message}`);
      continue;
    }

    for (const community of extractCommunities(result.data, query)) {
      const key = community.displayName.toLowerCase();
      const existing = found.get(key);
      if (!existing || community.score > existing.score) found.set(key, community);
    }
  }

  const communities = [...found.values()]
    .filter((community) => community.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { ok: true, communities, errors };
}

export function formatRedditDiscovery(result) {
  if (!result.ok) return result.message;
  if (!result.communities.length) {
    return [
      "Не нашел достаточно релевантных Reddit-сообществ.",
      "Можно сузить тему, например: high-voltage substations, protection relays, ETAP, IEC 61850."
    ].join("\n");
  }

  const lines = [
    "Нашел релевантные Reddit-сообщества:",
    ""
  ];

  result.communities.forEach((community, index) => {
    lines.push(`${index + 1}. ${community.prefixedName} - score ${community.score}`);
    lines.push(`   Subscribers: ${formatNumber(community.subscribers)}; active now: ${formatNumber(community.activeUsers)}`);
    lines.push(`   Use: ${community.recommendedUse}`);
    lines.push(`   Why: ${community.reason}`);
    lines.push(`   Link: https://www.reddit.com/${community.prefixedName}/`);
    lines.push("");
  });

  if (result.errors?.length) {
    lines.push("Некоторые поисковые запросы не сработали, но список выше собран из успешных ответов.");
  }

  lines.push("Перед автопостингом лучше отдельно проверить правила выбранного сабреддита. Для мониторинга и поиска тем это уже можно использовать.");
  return lines.join("\n").slice(0, 3900);
}

export async function buildRedditDiscoveryMessages(env, result, { topic = "" } = {}) {
  if (!result.ok) return result.message;
  if (!result.communities.length) return formatRedditDiscovery(result);

  const messages = [];
  messages.push({
    text: [
      "Нашел Reddit-сообщества на проверку.",
      "Если тематика наша, нажми Approve - я добавлю источник в базу мониторинга."
    ].join("\n")
  });

  for (const community of result.communities.slice(0, 8)) {
    const candidate = await addSourceCandidate(env, {
      type: "reddit",
      name: community.prefixedName,
      url: redditRssUrl(community.displayName),
      topic: topic || "power engineering",
      score: community.score,
      reason: community.reason
    });

    messages.push({
      text: [
        `${community.prefixedName} - score ${community.score}`,
        `Subscribers: ${formatNumber(community.subscribers)}; active now: ${formatNumber(community.activeUsers)}`,
        `Use: ${community.recommendedUse}`,
        `Why: ${community.reason}`,
        `Link: ${redditPublicUrl(community.displayName)}`
      ].join("\n"),
      options: {
        reply_markup: {
          inline_keyboard: [[
            { text: "Approve source", callback_data: `source_approve:${candidate.id}` },
            { text: "Reject", callback_data: `source_reject:${candidate.id}` }
          ]]
        }
      }
    });
  }

  return { messages };
}

function buildQueries(topic) {
  const cleanTopic = cleanupTopic(topic);
  const queries = cleanTopic ? [cleanTopic, ...DEFAULT_QUERIES] : DEFAULT_QUERIES;
  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

function cleanupTopic(topic) {
  return String(topic || "")
    .replace(/\b(?:reddit|subreddit|subreddits|сабреддит|сабреддиты|сообщества|найди|подбери|релевантные|площадки)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCommunities(data, query) {
  const listing = data?.data?.children
    || data?.children
    || data?.data?.data?.children
    || data?.response_data?.data?.children
    || [];

  return listing
    .map((child) => normalizeCommunity(child?.data || child, query))
    .filter(Boolean);
}

function normalizeCommunity(raw, query) {
  if (!raw) return null;
  const displayName = raw.display_name || raw.display_name_prefixed?.replace(/^r\//i, "") || raw.name || "";
  if (!displayName) return null;

  const text = [
    displayName,
    raw.title,
    raw.public_description,
    raw.description
  ].filter(Boolean).join(" ").toLowerCase();

  const subscribers = Number(raw.subscribers || raw.subscriber_count || 0);
  const activeUsers = Number(raw.active_user_count || raw.accounts_active || 0);
  const relevance = scoreTextRelevance(text, query);
  const community = {
    displayName,
    prefixedName: raw.display_name_prefixed || `r/${displayName}`,
    title: raw.title || displayName,
    publicDescription: raw.public_description || "",
    subscribers,
    activeUsers,
    over18: Boolean(raw.over18),
    quarantine: Boolean(raw.quarantine),
    score: 0,
    recommendedUse: "",
    reason: ""
  };

  community.score = scoreCommunity(community, relevance, text);
  community.recommendedUse = recommendUse(community);
  community.reason = buildReason(community, relevance);
  return community;
}

function scoreTextRelevance(text, query) {
  let score = 0;
  const cleanQuery = cleanupTopic(query).toLowerCase();
  if (cleanQuery && text.includes(cleanQuery)) score += 24;

  for (const term of STRONG_TERMS) {
    if (text.includes(term)) score += term.includes(" ") ? 8 : 5;
  }

  for (const term of WEAK_OR_BROAD_TERMS) {
    if (text.includes(term)) score -= 8;
  }

  return Math.max(0, score);
}

function scoreCommunity(community, relevance, text) {
  if (community.over18 || community.quarantine) return -100;

  let score = relevance;
  score += Math.min(28, Math.log10(community.subscribers + 1) * 6);
  score += Math.min(18, Math.log10(community.activeUsers + 1) * 7);

  const name = community.displayName.toLowerCase();
  if (["electricalengineering", "powerengineering", "askengineers", "solar", "renewableenergy"].includes(name)) score += 18;
  if (text.includes("engineer") || text.includes("engineering")) score += 8;
  if (community.subscribers < 1000) score -= 10;

  return Math.round(score);
}

function recommendUse(community) {
  if (community.score >= 75) return "monitoring + careful engagement";
  if (community.score >= 55) return "monitoring, then manual review before posting";
  return "watchlist only";
}

function buildReason(community, relevance) {
  const signals = [];
  if (relevance >= 30) signals.push("strong keyword match");
  if (community.subscribers >= 100000) signals.push("large audience");
  else if (community.subscribers >= 10000) signals.push("meaningful niche audience");
  if (community.activeUsers >= 100) signals.push("visible current activity");
  if (!signals.length) signals.push("topic overlap found");
  return signals.join(", ");
}

function formatNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return "unknown";
  return Math.round(value).toLocaleString("en-US");
}

function redditPublicUrl(displayName) {
  return `https://www.reddit.com/r/${encodeURIComponent(displayName)}/`;
}

function redditRssUrl(displayName) {
  return `https://www.reddit.com/r/${encodeURIComponent(displayName)}/.rss`;
}
