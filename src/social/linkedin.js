import { isDryRun } from "./shared.js";

export async function publishLinkedIn(post, env) {
  if (!env.LINKEDIN_ACCESS_TOKEN || !env.LINKEDIN_ORGANIZATION_URN) {
    return { ok: false, message: "missing LinkedIn credentials" };
  }

  if (isDryRun(env)) {
    return { ok: true, message: "dry run" };
  }

  return {
    ok: false,
    message: "LinkedIn connector placeholder: add official API request after app permissions are approved"
  };
}
