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
  const strategicScore = scoreStrategicPriority(lower);

  const total = Math.round(
    topicScore * 0.23 +
    importanceScore * 0.20 +
    popularityScore * 0.14 +
    materialScore * 0.12 +
    freshnessScore * 0.10 +
    leadScore * 0.08 +
    softwareScore * 0.18 +
    gridBuildScore * 0.24 +
    oemScore * 0.18 +
    strategicScore * 0.22
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
      oem: oemScore,
      strategic: strategicScore
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
  const base = platform === "facebook" ? 18 : platform === "linkedin" ? 16 : 4;
  return Math.min(100, base + cappedScore(text, [
    ["etap", 34],
    ["digSilent".toLowerCase(), 32],
    ["powerfactory", 32],
    ["skm", 24],
    ["easypower", 24],
    ["cyme", 22],
    ["pss/e", 26],
    ["psse", 26],
    ["pvsyst", 22],
    ["helioscope", 20],
    ["homer pro", 18],
    ["neplan", 18],
    ["pscad", 26],
    ["neplan", 22],
    ["powerworld", 20],
    ["gridmo", 18],
    ["matlab", 12],
    ["simulink", 12],
    ["software", 22],
    ["software review", 30],
    ["feature", 18],
    ["function", 16],
    ["tool", 16],
    ["calculator", 18],
    ["template", 16],
    ["spreadsheet", 14],
    ["compare", 12],
    ["review", 14],
    ["workflow", 14],
    ["load flow", 24],
    ["power flow", 22],
    ["short circuit", 24],
    ["arc flash", 24],
    ["protection coordination", 28],
    ["relay coordination", 28],
    ["iec 60909", 30],
    ["iec 61850", 26]
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
    ["power transformer", 18],
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
    ["330 kv", 36],
    ["345 kv", 34],
    ["400 kv", 34],
    ["500 kv", 42],
    ["525 kv", 38],
    ["550 kv", 38],
    ["735 kv", 42],
    ["750 kv", 48],
    ["765 kv", 50],
    ["800 kv", 30],
    ["1100 kv", 30],
    ["±500", 22],
    ["±800", 28],
    ["hvdc", 38],
    ["uhv", 36],
    ["ehv", 30],
    ["transmission line", 30],
    ["transmission project", 34],
    ["grid expansion", 34],
    ["grid upgrade", 30],
    ["substation construction", 38],
    ["new substation", 34],
    ["greenfield substation", 34],
    ["energized", 24],
    ["commissioned", 24],
    ["converter station", 22],
    ["gis", 22],
    ["gas-insulated switchgear", 30],
    ["breaker-and-a-half", 18],
    ["500/230", 22],
    ["500/115", 20],
    ["765-kv", 30],
    ["500-kv", 24],
    ["750-kv", 28],
    ["major transmission", 18],
    ["large power transformer", 30],
    ["transformer bank", 26],
    ["grid interconnection", 26],
    ["substation project", 34],
    ["interconnector", 28]
  ]);
}

function scoreOemEquipmentInterest(text) {
  return cappedScore(text, [
    ["abb", 24],
    ["siemens", 22],
    ["siemens energy", 32],
    ["hitachi", 22],
    ["hitachi energy", 34],
    ["alstom", 20],
    ["alstom grid", 24],
    ["ge vernova", 30],
    ["ge grid", 22],
    ["schneider electric", 26],
    ["sel", 20],
    ["eaton", 20],
    ["mitsubishi electric", 22],
    ["toshiba", 18],
    ["hyundai electric", 22],
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
    ["new product", 22],
    ["product launch", 24],
    ["unveiled", 22],
    ["commissioned", 20],
    ["energized", 20],
    ["factory expansion", 22],
    ["manufacturing capacity", 22]
  ]);
}

function scoreStrategicPriority(text) {
  return Math.max(
    scoreGridBuildInterest(text),
    scoreSoftwareInterest(text, "linkedin"),
    scoreOemEquipmentInterest(text),
    cappedScore(text, [
      ["data center load", 28],
      ["grid congestion", 24],
      ["transformer shortage", 36],
      ["supply chain", 22],
      ["interconnection queue", 26],
      ["blackout", 24],
      ["system operator", 18],
      ["utility scale", 14],
      ["protection relay", 22],
      ["commissioning", 20],
      ["substation automation", 24],
      ["digital substation", 28]
    ])
  );
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
