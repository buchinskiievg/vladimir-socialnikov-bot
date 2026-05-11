import { listTopicsForPlatform } from "../storage/topic-preferences.js";
import { platformForSourceType } from "../topic-strategy.js";

export async function scoreMaterial(item, source, env) {
  const platform = platformForSourceType(source.type);
  const topics = await listTopicsForPlatform(env, platform);
  const text = materialText(item);
  const lower = text.toLowerCase();

  const topicScore = scoreTopicFit(lower, topics);
  const importanceScore = scoreImportance(lower, source.type);
  const popularityScore = scorePopularity(lower);
  const materialScore = scoreMaterialAmount(item, text);
  const freshnessScore = scoreFreshness(item.publishedAt);
  const leadScore = scoreLeadPotential(lower);
  const softwareScore = scoreSoftwareInterest(lower, platform);
  const gridBuildScore = scoreGridBuildInterest(lower);
  const oemScore = scoreOemEquipmentInterest(lower);

  const total = Math.round(
    topicScore * 0.25 +
    importanceScore * 0.22 +
    popularityScore * 0.18 +
    materialScore * 0.14 +
    freshnessScore * 0.11 +
    leadScore * 0.10 +
    softwareScore * 0.10 +
    gridBuildScore * 0.16 +
    oemScore * 0.14
  );

  return {
    total,
    platform,
    components: {
      topic: topicScore,
      importance: importanceScore,
      popularity: popularityScore,
      material: materialScore,
      freshness: freshnessScore,
      lead: leadScore,
      software: softwareScore,
      gridBuild: gridBuildScore,
      oem: oemScore
    },
    matchedTopics: matchTopics(lower, topics).slice(0, 3)
  };
}

export function scoreLeadPotential(text) {
  return cappedScore(text, [
    ["recommend", 18],
    ["looking for", 22],
    ["need help", 24],
    ["how to calculate", 24],
    ["consultant", 20],
    ["software", 14],
    ["tool", 12],
    ["etap", 24],
    ["digSilent".toLowerCase(), 22],
    ["powerfactory", 22],
    ["skm", 20],
    ["easypower", 20],
    ["cyme", 18],
    ["pss/e", 18],
    ["psse", 18],
    ["pvsyst", 18],
    ["helioscope", 18],
    ["calculator", 16],
    ["template", 14],
    ["design help", 22],
    ["proposal", 16],
    ["quote", 16],
    ["contractor", 14]
  ]);
}

function scoreSoftwareInterest(text, platform) {
  const base = platform === "facebook" ? 12 : platform === "linkedin" ? 10 : 0;
  return Math.min(100, base + cappedScore(text, [
    ["etap", 28],
    ["digSilent".toLowerCase(), 26],
    ["powerfactory", 26],
    ["skm", 24],
    ["easypower", 24],
    ["cyme", 22],
    ["pss/e", 22],
    ["psse", 22],
    ["pvsyst", 22],
    ["helioscope", 20],
    ["homer pro", 18],
    ["neplan", 18],
    ["pscad", 18],
    ["matlab", 12],
    ["simulink", 12],
    ["software", 16],
    ["tool", 12],
    ["calculator", 18],
    ["template", 16],
    ["spreadsheet", 14],
    ["compare", 12],
    ["review", 14],
    ["workflow", 14],
    ["load flow", 18],
    ["short circuit", 18],
    ["arc flash", 18],
    ["protection coordination", 20],
    ["relay coordination", 20]
  ]));
}

function scoreTopicFit(text, topics) {
  const matches = matchTopics(text, topics);
  return Math.min(100, matches.reduce((sum, item) => sum + 18 * Number(item.weight || 1), 0));
}

function matchTopics(text, topics) {
  const matches = [];
  for (const row of topics) {
    const tokens = String(row.topic || "")
      .toLowerCase()
      .split(/[^a-z0-9а-яё]+/i)
      .filter((token) => token.length > 3);
    const hits = tokens.filter((token) => text.includes(token)).length;
    if (hits >= Math.min(2, tokens.length)) {
      matches.push({ id: row.id, topic: row.topic, weight: row.weight, hits });
    }
  }
  return matches.sort((a, b) => b.hits * b.weight - a.hits * a.weight);
}

