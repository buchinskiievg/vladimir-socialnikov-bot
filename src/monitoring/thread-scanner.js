import { fetchRedditThread } from "./thread-scanners/reddit.js";
import { fetchPublicHtmlThread } from "./thread-scanners/html.js";

export async function enrichItem(item, source, env) {
  const url = item.url || "";
  if (!url) return item;

  try {
    if (isRedditUrl(url)) {
      const enriched = await fetchRedditThread(url, env);
      return mergeItem(item, enriched);
    }

    if (source.type === "forum" || source.type === "news" || source.type === "classifieds") {
      const enriched = await fetchPublicHtmlThread(url, env);
      return mergeItem(item, enriched);
    }
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      job: "thread-enrichment",
      url,
      error: error.message
    }));
  }

  return item;
}

function mergeItem(item, enriched) {
  return {
    ...item,
    ...enriched,
    excerpt: enriched?.excerpt || item.excerpt,
    commentsText: enriched?.commentsText || "",
    fullText: [item.excerpt, enriched?.fullText, enriched?.commentsText]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12000)
  };
}

function isRedditUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") === "reddit.com" && parsed.pathname.includes("/comments/");
  } catch {
    return false;
  }
}
