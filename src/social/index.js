import { publishLinkedIn } from "./linkedin.js";
import { publishFacebookPage } from "./facebook.js";
import { publishInstagram } from "./instagram.js";
import { publishReddit } from "./reddit.js";
import { publishThreads } from "./threads.js";

const CONNECTORS = [
  { name: "LinkedIn", publish: publishLinkedIn },
  { name: "Reddit", publish: publishReddit },
  { name: "Facebook", publish: publishFacebookPage },
  { name: "Instagram", publish: publishInstagram },
  { name: "Threads", publish: publishThreads }
];

export async function publishToSocials(post, env) {
  const results = [];
  const connectors = filterConnectors(CONNECTORS, post.target || "all");

  for (const connector of connectors) {
    const dryRun = isConnectorDryRun(env, connector.name);
    const connectorEnv = { ...env, SOCIAL_DRY_RUN: dryRun ? "true" : "false" };
    try {
      const item = await connector.publish(post, connectorEnv);
      results.push({ network: connector.name, dryRun, ...item });
    } catch (error) {
      results.push({ network: connector.name, dryRun, ok: false, message: error.message });
    }
  }

  return {
    ok: results.every((item) => item.ok),
    dryRun: results.length ? results.every((item) => item.dryRun) : true,
    results
  };
}

function filterConnectors(connectors, target) {
  if (target === "linkedin_personal" || target === "linkedin_company") {
    return connectors.filter((connector) => connector.name === "LinkedIn");
  }
  if (target === "facebook") return connectors.filter((connector) => connector.name === "Facebook");
  if (target === "instagram") return connectors.filter((connector) => connector.name === "Instagram");
  if (target === "threads") return connectors.filter((connector) => connector.name === "Threads");
  if (target === "reddit") return connectors.filter((connector) => connector.name === "Reddit");
  return connectors;
}

function isConnectorDryRun(env, networkName) {
  if (env.SOCIAL_DRY_RUN === "false") return false;
  const liveNetworks = String(env.LIVE_PUBLISH_NETWORKS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return !liveNetworks.includes(String(networkName || "").toLowerCase());
}
