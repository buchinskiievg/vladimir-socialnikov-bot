export async function generatePostDraft({ topic, finding }, env) {
  const model = env.OPENAI_TEXT_MODEL || "gpt-4.1-mini";
  const source = finding
    ? `Title: ${finding.title || ""}\nURL: ${finding.url || ""}\nExcerpt: ${finding.excerpt || ""}`
    : "No external source. User provided the topic directly.";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "Write concise professional social posts for electrical power engineers. Avoid hype. Do not copy source text. Mention standards only when relevant."
        },
        {
          role: "user",
            content: `Prepare one final LinkedIn-style post for human approval about: ${topic}\n\n${source}\n\nStructure: strong first line, 2-4 useful technical points, practical takeaway, discussion question.`
        }
      ]
    })
  });

  if (!response.ok) {
    return fallbackDraft(topic, finding, await response.text());
  }

  const body = await response.json();
  return body.output_text || fallbackDraft(topic, finding, "empty model output");
}

function fallbackDraft(topic, finding, reason) {
  return [
    `Final post about: ${topic}`,
    finding?.url ? `Source: ${finding.url}` : null,
    "",
    `AI post generation failed: ${reason}`,
    "Manual edit recommended before approval."
  ].filter(Boolean).join("\n");
}
