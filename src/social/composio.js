export async function executeComposioTool(env, toolSlug, connectedAccountId, args) {
  if (!env.COMPOSIO_API_KEY) {
    return { ok: false, message: "missing Composio API key" };
  }

  const response = await fetch(`https://backend.composio.dev/api/v3.1/tools/execute/${toolSlug}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.COMPOSIO_API_KEY
    },
    body: JSON.stringify({
      connected_account_id: connectedAccountId,
      entity_id: env.COMPOSIO_ENTITY_ID || "default",
      arguments: args
    })
  });

  const body = await response.json().catch(async () => ({ error: await response.text() }));
  if (!response.ok || body.successful === false) {
    return {
      ok: false,
      message: body.error?.message || body.error || JSON.stringify(body)
    };
  }

  return {
    ok: true,
    message: body.data?.id || body.data?.post_id || "published",
    data: body.data
  };
}
