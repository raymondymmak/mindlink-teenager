"use strict";

const assert = require("assert");
const {
  analyzeLocalSignals,
  buildMockSessionBrief,
  buildLocalChatReport,
  buildLocalKeyPoints,
  buildDiaryRecord,
  buildLocalReportSections,
  buildSynthesisPrompt,
  constrainMoodScaleLanguage,
  formatSessionBriefMarkdown,
  hasEnoughBriefData,
  getTagFrequency,
  normalizeTags,
  parseDiaryRecord,
  parseStructuredBrief,
  REPORT_SECTIONS,
  NOT_DISCLOSED,
} = require("../utils/sessionBriefLogic");

function testMoodAndTags() {
  const analysis = analyzeLocalSignals({
    userName: "Alex",
    entries: [
      {
        date: "2026-09-04",
        mood: 7,
        tags: ["friends"],
        response: "Had lunch with my classmates and felt okay.",
      },
      {
        date: "2026-09-05",
        mood: 3,
        tags: ["school", "anxiety"],
        response:
          "I am so worried about the exam and I can't focus in class at all.",
      },
    ],
    checkIns: [
      {
        date: "2026-09-06",
        messages: [
          {
            role: "user",
            text: "School has been exhausting and I feel hopeless about the next test.",
          },
        ],
      },
    ],
    summaries: [],
  });

  assert.strictEqual(analysis.moodSummary.count, 2);
  assert.strictEqual(analysis.moodSummary.average, 5);
  assert.strictEqual(analysis.moodSummary.min, 3);
  assert.strictEqual(analysis.moodSummary.max, 7);
  assert.ok(analysis.moodSummary.trend.includes("Downward"));
  assert.deepStrictEqual(getTagFrequency(analysis.moodTrajectory), {});
  assert.ok(analysis.tagFrequency.school >= 1);
  assert.ok(analysis.correlations.count >= 1);
  assert.ok(analysis.observationalSignals.some((signal) => signal.id === "school"));
  assert.ok(
    analysis.observationalSignals.some((signal) => signal.id === "hopelessness")
  );
  assert.ok(analysis.criticalQuote.quote.length > 0);
  return analysis;
}

function assertElevenSectionScaffold(text) {
  REPORT_SECTIONS.forEach((section) => {
    assert.ok(
      text.includes(`## ${section.number}. ${section.title}`),
      `missing section ${section.number}. ${section.title}`
    );
  });
}

function testMockBrief(analysis) {
  const narrative = buildMockSessionBrief(analysis, { reason: "unit test" });
  assertElevenSectionScaffold(narrative);
  assert.ok(narrative.includes("Alex"));
  assert.ok(/preliminary|conversation-derived|Insufficient data/i.test(narrative));
  assert.ok(!/HAM-A:\s*\d+/i.test(narrative));
  assert.ok(!/HAM-D:\s*\d+/i.test(narrative));
  assert.ok(narrative.includes("/10"));
  assert.ok(!/out of 5/.test(narrative));
  assert.ok(!/\b\/5\b/.test(narrative));
  assert.ok((analysis.openingQuestions || []).length >= 2);

  const sections = buildLocalReportSections(analysis, { reason: "unit test" });
  assert.strictEqual(Object.keys(sections).length, 11);
  assert.ok(sections.userProfile.includes("Alex"));
  assert.ok(sections.userProfile.includes(NOT_DISCLOSED));
  assert.ok(sections.moodAffectiveState.includes("3/10") || sections.moodAffectiveState.includes("/10"));

  const markdown = formatSessionBriefMarkdown(analysis, sections);
  assert.ok(markdown.startsWith("# Session Brief"));
  assertElevenSectionScaffold(markdown);
  assert.ok(markdown.includes("Preferred name: Alex"));
  assert.ok(markdown.includes("not a clinical assessment"));
  assert.ok(markdown.includes("Appendix — local source panels"));
  assert.ok(markdown.includes("### Mood trajectory"));
  assert.ok(!/HAM-A:\s*\d+/i.test(markdown));
}

