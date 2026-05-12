import { insertLead } from "../storage/leads.js";
import { listSources, updateSourceCheckedAt } from "../storage/sources.js";
import { fetchRssItems } from "./rss.js";
import { enrichItem } from "./thread-scanner.js";
import { insertScanRun } from "../storage/scan-runs.js";
import { createDraftsFromDemand } from "../workflows/demand.js";
import { sendTelegramMessage } from "../telegram-api.js";
import {
  firstSentenceFromItem,
  hasFindingSentence,
  normalizeSentence,
  pruneExpiredFindingSentences,
  rememberFindingSentence
} from "../storage/finding-memory.js";
import { scoreLeadPotential, scoreMaterial } from "../scoring/material-score.js";

export async function runMonitoringCycle(env, event) {
  const startedAt = new Date().toISOString();
  const sources = await listSources(env);
  const findings = [];
  await pruneExpiredFindingSentences(env, startedAt);

  for (const source of sources) {
    const stats = {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      checkedAt: startedAt,
      itemsFound: 0,
      itemsEnriched: 0,
      findingsFound: 0,
      leadsFound: 0,
      draftsCreated: 0,
      error: ""
    };

    try {
      const items = source.type === "rss" || source.type === "news" || source.type === "reddit"
        ? await fetchRssItems(source)
        : [];
      stats.itemsFound = items.length;

      for (const rawItem of items) {
        if (!isFreshEnough(rawItem, source, env)) continue;
        const item = shouldEnrich(rawItem, source, env)
          ? await enrichItem(rawItem, source, env)
          : rawItem;
        if (item.fullText || item.commentsText) stats.itemsEnriched += 1;
        const scoring = await scoreMaterial(item, source, env);
        const keywordScore = scoreItem(item, source.topic);
        const score = scoring.total;
        if (score >= Number(env.MIN_MATERIAL_SCORE || 45) || keywordScore >= 2) {
          const sentence = firstSentenceFromItem(item);
          const normalizedKey = normalizeSentence(sentence);
          if (await hasFindingSentence(env, normalizedKey)) continue;
          await rememberFindingSentence(env, {
            normalizedKey,
            rawSentence: sentence,
            sourceUrl: item.url || source.url,
            firstSeenAt: startedAt
          });
          stats.findingsFound += 1;
          findings.push({
            ...item,
            score,
            keywordScore,
            scoring,
            topic: source.topic,
            sourceId: source.id,
            platform: scoring.platform
          });
        }

        if (score >= Number(env.MIN_LEAD_SCORE || 65) && looksLikeLead(item)) {
          await insertLead(env, {
            sourceId: source.id,
            sourceUrl: item.url || source.url,
            title: item.title,
            excerpt: item.excerpt,
            topic: source.topic,
            score
          });
          stats.leadsFound += 1;
        }
      }

      await updateSourceCheckedAt(env, source.id, startedAt);
    } catch (error) {
      stats.error = error.message;
      console.log(JSON.stringify({ ok: false, source: source.id, error: error.message }));
    } finally {
      await insertScanRun(env, stats);
    }
  }

  const demandResult = await createDraftsFromDemand(findings, env);
  if (demandResult.drafts.length) {
    await notifyDemandDrafts(env, demandResult);
  }
  if (demandResult.topics.length || demandResult.drafts.length) {
    await insertScanRun(env, {
      sourceId: "demand-analysis",
      sourceName: "AI demand analysis",
      sourceType: "ai_demand",
      checkedAt: startedAt,
      itemsFound: findings.length,
      itemsEnriched: 0,
      findingsFound: demandResult.topics.length,
      leadsFound: 0,
      draftsCreated: demandResult.drafts.length,
      error: ""
    });
  }

  console.log(JSON.stringify({
    ok: true,
    job: "monitoring-cycle",
    scheduledTime: event.scheduledTime,
    startedAt,
    sources: sources.length,
    findings: findings.length,
    demandTopics: demandResult.topics.length,
    draftsCreated: demandResult.drafts.length,
    dryRun: env.SOCIAL_DRY_RUN !== "false"
  }));
}

async function notifyDemandDrafts(env, demandResult) {
  const chatId = env.TELEGRAM_REPORT_CHAT_ID || firstAllowedUser(env);
  if (!chatId) return;

  for (const draft of demandResult.drafts) {
    await sendTelegramMessage(env, chatId, formatDraft(draft).text, formatDraft(draft).options);
  }
}

function formatDraft(draft) {
  return {
    text: draft.text.slice(0, 3900),
    options: {
      parse_mode: undefined,
      photoUrl: draft.imageUrl || undefined,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Approve", callback_data: `approve:${draft.id}` },
            { text: "Reject", callback_data: `reject:${draft.id}` }
          ]
        ]
      }
    }
  };
}

function compactTopic(topic) {
  return String(topic || "").split(/\r?\n/)[0].slice(0, 180);
}

function firstAllowedUser(env) {
  return String(env.ALLOWED_TELEGRAM_USER_IDS || "").split(",").map((id) => id.trim()).find(Boolean);
}

function scoreItem(item, topic) {
  const haystack = `${item.title || ""} ${item.excerpt || ""} ${item.fullText || ""}`.toLowerCase();
  const terms = String(topic || "")
    .toLowerCase()
    .split(/[,\s]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2);

  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
  }

  const powerTerms = [
    "iec", "ieee", "substation", "capacitor", "harmonic", "grounding",
    "earthing", "lightning", "switchgear", "transformer", "short circuit"
  ];
  for (const term of powerTerms) {
    if (haystack.includes(term)) score += 1;
  }

  return score;
}

function looksLikeLead(item) {
  const text = `${item.title || ""} ${item.excerpt || ""} ${item.fullText || ""}`.toLowerCase();
  return scoreLeadPotential(text) >= 20;
}

function shouldEnrich(item, source, env) {
  if (env.ENRICH_THREADS === "false") return false;
  if (!item.url) return false;
  return source.type === "reddit" || source.type === "forum" || source.type === "news" || source.type === "classifieds";
}

function isFreshEnough(item, source, env) {
  const maxDays = Number(env.MAX_NEWS_AGE_DAYS || 14);
  if (!["rss", "news", "reddit"].includes(source.type)) return true;

  const publishedAt = parsePublishedAt(item.publishedAt);
  if (!publishedAt) return source.type !== "news";

  const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  return publishedAt.getTime() >= cutoff;
}

function parsePublishedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
