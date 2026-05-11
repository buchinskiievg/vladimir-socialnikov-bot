export async function fetchPublicHtmlThread(url, env) {
  const response = await fetch(url, {
    headers: {
      "user-agent": env.SOURCE_SCANNER_USER_AGENT || "social-telegram-worker-bot/0.1 (+https://workers.cloudflare.com)",
      "accept": "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`HTML thread fetch failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error(`Unsupported content-type: ${contentType}`);
  }

  const html = await response.text();
  if (looksBlocked(html)) {
    throw new Error("page appears to require login or anti-bot verification");
  }

  const title = readTitle(html);
  const text = extractReadableText(html).slice(0, Number(env.MAX_HTML_THREAD_CHARS || 12000));

  return {
    title,
    excerpt: text.slice(0, 1000),
    fullText: text
  };
}

function readTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(stripTags(match[1])).trim() : "";
}

function extractReadableText(html) {
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ");

  return decodeHtml(stripTags(body))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
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
