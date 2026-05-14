import { isDryRun, truncateForNetwork } from "./shared.js";
import { executeComposioTool } from "./composio.js";

export async function publishReddit(post, env) {
  if (env.COMPOSIO_API_KEY && env.COMPOSIO_REDDIT_ACCOUNT_ID) {
    return publishRedditViaComposio(post, env);
  }

  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET || !env.REDDIT_REFRESH_TOKEN) {
    return { ok: false, message: "missing Reddit OAuth credentials" };
  }

  const subreddit = env.REDDIT_SUBREDDIT;
  if (!subreddit) {
    return { ok: false, message: "missing REDDIT_SUBREDDIT" };
  }

  if (isDryRun(env)) {
    return { ok: true, message: `dry run to r/${subreddit}` };
  }

  const accessToken = await getRedditAccessToken(env);
  const title = truncateForNetwork(post.title || firstLine(post.text), 300);
  const text = post.text;

  const response = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": env.REDDIT_USER_AGENT || "social-telegram-worker-bot/0.1"
    },
    body: new URLSearchParams({
      api_type: "json",
      kind: "self",
      sr: subreddit,
      title,
      text,
      sendreplies: "true"
    })
  });

  const body = await response.json();
  const errors = body?.json?.errors || [];
  if (!response.ok || errors.length) {
    return { ok: false, message: JSON.stringify(errors.length ? errors : body) };
  }

  return { ok: true, message: body?.json?.data?.url || "submitted" };
}

async function publishRedditViaComposio(post, env) {
  const subreddit = env.REDDIT_SUBREDDIT;
  if (!subreddit) {
    return { ok: false, message: "missing REDDIT_SUBREDDIT" };
  }

  if (isDryRun(env)) {
    return { ok: true, message: `dry run via Composio to r/${subreddit}` };
  }

  const title = truncateForNetwork(post.title || firstLine(post.text), 300);
  const result = await executeComposioTool(env, "REDDIT_CREATE_REDDIT_POST", env.COMPOSIO_REDDIT_ACCOUNT_ID, {
    subreddit,
    title,
    body: post.text,
    kind: "self"
  });

  return result.ok
    ? { ok: true, message: result.data?.permalink || result.message || "submitted via Composio" }
    : result;
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
    throw new Error(`Reddit token failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  return body.access_token;
}

function firstLine(text) {
  return String(text || "Post").split(/\r?\n/).find(Boolean) || "Post";
}
