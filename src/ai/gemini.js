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
  const seo = seoGuidance(target);

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
              `SEO guidance: ${seo}`,
              "",
              source,
              "",
              "Prepare exactly one final LinkedIn-style post for human approval.",
              "Use this structure:",
              "1. Strong first line.",
              "2. Three short technical points.",
              "3. Practical takeaway.",
              "4. One discussion question.",
              "5. End with 3-6 relevant professional hashtags.",
              "",
              "Naturally include search phrases engineers might use, such as standard numbers, voltage levels, software names, equipment names, or calculation terms when relevant.",
              "Do not keyword-stuff. Do not use more than 6 hashtags. Do not write 'SEO', 'keywords', 'Option', 'Here are', 'choose', or any meta commentary."
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

function seoGuidance(target) {
  if (target === "linkedin_company") {
    return [
      "Prefer searchable product/engineering phrases for IECCalc: electrical engineering calculations, IEC calculator, power system studies, capacitor bank sizing, short circuit calculation, protection coordination, load flow study.",
      "When natural, include one soft website-oriented phrase such as 'engineering calculator workflow' or 'repeatable design check'."
    ].join(" ");
  }

  if (target === "linkedin_personal") {
    return [
      "Prefer searchable professional phrases: substation design, power system studies, IEC standards, ETAP, DIgSILENT PowerFactory, protection coordination, reactive power compensation, HVDC, GIS, transformer, switchgear.",
      "Keep the voice human and expert, not promotional."
    ].join(" ");
  }

  return [
    "Use searchable engineering terms: substation design, power system studies, IEC standards, ETAP, DIgSILENT PowerFactory, short circuit, load flow, arc flash, protection coordination, capacitor bank sizing, HVDC, GIS, transformer, switchgear, solar PV, BESS.",
    "Add only relevant hashtags."
  ].join(" ");
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
              "If a post request has no concrete topic, set topic to empty string and needs_topic true.",
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

export async function revisePostDraft({ draft, instruction }, env) {
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
              "You revise professional LinkedIn posts for electrical power engineers.",
              "Return exactly one complete ready-to-publish revised post.",
              "Do not explain changes. Do not include options or headings.",
              "Preserve the user's requested direction and keep the post technically credible."
            ].join(" ")
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: [
              `Post ID: ${draft.id}`,
              `Topic: ${draft.topic}`,
              `Target: ${draft.target || "all"}`,
              "",
              "Original post:",
              draft.text,
              "",
              "User revision request:",
              instruction
            ].join("\n")
          }]
        }],
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 700
        }
      })
    }
  );

  if (!response.ok) {
    return [
      draft.text,
      "",
      `Gemini revision failed: ${await response.text()}`,
      "Manual edit recommended before approval."
    ].join("\n");
  }

  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  return text || draft.text;
}

export async function generateDemandTopics({ findings }, env) {
  const model = env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
  const compactFindings = findings.slice(0, 40).map((finding) => ({
    title: finding.title || "",
    excerpt: String(finding.excerpt || finding.fullText || "").slice(0, 900),
    url: finding.url || "",
    score: finding.score || 0,
    scoring: finding.scoring?.components || {},
    platform: finding.platform || "",
    sourceTopic: finding.topic || ""
  }));

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "You analyze demand signals from engineering forums, Reddit, news, and public discussions.",
              "Find post topics that users currently care about in electrical power engineering.",
              "Return only valid compact JSON.",
              "Prefer practical pain points: questions, repeated confusion, design choices, calculations, standards, tools, failures.",
              "Also prioritize major grid construction and OEM equipment news: 330-750 kV substations, EHV/UHV/HVDC lines, transformers, GIS, breakers, SF6-free gear, digital substations, and announcements from ABB, Siemens Energy, Hitachi Energy, GE Vernova, Schneider Electric, Alstom Grid, and similar brands.",
              "Do not invent demand that is not supported by the findings."
            ].join(" ")
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: JSON.stringify({
              requiredJsonShape: {
                topics: [{
                  topic: "string",
                  angle: "string",
                  demandReason: "string",
                  target: "linkedin_personal or linkedin_company",
                  evidenceUrls: ["string"],
                  score: 0,
                  whyPopular: "string"
                }]
              },
              findings: compactFindings
            })
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 900,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini demand analysis failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  return JSON.parse(text || "{\"topics\":[]}");
}

export async function parseDialogueTurn({ message, fastMemory, recentMessages }, env) {
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
              "You are Vladimir Socialnikov, a Telegram assistant for Evgenii's social media workflow.",
              "Understand natural Russian and English conversation.",
              "Return only compact valid JSON.",
              "Intents: create_drafts, provide_topic, status, report, pending, leads, chat.",
              "Targets: linkedin_personal, linkedin_company, all.",
              "If user asks for company and personal LinkedIn, return both targets.",
              "If user gives a topic while fast memory is waiting for topic, use intent provide_topic.",
              "Do not invent a topic if none is present.",
              "For chat intent, provide a short Russian reply."
            ].join(" ")
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: JSON.stringify({
              message,
              fastMemory,
              recentMessages,
              requiredJsonShape: {
                intent: "string",
                topic: "string",
                targets: ["linkedin_personal", "linkedin_company"],
                reply: "string"
              }
            })
          }]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 500,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini dialogue parse failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  return JSON.parse(text || "{}");
}

function fallbackDraft(topic, finding, reason) {
  return [
    `Final post about: ${topic}`,
    finding?.url ? `Source: ${finding.url}` : null,
    "",
    `Gemini post generation failed: ${reason}`,
    "Manual edit recommended before approval."
  ].filter(Boolean).join("\n");
}
