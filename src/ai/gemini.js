export async function generatePostDraft({ topic, finding }, env) {
  const model = env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
  const source = finding
    ? `Title: ${finding.title || ""}\nURL: ${finding.url || ""}\nExcerpt: ${finding.excerpt || ""}`
    : "No external source. User provided the topic directly.";

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

function fallbackDraft(topic, finding, reason) {
  return [
    `Draft post about: ${topic}`,
    finding?.url ? `Source: ${finding.url}` : null,
    "",
    `Gemini draft generation failed: ${reason}`,
    "Manual edit recommended before approval."
  ].filter(Boolean).join("\n");
}