function scoreImportance(text, sourceType) {
  const base = sourceType === "news" || sourceType === "rss" ? 12 : 0;
  return Math.min(100, base + cappedScore(text, [
    ["iec", 15],
    ["ieee", 15],
    ["standard", 12],
    ["grid code", 18],
    ["interconnection", 14],
    ["substation", 16],
    ["transformer", 13],
    ["switchgear", 13],
    ["protection", 14],
    ["short circuit", 18],
    ["grounding", 14],
    ["earthing", 14],
    ["harmonic", 16],
    ["resonance", 16],
    ["capacitor", 14],
    ["solar", 10],
    ["pv", 10],
    ["battery", 9],
    ["failure", 18],
    ["outage", 18],
    ["safety", 16],
    ["arc flash", 20]
  ]));
}

function scoreGridBuildInterest(text) {
  return cappedScore(text, [
    ["330 kv", 20],
    ["345 kv", 20],
    ["400 kv", 18],
    ["500 kv", 24],
    ["550 kv", 24],
    ["735 kv", 24],
    ["750 kv", 28],
    ["765 kv", 30],
    ["800 kv", 30],
    ["1100 kv", 30],
    ["±500", 22],
    ["±800", 28],
    ["hvdc", 26],
    ["uhv", 26],
    ["ehv", 18],
    ["transmission line", 18],
    ["grid expansion", 20],
    ["substation construction", 22],
    ["converter station", 22],
    ["gis", 14],
    ["gas-insulated switchgear", 22],
    ["breaker-and-a-half", 18],
    ["500/230", 22],
    ["500/115", 20],
    ["765-kv", 30],
    ["500-kv", 24],
    ["750-kv", 28],
    ["major transmission", 18],
    ["large power transformer", 18],
    ["transformer bank", 18]
  ]);
}

function scoreOemEquipmentInterest(text) {
  return cappedScore(text, [
    ["abb", 18],
    ["siemens", 18],
    ["siemens energy", 24],
    ["hitachi", 18],
    ["hitachi energy", 26],
    ["alstom", 14],
    ["alstom grid", 18],
    ["ge vernova", 22],
    ["ge grid", 18],
    ["schneider electric", 20],
    ["econiQ".toLowerCase(), 24],
    ["sf6-free", 26],
    ["sf₆-free", 26],
    ["sf6 free", 26],
    ["circuit breaker", 16],
    ["dead tank", 16],
    ["gas-insulated", 18],
    ["digital substation", 20],
    ["protection relay", 16],
    ["transformer factory", 20],
    ["switchgear manufacturing", 20],
    ["grid equipment", 18],
    ["equipment order", 14],
    ["new product", 12],
    ["unveiled", 12],
    ["commissioned", 16],
    ["energized", 16]
  ]);
}

function scorePopularity(text) {
  return cappedScore(text, [
    ["?", 16],
    ["how", 12],
    ["why", 9],
    ["problem", 12],
    ["issue", 12],
    ["mistake", 14],
    ["best practice", 16],
    ["compare", 12],
    ["vs", 10],
    ["recommend", 14],
    ["experience", 10],
    ["help", 12],
    ["discussion", 8]
  ]);
}

function scoreMaterialAmount(item, text) {
  const lengthScore = Math.min(55, Math.floor(text.length / 120));
  const commentScore = item.commentsText ? 25 : 0;
  const fullTextScore = item.fullText ? 20 : 0;
  return Math.min(100, lengthScore + commentScore + fullTextScore);
}

function scoreFreshness(publishedAt) {
  if (!publishedAt) return 45;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return 45;
  const ageDays = (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 1) return 100;
  if (ageDays <= 3) return 85;
  if (ageDays <= 7) return 70;
  if (ageDays <= 14) return 55;
  return 0;
}

function cappedScore(text, rules) {
  let score = 0;
  for (const [marker, value] of rules) {
    if (text.includes(marker)) score += value;
  }
  return Math.min(100, score);
}

function materialText(item) {
  return [
    item.title || "",
    item.excerpt || "",
    item.fullText || "",
    item.commentsText || ""
  ].join("\n");
}
