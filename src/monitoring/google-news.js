import { fetchRssItems } from "./rss.js";
import { addSource, listSources } from "../storage/sources.js";

export const DEFAULT_GOOGLE_NEWS_QUERIES = [
  "330 kV OR 400 kV OR 500 kV OR 750 kV substation",
  "765 kV transmission OR HVDC converter station OR UHV grid",
  "large power transformer shortage OR transformer factory grid expansion",
  "Hitachi Energy OR Siemens Energy OR ABB OR GE Vernova transformer switchgear",
  "SF6-free GIS OR gas-insulated switchgear circuit breaker",
  "IEC 61850 digital substation protection relay commissioning",
  "ETAP OR DIgSILENT PowerFactory OR PSCAD OR PSS/E protection coordination",
  "load flow short circuit arc flash power system software",
  "utility scale solar BESS grid interconnection transformer"
];

export async function fetchGoogleNewsItems(source, env) {
  const items = await fetchRssItems({ ...source, url: normalizeGoogleNewsUrl(source, env) });
  return items.map((item) => ({
    ...item,
    title: cleanGoogleNewsTitle(item.title),
    excerpt: cleanGoogleNewsExcerpt(item.excerpt),
    url: item.url || source.url
  }));
}

export async function seedGoogleNewsSources(env) {
  const existing = await listSources(env);
  const existingUrls = new Set(existing.map((source) => source.url));
  const created = [];

  for (const query of DEFAULT_GOOGLE_NEWS_QUERIES) {
    const url = buildGoogleNewsRssUrl(query, env);
    if (existingUrls.has(url)) continue;
    created.push(await addSource(env, {
      type: "google_news",
      name: `Google News: ${query}`.slice(0, 180),
      topic: query,
      url
    }));
    existingUrls.add(url);
  }

  return {
    created,
    totalGoogleNewsSources: existing.filter((source) => source.type === "google_news").length + created.length
  };
}

export function buildGoogleNewsRssUrl(query, env = {}) {
  const hl = env.GOOGLE_NEWS_HL || "en-US";
  const gl = env.GOOGLE_NEWS_GL || "US";
  const ceid = env.GOOGLE_NEWS_CEID || `${gl}:en`;
  const freshness = env.GOOGLE_NEWS_FRESHNESS || "when:14d";
  const q = `${query} ${freshness}`.trim();
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", q);
  url.searchParams.set("hl", hl);
  url.searchParams.set("gl", gl);
  url.searchParams.set("ceid", ceid);
  return url.toString();
}

function normalizeGoogleNewsUrl(source, env) {
  if (String(source.url || "").includes("news.google.com/rss")) return source.url;
  return buildGoogleNewsRssUrl(source.topic || source.url || "", env);
}

function cleanGoogleNewsTitle(title) {
  const value = String(title || "").replace(/\s+/g, " ").trim();
  const splitAt = value.lastIndexOf(" - ");
  if (splitAt > 20 && value.length - splitAt < 90) return value.slice(0, splitAt).trim();
  return value;
}

function cleanGoogleNewsExcerpt(excerpt) {
  return String(excerpt || "")
    .replace(/<font\b[\s\S]*?<\/font>/gi, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}
