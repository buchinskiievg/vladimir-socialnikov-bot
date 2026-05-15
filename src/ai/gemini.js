export async function generatePostDraft({ topic, finding, target }, env) {
  const model = env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
  const sourceBased = Boolean(finding?.url);
  const source = finding
    ? `Title: ${finding.title || ""}\nURL: ${finding.url || ""}\nExcerpt: ${finding.excerpt || ""}`
    : "No external source. User provided the topic directly.";
  const audience = sourceBased
    ? "Write as a neutral technical editor summarizing a third-party source for electrical power engineers. Do not write as Evgenii, IECCalc, the article author, or a project participant."
    : target === "linkedin_personal"
    ? "Write as a personal LinkedIn post from Evgenii Buchinskii, an electrical power engineer. Use a practical first-person professional voice when natural."
    : target === "linkedin_company"
      ? "Write as an IECCalc company page post. Use a product/engineering brand voice and connect the topic to useful engineering calculation workflows when natural."
      : "Write as a professional engineering social post.";
  const seo = seoGuidance(target);
  const platform = sourceBased ? sourceRetellingGuidance(target) : platformGuidance(target);

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
              "For source-based posts, your job is to retell the source article in your own words while preserving its meaning and content. You are not the author of the story and not a witness to the project.",
              "For source-based posts, use neutral third-person editorial voice. Do not use I, my, we, our, from our experience, my practical takeaway, or claims implying personal involvement.",
              "When an external source is provided, ground the post in that source only. Do not invent project details, equipment specifications, companies, dates, locations, or claims that are not present in the source context.",
              "If the source context is thin, write a cautious engineering takeaway from the provided material instead of pretending to know more.",
              "Use the target platform's optimal length and depth. Do not make LinkedIn posts too short.",
              "The opening must be a strong human hook, not a news-title restatement.",
              "Never start with phrases like 'The recent...', 'The development of...', 'The construction of...', 'X represents...', 'The article points to...', or '<topic>:'."
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
              finding?.url ? "Source-based article mode: first explain what the source article says in your own words, then add a short engineering context section. Preserve the article's meaning and do not change its claims." : "",
              finding?.url ? "Grounding rule: every concrete factual claim must be supported by the title, excerpt, source text, or URL context above. You may add general engineering interpretation, but clearly keep it as interpretation/checklist, not as source facts." : "",
              finding?.url ? "Voice rule: do not write as 'I', 'we', 'our team', IECCalc, Evgenii, the project owner, or the article author. Do not present general commentary as personal experience." : "",
              "Language: English only. Translate the user's topic into natural professional English before writing.",
              "Use the requested platform length and structure.",
              "Start with a standalone engineering insight, tension, or practical problem. Do not repeat the title as the first sentence.",
              "For LinkedIn, use a strong hook, 4-6 substantial technical points, a practical takeaway, and one discussion question. LinkedIn posts must be at least the requested minimum length.",
              "For Facebook, use a practical hook, 3-5 readable points, and a simple question.",
              "For Instagram, use a concise caption that works with the infographic.",
              "For Threads, use a compact post with one sharp idea.",
              finding?.url ? "Because this post is based on an external material, include the exact source URL at the end as 'Source: <url>'." : "Do not add a source line because this is a user-provided topic without an external source.",
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
  const lengthChecked = ensurePlatformLength(finalText, { topic, target, sourceBased });
  const polished = sourceBased ? sanitizeSourceBasedPost(lengthChecked, { topic, target }) : polishPostStart(lengthChecked, { topic, target });
  return ensureSourceLine(polished, finding);
}

