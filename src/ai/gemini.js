export async function generatePostDraft({ topic, finding, target }, env) {
  const model = env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
  const source = finding
    ? `Title: ${finding.title || ""}\nURL: ${finding.url || ""}\nExcerpt: ${finding.excerpt || ""}`
    : "No external source. User provided the topic directly.";
  const audience = target === "linkedin_personal"
    ? "Write as a personal LinkedIn post from Evgenii Buchinskii, an electrical power engineer. Use a practical first-person professional voice when natural."
    : target === "linkedin_company"
      ? "Write as an IECCalc company page post. Use a product/engineering brand voice and connect the topic to useful engineering calculation workflows when natural."
      : "Write as a professional engineering social post.";
  const seo = seoGuidance(target);
  const platform = platformGuidance(target);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "Write professional social posts for electrical power engineers.",
              "Always write the final social post in English, even when the user topic or source context is in Russian or another language.",
              "Return exactly one ready-to-publish post.",
              "Do not provide options, alternatives, explanations, or markdown headings.",
              "Avoid hype. Do not copy source text. Mention standards only when relevant.",
              "Use the target platform's optimal length and depth. Do not make LinkedIn posts too short."
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
              `Platform writing guidance: ${platform}`,
              `SEO guidance: ${seo}`,
              "",
              source,
              "",
              "Prepare exactly one final platform-optimized post for human approval.",
              "Language: English only. Translate the user's topic into natural professional English before writing.",
              "Use the requested platform length and structure.",
              "For LinkedIn, use a strong hook, 4-6 substantial technical points, a practical takeaway, and one discussion question. LinkedIn posts must be at least the requested minimum length.",
              "For Facebook, use a practical hook, 3-5 readable points, and a simple question.",
              "For Instagram, use a concise caption that works with the infographic.",
              "For Threads, use a compact post with one sharp idea.",
              "End with the platform-appropriate number of relevant professional hashtags.",
              "",
              "Naturally include search phrases engineers might use, such as standard numbers, voltage levels, software names, equipment names, or calculation terms when relevant.",
              "Do not keyword-stuff. Do not write 'SEO', 'keywords', 'Option', 'Here are', 'choose', or any meta commentary."
            ].join("\n")
          }]
        }],
        generationConfig: {
          temperature: 0.55,
          maxOutputTokens: maxTokensForTarget(target)
        }
      })
    }
  );

  if (!response.ok) {
    return fallbackDraft(topic, finding, await response.text(), target);
  }

  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  const finalText = text || fallbackDraft(topic, finding, "empty model output", target);
  return ensurePlatformLength(finalText, { topic, target });
}

function ensurePlatformLength(text, { topic, target }) {
  const minimum = minCharsForTarget(target);
  if (!minimum || text.length >= minimum || text.includes("Gemini post generation failed")) return text;

  const needsLinkedIn = target === "linkedin_company" || target === "linkedin_personal";
  if (!needsLinkedIn) return text;

  const addition = [
    "",
    "A practical engineering checklist for this topic:",
    "",
    "* Validate the single-line diagram against the actual bay arrangement, CT/VT locations, interlocking philosophy, and protection zones.",
    "* Review short-circuit levels, protection coordination, breaker failure logic, and transformer or line differential schemes before commissioning starts.",
    "* Confirm IEC 61850 datasets, GOOSE messages, time synchronization, naming conventions, and SCADA signal mapping with real test cases, not only documentation.",
    "* Treat cybersecurity and access control as part of the commissioning scope, especially for digital substations and remote engineering access.",
    "* Keep calculation records, relay settings, test reports, and field markups traceable so future modifications do not depend on tribal knowledge.",
    "",
    `For engineering teams working on ${String(topic || "high-voltage projects")}, this is where repeatable design checks and structured calculation workflows can prevent expensive late-stage rework.`
  ].join("\n");

  return `${text.trim()}\n${addition}`;
}

function minCharsForTarget(target) {
  if (target === "linkedin_company") return 1600;
  if (target === "linkedin_personal") return 1400;
  if (target === "facebook") return 800;
  if (target === "instagram") return 600;
  if (target === "reddit") return 1100;
  return 0;
}