function testStructuredParseKeepsScaffold() {
  const json = JSON.stringify({
    userProfile: "Age 16, stated.",
    presentingConcerns: "Exam stress. Preliminary HAM-D 8 / HAM-A 10, conversation-derived only.",
    moodAffectiveState: "Low mood; journal 3/10.",
    anxietyStressLevels: "Worry about school.",
    extraIgnored: "should not become a twelfth section",
  });
  const parsed = parseStructuredBrief(json);
  assert.strictEqual(parsed.filled, 4);
  assert.strictEqual(parsed.sections.userProfile, "Age 16, stated.");
  assert.strictEqual(parsed.sections.functioning, NOT_DISCLOSED);
  assert.strictEqual(parsed.rawFallback, "");

  const markdown = `
## 1. User Profile
Preferred name only.

## 2. Presenting Concerns
School pressure.

## 3. Mood & Affective State
Anxious, tired.

## 6. Functioning
Hard to keep up in class.

## 8. Risk Assessment
No SI disclosed.
`;
  const fromMd = parseStructuredBrief(markdown);
  assert.ok(fromMd.filled >= 4);
  assert.ok(fromMd.sections.userProfile.includes("Preferred name"));
  assert.strictEqual(fromMd.sections.suggestionsForUser, NOT_DISCLOSED);

  const blob = parseStructuredBrief("Just a wall of freeform clinician notes.");
  assert.strictEqual(blob.filled, 0);
  assert.ok(blob.rawFallback.includes("freeform"));
  REPORT_SECTIONS.forEach((section) => {
    assert.strictEqual(blob.sections[section.id], NOT_DISCLOSED);
  });
}

function testEmptyState() {
  assert.strictEqual(
    hasEnoughBriefData({ entries: [], checkIns: [], summaries: [] }),
    false
  );
  assert.strictEqual(
    hasEnoughBriefData({
      entries: [{ date: "2026-09-06", mood: 5, response: "ok" }],
      checkIns: [],
      summaries: [],
    }),
    true
  );
}

function testTagNormalizationAndPersistence() {
  assert.deepStrictEqual(normalizeTags(["school", "#family", "friends"]), [
    "school",
    "family",
    "friends",
  ]);
  assert.deepStrictEqual(normalizeTags("anxiety, lonely"), [
    "anxiety",
    "lonely",
  ]);
  assert.deepStrictEqual(normalizeTags({ school: true, family: true }), [
    "school",
    "family",
  ]);

  const saved = buildDiaryRecord({
    date: "2026-09-07",
    prompt: "How are you feeling today?",
    response: "School was heavy and I felt left out at lunch.",
    mood: 3,
    tags: ["school", "anxiety", "lonely"],
  });
  const raw = JSON.stringify(saved);
  const loaded = parseDiaryRecord(raw, { source: "diary", file: "diary-test.json" });
  assert.strictEqual(loaded.mood, 3);
  assert.deepStrictEqual(loaded.tags, ["school", "anxiety", "lonely"]);
  assert.ok(raw.includes('"tags":['));
  assert.ok(raw.includes("school"));
}

function testDiarySaveShowsInBrief() {
  const stored = JSON.stringify(
    buildDiaryRecord({
      date: "2026-09-07",
      prompt: "How are you feeling today?",
      response: "I felt anxious about school and stayed away from friends.",
      mood: 3,
      tags: ["school", "anxiety"],
    })
  );
  const entry = parseDiaryRecord(stored, { source: "diary" });
  const analysis = analyzeLocalSignals({
    userName: "Alex",
    entries: [entry],
    checkIns: [],
    summaries: [],
  });

  assert.strictEqual(analysis.moodSummary.count, 1);
  assert.strictEqual(analysis.moodSummary.min, 3);
  assert.strictEqual(analysis.moodSummary.max, 3);
  assert.strictEqual(analysis.moodScale.max, 10);
  assert.ok(analysis.tagFrequency.school >= 1);
  assert.ok(analysis.tagFrequency.anxiety >= 1);
  assert.ok(analysis.correlations.count >= 1);
  assert.ok(analysis.correlations.summary.includes("#school"));
  assert.ok(analysis.correlations.summary.includes("#anxiety"));

  const markdown = formatSessionBriefMarkdown(
    analysis,
    buildMockSessionBrief(analysis, { reason: "repro" })
  );
  assert.ok(markdown.includes("3/10"));
  assert.ok(markdown.includes("1–10") || markdown.includes("1-10"));
  assert.ok(!/\b3\s*\/\s*5\b/.test(markdown));
  assert.ok(!/out of 5/i.test(markdown));

  const prompt = buildSynthesisPrompt(analysis);
  assert.ok(prompt.includes("tagFrequency"));
  assert.ok(prompt.includes('"school"'));
  assert.ok(prompt.includes("1") && prompt.includes("10"));
  assert.ok(prompt.includes("Never rescale"));
  assert.ok(prompt.includes("not 3/5"));
  assert.ok(prompt.includes("userProfile"));
  assert.ok(prompt.includes("presentingConcerns"));
  assert.ok(prompt.includes("suggestionsForUser"));
  assert.ok(prompt.includes("11-section"));
  assert.ok(!/cite mood as n\/5/i.test(prompt));
}

