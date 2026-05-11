export async function fetchRssItems(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "social-telegram-worker-bot/0.1 (+https://workers.cloudflare.com)"
    }
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }

  const xml = await response.text();
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const entryBlocks = itemBlocks.length
    ? itemBlocks
    : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);

  return entryBlocks.slice(0, 20).map((block) => ({
    title: decodeXml(readTag(block, "title")),
    url: decodeXml(readTag(block, "link") || readAtomLink(block)),
    excerpt: stripTags(decodeXml(readTag(block, "description") || readTag(block, "summary") || readTag(block, "content"))).slice(0, 800),
    publishedAt: decodeXml(readTag(block, "pubDate") || readTag(block, "updated") || readTag(block, "published"))
  })).filter((item) => item.title || item.url);
}

function readTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim().replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "") : "";
}

function readAtomLink(block) {
  const match = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : "";
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
