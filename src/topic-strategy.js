export const PLATFORM_TOPICS = {
  linkedin: [
    "IEC standards in practical electrical design",
    "substation design mistakes and lessons learned",
    "capacitor bank sizing and reactive power compensation",
    "short-circuit, load flow, and protection coordination workflows",
    "solar PV grid connection and utility requirements",
    "engineering calculators and repeatable design checks"
  ],
  reddit: [
    "how-to questions from electrical engineers",
    "career and field experience in power systems",
    "troubleshooting transformers, switchgear, relays, and grounding",
    "solar PV design, inverters, batteries, and grid-tie issues",
    "standards interpretation: IEC, IEEE, NEC, local grid codes",
    "software/tool recommendations and calculation workflows"
  ],
  facebook: [
    "solar installer and electrical contractor pain points",
    "off-grid and C&I solar design questions",
    "equipment selection: inverters, batteries, panels, switchgear",
    "electrical engineering software reviews and tool comparisons",
    "ETAP, DIgSILENT PowerFactory, SKM, EasyPower, CYME, PSS/E, PVsyst, HelioScope workflows",
    "power system studies software: load flow, short circuit, arc flash, protection coordination",
    "calculator and template recommendations for electrical design",
    "local code, permitting, and utility interconnection",
    "service leads: design help, calculations, documentation",
    "cost, payback, and reliability discussions"
  ],
  instagram: [
    "visual engineering explainers",
    "before/after design checks and calculation snapshots",
    "common mistakes in solar and substation design",
    "short standards explainers for engineers",
    "field photos with technical lessons",
    "IECCalc product visuals and calculator use cases"
  ],
  threads: [
    "short technical opinions on power engineering news",
    "quick practical tips for electrical designers",
    "myths and mistakes in reactive power, PV, grounding, and protection",
    "questions that invite engineer discussion",
    "commentary on standards and grid connection trends",
    "lightweight product/engineering updates"
  ],
  forums: [
    "detailed troubleshooting and design questions",
    "regional solar PV installation and grid connection problems",
    "substation, transformer, switchgear, grounding, and protection cases",
    "standards and calculation interpretation questions",
    "equipment failures, harmonics, resonance, and power quality",
    "requests for design software, calculators, and consultant help"
  ]
};

export const PLATFORM_SOURCE_MAP = {
  reddit: "reddit",
  forum: "forums",
  news: "linkedin",
  rss: "linkedin",
  facebook_group: "facebook",
  facebook_search: "facebook",
  classifieds: "facebook"
};

export function platformForSourceType(sourceType) {
  return PLATFORM_SOURCE_MAP[sourceType] || "forums";
}
