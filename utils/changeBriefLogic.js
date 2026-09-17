"use strict";

const {
  analyzeLocalSignals,
  constrainMoodScaleLanguage,
  extractObservationalSignals,
  formatReportSectionsMarkdown,
  getTagFrequency,
} = require("./sessionBriefLogic");

const WINDOW_LABELS = {
  firstVisit: "First visit",
  sinceLastBrief: "Since last Brief",
  sinceLastWeek: "Since last week",
};

const POLARITIES = ["improved", "worse", "new", "stable"];
const CONCERNS = ["none", "monitor", "elevated"];
const SOURCE_TYPES = ["diary", "chat"];

const SAFETY_RULES = [
  {
    kind: "si",
    label: "Suicidal ideation language",
    re: /suicid|kill myself|end my life|better off dead|want to die|don't want to be alive|dont want to be alive|no reason to live/i,
  },
  {
    kind: "self-harm",
    label: "Self-harm language",
    re: /self-harm|self harm|cut myself|hurt myself|hitting myself|starve myself/i,
  },
];

const THEME_DEFS = [
  {
    id: "school",
    label: "School / academic pressure",
    tags: ["school"],
    keywords: ["exam", "homework", "school", "teacher", "dse", "grade", "assignment"],
  },
  {
    id: "family",
    label: "Family relationships",
    tags: ["family"],
    keywords: ["mum", "mom", "dad", "mother", "father", "parents", "family", "home"],
  },
  {
    id: "friends",
    label: "Peer relationships",
    tags: ["friends"],
    keywords: ["friend", "friends", "lonely", "left out", "bullied", "classmate"],
  },
  {
    id: "anxiety",
    label: "Anxiety and worry",
    tags: ["anxiety"],
    keywords: ["anxious", "anxiety", "worried", "panic", "overthinking", "nervous", "scared"],
  },
  {
    id: "lonely",
    label: "Loneliness / isolation",
    tags: ["lonely"],
    keywords: ["lonely", "alone", "left out", "no one", "isolated"],
  },
  {
    id: "procrastination",
    label: "Procrastination / avoidance",
    tags: ["procrastination"],
    keywords: ["procrastinat", "avoid", "can't start", "cant start", "put off"],
  },
  {
    id: "mood",
    label: "Mood",
    tags: [],
    keywords: ["sad", "depressed", "down", "hopeless", "empty", "better", "okay", "ok"],
  },
  {
    id: "sleep",
    label: "Sleep",
    tags: [],
    keywords: ["sleep", "insomnia", "nightmare", "tired", "exhausted"],
  },
];

const IMPROVED_RE =
  /\b(better|easier|improving|helped|relieved|felt okay|felt ok|less anxious|slept better|lighter|managed|proud)\b/i;
const WORSE_RE =
  /\b(worse|harder|stuck|can't|cant|exhausted|hopeless|panic|terrified|hate|failing|falling behind|can't sleep|cant sleep)\b/i;
const INVENTED_SCALE_RE =
  /\b(?:HAM-D|HAM-A|HAMD|HAMA|PHQ-?9|GAD-?7|BDI-Y|SBQ-R)\s*[:#]?\s*\d+(?:\s*\/\s*\d+)?/gi;

function asText(value) {
  return String(value || "").trim();
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map(asText).filter(Boolean)));
}

