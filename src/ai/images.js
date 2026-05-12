export async function generateInfographicForPost({ id, topic, text, target }, env) {
  if (env.GENERATE_POST_IMAGES === "false") return null;
  if (!env.MESSAGE_ARCHIVE || !env.PUBLIC_WORKER_URL) return null;

  const spec = imageSpecForTarget(target);
  const imagePrompt = buildInfographicPrompt({ topic, text, target, spec });
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
    image = generateFallbackSvg({ topic, target, spec });
    prompt = prompt || "Fallback SVG infographic";
  }

  const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/svg+xml" ? "svg" : "png";
  const key = `generated-post-images/${new Date().toISOString().slice(0, 10)}/${id}.${extension}`;
  await env.MESSAGE_ARCHIVE.put(key, image.bytes, {
    httpMetadata: { contentType: image.mimeType || "image/png" },
    customMetadata: {
      topic: String(topic || "").slice(0, 256),
      target: String(target || "all").slice(0, 64),
      width: String(spec.width),
      height: String(spec.height)
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

function buildInfographicPrompt({ topic, text, target, spec }) {
  const concept = visualConceptForTopic(topic, text);
  return [
    "Generate one premium glossy engineering infographic image for a professional social media post. The infographic must fill the entire canvas.",
    "Audience: electrical power engineers, substation designers, power system consultants.",
    "Style: high-end technical magazine infographic, glossy but credible, crisp vector-like geometry, subtle 3D/isometric engineering equipment, high contrast, deep navy background with clean white panels, electric cyan and amber accents.",
    "Avoid dull gray backgrounds, tiny centered icons, flat empty slides, excessive white margins, cartoons, people, brand logos, watermarks, signatures, QR codes, and contact details.",
    `Format: ${spec.width}x${spec.height}px, ${spec.description}. Keep all important text inside safe margins.`,
    "Layout: use a large central technical diagram occupying at least 70% of the canvas, with 3-5 polished callout blocks around it. Make it visually striking at Telegram preview size.",
    "Composition: make substation/grid/single-line/software/equipment elements prominent, full-frame, balanced edge to edge, and technically plausible.",
    `Visual concept to emphasize: ${concept}.`,
    "Engineering accuracy: use recognizable power-system symbols where useful: busbars, breakers, transformers, CT/VT, protection relays, transmission towers, GIS bays, HVDC converter blocks, load-flow arrows, voltage labels such as 330 kV, 500 kV, 750 kV only when relevant.",
    "Text in image: English only. Use very little text, maximum 5 short labels, large and legible. No long paragraphs.",
    "Do not include fake standards numbers, fake company logos, watermarks, signatures, QR codes, or contact details.",
    `Topic: ${topic}`,
    `Target: ${target || "all"}`,
    "",
    "Post text for context:",
    String(text || "").slice(0, 1800)
  ].join("\n");
}

function imageSpecForTarget(target) {
  const specs = {
    linkedin_personal: { width: 1200, height: 1200, description: "1:1 square LinkedIn feed infographic" },
    linkedin_company: { width: 1200, height: 1200, description: "1:1 square LinkedIn company feed infographic" },
    facebook: { width: 1200, height: 630, description: "1.91:1 Facebook feed image" },
    instagram: { width: 1080, height: 1350, description: "4:5 portrait Instagram feed infographic" },
    threads: { width: 1080, height: 1350, description: "4:5 portrait Threads infographic" },
    reddit: { width: 1200, height: 675, description: "16:9 Reddit discussion image" },
    all: { width: 1200, height: 1200, description: "1:1 multi-platform infographic" }
  };
  return specs[target || "all"] || specs.all;
}

function visualConceptForTopic(topic, text) {
  const lower = `${topic || ""} ${text || ""}`.toLowerCase();
  if (hasAny(lower, ["etap", "digsilent", "powerfactory", "pscad", "pss/e", "psse", "skm", "easypower", "cyme", "software"])) {
    return "engineering software dashboard with a single-line diagram, load-flow arrows, short-circuit/protection study panels, and clean calculation widgets";
  }
  if (hasAny(lower, ["750 kv", "765 kv", "500 kv", "400 kv", "330 kv", "hvdc", "uhv", "ehv", "transmission"])) {
    return "large EHV grid expansion scene with 330-750 kV transmission corridors, GIS substation bays, transformers, busbars, and power-flow overlays";
  }
  if (hasAny(lower, ["transformer", "switchgear", "breaker", "gis", "sf6", "sf6-free", "hitachi", "siemens", "abb", "ge vernova", "schneider", "alstom"])) {
    return "premium OEM equipment visual with a power transformer, GIS or switchgear bay, circuit breaker, protection relay blocks, and commissioning checklist callouts";
  }
  if (hasAny(lower, ["solar", "pv", "bess", "battery", "wind", "renewable"])) {
    return "grid integration diagram combining PV or wind generation, BESS, transformer, point of interconnection, reactive power and protection constraints";
  }
  if (hasAny(lower, ["capacitor", "reactive", "power factor", "harmonic"])) {
    return "reactive power compensation diagram with capacitor bank steps, detuned reactor, harmonic spectrum, power-factor meter, and industrial load";
  }
  return "high-voltage substation engineering diagram with busbars, transformers, protection relays, SCADA/IEC 61850 blocks, and calculation checkpoints";
}

function generateFallbackSvg({ topic, target, spec }) {
  const title = normalizeSvgTitle(topic);
  const subtitle = String(target || "engineering post").replace(/_/g, " ");
  const lower = String(topic || "").toLowerCase();
  const renewable = hasAny(lower, ["solar", "wind"]);
  const software = hasAny(lower, ["etap", "digsilent", "powerfactory", "pscad", "pss/e", "psse", "skm", "easypower", "cyme", "software"]);
  const ehv = hasAny(lower, ["330", "400", "500", "525", "750", "765", "hvdc", "uhv", "ehv"]);
  const leftLabel = software ? "Model" : renewable ? "Generation" : ehv ? "EHV grid" : "Grid";
  const rightLabel = software ? "Study" : renewable ? "BESS" : ehv ? "Substation" : "Load";
  const centerLabel = software ? "Power study" : renewable ? "Grid integration" : ehv ? "330-750 kV" : "Power system";
  const width = spec?.width || 1200;
  const height = spec?.height || 1200;
  const sx = width / 1200;
  const sy = height / 1200;
  const s = Math.min(sx, sy);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#061827"/><stop offset="0.58" stop-color="#0b2a43"/><stop offset="1" stop-color="#07111e"/></linearGradient>
    <linearGradient id="panel" x1="0" x2="1"><stop offset="0" stop-color="#0f3555"/><stop offset="1" stop-color="#123f63"/></linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <g opacity="0.22" stroke="#57d7ff" stroke-width="${Math.max(1, 1.4 * s)}">
    <path d="M0 ${height * 0.18} H${width} M0 ${height * 0.36} H${width} M0 ${height * 0.54} H${width} M0 ${height * 0.72} H${width}"/>
    <path d="M${width * 0.15} 0 V${height} M${width * 0.35} 0 V${height} M${width * 0.55} 0 V${height} M${width * 0.75} 0 V${height}"/>
  </g>
  <rect x="${70 * sx}" y="${70 * sy}" width="${1060 * sx}" height="${1060 * sy}" rx="${28 * s}" fill="none" stroke="#2de2ff" stroke-width="${3 * s}" opacity="0.9"/>
  <text x="${110 * sx}" y="${145 * sy}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(28, 46 * s)}" font-weight="700" fill="#ffffff">${escapeXml(title)}</text>
  <text x="${110 * sx}" y="${200 * sy}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(18, 25 * s)}" fill="#9ee8ff">${escapeXml(subtitle)}</text>
  <line x1="${150 * sx}" y1="${610 * sy}" x2="${1050 * sx}" y2="${610 * sy}" stroke="#2de2ff" stroke-width="${10 * s}" stroke-linecap="round"/>
  <rect x="${220 * sx}" y="${482 * sy}" width="${160 * sx}" height="${255 * sy}" rx="${20 * s}" fill="#f7b733" stroke="#ffffff" stroke-width="${5 * s}"/>
  <path d="M${300 * sx} ${482 * sy} V${737 * sy} M${250 * sx} ${540 * sy} H${350 * sx} M${250 * sx} ${610 * sy} H${350 * sx} M${250 * sx} ${680 * sy} H${350 * sx}" stroke="#061827" stroke-width="${7 * s}" stroke-linecap="round"/>
  <rect x="${455 * sx}" y="${430 * sy}" width="${290 * sx}" height="${360 * sy}" rx="${30 * s}" fill="url(#panel)" stroke="#79ecff" stroke-width="${4 * s}"/>
  <text x="${600 * sx}" y="${560 * sy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(24, 36 * s)}" font-weight="700" fill="#ffffff">${escapeXml(centerLabel)}</text>
  <text x="${600 * sx}" y="${625 * sy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(18, 24 * s)}" fill="#9ee8ff">load flow</text>
  <text x="${600 * sx}" y="${670 * sy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(18, 24 * s)}" fill="#9ee8ff">protection</text>
  <circle cx="${900 * sx}" cy="${610 * sy}" r="${118 * s}" fill="#0e6f9e" stroke="#ffffff" stroke-width="${5 * s}"/>
  <path d="M${815 * sx} ${610 * sy} H${985 * sx} M${900 * sx} ${525 * sy} V${695 * sy} M${842 * sx} ${552 * sy} L${958 * sx} ${668 * sy} M${958 * sx} ${552 * sy} L${842 * sx} ${668 * sy}" stroke="#f7b733" stroke-width="${8 * s}" stroke-linecap="round"/>
  <rect x="${165 * sx}" y="${835 * sy}" width="${250 * sx}" height="${92 * sy}" rx="${14 * s}" fill="#ffffff" opacity="0.95"/>
  <rect x="${475 * sx}" y="${835 * sy}" width="${250 * sx}" height="${92 * sy}" rx="${14 * s}" fill="#ffffff" opacity="0.95"/>
  <rect x="${785 * sx}" y="${835 * sy}" width="${250 * sx}" height="${92 * sy}" rx="${14 * s}" fill="#ffffff" opacity="0.95"/>
  <text x="${290 * sx}" y="${892 * sy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(19, 27 * s)}" font-weight="700" fill="#08263d">${escapeXml(leftLabel)}</text>
  <text x="${600 * sx}" y="${892 * sy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(19, 27 * s)}" font-weight="700" fill="#08263d">Grid limits</text>
  <text x="${910 * sx}" y="${892 * sy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(19, 27 * s)}" font-weight="700" fill="#08263d">${escapeXml(rightLabel)}</text>
  <text x="${600 * sx}" y="${1010 * sy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(18, 25 * s)}" fill="#b9f3ff">Engineering decision = grid + equipment + studies + commissioning</text>
</svg>`;

  return {
    bytes: new TextEncoder().encode(svg),
    mimeType: "image/svg+xml"
  };
}

function normalizeSvgTitle(topic) {
  const lower = String(topic || "").toLowerCase();
  if (lower.includes("solar") && lower.includes("wind")) return "Solar vs Wind Generation";
  if (hasAny(lower, ["etap", "digsilent", "powerfactory", "software"])) return "Power Software Workflow";
  if (hasAny(lower, ["750", "765", "500", "330", "hvdc"])) return "EHV Grid Engineering";
  return String(topic || "Power System Engineering").replace(/\s+/g, " ").trim().slice(0, 42);
}

function hasAny(text, markers) {
  return markers.some((marker) => text.includes(marker));
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
