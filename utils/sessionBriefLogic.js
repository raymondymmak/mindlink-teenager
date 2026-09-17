"use strict";

const MOOD_SCALE_MIN = 1;
const MOOD_SCALE_MAX = 10;
const LOW_MOOD_THRESHOLD = 4;
const OBSERVATIONAL_PATTERNS = [
  {
    id: "low_mood",
    label: "Low mood / sadness",
    keywords: [
      "sad",
      "depressed",
      "down",
      "unhappy",
      "cry",
      "crying",
      "miserable",
      "empty",
      "low mood",
    ],
  },
  {
    id: "anhedonia",
    label: "Reduced interest or enjoyment",
    keywords: [
      "don't enjoy",
      "dont enjoy",
      "nothing fun",
      "lost interest",
      "no interest",
      "bored of everything",
      "can't enjoy",
      "cant enjoy",
    ],
  },
  {
    id: "sleep",
    label: "Sleep disruption",
    keywords: [
      "can't sleep",
      "cant sleep",
      "insomnia",
      "nightmare",
      "oversleep",
      "tired all the time",
      "no sleep",
      "sleeping too much",
    ],
  },
  {
    id: "energy",
    label: "Low energy / fatigue",
    keywords: ["exhausted", "no energy", "fatigue", "drained", "burnt out", "burned out"],
  },
  {
    id: "appetite",
    label: "Appetite or eating change",
    keywords: [
      "not hungry",
      "no appetite",
      "can't eat",
      "cant eat",
      "eating too much",
      "binge",
    ],
  },
  {
    id: "concentration",
    label: "Concentration difficulty",
    keywords: [
      "can't focus",
      "cant focus",
      "can't concentrate",
      "cant concentrate",
      "distracted",
      "brain fog",
    ],
  },
  {
    id: "self_worth",
    label: "Self-criticism / worthlessness",
    keywords: [
      "worthless",
      "useless",
      "hate myself",
      "i'm a failure",
      "im a failure",
      "not good enough",
    ],
  },
  {
    id: "hopelessness",
    label: "Hopelessness",
    keywords: ["hopeless", "no point", "give up", "nothing will change", "no way out"],
  },
  {
    id: "anxiety",
    label: "Worry / anxiety",
    keywords: [
      "anxious",
      "anxiety",
      "worried",
      "panic",
      "overthinking",
      "nervous",
      "scared",
    ],
  },
  {
    id: "school",
    label: "School pressure",
    keywords: ["exam", "homework", "school", "teacher", "dse", "grade", "assignment"],
  },
  {
    id: "family",
    label: "Family tension",
    keywords: ["mum", "mom", "dad", "mother", "father", "parents", "family", "home"],
  },
  {
    id: "peers",
    label: "Friendship / peer strain",
    keywords: ["friend", "friends", "lonely", "left out", "bullied", "classmate"],
  },
];

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asText(value) {
  return String(value || "").trim();
}

function normalizeMood(raw) {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
}