function testMoodScaleCopyNeverUsesOutOfFive() {
  const rewritten = constrainMoodScaleLanguage(
    "Score: 3 out of 5. Mood was 3/5 on a 5-point scale."
  );
  assert.ok(rewritten.includes("3 out of 10"));
  assert.ok(rewritten.includes("3/10"));
  assert.ok(!/out of 5/i.test(rewritten));
  assert.ok(!/\b3\/5\b/.test(rewritten));

  const fs = require("fs");
  const path = require("path");
  const instruction = fs.readFileSync(
    path.join(__dirname, "../utils/systemInstruction.js"),
    "utf8"
  );
  const summaryBlock = instruction.slice(
    instruction.indexOf("SYSTEM_INSTRUCTION_SUMMARY"),
    instruction.indexOf("SYSTEM_INSTRUCTION_SESSION_BRIEF")
  );
  assert.ok(summaryBlock.includes("User Profile"));
  assert.ok(summaryBlock.includes("Presenting Concerns"));
  assert.ok(summaryBlock.includes("Mood & Affective State"));
  assert.ok(summaryBlock.includes("Anxiety & Stress Levels"));
  assert.ok(summaryBlock.includes("Cognitive & Perceptual State"));
  assert.ok(summaryBlock.includes("HEADSS Contextual Factors"));
  assert.ok(summaryBlock.includes("Risk Assessment"));
  assert.ok(summaryBlock.includes("Strengths & Protective Factors"));
  assert.ok(summaryBlock.includes("Key Insights & Potential Areas of Concern"));
  assert.ok(summaryBlock.includes("Suggestions for User"));
  assert.ok(summaryBlock.includes("Hamilton Depression Scale"));
  assert.ok(summaryBlock.includes("HAM-A"));

  const briefBlock = instruction.slice(
    instruction.indexOf("SYSTEM_INSTRUCTION_SESSION_BRIEF")
  );
  assert.ok(briefBlock.includes("n/10"));
  assert.ok(briefBlock.includes("not 3/5"));
  assert.ok(briefBlock.includes("Never rescale mood to a 5-point scale"));
  assert.ok(briefBlock.includes("userProfile"));
  assert.ok(briefBlock.includes("Not disclosed in conversation"));
}

function testChatFallbacks() {
  const report = buildLocalChatReport(
    [{ role: "user", parts: [{ text: "I am tired of school." }] }],
    "Alex"
  );
  assert.ok(report.includes("Alex"));
  assert.ok(report.includes("I am tired of school."));
  assert.ok(report.includes("No PHQ/HAM scores"));

  const points = buildLocalKeyPoints([
    { role: "user", parts: [{ text: "I argued with my mum." }] },
  ]);
  assert.ok(points.title1);
  assert.ok(points.point1.includes("mum"));
}

function main() {
  const analysis = testMoodAndTags();
  testMockBrief(analysis);
  testStructuredParseKeepsScaffold();
  testEmptyState();
  testChatFallbacks();
  testTagNormalizationAndPersistence();
  testDiarySaveShowsInBrief();
  testMoodScaleCopyNeverUsesOutOfFive();
  console.log("session-brief unit tests passed");
}

main();