function sanitizeSourceBasedPost(text, { topic, target } = {}) {
  let result = String(text || "")
    .replace(/\bMy practical takeaway\s*:/gi, "Engineering takeaway:")
    .replace(/\bIn my view\s*,?\s*/gi, "")
    .replace(/\bFrom my experience\s*,?\s*/gi, "")
    .replace(/\bFrom our experience\s*,?\s*/gi, "")
    .replace(/\bOur practical takeaway\s*:/gi, "Engineering takeaway:")
    .replace(/\bWe should\b/gi, "Engineering teams should")
    .replace(/\bOur team\b/gi, "Engineering teams")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (/^The article points to\b/i.test(result)) {
    result = `${openingHookForTopic(topic, target)}\n\n${stripFirstParagraph(result)}`;
  }
  return result.trim();
}

function ensureSourceLine(text, finding) {
  const url = String(finding?.url || "").trim();
  if (!url) return text;
  const clean = String(text || "").trim();
  if (clean.includes(url)) return clean;
  return `${clean}\n\nSource: ${url}`;
}

function ensurePlatformLength(text, { topic, target, sourceBased = false }) {
  const minimum = minCharsForTarget(target);
  if (!minimum || text.length >= minimum || text.includes("Gemini post generation failed")) return text;
  if (sourceBased) return text;

  const needsLinkedIn = target === "linkedin_company" || target === "linkedin_personal";
  if (!needsLinkedIn) return text;
  if (isRenewableComparisonTopic(topic)) {
    return `${text.trim()}\n${renewableComparisonChecklist(target)}`;
  }

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

function polishPostStart(text, { topic, target }) {
  const cleanTopic = cleanPostTopic(topic);
  let result = String(text || "").trim();
  if (!result) return result;

  result = result.replace(new RegExp(`^${escapeRegExp(cleanTopic)}\\s*[:\\-–—.]\\s*`, "i"), "");

  const weakStart = /^(the recent|the development of|the construction of|the rapid expansion of|the launch of|the announcement of|.+?: what engineers should look at beyond the headline)/i;
  if (weakStart.test(result)) {
    result = `${openingHookForTopic(cleanTopic, target)}\n\n${stripFirstParagraph(result)}`;
  }

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function stripFirstParagraph(text) {
  const parts = String(text || "").split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join("\n\n") : text;
}

function openingHookForTopic(topic, target) {
  const lower = String(topic || "").toLowerCase();
  if (lower.includes("data center")) {
    return "Data center load growth is no longer just a planning note; it is becoming a grid reliability constraint.";
  }
  if (lower.includes("safegrid") || lower.includes("smart grid")) {
    return "Smart grid technology matters only when it gives operators clearer visibility and faster control of real network risk.";
  }
  if (lower.includes("drone") || lower.includes("field to system")) {
    return "Drone inspections are easy to collect; the hard part is turning field data into engineering action.";
  }
  if (lower.includes("transformer")) {
    return "Transformer availability is becoming one of the quiet constraints behind grid expansion and renewable interconnection.";
  }
  if (lower.includes("solar")) {
    return "A solar project is not just panels and inverters; it is a grid connection problem with a generation asset attached.";
  }
  if (target === "linkedin_company") {
    return "The headline is only useful if it can be translated into a repeatable engineering check.";
  }
  return "The headline is only the starting point; the engineering question is what must change in design, operation, or risk control.";
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function sourceRetellingGuidance(target) {
  const base = [
    "Mode: source article retelling.",
    "Structure: 1) engaging neutral hook based on the article, 2) what the article reports in your own words, 3) why it matters for electrical engineers, 4) one discussion question, 5) source URL and relevant hashtags.",
    "Do not write as the author, project participant, Evgenii, or IECCalc.",
    "Do not turn the article into a generic checklist unless the source itself is thin; even then, label engineering points as context."
  ];

  if (target === "linkedin_company") {
    return [
      ...base,
      "Platform: LinkedIn company page.",
      "Length: 1,200-2,000 characters.",
      "Tone: neutral technical editorial, useful for engineers, not promotional."
    ].join(" ");
  }

  if (target === "linkedin_personal") {
    return [
      ...base,
      "Platform: LinkedIn personal profile.",
      "Length: 1,100-1,800 characters.",
      "Tone: informed editorial note, not first-person memoir."
    ].join(" ");
  }

  return [
    ...base,
    "Keep it concise, clear, and faithful to the source."
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
              "For LinkedIn and Facebook, strongly consider engineering software content when evidence exists: ETAP, DIgSILENT PowerFactory, PSCAD, PSS/E, SKM, EasyPower, CYME, load-flow, short-circuit, arc-flash, protection coordination, IEC 60909, IEC 61850, and practical feature reviews.",
              "Avoid solar-only selection unless the solar item is clearly the strongest available signal. Keep a balanced mix of traditional power systems, EHV grids, substations, transformers, OEM equipment, software workflows, and renewables.",
              "When two findings have similar scores, choose the one closer to 330-750 kV grids, major substation construction, transformer supply, OEM equipment, or engineering software functionality.",
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
              "You are the primary dispatcher. Do not rely on fixed command wording; infer the user's intention from natural language.",
              "Intents: create_drafts, provide_topic, auto_select_topic, revise_text, revise_image, change_topic, find_reddit_communities, cleanup_pending, status, report, pending, leads, chat.",
              "Targets: linkedin_personal, linkedin_company, facebook, instagram, threads, reddit, all.",
              "create_drafts means the user wants a new final social post/article prepared for approval. This includes any wording such as prepare, write, generate, create, make, compose, draft, пост, публикация, статья, материал.",
              "revise_text means the user wants to rewrite, shorten, expand, translate, add a source/reference/link, make more technical, change tone, or otherwise edit the text/caption of an existing pending post.",
              "revise_image means the user wants to change only the image/visual/infographic/photo/style/background/colors of an existing pending post. Do not classify this as create_drafts.",
              "change_topic means the user asks to keep the workflow/post but switch to a different topic.",
              "find_reddit_communities means the user wants to discover relevant Reddit communities/subreddits for monitoring, engagement, or posting. Extract the niche/topic if present.",
              "cleanup_pending means the user asks to remove, hide, clean up, or delete obsolete/not actual old posts from the approval queue.",
              "If user asks for company and personal LinkedIn, return both targets.",
              "If user explicitly asks for Facebook, Instagram, Threads, or Reddit, use that exact target.",
              "If user gives a topic while fast memory is waiting for topic, use intent provide_topic.",
              "If fast memory is waiting for a post topic and the user says to choose yourself, pick from monitoring, choose the best/popular topic, use algorithm, or similar, use intent auto_select_topic.",
              "If user asks to make a post from the strongest, most popular, selected, found, or monitored article/news/material, use intent auto_select_topic even if fast memory is not waiting.",
              "If the user asks to prepare/write/make a post for a platform but gives no explicit subject after words like about, pro, po teme, na temu, use intent auto_select_topic and leave topic empty. Do not reuse an old topic from memory for a new generic post request.",
              "If the user comments on what the bot already did, complains, asks why, or says something like 'you already searched', classify as chat unless they explicitly ask to create a new post or choose a new article.",
              "Do not invent a topic if none is present.",
              "If essential details are missing, still classify the intent correctly and leave missing fields empty; the assistant is allowed to ask a natural follow-up question.",
              "For create_drafts and change_topic, extract the real subject/topic, not the whole user sentence.",
              "For revise_text and revise_image, topic can be empty unless the user explicitly provides a replacement topic.",
              "For chat intent, provide a short Russian reply.",
              "Examples:",
              "'Владимир, сделай материал для LinkedIn про 500 кВ ПС' => create_drafts, topic='500 kV substation', targets=['linkedin_personal'] unless company is specified.",
              "'а картинку сделай ярче и без серого фона' => revise_image.",
              "'перепиши текст более инженерно' => revise_text.",
              "'сменим тему на HVDC converter station commissioning' => change_topic.",
              "'выбери сам из мониторинга' after a missing-topic question => auto_select_topic."
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

export async function generateClarifyingQuestion({ message, missing, fastMemory, recentMessages }, env) {
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
              "You are Vladimir Socialnikov, Evgenii's Telegram assistant.",
              "Ask one short, natural clarifying question in Russian.",
              "Do not mention JSON, commands, parsers, intents, or internal tools.",
              "Do not apologize. Do not provide a menu unless it is genuinely helpful.",
              "Use the user's wording and context. Be specific about what detail is missing.",
              "If the missing detail is a post topic, ask whether Evgenii wants to give his own topic or wants you to choose one from the most popular topics selected by the monitoring algorithm.",
              "For missing post topic, phrase the question naturally like: 'Сделать пост на твою тему или выбрать тему из самых сильных находок мониторинга?'",
              "If the missing detail is a replacement topic, ask what new topic to use.",
              "If target/social network is unclear, ask where to prepare it, but only if the topic is already clear."
            ].join(" ")
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: JSON.stringify({
              userMessage: message,
              missing,
              fastMemory,
              recentMessages
            })
          }]
        }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 180
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini clarifying question failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  return body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim() || "Уточни, пожалуйста, какой детали не хватает для задачи?";
}

export async function generateDialogueReply({ message, fastMemory, recentMessages }, env) {
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
              "You are Vladimir Socialnikov, Evgenii's Telegram assistant for social media and engineering content workflows.",
              "Reply in Russian by default, unless Evgenii asks for another language.",
              "Be conversational, useful, and concrete.",
              "You can help with: preparing final social posts, revising posts, explaining connected social networks, checking pending approvals, reports, leads, monitored topics, and asking clarifying questions.",
              "Do not claim that you published anything unless approval/publishing was actually requested and handled by the system.",
              "If the user asks for an action you cannot directly perform, explain what you can do next in one or two sentences.",
              "Do not expose secrets, tokens, internal logs, or raw JSON."
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
              availableTools: [
                "create final social post for approval",
                "revise the latest pending post",
                "show pending posts",
                "show status",
                "show daily report",
                "show leads",
                "discuss strategy and ask clarifying questions"
              ]
            })
          }]
        }],
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 450
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini dialogue reply failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  return body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim() || "Я на связи. Сформулируй, что нужно сделать, и я обработаю запрос.";
}