function normalizeTags(raw) {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return uniqueStrings(raw.flatMap((item) => normalizeTags(item)));
  }
  if (typeof raw === "object") {
    const trueKeys = Object.entries(raw)
      .filter(([, value]) => value === true)
      .map(([key]) => asText(key).replace(/^#/, ""));
    if (trueKeys.length > 0) return uniqueStrings(trueKeys);
    return uniqueStrings(
      Object.values(raw).flatMap((item) => normalizeTags(item))
    );
  }
  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return normalizeTags(JSON.parse(trimmed));
    } catch {
      // Fall through to comma splitting.
    }
  }
  return uniqueStrings(
    trimmed
      .split(/[,]+/)
      .map((part) => part.replace(/^[#\s]+|[.\s]+$/g, "").trim())
      .filter(Boolean)
  );
}

function buildDiaryRecord({
  date,
  prompt = "",
  response = "",
  mood,
  tags,
  createdAt,
} = {}) {
  const record = {
    date,
    prompt: String(prompt || ""),
    response: String(response || ""),
    mood: normalizeMood(mood),
    tags: normalizeTags(tags),
  };
  if (createdAt) record.createdAt = createdAt;
  return record;
}

function parseDiaryRecord(raw, extra = {}) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
  return {
    ...parsed,
    ...extra,
    date: parsed.date || extra.date || "",
    prompt: parsed.prompt || "",
    response: parsed.response || "",
    mood: normalizeMood(parsed.mood),
    tags: normalizeTags(parsed.tags ?? parsed.selectedTags ?? parsed.tag),
  };
}

function moodScaleDescriptor() {
  return {
    min: MOOD_SCALE_MIN,
    max: MOOD_SCALE_MAX,
    label: `self-rated journal mood ${MOOD_SCALE_MIN}-${MOOD_SCALE_MAX}`,
    citation: `n/${MOOD_SCALE_MAX}`,
  };
}

const NOT_DISCLOSED = "Not disclosed in conversation";
const INSUFFICIENT_SCALE =
  "Insufficient data for a conversation-derived rating. No formal Hamilton instrument was administered. Any HAM-D / HAM-A figure must stay preliminary and grounded in shared conversation only.";

const REPORT_SECTIONS = [
  { id: "userProfile", number: 1, title: "User Profile" },
  { id: "presentingConcerns", number: 2, title: "Presenting Concerns" },
  { id: "moodAffectiveState", number: 3, title: "Mood & Affective State" },
  { id: "anxietyStressLevels", number: 4, title: "Anxiety & Stress Levels" },
  { id: "cognitivePerceptualState", number: 5, title: "Cognitive & Perceptual State" },
  { id: "functioning", number: 6, title: "Functioning" },
  { id: "headssContextualFactors", number: 7, title: "HEADSS Contextual Factors" },
  { id: "riskAssessment", number: 8, title: "Risk Assessment" },
  { id: "strengthsProtectiveFactors", number: 9, title: "Strengths & Protective Factors" },
  { id: "keyInsights", number: 10, title: "Key Insights & Potential Areas of Concern" },
  { id: "suggestionsForUser", number: 11, title: "Suggestions for User" },
];

function constrainMoodScaleLanguage(text) {
  const max = String(MOOD_SCALE_MAX);
  return String(text || "")
    .replace(/\b(\d{1,2})\s*\/\s*5\b/g, `$1/${max}`)
    .replace(/\b(\d{1,2})\s+out of\s+5\b/gi, `$1 out of ${max}`)
    .replace(/\b(\d{1,2})\s+out of\s+five\b/gi, `$1 out of ${max}`);
}

function normalizeSectionBody(value) {
  const text = constrainMoodScaleLanguage(asText(value));
  return text || NOT_DISCLOSED;
}

function emptyReportSections() {
  const sections = {};
  REPORT_SECTIONS.forEach((section) => {
    sections[section.id] = NOT_DISCLOSED;
  });
  return sections;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function sectionKeyAliases(section) {
  return [
    section.id,
    section.title,
    section.title.replace(/&/g, "and"),
    String(section.number),
    `section${section.number}`,
    `${section.number}${section.title}`,
  ].map(normalizeKey);
}

function lookupSectionByHeading(line) {
  const cleaned = String(line || "")
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^(\d{1,2})[.)]\s+/, "")
    .replace(/:$/, "")
    .trim();
  const norm = normalizeKey(cleaned);
  if (!norm) return null;
  return (
    REPORT_SECTIONS.find((section) => {
      const aliases = sectionKeyAliases(section);
      return aliases.includes(norm) || aliases.some((alias) => norm.startsWith(alias) || alias.startsWith(norm));
    }) || null
  );
}

function extractJsonObject(text) {
  const trimmed = String(text || "").trim();
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

function assignSectionsFromObject(target, raw) {
  if (!raw || typeof raw !== "object") return 0;
  let assigned = 0;
  const keys = Object.keys(raw);
  REPORT_SECTIONS.forEach((section) => {
    const aliases = new Set(sectionKeyAliases(section));
    const match = keys.find((key) => aliases.has(normalizeKey(key)));
    if (match != null && raw[match] != null && asText(raw[match])) {
      target[section.id] = normalizeSectionBody(raw[match]);
      assigned += 1;
    }
  });
  return assigned;
}

function parseMarkdownReportSections(text) {
  const sections = emptyReportSections();
  const lines = String(text || "").split(/\n/);
  let current = null;
  const buckets = {};
  lines.forEach((line) => {
    const heading = lookupSectionByHeading(line);
    const looksLikeHeading =
      heading &&
      (/^#{1,6}\s+/.test(line.trim()) ||
        /^\d{1,2}[.)]\s+/.test(line.trim()) ||
        /^\*\*.+\*\*$/.test(line.trim()));
    if (heading && looksLikeHeading) {
      current = heading.id;
      if (!buckets[current]) buckets[current] = [];
      return;
    }
    if (current) {
      buckets[current].push(line);
    }
  });
  let assigned = 0;
  Object.entries(buckets).forEach(([id, bodyLines]) => {
    const body = normalizeSectionBody(bodyLines.join("\n"));
    if (body !== NOT_DISCLOSED) {
      sections[id] = body;
      assigned += 1;
    }
  });
  return { sections, assigned };
}

