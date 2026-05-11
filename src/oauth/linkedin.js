import { sendTelegramMessage } from "../telegram-api.js";

const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];

export async function handleLinkedInAuth(request, env) {
  const state = crypto.randomUUID();
  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", env.LINKEDIN_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", linkedinRedirectUri(env));
  authUrl.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl.toString(), 302);
}

export async function handleLinkedInCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return html(`LinkedIn authorization failed: ${escapeHtml(errorDescription || error)}`);
  }

  if (!code) {
    return html("Missing LinkedIn authorization code.");
  }

  const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: linkedinRedirectUri(env),
      client_id: env.LINKEDIN_CLIENT_ID,
      client_secret: env.LINKEDIN_CLIENT_SECRET
    })
  });

  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok) {
    return html(`Token exchange failed:<pre>${escapeHtml(JSON.stringify(tokenBody, null, 2))}</pre>`);
  }

  const accessToken = tokenBody.access_token;
  const idTokenProfile = tokenBody.id_token ? decodeJwtPayload(tokenBody.id_token) : {};
  const apiProfile = await fetchLinkedInProfile(accessToken);
  const profileSub = idTokenProfile.sub || apiProfile.sub || "";
  const owner = profileSub ? `urn:li:person:${profileSub}` : "";
  const chatId = env.TELEGRAM_REPORT_CHAT_ID || firstAllowedUser(env);

  if (chatId) {
    await sendTelegramMessage(env, chatId, [
      "LinkedIn OAuth completed.",
      "",
      `Owner URN: ${owner || "not available"}`,
      "",
      "Next: set Cloudflare secrets:",
      "LINKEDIN_ACCESS_TOKEN = received",
      owner ? `LINKEDIN_PERSON_URN = ${owner}` : "LINKEDIN_PERSON_URN = not available"
    ].join("\n"));
  }

  return html([
    "<h1>LinkedIn connected</h1>",
    "<p>Copy these values into Cloudflare secrets/vars if Codex has not done it automatically.</p>",
    `<p><strong>LINKEDIN_PERSON_URN</strong>: <code>${escapeHtml(owner)}</code></p>`,
    `<p><strong>LINKEDIN_ACCESS_TOKEN</strong>:</p><textarea style=\"width:100%;height:180px\">${escapeHtml(accessToken)}</textarea>`,
    tokenBody.id_token ? `<p><strong>ID token subject</strong>: <code>${escapeHtml(profileSub)}</code></p>` : "<p>No id_token returned by LinkedIn.</p>",
    "<p>You can close this tab after saving the token.</p>"
  ].join(""));
}

async function fetchLinkedInProfile(accessToken) {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) return {};
  return response.json();
}

function linkedinRedirectUri(env) {
  return env.LINKEDIN_REDIRECT_URI || `${env.PUBLIC_WORKER_URL}/linkedin/callback`;
}

function firstAllowedUser(env) {
  return String(env.ALLOWED_TELEGRAM_USER_IDS || "").split(",").map((id) => id.trim()).find(Boolean);
}

function html(body) {
  return new Response(`<!doctype html><html><body>${body}</body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeJwtPayload(jwt) {
  try {
    const [, payload] = String(jwt).split(".");
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}
