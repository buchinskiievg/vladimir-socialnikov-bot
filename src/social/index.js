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

  for (const connector of CONNECTORS) {
    try {
      const item = await connector.publish(post, env);
      results.push({ network: connector.name, ...item });
    } catch (error) {
      results.push({ network: connector.name, ok: false, message: error.message });
    }
  }

  return { ok: results.every((item) => item.ok), results };
}
