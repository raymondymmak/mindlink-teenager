"use strict";

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

function collectUserTexts({ entries = [], checkIns = [], summaries = [] }) {
  const texts = [];
  entries.forEach((entry) => {
    if (entry.response) {
      texts.push({
        source: "diary",
        date: entry.date,
        text: asText(entry.response),
        mood: entry.mood,
        tags: entry.tags || [],
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
    .filter((entry) => entry.mood != null && entry.date)
    .map((entry) => ({
      date: entry.date,
      mood: Number(entry.mood),
    }))
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
  let trend = "Stable across recorded days.";
  if (scores.length >= 2) {
    const delta = scores[scores.length - 1] - scores[0];
    if (delta <= -2) trend = "Downward across recorded days.";
    else if (delta >= 2) trend = "Upward across recorded days.";
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
    (entry.tags || []).forEach((tag) => {
      const key = String(tag).replace(/^#/, "");
      if (!key) return;
      tagCounts[key] = (tagCounts[key] || 0) + 1;
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
  const fromSignals = extractObservationalSignals(textItems)
    .filter((signal) =>
      ["school", "family", "peers", "anxiety", "low_mood"].includes(signal.id)
    )
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
    tags: entry.tags || [],
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

  return {
    userName,
    generatedAt: new Date().toISOString(),
    dataSources: {
      diaryEntries: entries.length,
      checkIns: checkIns.length,
      chatReports: summaries.length,
    },
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

function buildMockSessionBrief(analysis, { reason } = {}) {
  const { moodSummary, themes, correlations, criticalQuote, observationalSignals } =
    analysis;
  const themeLine =
    themes.length > 0 ? themes.map((theme) => `- ${theme}`).join("\n") : "- Not enough tagged or repeated topics yet.";
  const signalLine =
    observationalSignals.length > 0
      ? observationalSignals
          .map(
            (signal) =>
              `- ${signal.label} (mentioned in ${signal.sources.join(", ")}; ${signal.mentionCount} match${signal.mentionCount === 1 ? "" : "es"})`
          )
          .join("\n")
      : "- No PHQ-adjacent phrases were detected in the stored user text.";
  const quoteLine = criticalQuote.quote
    ? `"${criticalQuote.quote}"`
    : "No user quote was long enough to extract.";
  const questions = buildOpeningQuestions(analysis)
    .map((question) => `- ${question}`)
    .join("\n");
  const moodLine =
    moodSummary.count > 0
      ? `Self-rated journal mood across ${moodSummary.count} day(s): average ${moodSummary.average}/10 (range ${moodSummary.min}–${moodSummary.max}). ${moodSummary.trend}`
      : "No journal mood scores are stored yet. Trajectory is based on check-in text only.";

  return [
    `## Mood trajectory`,
    moodLine,
    "",
    `## Recurring themes`,
    themeLine,
    "",
    `## Stressors on lower-mood days`,
    correlations.summary,
    "",
    `## Notable quote`,
    quoteLine,
    "",
    `## Observational signals from user-reported text`,
    "These are keyword matches from journal/check-in wording, not a PHQ-9 or other scored instrument.",
    signalLine,
    "",
    `## Suggested opening questions`,
    questions,
    "",
    reason
      ? `_Local demo brief (${reason}). Not a diagnosis._`
      : `_Local demo brief synthesized on-device. Not a diagnosis._`,
  ].join("\n");
}

function formatSessionBriefMarkdown(analysis, narrative) {
  const sources = analysis.dataSources || {};
  const header = [
    `# Session Brief`,
    `Preferred name: ${analysis.userName || "User"}`,
    `Generated: ${new Date(analysis.generatedAt || Date.now()).toLocaleString()}`,
    `Sources: ${sources.diaryEntries || 0} journal entries, ${sources.checkIns || 0} check-ins, ${sources.chatReports || 0} chat reports.`,
    "",
    narrative.trim(),
    "",
    `---`,
    `This brief is a synthesis of data the teen stored on this device. It is not a clinical assessment, diagnosis, or risk score.`,
  ];
  return header.join("\n");
}

function hasEnoughBriefData({ entries = [], checkIns = [], summaries = [] }) {
  const hasDiary = entries.some((entry) => asText(entry.response) || entry.mood != null);
  const hasCheckIn = checkIns.some((item) => (item.messages || []).some((msg) => msg.role === "user" && msg.text));
  const hasReport = summaries.some((item) => asText(item.content));
  return hasDiary || hasCheckIn || hasReport;
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
      point1: "A short daily note about mood, sleep, or school is enough to start a Session Brief.",
      title2: "Tags help the brief",
      point2: "In the diary, add tags such as school, family, or anxiety so themes are easier to scan.",
      title3: "Share with a clinician",
      point3: "The Session Brief can be copied or shared as plain text from the Brief tab.",
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
  LOW_MOOD_THRESHOLD,
  analyzeLocalSignals,
  buildMockSessionBrief,
  buildOpeningQuestions,
  formatSessionBriefMarkdown,
  hasEnoughBriefData,
  buildLocalChatReport,
  buildLocalKeyPoints,
  getMoodTrajectory,
  getTagFrequency,
  extractObservationalSignals,
};
