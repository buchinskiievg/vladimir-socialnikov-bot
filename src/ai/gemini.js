export async function generatePostDraft({ topic, finding, target }, env) {
  const model = env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
  const source = finding
    ? `Title: ${finding.title || ""}\nURL: ${finding.url || ""}\nExcerpt: ${finding.excerpt || ""}`
    : "No external source. User provided the topic directly.";
  const audience = target === "linkedin_personal"
    ? "Write as a personal LinkedIn post from Evgenii Buchinskii, an electrical power engineer. Use a practical first-person professional voice when natural."
    : target === "linkedin_company"
      ? "Write as an IECCalc company page post. Use a product/engineering brand voice and connect the topic to useful engineering calculation workflows when natural."
      : "Write as a professional LinkedIn-style post.";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "Write concise professional social posts for electrical power engineers.",
              "Return exactly one ready-to-publish post.",
              "Do not provide options, alternatives, explanations, or markdown headings.",
              "Avoid hype. Do not copy source text. Mention standards only when relevant."
            ].join(" ")
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: [
              `Topic: ${topic}`,
              `Target: ${target || "general"}`,
              `Audience: ${audience}`,
              "",
              source,
              "",
              "Prepare exactly one LinkedIn-style post draft.",
              "Use this structure:",
              "1. Strong first line.",
              "2. Three short technical points.",
              "3. Practical takeaway.",
              "4. One discussion question.",
              "",
              "Do not write 'Option', 'Here are', 'choose', or any meta commentary."
            ].join("\n")
          }]
        }],
        generationConfig: {
          temperature: 0.55,
          maxOutputTokens: 700
        }
      })
    }
  );

  if (!response.ok) {
    return fallbackDraft(topic, finding, await response.text());
  }

  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  return text || fallbackDraft(topic, finding, "empty model output");
}

export async function parseNaturalIntent(message, env) {
  const model = env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "You parse Russian/English Telegram messages for a social media assistant.",
              "Return only valid compact JSON.",
              "Supported intents:",
              "create_drafts, status, pending, report, leads, unknown.",
              "Targets: linkedin_personal, linkedin_company, all.",
              "If the user asks for LinkedIn company and personal account, include both targets.",
              "Extract the concrete topic after Russian markers like 'про', 'о', 'на тему', 'по теме'.",
              "Example: 'подготовь публикацию для LinkedIn компании и персонального аккаунта про компенсацию реактивной мощности' means topic='компенсация реактивной мощности' and targets=['linkedin_company','linkedin_personal'].",
              "If a draft request has no concrete topic, set topic to empty string and needs_topic true.",
              "Do not invent topics."
            ].join(" ")
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: [
              "Parse this message into JSON with fields:",
              "{ \"intent\": string, \"topic\": string, \"targets\": string[], \"needs_topic\": boolean }",
              "",
              message
            ].join("\n")
          }]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 300,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini intent parse failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  return JSON.parse(text || "{}");
}

function fallbackDraft(topic, finding, reason) {
  return [
    `Draft post about: ${topic}`,
    finding?.url ? `Source: ${finding.url}` : null,
    "",
    `Gemini draft generation failed: ${reason}`,
    "Manual edit recommended before approval."
  ].filter(Boolean).join("\n");
}
