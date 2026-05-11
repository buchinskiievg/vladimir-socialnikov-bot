export function isDryRun(env) {
  return env.SOCIAL_DRY_RUN !== "false";
}

export function graphApiBase(env) {
  const version = env.META_GRAPH_API_VERSION || "v24.0";
  return `https://graph.facebook.com/${version}`;
}

export function truncateForNetwork(text, maxLength) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}
