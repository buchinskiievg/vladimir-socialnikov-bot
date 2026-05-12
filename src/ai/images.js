export async function generateInfographicForPost({ id, topic, text, target }, env) {
  if (env.GENERATE_POST_IMAGES === "false") return null;
  if (!env.GEMINI_API_KEY || !env.MESSAGE_ARCHIVE || !env.PUBLIC_WORKER_URL) return null;

  const imagePrompt = buildInfographicPrompt({ topic, text, target });
  const image = await generateGeminiImage(imagePrompt, env);
  if (!image?.bytes?.byteLength) return null;

  const extension = image.mimeType === "image/jpeg" ? "jpg" : "png";
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
    imagePrompt
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
    "Generate a clean square engineering infographic image for a professional social media post.",
    "Audience: electrical power engineers, substation designers, power system consultants.",
    "Style: modern technical infographic, white/light background, restrained colors, IEC/utility engineering feel, no cartoon style, no people, no brand logos.",
    "Format: 1:1 square, suitable for LinkedIn, Facebook, Instagram.",
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

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