function fallbackDraft(topic, finding, _reason, target = "all") {
  const cleanTopic = cleanPostTopic(topic);
  const sourceLine = finding?.url ? `\nReference: ${finding.url}` : "";

  if (isRenewableComparisonTopic(cleanTopic)) {
    return polishPostStart(ensurePlatformLength(renewableComparisonPost(target, sourceLine), { topic: cleanTopic, target }), { topic: cleanTopic, target });
  }
  if (isDroneDataTopic(cleanTopic)) {
    return polishPostStart(ensurePlatformLength(droneDataPost(cleanTopic, sourceLine, target), { topic: cleanTopic, target }), { topic: cleanTopic, target });
  }

  if (target === "threads") {
    return `${cleanTopic}: the engineering value is in the practical details, not only in the headline. The key question is what this changes for design decisions, reliability, grid integration, equipment selection, or project risk.`;
  }

  if (target === "instagram") {
    return [
      `A practical view on ${cleanTopic}.`,
      "",
      "For power engineering teams, the useful questions are:",
      "",
      "* what changes in design assumptions?",
      "* what risks appear during operation?",
      "* what calculations need to be checked?",
      "* what equipment constraints matter?",
      "* what should be verified before approval?",
      "",
      "Good engineering is usually the difference between an interesting headline and a reliable project.",
      "",
      "#PowerEngineering #ElectricalEngineering #GridIntegration #SubstationDesign #Energy"
    ].join("\n");
  }

  if (target === "facebook") {
    return [
      `${cleanTopic}: a few practical checks worth discussing.`,
      "",
      "The practical engineering value is not only in the announcement itself, but in what it means for design and operation:",
      "",
      "* does it change grid connection requirements?",
      "* does it affect transformer, switchgear, protection, or control system selection?",
      "* does it introduce new constraints for short-circuit, load flow, harmonic, or reactive power studies?",
      "* does it create commissioning, maintenance, or supply chain risks?",
      "",
      "A structured engineering review helps turn industry news into practical design decisions instead of just another headline.",
      "",
      "What would you check first before applying this idea to a real project?",
      "",
      "#PowerEngineering #ElectricalEngineering #Grid"
    ].join("\n");
  }

  const sourceBased = Boolean(finding?.url);
  const fallback = genericEngineeringPost(cleanTopic, sourceLine, target, sourceBased);
  return sourceBased
    ? sanitizeSourceBasedPost(fallback)
    : polishPostStart(ensurePlatformLength(fallback, { topic: cleanTopic, target }), { topic: cleanTopic, target });
}

