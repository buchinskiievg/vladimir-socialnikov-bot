export async function handleMediaRequest(request, env) {
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/media\//, ""));

  if (!key || key.includes("..") || !env.MESSAGE_ARCHIVE) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.MESSAGE_ARCHIVE.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "image/png",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
