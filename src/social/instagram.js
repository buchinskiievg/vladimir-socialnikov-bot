import { isDryRun } from "./shared.js";
import { executeComposioTool } from "./composio.js";

export async function publishInstagram(post, env) {
  if (env.COMPOSIO_INSTAGRAM_ACCOUNT_ID && env.COMPOSIO_INSTAGRAM_USER_ID) {
    return publishInstagramViaComposio(post, env);
  }

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

async function publishInstagramViaComposio(post, env) {
  if (!post.imageUrl) {
    return { ok: false, message: "missing image for Instagram" };
  }

  if (isDryRun(env)) {
    return { ok: true, message: `dry run via Composio to Instagram user ${env.COMPOSIO_INSTAGRAM_USER_ID}` };
  }

  const container = await executeComposioTool(
    env,
    "INSTAGRAM_POST_IG_USER_MEDIA",
    env.COMPOSIO_INSTAGRAM_ACCOUNT_ID,
    {
      ig_user_id: env.COMPOSIO_INSTAGRAM_USER_ID,
      image_url: post.imageUrl,
      caption: post.text
    }
  );

  if (!container.ok) return container;
  const creationId = container.data?.id || container.data?.creation_id || container.message;
  if (!creationId) {
    return { ok: false, message: "Instagram media container did not return creation id" };
  }

  return executeComposioTool(
    env,
    "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",
    env.COMPOSIO_INSTAGRAM_ACCOUNT_ID,
    {
      ig_user_id: env.COMPOSIO_INSTAGRAM_USER_ID,
      creation_id: creationId
    }
  );
}
