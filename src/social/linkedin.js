import { isDryRun } from "./shared.js";

export async function publishLinkedIn(post, env) {
  const owner = linkedinOwner(post.target, env);
  if (!env.LINKEDIN_ACCESS_TOKEN || !owner) {
    return { ok: false, message: "missing LinkedIn credentials" };
  }

  if (isDryRun(env)) {
    return { ok: true, message: "dry run" };
  }

  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
      "content-type": "application/json",
      "x-restli-protocol-version": "2.0.0"
    },
    body: JSON.stringify({
      author: owner,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: post.text },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
      }
    })
  });

  if (!response.ok) {
    return { ok: false, message: await response.text() };
  }

  return { ok: true, message: response.headers.get("x-restli-id") || "published" };
}

function linkedinOwner(target, env) {
  if (target === "linkedin_personal") return env.LINKEDIN_PERSON_URN;
  if (target === "linkedin_company") return env.LINKEDIN_ORGANIZATION_URN;
  return env.LINKEDIN_ORGANIZATION_URN || env.LINKEDIN_PERSON_URN;
}