function countFilledSections(sections) {
  return REPORT_SECTIONS.filter(
    (section) =>
      asText(sections?.[section.id]) &&
      asText(sections[section.id]) !== NOT_DISCLOSED
  ).length;
}

function parseStructuredBrief(text) {
  const sections = emptyReportSections();
  const raw = String(text || "").trim();
  if (!raw) {
    return { sections, rawFallback: "", filled: 0 };
  }

  const json = extractJsonObject(raw);
  const jsonAssigned = assignSectionsFromObject(sections, json);
  if (jsonAssigned >= 4) {
    return { sections, rawFallback: "", filled: countFilledSections(sections) };
  }

  const markdown = parseMarkdownReportSections(raw);
  if (markdown.assigned >= 4) {
    return {
      sections: markdown.sections,
      rawFallback: "",
      filled: countFilledSections(markdown.sections),
    };
  }

  if (jsonAssigned > 0) {
    return { sections, rawFallback: "", filled: countFilledSections(sections) };
  }

  return {
    sections: emptyReportSections(),
    rawFallback: constrainMoodScaleLanguage(raw),
    filled: 0,
  };
}

function formatReportSectionsMarkdown(sections) {
  return REPORT_SECTIONS.map((section) => {
    const body = normalizeSectionBody(sections?.[section.id]);
    return `## ${section.number}. ${section.title}\n${body}`;
  }).join("\n\n");
}

function signalsById(analysis, ids) {
  return (analysis?.observationalSignals || []).filter((signal) =>
    ids.includes(signal.id)
  );
}

function hasSafetyLanguage(analysis) {
  const haystack = [
    analysis?.criticalQuote?.quote,
    ...(analysis?.textPreview || []),
  ]
    .join(" ")
    .toLowerCase();
  return /suicid|kill myself|end my life|self-harm|self harm|hurt myself|better off dead/.test(
    haystack
  );
}

