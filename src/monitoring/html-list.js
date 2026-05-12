export async function fetchHtmlItems(source, env) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": env.SOURCE_SCANNER_USER_AGENT || "Mozilla/5.0 (compatible; VladimirSocialnikovBot/0.1; +https://workers.cloudflare.com)",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.8,*/*;q=0.5"
    }
  });

  if (!response.ok) {
    throw new Error(`HTML list fetch failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Unsupported list content-type: ${contentType || "unknown"}`);
  }

  const html = await response.text();
  if (looksBlocked(html)) {
    throw new Error("page appears to require login or anti-bot verification");
  }

  const baseUrl = source.url;
  const candidates = [
    ...extractArticleLinks(html, baseUrl),
    ...extractAnchorLinks(html, baseUrl)
  ];

  return dedupeItems(candidates)
    .filter((item) => isUsefulItem(item, baseUrl))
    .slice(0, Number(env.MAX_HTML_LIST_ITEMS || 20));
}

function extractArticleLinks(html, baseUrl) {
  const blocks = [...html.matchAll(/<(article|li|h2|h3)\b[\s\S]*?<\/\1>/gi)].map((match) => match[0]);
  return blocks.flatMap((block) => extractAnchorLinks(block, baseUrl));
}

function extractAnchorLinks(html, baseUrl) {
  const items = [];
  const matches = html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi);
  for (const match of matches) {
    const attrs = `${match[1] || ""} ${match[3] || ""}`;
    const href = decodeHtml(match[2] || "");
    const url = resolveUrl(href, baseUrl);
    if (!url) continue;

    const title = cleanupTitle(decodeHtml(stripTags(match[4] || "")));
    const aria = cleanupTitle(readAttr(attrs, "aria-label") || readAttr(attrs, "title"));
    const finalTitle = title.length >= aria.length ? title : aria;
    if (!finalTitle) continue;

    items.push({
      title: finalTitle,
      url,
      excerpt: "",
      publishedAt: readDateNearLink(html, match.index || 0)
    });
  }
  return items;
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = normalizeUrl(item.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, url: key });
  }
  return result;
}

function isUsefulItem(item, baseUrl) {
  const title = String(item.title || "");
  if (title.length < 18 || title.length > 220) return false;
  if (/^(home|login|sign in|subscribe|privacy|terms|contact|about|advertise)$/i.test(title.trim())) return false;

  const url = String(item.url || "");
  const base = new URL(baseUrl);
  const parsed = new URL(url);
  if (parsed.hostname !== base.hostname && !sameRegistrableDomain(parsed.hostname, base.hostname)) return false;
  if (parsed.pathname === "/" || parsed.pathname === base.pathname) return false;
  if (/[?&](share|replytocom|utm_|fbclid|gclid)=/i.test(url)) return false;
  if (/\/(login|signin|register|privacy|terms|tag|category|author|search|wp-json|feed)\b/i.test(parsed.pathname)) return false;
  return true;
}

function readDateNearLink(html, index) {
  const windowText = html.slice(Math.max(0, index - 500), index + 500);
  const datetime = windowText.match(/datetime=["']([^"']+)["']/i)?.[1];
  if (datetime) return datetime;
  return windowText.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/)?.[1] || "";
}

function readAttr(attrs, name) {
  return decodeHtml(String(attrs || "").match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] || "");
}

function resolveUrl(href, baseUrl) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return "";
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function sameRegistrableDomain(a, b) {
  const tail = (host) => host.replace(/^www\./, "").split(".").slice(-2).join(".");
  return tail(a) === tail(b);
}

function cleanupTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+[|–-]\s+.*$/g, "")
    .trim();
}

function stripTags(value) {
  return String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function looksBlocked(html) {
  const text = html.slice(0, 5000).toLowerCase();
  return [
    "captcha",
    "enable javascript",
    "log in to continue",
    "login to continue",
    "sign in to continue",
    "access denied",
    "cloudflare ray id"
  ].some((marker) => text.includes(marker));
}
