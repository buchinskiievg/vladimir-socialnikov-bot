import { graphApiBase, isDryRun } from "./shared.js";

export async function publishFacebookPage(post, env) {
  if (!env.FACEBOOK_PAGE_ACCESS_TOKEN || !env.FACEBOOK_PAGE_ID) {
    return { ok: false, message: "missing Facebook Page credentials" };
  }

  if (isDryRun(env)) {
    return { ok: true, message: "dry run" };
  }

  const response = await fetch(`${graphApiBase(env)}/${env.FACEBOOK_PAGE_ID}/feed`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      message: post.text,
      access_token: env.FACEBOOK_PAGE_ACCESS_TOKEN
    })
  });

  if (!response.ok) {
    return { ok: false, message: await response.text() };
  }

  return { ok: true, message: "published" };
}
