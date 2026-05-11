import { createDraftFromFinding } from "../workflows/drafts.js";
import { insertLead } from "../storage/leads.js";
import { listSources, updateSourceCheckedAt } from "../storage/sources.js";
import { fetchRssItems } from "./rss.js";
import { enrichItem } from "./thread-scanner.js";
import { insertScanRun } from "../storage/scan-runs.js";

export async function runMonitoringCycle(env, event) {
  const startedAt = new Date().toISOString();
  const sources = await listSources(env);
  const findings = [];

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
        const item = shouldEnrich(rawItem, source, env)
          ? await enrichItem(rawItem, source, env)
          : rawItem;
        if (item.fullText || item.commentsText) stats.itemsEnriched += 1;
        const score = scoreItem(item, source.topic);
        if (score >= 2) {
          stats.findingsFound += 1;
          findings.push({ ...item, score, topic: source.topic, sourceId: source.id });
        }

        if (score >= 3 && looksLikeLead(item)) {
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

  const draftFindings = findings.slice(0, Number(env.MAX_DRAFTS_PER_MONITORING_RUN || 3));
  for (const finding of draftFindings) {
    await createDraftFromFinding(finding, env);
  }

  console.log(JSON.stringify({
    ok: true,
    job: "monitoring-cycle",
    scheduledTime: event.scheduledTime,
    startedAt,
    sources: sources.length,
    findings: findings.length,
    dryRun: env.SOCIAL_DRY_RUN !== "false"
  }));
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
  return [
    "recommend",
    "looking for",
    "need help",
    "how to calculate",
    "consultant",
    "software",
    "tool",
    "design"
  ].some((marker) => text.includes(marker));
}

function shouldEnrich(item, source, env) {
  if (env.ENRICH_THREADS === "false") return false;
  if (!item.url) return false;
  return source.type === "reddit" || source.type === "forum" || source.type === "news" || source.type === "classifieds";
}