function buildLocalReportSections(analysis = {}, { reason } = {}) {
  const sections = emptyReportSections();
  const name = analysis.userName || "User";
  const mood = analysis.moodSummary || {};
  const themes = analysis.themes || [];
  const tags = Object.keys(analysis.tagFrequency || {});
  const quote = asText(analysis.criticalQuote?.quote);
  const moodSignals = signalsById(analysis, [
    "low_mood",
    "anhedonia",
    "sleep",
    "energy",
    "appetite",
    "hopelessness",
  ]);
  const anxietySignals = signalsById(analysis, ["anxiety"]);
  const cognitiveSignals = signalsById(analysis, ["concentration"]);
  const functionSignals = signalsById(analysis, ["school", "peers", "family"]);

  sections.userProfile = `Preferred name (on-device): ${name}. Age and gender: ${NOT_DISCLOSED}.`;

  const concernBits = [];
  if (themes.length) {
    concernBits.push(`Key issues from stored notes: ${themes.join("; ")}.`);
  }
  if (tags.length) {
    concernBits.push(
      `Diary tags selected: ${tags.map((tag) => `#${tag}`).join(", ")}.`
    );
  }
  if (quote) {
    concernBits.push(`In their words: "${quote}"`);
  }
  sections.presentingConcerns = concernBits.length
    ? `${concernBits.join(" ")} ${INSUFFICIENT_SCALE}`
    : INSUFFICIENT_SCALE;

  const moodBits = [];
  if (mood.count > 0) {
    moodBits.push(
      `Self-rated journal mood (1–10): average ${mood.average}/${MOOD_SCALE_MAX} (range ${mood.min}–${mood.max}) across ${mood.count} day(s). ${mood.trend}`
    );
  }
  if (moodSignals.length) {
    moodBits.push(
      `User-reported wording mentioned: ${moodSignals
        .map((signal) => signal.label)
        .join("; ")}.`
    );
  }
  sections.moodAffectiveState = moodBits.length
    ? `${moodBits.join(" ")} These are observations from stored notes, not a PHQ-9, BDI-Y, or DIGFAST administration.`
    : NOT_DISCLOSED;

  const anxietyBits = [];
  if (anxietySignals.length || tags.includes("anxiety")) {
    anxietyBits.push(
      "User-reported worry or anxiety appears in diary tags and/or wording."
    );
  }
  if (analysis.correlations?.summary) {
    anxietyBits.push(analysis.correlations.summary);
  }
  sections.anxietyStressLevels = anxietyBits.length
    ? `${anxietyBits.join(" ")} ${INSUFFICIENT_SCALE}`
    : INSUFFICIENT_SCALE;

  sections.cognitivePerceptualState = cognitiveSignals.length
    ? `User-reported concentration difficulty (${cognitiveSignals[0].mentionCount} mention(s) in ${cognitiveSignals[0].sources.join(", ")}). No unusual thought content or perceptual disturbance was disclosed.`
    : "No concentration, decision-making, or perceptual disturbance was disclosed in stored notes.";

  const functionBits = uniqueStrings([
    ...functionSignals.map((signal) => signal.label),
    ...tags
      .filter((tag) => ["school", "friends", "family"].includes(tag))
      .map((tag) => `#${tag}`),
  ]);
  sections.functioning = functionBits.length
    ? `Impact described in stored notes: ${functionBits.join("; ")}.`
    : NOT_DISCLOSED;

  const headss = [];
  if (tags.includes("family") || functionSignals.some((signal) => signal.id === "family")) {
    headss.push("Home: family mentioned.");
  }
  if (tags.includes("school") || functionSignals.some((signal) => signal.id === "school")) {
    headss.push("Education: school mentioned.");
  }
  if (tags.includes("friends")) {
    headss.push("Activities / social: friends mentioned.");
  }
  if (signalsById(analysis, ["hopelessness"]).length) {
    headss.push(
      "Suicide/Safety: hopelessness wording was present; no plan or intent was disclosed."
    );
  }
  sections.headssContextualFactors = headss.length
    ? headss.join(" ")
    : NOT_DISCLOSED;

  if (hasSafetyLanguage(analysis)) {
    sections.riskAssessment =
      "User-reported language may indicate self-harm or suicidal thinking. Review the original wording. Level of concern: elevated based on wording only — this is not an SBQ-R score. Other Risks: not disclosed unless listed in stored notes.";
  } else if (signalsById(analysis, ["hopelessness"]).length) {
    sections.riskAssessment =
      "Suicidal Ideation/Self-Harm: hopelessness was mentioned; no plan, intent, or self-harm history was disclosed. Level of concern: monitor. Other Risks: not disclosed in conversation.";
  } else {
    sections.riskAssessment =
      "Suicidal Ideation/Self-Harm: no thoughts, plans, intent, or history were disclosed in stored conversation or diary text. Other Risks: not disclosed in conversation.";
  }

  const strengths = [];
  if (tags.includes("friends")) {
    strengths.push("Peer contact (friends tag) is a possible social support.");
  }
  if (mood.max != null && mood.max >= 7) {
    strengths.push(
      `At least one journal day was rated ${mood.max}/${MOOD_SCALE_MAX}.`
    );
  }
  sections.strengthsProtectiveFactors = strengths.length
    ? strengths.join(" ")
    : NOT_DISCLOSED;

  sections.keyInsights = [
    themes.length ? `Salient themes: ${themes.join("; ")}.` : null,
    analysis.correlations?.summary,
    reason
      ? `Local demo brief (${reason}). Preliminary, conversation-derived impressions only — not a diagnosis.`
      : "Preliminary, conversation-derived impressions only — not a diagnosis.",
  ]
    .filter(Boolean)
    .join(" ");

  const suggestions = [];
  if (signalsById(analysis, ["sleep"]).length) {
    suggestions.push(
      "If offered in chat, MindLink may have suggested a steadier sleep routine."
    );
  }
  if (tags.includes("school") || functionSignals.some((signal) => signal.id === "school")) {
    suggestions.push(
      "School stress: break work into smaller steps and name one trusted adult at school."
    );
  }
  if (anxietySignals.length || tags.includes("anxiety")) {
    suggestions.push(
      "Worry: notice the thought, then one grounding or breathing step."
    );
  }
  suggestions.push(
    "If distress rises, contact a trusted adult or local crisis support. This app is not emergency care."
  );
  sections.suggestionsForUser = suggestions.join(" ");

  return sections;
}