function platformGuidance(target) {
  if (target === "linkedin_company") {
    return [
      "Platform: LinkedIn company page.",
      "Optimal length: 1,800-2,600 characters.",
      "Depth: substantial but scannable. Use 4-6 technical bullets or short paragraphs.",
      "Tone: authoritative engineering brand voice, useful and practical, lightly connected to IECCalc workflows.",
      "Hashtags: 4-6."
    ].join(" ");
  }

  if (target === "linkedin_personal") {
    return [
      "Platform: LinkedIn personal profile.",
      "Optimal length: 1,500-2,300 characters.",
      "Depth: practical first-person engineering insight with 4-5 concrete points.",
      "Tone: human, experienced, field-aware, not salesy.",
      "Hashtags: 3-5."
    ].join(" ");
  }

  if (target === "facebook") {
    return [
      "Platform: Facebook.",
      "Optimal length: 900-1,400 characters.",
      "Depth: practical and readable, less formal than LinkedIn.",
      "Use 3-5 points and one direct question.",
      "Hashtags: 2-4."
    ].join(" ");
  }

  if (target === "instagram") {
    return [
      "Platform: Instagram.",
      "Optimal length: 700-1,100 characters.",
      "Caption should complement the infographic, not repeat every detail.",
      "Use short lines and 5-8 relevant hashtags."
    ].join(" ");
  }

  if (target === "threads") {
    return [
      "Platform: Threads.",
      "Optimal length: 250-500 characters.",
      "One clear engineering insight, compact and conversational.",
      "Hashtags: 0-2."
    ].join(" ");
  }

  if (target === "reddit") {
    return [
      "Platform: Reddit.",
      "Optimal length: 1,200-2,000 characters.",
      "Tone: discussion-first, transparent, technically useful, no promotional feel.",
      "Avoid hashtags."
    ].join(" ");
  }

  return [
    "Platform: broad social distribution.",
    "Optimal length: 1,000-1,600 characters.",
    "Make it useful, technical, and scannable.",
    "Hashtags: 3-5."
  ].join(" ");
}

function maxTokensForTarget(target) {
  if (target === "linkedin_company") return 1100;
  if (target === "linkedin_personal") return 950;
  if (target === "facebook") return 650;
  if (target === "instagram") return 550;
  if (target === "threads") return 260;
  if (target === "reddit") return 900;
  return 750;
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
              "Targets: linkedin_personal, linkedin_company, facebook, instagram, threads, reddit, all.",
              "If user asks for company and personal LinkedIn, return both targets.",
              "If user explicitly asks for Facebook, Instagram, Threads, or Reddit, use that exact target.",
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
                targets: ["linkedin_personal", "linkedin_company", "facebook", "instagram", "threads", "reddit"],
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

function fallbackDraft(topic, finding, _reason, target = "all") {
  const cleanTopic = String(topic || "high-voltage power system engineering").replace(/\s+/g, " ").trim();
  const sourceLine = finding?.url ? `\nReference: ${finding.url}` : "";

  if (target === "threads") {
    return `500 kV GIS projects are rarely limited by one calculation. The real risk is integration: IEC 61850 signals, protection zones, interlocks, SCADA mapping, and field test evidence all have to match the actual substation.`;
  }

  if (target === "instagram") {
    return [
      `A practical view on ${cleanTopic}.`,
      "",
      "For high-voltage substations, the engineering value is in the interfaces:",
      "",
      "* protection zones",
      "* IEC 61850 signal mapping",
      "* CT/VT verification",
      "* interlocking logic",
      "* commissioning evidence",
      "",
      "The cleaner the design checks, the fewer surprises appear during energization.",
      "",
      "#PowerEngineering #DigitalSubstation #GIS #ProtectionRelay #IEC61850"
    ].join("\n");
  }

  if (target === "facebook") {
    return [
      `${cleanTopic}: a few practical checks worth discussing.`,
      "",
      "On large substation projects, many issues appear at the boundary between design and commissioning:",
      "",
      "* the single-line diagram does not fully match field wiring or bay logic;",
      "* IEC 61850 datasets and GOOSE messages are tested only on paper;",
      "* relay settings, SCADA points, and interlocking logic are reviewed separately instead of as one system;",
      "* field changes are not reflected back into the calculation package.",
      "",
      "A structured workflow for short-circuit studies, protection coordination, and commissioning records can remove a lot of late-stage rework.",
      "",
      "What is usually the hardest part on your projects: design review, relay testing, SCADA integration, or documentation?",
      "",
      "#PowerEngineering #Substation #IEC61850"
    ].join("\n");
  }

  return [
    `${cleanTopic}: where engineering discipline matters most.`,
    "",
    "Commissioning a high-voltage GIS or digital substation is not only about passing individual tests. The real challenge is proving that the design, calculations, protection logic, communication model, and field installation all describe the same system.",
    "",
    "A few checks are especially important:",
    "",
    "* Validate the single-line diagram against the actual bay arrangement, CT/VT locations, interlocking philosophy, and protection zones.",
    "* Review short-circuit levels, protection coordination, breaker failure logic, and transformer or line differential schemes before commissioning starts.",
    "* Confirm IEC 61850 datasets, GOOSE messages, time synchronization, naming conventions, and SCADA signal mapping with real test cases, not only documentation.",
    "* Treat cybersecurity and access control as part of the commissioning scope, especially for digital substations and remote engineering access.",
    "* Keep calculation records, relay settings, test reports, and field markups traceable so future modifications do not depend on memory or informal notes.",
    "",
    "For 330-750 kV projects, small inconsistencies can become expensive because many disciplines meet at the same point: primary equipment, protection, automation, telecom, civil layout, and utility requirements. A repeatable engineering calculator workflow helps keep those interfaces visible.",
    sourceLine,
    "",
    "What commissioning check has saved you the most trouble on a high-voltage substation project?",
    "",
    "#PowerEngineering #DigitalSubstation #GIS #IEC61850 #ProtectionCoordination"
  ].filter(Boolean).join("\n");
}
