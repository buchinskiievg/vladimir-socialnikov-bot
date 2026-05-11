import { isDryRun } from "./shared.js";

export async function publishInstagram(post, env) {
  if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
    return { ok: false, message: "missing Instagram credentials" };
  }

  if (isDryRun(env)) {
    return { ok: true, message: "dry run" };
  }

  return {
    ok: false,
    message: "Instagram requires media container publishing; text-only posts are not supported"
  };
}