function clipQuote(text, max = 140) {
  const cleaned = asText(text).replace(/\s+/g, " ");
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

function stripInventedScales(text) {
  return constrainMoodScaleLanguage(asText(text))
    .replace(INVENTED_SCALE_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function walkStrings(value, fn) {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((item) => walkStrings(item, fn));
  if (value && typeof value === "object") {
    const next = {};
    Object.entries(value).forEach(([key, child]) => {
      next[key] = walkStrings(child, fn);
    });
    return next;
  }
  return value;
}

function extractJsonObject(text) {
  const trimmed = asText(text);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function mapSourceType(raw) {
  const value = asText(raw).toLowerCase();
  if (value === "diary") return "diary";
  if (
    value === "chat" ||
    value === "check-in" ||
    value === "checkin" ||
    value === "chat-report"
  ) {
    return "chat";
  }
  return SOURCE_TYPES.includes(value) ? value : "chat";
}

function normalizeEvidence(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = clipQuote(stripInventedScales(raw.text));
  if (!text) return null;
  return {
    text,
    sourceType: mapSourceType(raw.sourceType || raw.source),
    sourceId: asText(raw.sourceId || raw.id || raw.file) || null,
    createdAt: asText(raw.createdAt || raw.date) || null,
  };
}

function normalizePolarity(value) {
  const raw = asText(value).toLowerCase();
  if (raw === "harder" || raw === "stuck" || raw === "harderorstuck") {
    return "worse";
  }
  return POLARITIES.includes(raw) ? raw : "stable";
}

function normalizeTheme(raw, fallbackPolarity = "stable") {
  if (typeof raw === "string") {
    const label = stripInventedScales(raw);
    if (!label) return null;
    return {
      label,
      polarity: fallbackPolarity,
      claim: label,
      evidence: [],
    };
  }
  if (!raw || typeof raw !== "object") return null;
  const label = stripInventedScales(raw.label || raw.theme || raw.title);
  const claim = stripInventedScales(raw.claim || raw.note || label);
  if (!label && !claim) return null;
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : [])
    .map(normalizeEvidence)
    .filter(Boolean)
    .slice(0, 2);
  return {
    label: label || "Theme",
    polarity: normalizePolarity(raw.polarity || fallbackPolarity),
    claim: claim || label || "Theme",
    evidence,
  };
}

function normalizeConcern(value) {
  const raw = asText(value).toLowerCase();
  return CONCERNS.includes(raw) ? raw : "none";
}

function escalateConcern(a, b) {
  const rank = { none: 0, monitor: 1, elevated: 2 };
  return rank[b] > rank[a] ? b : a;
}

function normalizeSafetyItem(raw) {
  if (typeof raw === "string") {
    const text = stripInventedScales(raw);
    if (!text) return null;
    return { kind: "other", text };
  }
  if (!raw || typeof raw !== "object") return null;
  const text = stripInventedScales(raw.text || raw.label || raw.note);
  if (!text) return null;
  const kind = asText(raw.kind).toLowerCase();
  const allowed = ["si", "self-harm", "other", "open"];
  return {
    kind: allowed.includes(kind) ? kind : "other",
    text,
  };
}

function emptySafetySummary() {
  return {
    concern: "none",
    siOrSelfHarm: false,
    otherRisk: false,
    items: [],
    stillOpen: [],
  };
}

function normalizeSafetySummary(raw) {
  const base = emptySafetySummary();
  if (!raw || typeof raw !== "object") return base;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normalizeSafetyItem)
    .filter(Boolean);
  const stillOpen = (Array.isArray(raw.stillOpen) ? raw.stillOpen : [])
    .map((item) =>
      typeof item === "string"
        ? stripInventedScales(item)
        : stripInventedScales(item?.text)
    )
    .filter(Boolean);
  const siOrSelfHarm =
    Boolean(raw.siOrSelfHarm) ||
    items.some((item) => item.kind === "si" || item.kind === "self-harm");
  const otherRisk =
    Boolean(raw.otherRisk) || items.some((item) => item.kind === "other");
  let concern = normalizeConcern(raw.concern);
  if (siOrSelfHarm) concern = escalateConcern(concern, "elevated");
  else if (otherRisk || stillOpen.length) {
    concern = escalateConcern(concern, "monitor");
  }
  return {
    concern,
    siOrSelfHarm,
    otherRisk,
    items,
    stillOpen,
  };
}

function sourceIdOf(item) {
  return asText(item?.file || item?.id || item?.sourceId) || "";
}

function collectSourceIds({ entries = [], checkIns = [], summaries = [] } = {}) {
  return uniqueStrings([
    ...(entries || []).map(sourceIdOf),
    ...(checkIns || []).map(sourceIdOf),
    ...(summaries || []).map(sourceIdOf),
  ]);
}

function timestampOf(item) {
  if (item?.createdAt) {
    const parsed = Date.parse(item.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (item?.date) {
    const parsed = Date.parse(`${item.date}T23:59:59`);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function filterInputsSinceSnapshot(inputs = {}, snapshot = null) {
  if (!snapshot) return inputs;
  const seen = new Set(snapshot.sourceEntryIds || []);
  const keepById = (item) => {
    const id = sourceIdOf(item);
    if (id && seen.has(id)) return false;
    return true;
  };
  if (seen.size === 0) {
    const start = Date.parse(snapshot.windowEnd || snapshot.createdAt || 0);
    const keepByTime = (item) => timestampOf(item) >= start;
    return {
      ...inputs,
      entries: (inputs.entries || []).filter(keepByTime),
      checkIns: (inputs.checkIns || []).filter(keepByTime),
      summaries: (inputs.summaries || []).filter(keepByTime),
    };
  }
  return {
    ...inputs,
    entries: (inputs.entries || []).filter(keepById),
    checkIns: (inputs.checkIns || []).filter(keepById),
    summaries: (inputs.summaries || []).filter(keepById),
  };
}

function filterInputsSinceLastWeek(inputs = {}, now = new Date()) {
  const start = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const keep = (item) => timestampOf(item) >= start;
  return {
    ...inputs,
    entries: (inputs.entries || []).filter(keep),
    checkIns: (inputs.checkIns || []).filter(keep),
    summaries: (inputs.summaries || []).filter(keep),
  };
}

function collectEvidenceItems({ entries = [], checkIns = [], summaries = [] } = {}) {
  const items = [];
  (entries || []).forEach((entry) => {
    const text = asText(entry.response);
    if (!text) return;
    items.push({
      text,
      sourceType: "diary",
      sourceId: sourceIdOf(entry) || `diary-${entry.date || "undated"}`,
      createdAt: entry.createdAt || entry.date || null,
      date: entry.date || null,
      mood: entry.mood,
      tags: entry.tags || [],
    });
  });
  (checkIns || []).forEach((checkIn) => {
    (checkIn.messages || []).forEach((msg, index) => {
      if (msg.role !== "user" || !asText(msg.text)) return;
      items.push({
        text: asText(msg.text),
        sourceType: "chat",
        sourceId: sourceIdOf(checkIn) || `checkin-${checkIn.date || "undated"}-${index}`,
        createdAt: checkIn.createdAt || checkIn.date || null,
        date: checkIn.date || null,
        mood: null,
        tags: [],
      });
    });
  });
  (summaries || []).forEach((summary) => {
    if (!asText(summary.content)) return;
    items.push({
      text: asText(summary.content),
      sourceType: "chat",
      sourceId: sourceIdOf(summary) || `report-${summary.date || "undated"}`,
      createdAt: summary.date || null,
      date: summary.date || null,
      mood: null,
      tags: [],
    });
  });
  return items;
}

function scanSafety(items = [], priorSnapshot = null) {
  const hits = [];
  (items || []).forEach((item) => {
    SAFETY_RULES.forEach((rule) => {
      if (rule.re.test(item.text || "")) {
        hits.push({
          kind: rule.kind,
          text: `${rule.label} in ${item.sourceType}${item.date ? ` (${item.date})` : ""}`,
          evidence: normalizeEvidence(item),
        });
      }
    });
  });
  const uniqueItems = [];
  const seen = new Set();
  hits.forEach((hit) => {
    const key = `${hit.kind}:${hit.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniqueItems.push({ kind: hit.kind, text: hit.text });
  });

  const priorSafety = normalizeSafetySummary(priorSnapshot?.safetySummary);
  const stillOpen = [];
  if (priorSafety.siOrSelfHarm && !uniqueItems.some((item) => item.kind === "si" || item.kind === "self-harm")) {
    stillOpen.push(
      "Prior Brief flagged suicidal ideation or self-harm language — still open until reviewed in the room."
    );
  }
  (priorSafety.stillOpen || []).forEach((text) => {
    if (!stillOpen.includes(text)) stillOpen.push(text);
  });
  (priorSafety.items || []).forEach((item) => {
    if (item.kind === "open" && item.text && !stillOpen.includes(item.text)) {
      stillOpen.push(item.text);
    }
  });

  const siOrSelfHarm = uniqueItems.some(
    (item) => item.kind === "si" || item.kind === "self-harm"
  );
  let concern = "none";
  if (siOrSelfHarm) concern = "elevated";
  else if (uniqueItems.length || stillOpen.length) concern = "monitor";

  return {
    concern,
    siOrSelfHarm,
    otherRisk: uniqueItems.some((item) => item.kind === "other"),
    items: uniqueItems.slice(0, 6),
    stillOpen: stillOpen.slice(0, 4),
  };
}

function themeDefForLabel(label) {
  const norm = asText(label).toLowerCase();
  return (
    THEME_DEFS.find(
      (def) =>
        def.label.toLowerCase() === norm ||
        def.id === norm ||
        def.tags.some((tag) => tag === norm)
    ) || null
  );
}

function itemMatchesTheme(item, def) {
  if (!def) return false;
  const tags = item.tags || [];
  if (def.tags.some((tag) => tags.includes(tag))) return true;
  const hay = `${item.text || ""}`.toLowerCase();
  return def.keywords.some((keyword) => hay.includes(keyword));
}

function evidenceForTheme(items, def, limit = 2) {
  if (!def) {
    return (items || [])
      .slice(-limit)
      .map(normalizeEvidence)
      .filter(Boolean);
  }
  const hits = [];
  (items || []).forEach((item) => {
    if (hits.length >= limit) return;
    if (itemMatchesTheme(item, def)) {
      const evidence = normalizeEvidence(item);
      if (evidence) hits.push(evidence);
    }
  });
  return hits;
}

function presentThemesFromInputs(inputs, items) {
  const tags = Object.keys(getTagFrequency(inputs.entries || []));
  const signals = extractObservationalSignals(items);
  const fromTags = THEME_DEFS.filter((def) =>
    def.tags.some((tag) => tags.includes(tag))
  );
  const fromSignals = THEME_DEFS.filter((def) => {
    if (fromTags.includes(def)) return false;
    return (items || []).some((item) => itemMatchesTheme(item, def) && def.id !== "mood");
  });
  const fromKeywords = signals
    .map((signal) => THEME_DEFS.find((def) => def.id === signal.id))
    .filter(Boolean);
  const list = [];
  const seen = new Set();
  [...fromTags, ...fromSignals, ...fromKeywords].forEach((def) => {
    if (!def || seen.has(def.id)) return;
    seen.add(def.id);
    list.push(def);
  });
  return list.slice(0, 6);
}

function moodClaim(windowMood, priorMood) {
  if (!windowMood || windowMood.count === 0) return null;
  if (!priorMood || priorMood.count === 0) {
    return {
      label: "Mood",
      polarity: "new",
      claim: `Self-rated journal mood ${windowMood.average}/10 across ${windowMood.count} day(s) in this window.`,
    };
  }
  const delta = windowMood.average - priorMood.average;
  let polarity = "stable";
  if (delta >= 1.5) polarity = "improved";
  else if (delta <= -1.5) polarity = "worse";
  if (polarity === "stable") return null;
  return {
    label: "Mood",
    polarity,
    claim:
      polarity === "improved"
        ? `Self-rated mood lifted to ${windowMood.average}/10 (was ${priorMood.average}/10).`
        : `Self-rated mood dropped to ${windowMood.average}/10 (was ${priorMood.average}/10).`,
  };
}

function claimForTheme(def, polarity, windowMood) {
  const moodBit =
    windowMood?.count > 0 ? ` Journal mood in window: ${windowMood.average}/10.` : "";
  if (polarity === "improved") {
    return `${def.label} looks lighter than last Brief.${moodBit}`;
  }
  if (polarity === "worse") {
    return `${def.label} looks harder or stuck since last Brief.${moodBit}`;
  }
  if (polarity === "new") {
    return `${def.label} showed up in notes since last Brief.${moodBit}`;
  }
  return `${def.label} is still present.${moodBit}`;
}

function polarityForTheme(def, { priorTheme, items, windowMood, priorMood }) {
  const matched = (items || []).filter((item) => itemMatchesTheme(item, def));
  const improvedLang = matched.some((item) => IMPROVED_RE.test(item.text));
  const worseLang = matched.some((item) => WORSE_RE.test(item.text));
  if (!priorTheme) return "new";
  if (improvedLang && !worseLang) return "improved";
  if (worseLang) return "worse";
  if (windowMood?.count && priorMood?.count) {
    if (windowMood.average - priorMood.average >= 1.5) return "improved";
    if (priorMood.average - windowMood.average >= 1.5) return "worse";
  }
  if (priorTheme.polarity === "worse" || priorTheme.polarity === "new") {
    return "worse";
  }
  return "stable";
}

function buildUnknowns({ kind, analysis, safety, themes, items }) {
  const unknowns = [];
  if (safety.siOrSelfHarm) {
    unknowns.push("Intent, plan, and current supports around the safety language.");
  }
  if (!(analysis?.dataSources?.diaryEntries > 0)) {
    unknowns.push("No diary entries yet — what a typical day looks like.");
  }
  if (kind === "baseline") {
    unknowns.push("Age, living situation, and school year were not stored.");
  }
  if (!(themes || []).some((theme) => /sleep/i.test(theme.label))) {
    unknowns.push("Sleep pattern this week.");
  }
  if ((items || []).length < 2) {
    unknowns.push("Not much in their own words yet — what they want you to understand today.");
  }
  if (unknowns.length === 0) {
    unknowns.push("What changed that would not show up in diary tags.");
  }
  return uniqueStrings(unknowns).slice(0, 5);
}

function buildSessionFocus({ kind, safety, themes, unknowns }) {
  const bullets = [];
  if (safety.siOrSelfHarm || safety.concern === "elevated") {
    bullets.push("Check safety in the room: current thoughts, plan, and who they can tell.");
  } else if (safety.stillOpen?.length) {
    bullets.push("Revisit still-open safety items from the last Brief.");
  }
  (themes || [])
    .filter((theme) => theme.polarity === "worse")
    .slice(0, 2)
    .forEach((theme) => {
      bullets.push(`Clarify what is harder with ${theme.label.toLowerCase()}.`);
    });
  (themes || [])
    .filter((theme) => theme.polarity === "new")
    .slice(0, 2)
    .forEach((theme) => {
      bullets.push(`Ask what is new about ${theme.label.toLowerCase()}.`);
    });
  (themes || [])
    .filter((theme) => theme.polarity === "improved")
    .slice(0, 1)
    .forEach((theme) => {
      bullets.push(`Name what helped with ${theme.label.toLowerCase()} so it can be repeated.`);
    });
  (unknowns || []).slice(0, 2).forEach((item) => {
    if (bullets.length >= 5) return;
    bullets.push(`Clarify: ${item.replace(/\.$/, "")}.`);
  });
  if (kind === "baseline" && bullets.length < 3) {
    bullets.push("What felt heaviest coming in today?");
    bullets.push("Is there anything they do not want missed before you finish?");
  }
  if (bullets.length < 3) {
    bullets.push("What felt heaviest since last contact, and what helped even a little?");
  }
  if (bullets.length < 3) {
    bullets.push("If you only had time for one thing, what should it be?");
  }
  return uniqueStrings(bullets).slice(0, 5);
}

function emptyChangeBrief(kind = "baseline") {
  return {
    kind,
    windowLabel:
      kind === "change" ? WINDOW_LABELS.sinceLastBrief : WINDOW_LABELS.firstVisit,
    windowStart: null,
    windowEnd: null,
    emptyWindow: false,
    safetySummary: emptySafetySummary(),
    themes: [],
    presentingConcerns: [],
    unknowns: [],
    sessionFocus: [
      "What felt heaviest since last contact, and what helped even a little?",
      "Is there anything they do not want missed today?",
      "If you only had time for one thing, what should it be?",
    ],
    sourceEntryIds: [],
    moodSummary: null,
    tagFrequency: {},
  };
}

function buildBaselineBrief({ inputs, analysis, items, now }) {
  const safety = scanSafety(items, null);
  const defs = presentThemesFromInputs(inputs, items);
  const themes = defs.map((def) => ({
    label: def.label,
    polarity: "new",
    claim: analysis.themes?.includes(def.label)
      ? `${def.label} is a presenting theme in stored notes.`
      : `${def.label} appears in diary tags or wording.`,
    evidence: evidenceForTheme(items, def),
  }));
  if (themes.length === 0 && analysis.criticalQuote?.quote) {
    themes.push({
      label: "Presenting concern",
      polarity: "new",
      claim: "A concern was shared in their own words.",
      evidence: [
        normalizeEvidence({
          text: analysis.criticalQuote.quote,
          sourceType: analysis.criticalQuote.source,
          createdAt: analysis.criticalQuote.date,
        }),
      ].filter(Boolean),
    });
  }
  const presentingConcerns = uniqueStrings([
    ...(analysis.themes || []),
    ...Object.keys(analysis.tagFrequency || {}).map((tag) => `#${tag}`),
  ]).slice(0, 6);
  const unknowns = buildUnknowns({
    kind: "baseline",
    analysis,
    safety,
    themes,
    items,
  });
  const sessionFocus = buildSessionFocus({
    kind: "baseline",
    safety,
    themes,
    unknowns,
  });
  return {
    kind: "baseline",
    windowLabel: WINDOW_LABELS.firstVisit,
    windowStart: null,
    windowEnd: now.toISOString(),
    emptyWindow: items.length === 0,
    safetySummary: safety,
    themes,
    presentingConcerns:
      presentingConcerns.length > 0
        ? presentingConcerns
        : ["Not enough stored notes to name a presenting concern yet."],
    unknowns,
    sessionFocus,
    sourceEntryIds: collectSourceIds(inputs),
    moodSummary: analysis.moodSummary || null,
    tagFrequency: analysis.tagFrequency || {},
  };
}

function buildReturnBrief({
  inputs,
  priorSnapshot,
  windowInputs,
  windowAnalysis,
  windowItems,
  now,
  windowLabel,
}) {
  const safety = scanSafety(windowItems, priorSnapshot);
  const priorThemes = (priorSnapshot.themes || []).map((theme) =>
    normalizeTheme(theme)
  ).filter(Boolean);
  const defs = presentThemesFromInputs(windowInputs, windowItems);
  const priorMood = priorSnapshot.moodSummary || null;
  const windowMood = windowAnalysis.moodSummary || null;
  const themes = [];

  const moodTheme = moodClaim(windowMood, priorMood);
  if (moodTheme) {
    const moodDef = THEME_DEFS.find((def) => def.id === "mood");
    themes.push({
      ...moodTheme,
      evidence: evidenceForTheme(windowItems, moodDef),
    });
  }

  defs.forEach((def) => {
    const priorTheme = priorThemes.find(
      (theme) =>
        theme.label.toLowerCase() === def.label.toLowerCase() ||
        themeDefForLabel(theme.label)?.id === def.id
    );
    const polarity = polarityForTheme(def, {
      priorTheme,
      items: windowItems,
      windowMood,
      priorMood,
    });
    if (polarity === "stable") return;
    themes.push({
      label: def.label,
      polarity,
      claim: claimForTheme(def, polarity, windowMood),
      evidence: evidenceForTheme(windowItems, def),
    });
  });

  const emptyWindow =
    windowItems.length === 0 &&
    (windowInputs.entries || []).length === 0 &&
    (windowInputs.checkIns || []).length === 0 &&
    (windowInputs.summaries || []).length === 0;

  if (emptyWindow && themes.length === 0) {
    (priorSnapshot.unknowns || []).slice(0, 2).forEach((text) => {
      themes.push({
        label: "Still open",
        polarity: "worse",
        claim: `No new notes since last Brief. Still open: ${text}`,
        evidence: [],
      });
    });
  }

  const unknowns = emptyWindow
    ? uniqueStrings([
        "No new diary or chat notes since last Brief.",
        ...(priorSnapshot.unknowns || []),
      ]).slice(0, 5)
    : buildUnknowns({
        kind: "change",
        analysis: windowAnalysis,
        safety,
        themes,
        items: windowItems,
      });

  const sessionFocus = buildSessionFocus({
    kind: "change",
    safety,
    themes,
    unknowns,
  });

  return {
    kind: "change",
    windowLabel: windowLabel || WINDOW_LABELS.sinceLastBrief,
    windowStart: priorSnapshot.createdAt || priorSnapshot.windowEnd || null,
    windowEnd: now.toISOString(),
    emptyWindow,
    safetySummary: safety,
    themes,
    presentingConcerns: [],
    unknowns,
    sessionFocus,
    sourceEntryIds: collectSourceIds(inputs),
    moodSummary: windowMood,
    tagFrequency: windowAnalysis.tagFrequency || {},
  };
}

function buildLocalChangeBrief({
  inputs = {},
  priorSnapshot = null,
  now = new Date(),
  windowMode = "last-brief",
} = {}) {
  const analysis = analyzeLocalSignals(inputs);
  const items = collectEvidenceItems(inputs);
  if (!priorSnapshot) {
    return buildBaselineBrief({ inputs, analysis, items, now });
  }
  const windowInputs =
    windowMode === "last-week"
      ? filterInputsSinceLastWeek(inputs, now)
      : filterInputsSinceSnapshot(inputs, priorSnapshot);
  const windowAnalysis = analyzeLocalSignals({
    ...windowInputs,
    userName: inputs.userName,
  });
  const windowItems = collectEvidenceItems(windowInputs);
  return buildReturnBrief({
    inputs,
    priorSnapshot: normalizeSnapshot(priorSnapshot),
    windowInputs,
    windowAnalysis,
    windowItems,
    now,
    windowLabel:
      windowMode === "last-week"
        ? WINDOW_LABELS.sinceLastWeek
        : WINDOW_LABELS.sinceLastBrief,
  });
}

function themesFromParsed(parsed) {
  if (Array.isArray(parsed?.themes) && parsed.themes.length) {
    return parsed.themes.map((theme) => normalizeTheme(theme)).filter(Boolean);
  }
  const out = [];
  const buckets = [
    ["improved", "improved"],
    ["worse", "worse"],
    ["harder", "worse"],
    ["new", "new"],
    ["newSinceLastTime", "new"],
  ];
  buckets.forEach(([key, polarity]) => {
    const arr = parsed?.[key];
    if (!Array.isArray(arr)) return;
    arr.forEach((item) => {
      const theme = normalizeTheme(item, polarity);
      if (theme) out.push(theme);
    });
  });
  return out;
}

function mergeEvidence(primary = [], fallback = []) {
  const merged = [...(primary || [])];
  (fallback || []).forEach((item) => {
    if (merged.length >= 2) return;
    if (!merged.some((existing) => existing.text === item.text)) {
      merged.push(item);
    }
  });
  return merged.slice(0, 2);
}

function mergeChangeBrief(parsed, local) {
  const base = local || emptyChangeBrief(parsed?.kind);
  if (!parsed || typeof parsed !== "object") return base;
  const kind =
    parsed.kind === "change" || parsed.kind === "baseline"
      ? parsed.kind
      : base.kind;
  let windowLabel = asText(parsed.windowLabel) || base.windowLabel;
  if (/delta/i.test(windowLabel)) {
    windowLabel =
      kind === "change" ? WINDOW_LABELS.sinceLastBrief : WINDOW_LABELS.firstVisit;
  }
  if (
    windowLabel &&
    windowLabel !== WINDOW_LABELS.firstVisit &&
    windowLabel !== WINDOW_LABELS.sinceLastBrief &&
    windowLabel !== WINDOW_LABELS.sinceLastWeek
  ) {
    windowLabel = base.windowLabel;
  }

  const parsedThemes = themesFromParsed(parsed);
  const localByLabel = new Map(
    (base.themes || []).map((theme) => [theme.label.toLowerCase(), theme])
  );
  let themes =
    parsedThemes.length > 0
      ? parsedThemes.map((theme) => {
          const localTheme = localByLabel.get(theme.label.toLowerCase());
          return {
            ...theme,
            evidence: mergeEvidence(theme.evidence, localTheme?.evidence),
          };
        })
      : base.themes;

  const safety = normalizeSafetySummary(parsed.safety || parsed.safetySummary);
  const localSafety = base.safetySummary || emptySafetySummary();
  const mergedSafety = {
    concern: escalateConcern(safety.concern, localSafety.concern),
    siOrSelfHarm: safety.siOrSelfHarm || localSafety.siOrSelfHarm,
    otherRisk: safety.otherRisk || localSafety.otherRisk,
    items:
      [...safety.items, ...localSafety.items]
        .filter(
          (item, index, arr) =>
            arr.findIndex((other) => other.text === item.text) === index
        )
        .slice(0, 6),
    stillOpen: uniqueStrings([
      ...safety.stillOpen,
      ...localSafety.stillOpen,
    ]).slice(0, 4),
  };
  if (mergedSafety.siOrSelfHarm) {
    mergedSafety.concern = escalateConcern(mergedSafety.concern, "elevated");
  }

  const presentingConcerns = uniqueStrings(
    Array.isArray(parsed.presentingConcerns)
      ? parsed.presentingConcerns.map(stripInventedScales)
      : base.presentingConcerns
  );
  const unknowns = uniqueStrings(
    Array.isArray(parsed.unknowns)
      ? parsed.unknowns.map(stripInventedScales)
      : base.unknowns
  );
  let sessionFocus = uniqueStrings(
    Array.isArray(parsed.sessionFocus)
      ? parsed.sessionFocus.map(stripInventedScales)
      : base.sessionFocus
  ).slice(0, 5);
  if (sessionFocus.length < 3) {
    sessionFocus = uniqueStrings([
      ...sessionFocus,
      ...(base.sessionFocus || []),
    ]).slice(0, 5);
  }

  return walkStrings(
    {
      kind,
      windowLabel,
      windowStart: parsed.windowStart || base.windowStart,
      windowEnd: parsed.windowEnd || base.windowEnd,
      emptyWindow: Boolean(parsed.emptyWindow) || base.emptyWindow,
      safetySummary: mergedSafety,
      themes,
      presentingConcerns,
      unknowns: unknowns.slice(0, 5),
      sessionFocus,
      sourceEntryIds: base.sourceEntryIds,
      moodSummary: base.moodSummary,
      tagFrequency: base.tagFrequency,
    },
    stripInventedScales
  );
}

function parseChangeBrief(text, localFallback = null) {
  const local = localFallback || emptyChangeBrief();
  const json = extractJsonObject(text);
  if (!json) return local;
  return mergeChangeBrief(json, local);
}

function normalizeSnapshot(raw = {}) {
  const kind = raw.kind === "change" ? "change" : "baseline";
  const safetySummary = normalizeSafetySummary(raw.safetySummary || raw.safety);
  const themes = (Array.isArray(raw.themes) ? raw.themes : [])
    .map((theme) => normalizeTheme(theme))
    .filter(Boolean);
  return {
    id: asText(raw.id) || null,
    createdAt: asText(raw.createdAt) || null,
    windowStart: asText(raw.windowStart) || null,
    windowEnd: asText(raw.windowEnd) || asText(raw.createdAt) || null,
    kind,
    windowLabel:
      asText(raw.windowLabel) ||
      (kind === "change"
        ? WINDOW_LABELS.sinceLastBrief
        : WINDOW_LABELS.firstVisit),
    safetySummary,
    themes,
    unknowns: uniqueStrings(raw.unknowns).slice(0, 8),
    sessionFocus: uniqueStrings(raw.sessionFocus).slice(0, 5),
    sourceEntryIds: uniqueStrings(raw.sourceEntryIds),
    moodSummary: raw.moodSummary || null,
    tagFrequency: raw.tagFrequency || {},
  };
}

function snapshotFromChangeBrief(changeBrief, { id, createdAt, now = new Date() } = {}) {
  const normalized = mergeChangeBrief(changeBrief, changeBrief);
  const stamp = createdAt || now.toISOString();
  return normalizeSnapshot({
    ...normalized,
    id,
    createdAt: stamp,
    windowStart: normalized.windowStart,
    windowEnd: normalized.windowEnd || stamp,
  });
}

function themesByPolarity(themes, polarity) {
  return (themes || []).filter((theme) => theme.polarity === polarity);
}

function formatEvidenceLine(evidence) {
  if (!evidence) return "";
  const when = asText(evidence.createdAt).slice(0, 10);
  const source = evidence.sourceType === "diary" ? "diary" : "chat";
  return `“${evidence.text}” · ${source}${when ? ` · ${when}` : ""}`;
}

function formatChangeBriefMarkdown(changeBrief, { analysis, sections } = {}) {
  const brief = changeBrief || emptyChangeBrief();
  const safety = brief.safetySummary || emptySafetySummary();
  const improved = themesByPolarity(brief.themes, "improved");
  const worse = themesByPolarity(brief.themes, "worse");
  const newer = themesByPolarity(brief.themes, "new");
  const lines = [
    `# Session Brief`,
    `Window: ${brief.windowLabel}`,
    analysis?.userName ? `Preferred name: ${analysis.userName}` : "",
    "",
    `## Safety`,
    `Concern: ${safety.concern}`,
    safety.siOrSelfHarm
      ? "- Suicidal ideation or self-harm language is present in this window."
      : "- No suicidal ideation or self-harm language detected in this window.",
    ...safety.items.map((item) => `- ${item.text}`),
    ...safety.stillOpen.map((item) => `- Still open: ${item}`),
  ];

  if (brief.kind === "baseline") {
    lines.push(
      "",
      `## Presenting concerns`,
      ...(brief.presentingConcerns || []).map((item) => `- ${item}`),
      "",
      `## Themes`,
      ...(brief.themes || []).map((theme) => `- ${theme.claim}`),
      "",
      `## Unknowns`,
      ...(brief.unknowns || []).map((item) => `- ${item}`)
    );
  } else {
    const sectionBlock = (title, list, empty) => {
      lines.push("", `## ${title}`);
      if (!list.length) {
        lines.push(`- ${empty}`);
        return;
      }
      list.forEach((theme) => {
        lines.push(`- ${theme.claim}`);
        (theme.evidence || []).forEach((evidence) => {
          lines.push(`  - ${formatEvidenceLine(evidence)}`);
        });
      });
    };
    sectionBlock("Improved", improved, "None noted in this window.");
    sectionBlock("Harder or stuck", worse, "None noted in this window.");
    sectionBlock("New since last time", newer, "None noted in this window.");
  }

  lines.push(
    "",
    `## Session focus`,
    ...(brief.sessionFocus || []).map((item) => `- ${item}`)
  );

  if (sections) {
    lines.push(
      "",
      `## Fuller note`,
      formatReportSectionsMarkdown(sections)
    );
  }

  lines.push(
    "",
    `---`,
    `This brief is a synthesis of data the teen stored on this device. It is not a clinical assessment, diagnosis, or formal risk score. No HAM-D / HAM-A numbers are generated.`
  );

  return lines.filter((line) => line !== undefined).join("\n");
}

function buildChangeBriefPrompt({
  kind,
  priorSnapshot,
  analysis,
  windowAnalysis,
  evidenceCandidates,
  windowLabel,
}) {
  return `Write a change-over-time clinician Session Brief using ONLY this on-device evidence. Do not invent biography, diagnoses, events, or quotes.

Rules:
- Return ONLY a JSON object.
- Never write the word "delta". windowLabel must be exactly one of: "${WINDOW_LABELS.firstVisit}", "${WINDOW_LABELS.sinceLastBrief}", "${WINDOW_LABELS.sinceLastWeek}".
- Never output HAM-D, HAM-A, PHQ, GAD, BDI, or SBQ numeric scores. Do not invent scale totals.
- Journal mood is self-rated 1-10. Cite only as n/10 when a stored score exists.
- Evidence text MUST be copied from evidenceCandidates (shorten if needed). Do not invent quotes.
- Each improved/worse/new claim gets 1-2 evidence objects when a matching candidate exists.
- sessionFocus: 3-5 short "clarify in the room" bullets, not advice essays.
- If kind is "baseline", fill presentingConcerns, themes, unknowns, sessionFocus, safetySummary. Leave improved/worse/new empty arrays.
- If kind is "change", fill improved, worse, and new (or themes with polarity). Use ${WINDOW_LABELS.sinceLastBrief} unless the window is last week.

Required JSON shape:
{
  "kind": "${kind}",
  "windowLabel": "${windowLabel}",
  "safetySummary": {
    "concern": "none" | "monitor" | "elevated",
    "siOrSelfHarm": false,
    "otherRisk": false,
    "items": [{ "kind": "si" | "self-harm" | "other" | "open", "text": "" }],
    "stillOpen": [""]
  },
  "improved": [{ "label": "", "claim": "", "evidence": [{ "text": "", "sourceType": "diary" | "chat", "sourceId": "", "createdAt": "" }] }],
  "worse": [],
  "new": [],
  "presentingConcerns": [""],
  "themes": [{ "label": "", "polarity": "improved" | "worse" | "new" | "stable", "claim": "", "evidence": [] }],
  "unknowns": [""],
  "sessionFocus": ["", "", ""]
}

Prior snapshot (may be null on first visit):
${JSON.stringify(
    priorSnapshot
      ? {
          createdAt: priorSnapshot.createdAt,
          safetySummary: priorSnapshot.safetySummary,
          themes: priorSnapshot.themes,
          unknowns: priorSnapshot.unknowns,
          sessionFocus: priorSnapshot.sessionFocus,
          moodSummary: priorSnapshot.moodSummary,
          tagFrequency: priorSnapshot.tagFrequency,
        }
      : null,
    null,
    2
  )}

Window analysis:
${JSON.stringify(windowAnalysis || analysis, null, 2)}

Evidence candidates (copy quotes from here only):
${JSON.stringify(
    (evidenceCandidates || []).slice(-16).map((item) => ({
      text: clipQuote(item.text, 240),
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      createdAt: item.createdAt || item.date,
    })),
    null,
    2
  )}`;
}

function usesForbiddenUiWord(text) {
  return /\bdelta\b/i.test(String(text || ""));
}

module.exports = {
  WINDOW_LABELS,
  POLARITIES,
  collectSourceIds,
  collectEvidenceItems,
  filterInputsSinceSnapshot,
  filterInputsSinceLastWeek,
  scanSafety,
  stripInventedScales,
  buildLocalChangeBrief,
  parseChangeBrief,
  mergeChangeBrief,
  normalizeSnapshot,
  snapshotFromChangeBrief,
  themesByPolarity,
  formatChangeBriefMarkdown,
  buildChangeBriefPrompt,
  emptyChangeBrief,
  usesForbiddenUiWord,
};