function cleanPostTopic(topic) {
  return String(topic || "Practical electrical engineering discussion")
    .split(/\r?\n/)[0]
    .replace(/\s+(Angle|Demand signal|Evidence):.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function genericEngineeringPost(topic, sourceLine, target, sourceBased = false) {
  const companyVoice = target === "linkedin_company";
  return [
    sourceBased ? `The article points to a practical power engineering issue: ${topic}.` : openingHookForTopic(topic, target),
    "",
    sourceBased
      ? "In simple terms, the source highlights a development that should be read not only as industry news, but as a signal for engineering review. The exact facts should stay tied to the source; the useful next step is to ask what the material changes for design, operation, or risk control."
      : "Industry news becomes useful only when it is translated into design checks, operating constraints, and project risk. For power engineering teams, the important question is not simply what happened, but what it changes in the electrical system.",
    "",
    "A practical review should usually cover:",
    "",
    "* Grid connection impact: voltage regulation, available capacity, fault levels, and reactive power requirements.",
    "* Equipment implications: transformers, switchgear, protection devices, control systems, metering, and thermal limits.",
    "* Study requirements: load flow, short-circuit, protection coordination, harmonic assessment, and contingency cases.",
    "* Delivery risk: supply chain constraints, commissioning complexity, maintainability, documentation quality, and operator readiness.",
    "* Long-term reliability: how the solution behaves after the first energization, when real operating conditions replace assumptions.",
    "",
    companyVoice
      ? "For IECCalc-style workflows, this is where structured calculation records and repeatable design checks help convert market signals into engineering decisions."
      : sourceBased
        ? "Engineering takeaway: the best discussion starts with the source material, then moves carefully into what must be verified before a similar project, product, or approach can be trusted in real operation."
        : "My practical takeaway: the best engineering conversations start when we stop treating news as a headline and start asking what must be verified before a project can safely operate.",
    sourceLine,
    "",
    "Which check would you put first for this topic: grid studies, equipment selection, protection coordination, commissioning, or supply chain risk?",
    "",
    "#PowerEngineering #ElectricalEngineering #GridIntegration #SubstationDesign #Energy"
  ].filter(Boolean).join("\n");
}

function isRenewableComparisonTopic(topic) {
  const lower = String(topic || "").toLowerCase();
  return (lower.includes("солнеч") || lower.includes("solar"))
    && (lower.includes("ветр") || lower.includes("wind"));
}

function isDroneDataTopic(topic) {
  const lower = String(topic || "").toLowerCase();
  return lower.includes("drone") || lower.includes("uav") || lower.includes("field to system");
}

function droneDataPost(topic, sourceLine, target) {
  const companyVoice = target === "linkedin_company";
  return [
    "Drone inspections are easy to collect; the hard part is turning field data into engineering action.",
    "",
    "Drones can collect impressive field data, but the real engineering value starts after the flight. Aerial inspection, thermal imagery, LiDAR, and site photos are useful only when they are connected to asset records, design drawings, maintenance history, and actionable engineering decisions.",
    "",
    "For substations, transmission lines, solar plants, and industrial facilities, the practical checks are clear:",
    "",
    "* Data quality: imagery must be georeferenced, time-stamped, and linked to the correct asset or bay, not stored as isolated folders.",
    "* Engineering context: findings should connect to single-line diagrams, equipment lists, protection zones, cable routes, or maintenance plans.",
    "* Workflow integration: inspection results need a path into CMMS, GIS, SCADA/asset systems, or project documentation.",
    "* Risk prioritization: not every visual defect has the same operational consequence; engineers still need severity logic.",
    "* Traceability: field evidence should remain usable months later when a design change, outage plan, or failure investigation starts.",
    "",
    companyVoice
      ? "For IECCalc-style workflows, this reinforces a simple principle: field data is strongest when it supports repeatable engineering checks, not when it lives as a separate media archive."
      : "My practical takeaway: drone programs should be judged less by image volume and more by how quickly the data becomes a verified engineering action.",
    sourceLine,
    "",
    "Where do you see the biggest bottleneck: data capture, asset tagging, integration with engineering tools, or turning findings into maintenance decisions?",
    "",
    "#PowerEngineering #DroneInspection #AssetManagement #SubstationMaintenance #GridReliability"
  ].filter(Boolean).join("\n");
}

function renewableComparisonPost(target, sourceLine = "") {
  const companyVoice = target === "linkedin_company";
  return [
    "Solar or wind generation: the better choice depends less on the technology itself and more on the power system around it.",
    "",
    "For engineers, the comparison should start with the grid connection point, load profile, site conditions, and dispatch requirements rather than with the headline capacity in MW.",
    "",
    "* Solar PV is usually more predictable during daylight hours, easier to modularize, and often faster to deploy. Its main engineering challenges are evening ramps, voltage control on weak grids, inverter behavior during faults, and the need for storage or flexible generation when production falls after sunset.",
    "* Wind generation can deliver strong output during evening or night periods and may complement solar well in some regions. The tradeoff is higher variability, more demanding mechanical maintenance, complex site assessment, and stronger dependence on local wind resource quality.",
    "* From a grid studies perspective, both technologies require serious attention to load flow, short-circuit contribution, protection coordination, harmonic performance, reactive power capability, and grid code compliance.",
    "* The strongest projects often combine solar, wind, BESS, and conventional grid reinforcement instead of treating one renewable source as a universal answer.",
    "",
    companyVoice
      ? "For IECCalc-style engineering workflows, the practical question is not 'solar or wind?' but 'what studies prove that this generation mix can operate reliably at the actual point of interconnection?'"
      : "My practical view: solar is often simpler to develop, wind can be more valuable when its production profile matches system demand, and the best answer usually appears only after proper grid studies.",
    sourceLine,
    "",
    "Which factor usually decides the choice in your projects: resource quality, grid capacity, storage cost, permitting, or power purchase conditions?",
    "",
    "#RenewableEnergy #PowerSystems #SolarPV #WindPower #GridIntegration"
  ].filter(Boolean).join("\n");
}

function renewableComparisonChecklist(target) {
  const companyVoice = target === "linkedin_company";
  return [
    "",
    "A practical comparison checklist:",
    "",
    "* Match the generation profile against the local demand curve, not only annual energy yield.",
    "* Check available grid capacity, voltage regulation limits, and reactive power requirements at the point of interconnection.",
    "* Model inverter behavior, fault ride-through, harmonics, and protection settings before assuming the connection is straightforward.",
    "* Compare storage needs, curtailment risk, land use, maintenance access, and seasonal resource variation.",
    companyVoice
      ? "* Use repeatable calculation workflows so early commercial assumptions can be tested against real electrical constraints."
      : "* Keep the engineering decision separate from the marketing narrative; the grid usually tells the truth first."
  ].join("\n");
}