function buildSynthesisPrompt(analysis) {
  const keys = REPORT_SECTIONS.map((section) => `"${section.id}"`).join(", ");
  return `Write the 11-section preliminary clinician report using ONLY this on-device analysis. Do not invent biography, diagnoses, or events.

Journal mood scale (mandatory):
- Every value in moodTrajectory / moodSummary is a self-rated journal mood from ${MOOD_SCALE_MIN} (lowest) to ${MOOD_SCALE_MAX} (highest).
- Cite mood only as n/${MOOD_SCALE_MAX} (example: 3/${MOOD_SCALE_MAX}).
- Never rescale, convert, or describe mood as x/5, "out of 5", "/5", or a 5-point scale.
- A stored score of 3 means 3/${MOOD_SCALE_MAX}, not 3/5.

Diary tags:
- tagFrequency counts tags the teen selected on journal entries (school, family, friends, anxiety, procrastination, lonely, etc.).
- Use only those tags. If tagFrequency is empty, say no diary tags were selected.

HAM-D / HAM-A:
- These are preliminary conversation-derived conceptual ratings, not administered instruments or diagnoses.
- Give two numbers plus a short explanation only when stored conversation/diary text can support them.
- Otherwise write: Insufficient data for a conversation-derived rating.

Required JSON keys (return ONLY this object):
${keys}

If a section has no evidence, set it to exactly: ${NOT_DISCLOSED}

Do not use the old v2 report slots (Mood trajectory, Recurring themes, Stressors on lower-mood days, Notable quote, Observational signals, Suggested opening questions) as the report body.

Structured observations:
${JSON.stringify(analysis, null, 2)}`;
}

function collectUserTexts({ entries = [], checkIns = [], summaries = [] }) {
  const texts = [];
  entries.forEach((entry) => {
    if (entry.response) {
      texts.push({
        source: "diary",
        date: entry.date,
        text: asText(entry.response),
        mood: normalizeMood(entry.mood),
        tags: normalizeTags(entry.tags ?? entry.selectedTags ?? entry.tag),
      });
    }
  });
  checkIns.forEach((checkIn) => {
    (checkIn.messages || []).forEach((msg) => {
      if (msg.role === "user" && msg.text) {
        texts.push({
          source: "check-in",
          date: checkIn.date,
          text: asText(msg.text),
        });
      }
    });
  });
  summaries.forEach((summary) => {
    if (summary.content) {
      texts.push({
        source: "chat-report",
        date: summary.date,
        text: asText(summary.content),
      });
    }
  });
  return texts.filter((item) => item.text);
}

