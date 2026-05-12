import { createDraftFromTopic } from "./drafts.js";

export async function createDraftsFromDemand(findings, env) {
  const maxDrafts = Number(env.MAX_DEMAND_TOPICS_PER_MONITORING_RUN || env.MAX_DRAFTS_PER_MONITORING_RUN || 3);
  if (!findings.length || maxDrafts <= 0) return { topics: [], drafts: [] };

  const topics = await findDemandTopics(findings, env);
  const drafts = [];

  for (const item of topics.sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, maxDrafts)) {
    const target = normalizeTarget(item.target);
    const topic = cleanTopic(item.topic);
    drafts.push(await createDraftFromTopic(topic, {
      env,
      target,
      finding: {
        title: topic,
        excerpt: [item.angle, item.demandReason].filter(Boolean).join("\n"),
        url: item.evidenceUrls?.[0] || ""
      }
    }));
  }

  return { topics: topics.slice(0, maxDrafts), drafts };
}

async function findDemandTopics(findings, env) {
  if (env.GEMINI_API_KEY) {
    try {
      const { generateDemandTopics } = await import("../ai/gemini.js");
      const result = await generateDemandTopics({ findings }, env);
      return normalizeTopics(result.topics || []);
    } catch (error) {
      console.log(JSON.stringify({ ok: false, job: "demand-topic-analysis", error: error.message }));
    }
  }

  return fallbackTopics(findings);
}

function normalizeTopics(topics) {
  const seen = new Set();
  const normalized = [];

  for (const item of topics) {
    const topic = String(item.topic || "").trim();
    if (topic.length < 8) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      topic,
      angle: String(item.angle || "").trim(),
      demandReason: String(item.demandReason || "").trim(),
      target: normalizeTarget(item.target),
      evidenceUrls: Array.isArray(item.evidenceUrls) ? item.evidenceUrls.filter(Boolean).slice(0, 3) : [],
      score: Number(item.score || 0)
    });
  }

  return normalized;
}

function fallbackTopics(findings) {
  return findings
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 5)
    .map((finding) => ({
      topic: finding.title || finding.topic || "Practical electrical engineering discussion",
      angle: "Answer the practical question behind this discussion.",
      demandReason: demandReasonFromScore(finding),
      target: "linkedin_personal",
      evidenceUrls: [finding.url].filter(Boolean),
      score: finding.score || 0
    }));
}

function cleanTopic(topic) {
  return String(topic || "Practical electrical engineering discussion")
    .split(/\r?\n/)[0]
    .replace(/\s+(Angle|Demand signal|Evidence):.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTarget(target) {
  return ["linkedin_personal", "linkedin_company", "all"].includes(target) ? target : "linkedin_personal";
}

function demandReasonFromScore(finding) {
  const components = finding.scoring?.components;
  if (!components) return "This topic appeared in monitored sources and matched engineering intent.";
  return [
    `material score ${finding.score}`,
    `topic ${components.topic}`,
    `importance ${components.importance}`,
    `popularity ${components.popularity}`,
    `material ${components.material}`,
    `freshness ${components.freshness}`,
    components.gridBuild ? `grid build ${components.gridBuild}` : "",
    components.oem ? `OEM/equipment ${components.oem}` : ""
  ].filter(Boolean).join("; ");
}
