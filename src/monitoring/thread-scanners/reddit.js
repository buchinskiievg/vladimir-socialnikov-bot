export async function fetchRedditThread(url, env) {
  const threadUrl = normalizeRedditJsonUrl(url);
  const headers = {
    "user-agent": env.REDDIT_USER_AGENT || "social-telegram-worker-bot/0.1"
  };

  if (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET && env.REDDIT_REFRESH_TOKEN) {
    headers.authorization = `Bearer ${await getRedditAccessToken(env)}`;
  }

  const response = await fetch(threadUrl, { headers });
  if (!response.ok) {
    throw new Error(`Reddit thread fetch failed: ${response.status}`);
  }

  const data = await response.json();
  const post = data?.[0]?.data?.children?.[0]?.data || {};
  const comments = data?.[1]?.data?.children || [];

  const commentTexts = comments
    .map((child) => child?.data)
    .filter((comment) => comment?.body)
    .slice(0, Number(env.MAX_COMMENTS_PER_THREAD || 12))
    .map((comment) => `Comment by ${comment.author || "unknown"}: ${comment.body}`)
    .join("\n\n");

  return {
    title: post.title || "",
    author: post.author || "",
    excerpt: post.selftext || post.title || "",
    fullText: [post.title, post.selftext].filter(Boolean).join("\n\n"),
    commentsText: commentTexts,
    canonicalUrl: post.permalink ? `https://www.reddit.com${post.permalink}` : url
  };
}

function normalizeRedditJsonUrl(url) {
  const parsed = new URL(url);
  parsed.hostname = "www.reddit.com";
  parsed.search = "";

  let path = parsed.pathname;
  if (!path.endsWith("/")) path += "/";
  if (!path.includes("/comments/")) {
    throw new Error("not a Reddit comments URL");
  }
  if (!path.endsWith(".json/")) path = `${path.replace(/\/$/, "")}.json`;

  return `${parsed.origin}${path}?limit=20&sort=confidence`;
}

async function getRedditAccessToken(env) {
  const basic = btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`);
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "authorization": `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": env.REDDIT_USER_AGENT || "social-telegram-worker-bot/0.1"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.REDDIT_REFRESH_TOKEN
    })
  });

  if (!response.ok) {
    throw new Error(`Reddit token failed: ${response.status}`);
  }

  const body = await response.json();
  return body.access_token;
}
