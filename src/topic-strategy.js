export const PLATFORM_TOPICS = {
  linkedin: [
    "major 330-750 kV substations, EHV transmission lines, HVDC converter stations, and grid expansion projects",
    "new high-voltage equipment from Hitachi Energy, Siemens Energy, ABB, GE Vernova, Schneider Electric, and other OEMs",
    "SF6-free GIS, EHV circuit breakers, large power transformers, digital substations, and protection equipment",
    "ETAP, DIgSILENT PowerFactory, SKM, EasyPower, CYME, PSS/E, PSCAD, NEPLAN professional workflows",
    "software-assisted studies: load flow, short circuit, arc flash, protection coordination, harmonics, power quality",
    "IEC and IEEE standards in practical substation, protection, grounding, and equipment design",
    "substation design mistakes, lessons learned, commissioning issues, and field-proven design checks",
    "capacitor bank sizing, harmonic resonance, detuned filters, and reactive power compensation",
    "engineering calculators, automation, templates, and repeatable design checks that reduce study errors",
    "solar PV grid connection, BESS interconnection, utility requirements, and hybrid plant studies"
  ],
  reddit: [
    "how-to questions from electrical engineers about power systems, substations, protection, grounding, and studies",
    "troubleshooting transformers, switchgear, relays, grounding, harmonics, capacitor banks, and power quality",
    "software and tool recommendations: ETAP, DIgSILENT PowerFactory, SKM, EasyPower, CYME, PSS/E, PSCAD",
    "standards interpretation: IEC, IEEE, NEC, local grid codes, utility interconnection requirements",
    "field experience, commissioning lessons, failures, outages, and practical design mistakes",
    "solar PV, BESS, inverters, grid-tie issues, and utility approval pain points"
  ],
  facebook: [
    "electrical engineering software reviews, tutorials, feature comparisons, and practical workflows",
    "ETAP, DIgSILENT PowerFactory, SKM, EasyPower, CYME, PSS/E, PSCAD, NEPLAN, PVsyst, HelioScope workflows",
    "power system studies software: load flow, short circuit, arc flash, protection coordination, harmonics, power quality",
    "calculator and template recommendations for electrical design, substation studies, and solar interconnection",
    "solar installer, C&I solar, BESS, off-grid, inverter, battery, and utility interconnection pain points",
    "equipment selection: transformers, switchgear, protection relays, inverters, batteries, panels, capacitor banks",
    "local code, permitting, utility approval, grid connection documentation, and design help leads",
    "cost, payback, reliability, equipment failures, and real project lessons"
  ],
  instagram: [
    "visual engineering explainers for substations, protection, grounding, capacitor banks, and grid studies",
    "before/after design checks, calculation snapshots, and engineering workflow diagrams",
    "330-750 kV substations, GIS, transformers, circuit breakers, HVDC, and digital substation visuals",
    "ETAP, DIgSILENT PowerFactory, SKM, EasyPower, CYME, PSS/E workflow snapshots and software tips",
    "solar PV, BESS, grid connection, and inverter study visuals",
    "IECCalc product visuals, calculator use cases, and short standards explainers"
  ],
  threads: [
    "short technical opinions on power engineering news, grid construction, OEM launches, and standards",
    "quick practical tips for substation, protection, grounding, capacitor bank, and software workflows",
    "myths and mistakes in reactive power, harmonics, PV, BESS, grounding, and protection coordination",
    "questions that invite engineer discussion and field experience",
    "commentary on 330-750 kV projects, HVDC, SF6-free GIS, transformers, and digital substations",
    "lightweight IECCalc product updates and calculator-based engineering insights"
  ],
  forums: [
    "detailed troubleshooting and design questions from engineers, contractors, utilities, and plant owners",
    "substation, transformer, switchgear, grounding, protection, relay coordination, and commissioning cases",
    "330-750 kV transmission, substation construction, HVDC, GIS, transformers, and EHV equipment",
    "high-voltage OEM equipment news from Hitachi Energy, Siemens Energy, ABB, GE Vernova, Schneider Electric, and Alstom Grid",
    "ETAP, DIgSILENT PowerFactory, SKM, EasyPower, CYME, PSS/E, PSCAD, NEPLAN software questions",
    "standards and calculation interpretation questions: IEC, IEEE, NEC, grid codes, utility specs",
    "equipment failures, harmonics, resonance, capacitor banks, power quality, and arc flash",
    "regional solar PV, BESS, grid connection, permitting, and utility approval problems",
    "requests for design software, calculators, templates, studies, and consultant help"
  ]
};

export const FINAL_TOPIC_WEIGHTS = {
  linkedin: [1.45, 1.4, 1.35, 1.3, 1.25, 1.2, 1.15, 1.1, 1.05, 0.85],
  reddit: [1.25, 1.2, 1.2, 1.1, 1.05, 0.9],
  facebook: [1.35, 1.3, 1.25, 1.2, 1.0, 1.0, 0.95, 0.9],
  instagram: [1.25, 1.2, 1.2, 1.15, 1.0, 0.95],
  threads: [1.25, 1.15, 1.1, 1.05, 1.15, 0.9],
  forums: [1.25, 1.3, 1.35, 1.3, 1.2, 1.15, 1.15, 0.95, 1.0]
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