function getMoodTrajectory(entries = []) {
  return entries
    .map((entry) => ({
      date: entry.date,
      mood: normalizeMood(entry.mood),
    }))
    .filter((entry) => entry.mood != null && entry.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function summarizeMood(trajectory) {
  if (trajectory.length === 0) {
    return {
      count: 0,
      average: null,
      min: null,
      max: null,
      trend: "No self-rated mood scores yet.",
    };
  }
  const scores = trajectory.map((item) => item.mood);
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  let trend = "Only one self-rated day so far.";
  if (scores.length >= 2) {
    const delta = scores[scores.length - 1] - scores[0];
    if (delta <= -2) trend = "Downward across recorded days.";
    else if (delta >= 2) trend = "Upward across recorded days.";
    else trend = "Stable across recorded days.";
  }
  return {
    count: scores.length,
    average: Number(average.toFixed(1)),
    min,
    max,
    trend,
  };
}

function getTagFrequency(entries = []) {
  const tagCounts = {};
  entries.forEach((entry) => {
    normalizeTags(entry.tags ?? entry.selectedTags ?? entry.tag).forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  return tagCounts;
}

function extractObservationalSignals(textItems = []) {
  const haystack = textItems.map((item) => item.text.toLowerCase());
  return OBSERVATIONAL_PATTERNS.map((pattern) => {
    const matches = [];
    haystack.forEach((text, index) => {
      const hit = pattern.keywords.find((keyword) => text.includes(keyword));
      if (hit) {
        matches.push({
          keyword: hit,
          source: textItems[index].source,
          date: textItems[index].date,
        });
      }
    });
    if (matches.length === 0) return null;
    return {
      id: pattern.id,
      label: pattern.label,
      mentionCount: matches.length,
      sources: uniqueStrings(matches.map((item) => item.source)),
    };
  }).filter(Boolean);
}

function extractThemes(entries = [], textItems = []) {
  const tags = Object.keys(getTagFrequency(entries));
  const themeLabels = {
    school: "School / academic pressure",
    family: "Family relationships",
    friends: "Peer relationships",
    anxiety: "Anxiety and worry",
    procrastination: "Procrastination / avoidance",
    lonely: "Loneliness / isolation",
  };
  const fromTags = tags.map((tag) => themeLabels[tag] || `#${tag}`);
  const tagSignalIds = {
    school: "school",
    family: "family",
    friends: "peers",
    anxiety: "anxiety",
    lonely: "low_mood",
  };
  const coveredSignals = new Set(
    tags.map((tag) => tagSignalIds[tag]).filter(Boolean)
  );
  const fromSignals = extractObservationalSignals(textItems)
    .filter((signal) =>
      ["school", "family", "peers", "anxiety", "low_mood"].includes(signal.id)
    )
    .filter((signal) => !coveredSignals.has(signal.id))
    .map((signal) => signal.label);
  const themes = uniqueStrings([...fromTags, ...fromSignals]);
  return themes.slice(0, 5);
}

function extractCriticalQuote(textItems = []) {
  const userItems = textItems.filter((item) => item.source !== "chat-report");
  const sentences = [];
  userItems.forEach((item) => {
    String(item.text)
      .split(/(?<=[.!?。！？])\s+/)
      .forEach((sentence) => {
        const cleaned = sentence.replace(/^["'\s]+|["'\s]+$/g, "").trim();
        if (cleaned.length >= 20 && cleaned.length <= 220) {
          sentences.push({ text: cleaned, source: item.source, date: item.date });
        }
      });
  });
  if (sentences.length === 0 && userItems[0]) {
    return {
      quote: userItems[0].text.slice(0, 180),
      source: userItems[0].source,
      date: userItems[0].date,
    };
  }
  const emotionWords =
    /sad|anxious|worried|alone|tired|exam|family|friend|school|hopeless|stress|scared|lonely|angry|fail/i;
  sentences.sort((a, b) => {
    const aScore = (emotionWords.test(a.text) ? 40 : 0) + Math.min(a.text.length, 140);
    const bScore = (emotionWords.test(b.text) ? 40 : 0) + Math.min(b.text.length, 140);
    return bScore - aScore;
  });
  const best = sentences[0];
  if (!best) {
    return { quote: "", source: null, date: null };
  }
  return { quote: best.text, source: best.source, date: best.date };
}

function lowMoodStressors(entries = []) {
  const lowDays = entries.filter(
    (entry) => Number(entry.mood) > 0 && Number(entry.mood) < LOW_MOOD_THRESHOLD
  );
  if (lowDays.length === 0) {
    return {
      count: 0,
      tags: [],
      excerpts: [],
      summary: "No journal days with a self-rated mood below 4/10.",
    };
  }
  const tags = getTagFrequency(lowDays);
  const excerpts = lowDays.slice(-3).map((entry) => ({
    date: entry.date,
    mood: entry.mood,
    text: asText(entry.response).slice(0, 160),
    tags: normalizeTags(entry.tags ?? entry.selectedTags ?? entry.tag),
  }));
  const topTags = Object.entries(tags)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
  return {
    count: lowDays.length,
    tags: topTags,
    excerpts,
    summary:
      topTags.length > 0
        ? `On lower-mood journal days, tags included: ${topTags
            .map((tag) => `#${tag}`)
            .join(", ")}.`
        : "Lower-mood journal days were recorded, but no tags were selected.",
  };
}

function analyzeLocalSignals({
  entries = [],
  checkIns = [],
  summaries = [],
  userName = "User",
} = {}) {
  const textItems = collectUserTexts({ entries, checkIns, summaries });
  const moodTrajectory = getMoodTrajectory(entries);
  const moodSummary = summarizeMood(moodTrajectory);
  const tagFrequency = getTagFrequency(entries);
  const themes = extractThemes(entries, textItems);
  const correlations = lowMoodStressors(entries);
  const criticalQuote = extractCriticalQuote(textItems);
  const observationalSignals = extractObservationalSignals(textItems);

  const draft = {
    userName,
    generatedAt: new Date().toISOString(),
    dataSources: {
      diaryEntries: entries.length,
      checkIns: checkIns.length,
      chatReports: summaries.length,
    },
    moodScale: moodScaleDescriptor(),
    moodTrajectory,
    moodSummary,
    tagFrequency,
    themes,
    correlations,
    criticalQuote,
    observationalSignals,
    textPreview: textItems
      .filter((item) => item.source !== "chat-report")
      .slice(-6)
      .map((item) => `${item.date || "undated"} (${item.source}): ${item.text}`),
  };
  draft.openingQuestions = buildOpeningQuestions(draft);
  return draft;
}

function buildOpeningQuestions(analysis) {
  const questions = [];
  if (analysis.correlations.tags.includes("school") || analysis.themes.some((theme) => /school/i.test(theme))) {
    questions.push("What has school felt like this week, and which part is weighing on you most?");
  }
  if (analysis.correlations.tags.includes("family") || analysis.themes.some((theme) => /family/i.test(theme))) {
    questions.push("How have things been at home, and is there one conversation that has stayed with you?");
  }
  if (analysis.observationalSignals.some((signal) => signal.id === "sleep")) {
    questions.push("How has your sleep been, and does it change on the harder days?");
  }
  if (analysis.observationalSignals.some((signal) => signal.id === "anxiety")) {
    questions.push("When the worry shows up, what does it sound like in your head?");
  }
  if (questions.length < 2) {
    questions.push("What felt heaviest since we last met, and what helped even a little?");
  }
  if (questions.length < 2) {
    questions.push("If we only had time for one thing today, what would you want me to understand?");
  }
  return uniqueStrings(questions).slice(0, 2);
}

function resolveReportSections(narrativeOrSections) {
  if (
    narrativeOrSections &&
    typeof narrativeOrSections === "object" &&
    !Array.isArray(narrativeOrSections)
  ) {
    if (narrativeOrSections.sections) {
      return {
        sections: { ...emptyReportSections(), ...narrativeOrSections.sections },
        rawFallback: narrativeOrSections.rawFallback || "",
      };
    }
    if (narrativeOrSections.userProfile != null) {
      const sections = emptyReportSections();
      assignSectionsFromObject(sections, narrativeOrSections);
      return { sections, rawFallback: "" };
    }
  }
  return parseStructuredBrief(String(narrativeOrSections || ""));
}

function buildMockSessionBrief(analysis, { reason } = {}) {
  return formatReportSectionsMarkdown(
    buildLocalReportSections(analysis, { reason })
  );
}

function formatSessionBriefMarkdown(analysis, narrativeOrSections) {
  const sources = analysis.dataSources || {};
  const resolved = resolveReportSections(narrativeOrSections);
  const moodLines =
    (analysis.moodTrajectory || []).length > 0
      ? analysis.moodTrajectory
          .map((item) => `- ${item.date}: ${item.mood}/${MOOD_SCALE_MAX}`)
          .join("\n")
      : "- No journal mood scores available.";
  const tagEntries = Object.entries(analysis.tagFrequency || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const tagLines =
    tagEntries.length > 0
      ? tagEntries.map(([tag, count]) => `- #${tag}: ${count}`).join("\n")
      : "- No diary tags selected yet.";
  const quoteLine = analysis.criticalQuote?.quote
    ? `"${analysis.criticalQuote.quote}"`
    : "No user quote was long enough to extract.";

  return [
    `# Session Brief`,
    `Preferred name: ${analysis.userName || "User"}`,
    `Generated: ${new Date(analysis.generatedAt || Date.now()).toLocaleString()}`,
    `Sources: ${sources.diaryEntries || 0} journal entries, ${sources.checkIns || 0} check-ins, ${sources.chatReports || 0} chat reports.`,
    `Preliminary clinician report using the 11-section MindLink harness. HAM-D / HAM-A figures, if present, are conversation-derived conceptual ratings — not administered instruments or diagnoses. Journal mood is self-rated ${MOOD_SCALE_MIN}–${MOOD_SCALE_MAX}.`,
    "",
    formatReportSectionsMarkdown(resolved.sections),
    resolved.rawFallback
      ? `\n## Unstructured model notes\n${resolved.rawFallback}`
      : "",
    "",
    `## Appendix — local source panels`,
    `### Mood trajectory`,
    `Journal mood is self-rated ${MOOD_SCALE_MIN}–${MOOD_SCALE_MAX} (never a 5-point scale).`,
    moodLines,
    analysis.moodSummary?.count
      ? `Average ${analysis.moodSummary.average}/${MOOD_SCALE_MAX} (range ${analysis.moodSummary.min}–${analysis.moodSummary.max}). ${analysis.moodSummary.trend}`
      : "",
    "",
    `### Diary tags`,
    tagLines,
    "",
    `### Notable quote`,
    quoteLine,
    "",
    `---`,
    `This brief is a synthesis of data the teen stored on this device. It is not a clinical assessment, diagnosis, or formal risk score.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function hasEnoughBriefData({ entries = [], checkIns = [], summaries = [] }) {
  const hasDiary = entries.some((entry) => asText(entry.response) || entry.mood != null);
  const hasCheckIn = checkIns.some((item) => (item.messages || []).some((msg) => msg.role === "user" && msg.text));
  const hasReport = summaries.some((item) => asText(item.content));
  return hasDiary || hasCheckIn || hasReport;
}

function formatTeenMoodGlance(moodSummary, moodTrajectory = []) {
  const recent = (moodTrajectory || []).slice(-7);
  if (!moodSummary || moodSummary.count === 0 || recent.length === 0) {
    return {
      headline: "No mood notes yet",
      detail:
        "Save a diary entry with a 1–10 mood and a glance will show up here.",
      recent: [],
    };
  }
  const chips = recent.map((item) => `${item.mood}/10`);
  return {
    headline:
      recent.length === 1
        ? `Latest mood: ${recent[0].mood}/10`
        : `Around ${moodSummary.average}/10 lately`,
    detail: `Recent: ${chips.join(" · ")}`,
    recent,
  };
}

function buildTeenWeekCard(analysis = {}) {
  const sources = analysis.dataSources || {};
  const topTags = Object.entries(analysis.tagFrequency || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag, count]) => ({ tag, count }));
  const readyForSession =
    (sources.diaryEntries || 0) > 0 ||
    (sources.checkIns || 0) > 0 ||
    (sources.chatReports || 0) > 0;
  const moodGlance = formatTeenMoodGlance(
    analysis.moodSummary,
    analysis.moodTrajectory
  );
  return {
    title: "My week",
    moodGlance,
    topTags,
    readyForSession,
    readyTitle: "Ready for session?",
    readyBody: readyForSession
      ? "Yes — you've saved notes this week."
      : "Not yet — write in Diary or Chat first.",
    entryCount: sources.diaryEntries || 0,
    checkInCount: sources.checkIns || 0,
  };
}

function buildLocalChatReport(cleanedMessages = [], userName = "User") {
  const userTurns = cleanedMessages
    .filter((msg) => msg.role === "user")
    .map((msg) => asText(msg.parts?.[0]?.text || msg.text))
    .filter(Boolean);
  const lines = userTurns.slice(-8).map((text) => `- ${text}`);
  return [
    `# Local check-in note for ${userName}`,
    "",
    "Gemini was unavailable, so this note lists the teen's own words from the latest chat. It is not a scored clinical report.",
    "",
    "## What the user shared",
    lines.length > 0 ? lines.join("\n") : "- No user messages were captured.",
    "",
    "## Clinician reminder",
    "Use this as a conversation starter only. No PHQ/HAM scores were generated because no instrument was administered.",
  ].join("\n");
}

function buildLocalKeyPoints(cleanedMessages = []) {
  const userTurns = cleanedMessages
    .filter((msg) => msg.role === "user")
    .map((msg) => asText(msg.parts?.[0]?.text || msg.text))
    .filter(Boolean);
  if (userTurns.length === 0) {
    return {
      title1: "Keep checking in",
      point1: "A short daily note about mood, sleep, or school is enough to start.",
      title2: "Tags help you look back",
      point2: "In the diary, add tags such as school, family, or anxiety so themes are easier to scan.",
      title3: "Share when you are ready",
      point3: "Your notes stay on this device. A clinician can open their view from the top of the app.",
    };
  }
  return {
    title1: "Latest share",
    point1: userTurns[userTurns.length - 1].slice(0, 180),
    title2: "What to notice",
    point2:
      userTurns.length > 1
        ? userTurns[0].slice(0, 180)
        : "Ask what felt most important in this check-in.",
    title3: "Possible opener",
    point3: "What would you want your clinician to understand from today?",
  };
}

module.exports = {
  MOOD_SCALE_MIN,
  MOOD_SCALE_MAX,
  LOW_MOOD_THRESHOLD,
  NOT_DISCLOSED,
  INSUFFICIENT_SCALE,
  REPORT_SECTIONS,
  normalizeMood,
  normalizeTags,
  buildDiaryRecord,
  parseDiaryRecord,
  constrainMoodScaleLanguage,
  buildSynthesisPrompt,
  analyzeLocalSignals,
  buildMockSessionBrief,
  buildLocalReportSections,
  parseStructuredBrief,
  formatReportSectionsMarkdown,
  buildOpeningQuestions,
  formatSessionBriefMarkdown,
  hasEnoughBriefData,
  buildTeenWeekCard,
  buildLocalChatReport,
  buildLocalKeyPoints,
  getMoodTrajectory,
  getTagFrequency,
  extractObservationalSignals,
};
