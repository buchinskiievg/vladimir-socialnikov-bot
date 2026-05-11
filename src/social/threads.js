import { isDryRun, truncateForNetwork } from "./shared.js";

export async function publishThreads(post, env) {
  if (!env.THREADS_ACCESS_TOKEN || !env.THREADS_USER_ID) {
    return { ok: false, message: "missing Threads credentials" };
  }

  const text = truncateForNetwork(post.text, 500);

  if (isDryRun(env)) {
    return { ok: true, message: "dry run" };
  }

  const createResponse = await fetch(`https://graph.threads.net/v1.0/${env.THREADS_USER_ID}/threads`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "TEXT",
      text,
      access_token: env.THREADS_ACCESS_TOKEN
    })
  });

  if (!createResponse.ok) {
    return { ok: false, message: await createResponse.text() };
  }

  const container = await createResponse.json();
  const publishResponse = await fetch(`https://graph.threads.net/v1.0/${env.THREADS_USER_ID}/threads_publish`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: env.THREADS_ACCESS_TOKEN
    })
  });

  if (!publishResponse.ok) {
    return { ok: false, message: await publishResponse.text() };
  }

  const published = await publishResponse.json();
  return { ok: true, message: published.id || "published" };
}
