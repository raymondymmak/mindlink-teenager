"use strict";

const assert = require("assert");
const {
  analyzeLocalSignals,
  buildMockSessionBrief,
  buildLocalChatReport,
  buildLocalKeyPoints,
  formatSessionBriefMarkdown,
  hasEnoughBriefData,
  getTagFrequency,
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

function testMockBrief(analysis) {
  const narrative = buildMockSessionBrief(analysis, { reason: "unit test" });
  assert.ok(narrative.includes("Suggested opening questions"));
  assert.ok(narrative.includes("Alex"));
  assert.ok(!/HAM-A|Hamilton/.test(narrative));
  assert.ok((analysis.openingQuestions || []).length >= 2);

  const markdown = formatSessionBriefMarkdown(analysis, narrative);
  assert.ok(markdown.startsWith("# Session Brief"));
  assert.ok(markdown.includes("## Mood trajectory"));
  assert.ok(markdown.includes("## Recurring themes"));
  assert.ok(markdown.includes("## Stressors on lower-mood days"));
  assert.ok(markdown.includes("## Notable quote"));
  assert.ok(markdown.includes("Observational signals"));
  assert.ok(markdown.includes("Preferred name: Alex"));
  assert.ok(markdown.includes("not a clinical assessment"));
  assert.ok(!/HAM-A|Hamilton/.test(markdown));
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
  testEmptyState();
  testChatFallbacks();
  console.log("session-brief unit tests passed");
}

main();
