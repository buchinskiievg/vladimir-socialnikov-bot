export async function generateInfographicForPost({ id, topic, text, target }, env) {
  if (env.GENERATE_POST_IMAGES === "false") return null;
  if (!env.MESSAGE_ARCHIVE || !env.PUBLIC_WORKER_URL) return null;

  const imagePrompt = buildInfographicPrompt({ topic, text, target });
  let image = null;
  let prompt = imagePrompt;

  if (env.GEMINI_API_KEY) {
    try {
      image = await generateGeminiImage(imagePrompt, env);
    } catch (error) {
      prompt = `Fallback SVG infographic used because Gemini image generation failed: ${error.message}`;
    }
  }

  if (!image?.bytes?.byteLength) {
    image = generateFallbackSvg({ topic, target });
    prompt = prompt || "Fallback SVG infographic";
  }

  const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/svg+xml" ? "svg" : "png";
  const key = `generated-post-images/${new Date().toISOString().slice(0, 10)}/${id}.${extension}`;
  await env.MESSAGE_ARCHIVE.put(key, image.bytes, {
    httpMetadata: { contentType: image.mimeType || "image/png" },
    customMetadata: {
      topic: String(topic || "").slice(0, 256),
      target: String(target || "all").slice(0, 64)
    }
  });

  return {
    imageKey: key,
    imageUrl: `${String(env.PUBLIC_WORKER_URL).replace(/\/$/, "")}/media/${encodeURIComponent(key)}`,
    imagePrompt: prompt
  };
}

async function generateGeminiImage(prompt, env) {
  const model = env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const timeoutMs = Number(env.GEMINI_IMAGE_TIMEOUT_MS || 45000);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini image generation failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const parts = body.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((part) => part.inlineData || part.inline_data);
  const data = inline?.inlineData || inline?.inline_data;
  if (!data?.data) return null;

  return {
    bytes: base64ToBytes(data.data),
    mimeType: data.mimeType || data.mime_type || "image/png"
  };
}

function buildInfographicPrompt({ topic, text, target }) {
  return [
    "Generate a clean square engineering infographic image for a professional social media post. The infographic must fill the entire image canvas.",
    "Audience: electrical power engineers, substation designers, power system consultants.",
    "Style: modern technical infographic, light technical background with restrained contrast, IEC/utility engineering feel, no cartoon style, no people, no brand logos.",
    "Format: 1:1 square, suitable for LinkedIn, Facebook, Instagram.",
    "Layout: use a large central technical diagram occupying at least 75% of the canvas, with supporting callout blocks around it. No tiny icon in the middle. No excessive empty white margins.",
    "Composition: make the substation/grid/single-line elements visually prominent, full-frame, and balanced from edge to edge.",
    "Content: show a clear visual concept using simplified single-line diagram elements, grid/substation/capacitor bank/protection/software blocks when relevant.",
    "Text in image: English only. Use very little text, maximum 5 short labels, large and legible. Avoid long paragraphs.",
    "Do not include fake standards numbers, fake company logos, watermarks, signatures, QR codes, or contact details.",
    `Topic: ${topic}`,
    `Target: ${target || "all"}`,
    "",
    "Post text for context:",
    String(text || "").slice(0, 1800)
  ].join("\n");
}

function generateFallbackSvg({ topic, target }) {
  const title = normalizeSvgTitle(topic);
  const subtitle = String(target || "engineering post").replace(/_/g, " ");
  const renewable = /solar|wind|солнеч|ветр/i.test(String(topic || ""));
  const leftLabel = renewable ? "Solar PV" : "Grid";
  const rightLabel = renewable ? "Wind" : "Load";
  const centerLabel = renewable ? "Grid study" : "Power system";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#f6f8fb"/>
  <rect x="70" y="70" width="1060" height="1060" rx="36" fill="#ffffff" stroke="#d9e2ec" stroke-width="3"/>
  <text x="110" y="155" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700" fill="#17324d">${escapeXml(title)}</text>
  <text x="110" y="210" font-family="Arial, Helvetica, sans-serif" font-size="25" fill="#567086">${escapeXml(subtitle)}</text>
  <line x1="150" y1="610" x2="1050" y2="610" stroke="#9fb3c8" stroke-width="10" stroke-linecap="round"/>
  <circle cx="300" cy="610" r="130" fill="#f9d65c" stroke="#17324d" stroke-width="8"/>
  <path d="M245 610h110M300 555v110M262 572l76 76M338 572l-76 76" stroke="#17324d" stroke-width="9" stroke-linecap="round"/>
  <rect x="480" y="465" width="240" height="290" rx="28" fill="#17324d"/>
  <text x="600" y="585" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${escapeXml(centerLabel)}</text>
  <text x="600" y="640" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#d8e6f3">load flow</text>
  <text x="600" y="680" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#d8e6f3">protection</text>
  <circle cx="900" cy="610" r="126" fill="#9ad0ec" stroke="#17324d" stroke-width="8"/>
  <line x1="900" y1="610" x2="900" y2="500" stroke="#17324d" stroke-width="10" stroke-linecap="round"/>
  <path d="M900 610l96 55M900 610l-96 55M900 610l0 110" stroke="#17324d" stroke-width="10" stroke-linecap="round"/>
  <rect x="180" y="820" width="240" height="92" rx="18" fill="#eef6ff" stroke="#c8d8e8"/>
  <rect x="480" y="820" width="240" height="92" rx="18" fill="#eef6ff" stroke="#c8d8e8"/>
  <rect x="780" y="820" width="240" height="92" rx="18" fill="#eef6ff" stroke="#c8d8e8"/>
  <text x="300" y="875" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#17324d">${escapeXml(leftLabel)}</text>
  <text x="600" y="875" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#17324d">Grid limits</text>
  <text x="900" y="875" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#17324d">${escapeXml(rightLabel)}</text>
  <text x="600" y="1010" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#567086">Engineering decision = resource + grid + storage + protection</text>
</svg>`;

  return {
    bytes: new TextEncoder().encode(svg),
    mimeType: "image/svg+xml"
  };
}

function normalizeSvgTitle(topic) {
  const lower = String(topic || "").toLowerCase();
  if ((lower.includes("солнеч") || lower.includes("solar")) && (lower.includes("ветр") || lower.includes("wind"))) {
    return "Solar vs Wind Generation";
  }
  return String(topic || "Power System Engineering").replace(/\s+/g, " ").trim().slice(0, 42);
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
