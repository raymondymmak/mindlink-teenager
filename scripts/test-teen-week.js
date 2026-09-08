"use strict";

const assert = require("assert");
const {
  analyzeLocalSignals,
  buildTeenWeekCard,
  buildMockSessionBrief,
  formatSessionBriefMarkdown,
} = require("../utils/sessionBriefLogic");
const {
  APP_MODES,
  isClinicianMode,
  modeToggleLabel,
  normalizeAppMode,
} = require("../utils/appMode");

function sampleAnalysis() {
  return analyzeLocalSignals({
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
}

function collectTeenText(card) {
  return [
    card.title,
    card.moodGlance?.headline,
    card.moodGlance?.detail,
    card.readyTitle,
    card.readyBody,
    ...(card.topTags || []).map((item) => item.tag),
  ]
    .filter(Boolean)
    .join("\n");
}

function testModeLens() {
  assert.strictEqual(normalizeAppMode("clinician"), APP_MODES.clinician);
  assert.strictEqual(normalizeAppMode("teen"), APP_MODES.teen);
  assert.strictEqual(normalizeAppMode("nope"), APP_MODES.teen);
  assert.strictEqual(normalizeAppMode(undefined), APP_MODES.teen);
  assert.strictEqual(isClinicianMode("clinician"), true);
  assert.strictEqual(isClinicianMode("teen"), false);
  assert.strictEqual(modeToggleLabel("teen"), "Show clinician view");
  assert.strictEqual(modeToggleLabel("clinician"), "Show teen view");
}

function testTeenWeekHidesClinicalJargon() {
  const analysis = sampleAnalysis();
  const card = buildTeenWeekCard(analysis);
  assert.strictEqual(card.title, "My week");
  assert.strictEqual(card.readyForSession, true);
  assert.ok(card.moodGlance.headline.includes("/10"));
  assert.ok(card.moodGlance.detail.includes("/10"));
  assert.ok(!card.moodGlance.headline.includes("/5"));
  assert.ok(card.topTags.some((item) => item.tag === "school"));
  assert.ok(card.readyBody.includes("saved notes"));

  const teenText = collectTeenText(card);
  assert.ok(!/PHQ/i.test(teenText));
  assert.ok(!/HAM-A|Hamilton/i.test(teenText));
  assert.ok(!/Session Brief/i.test(teenText));
  assert.ok(!/observational/i.test(teenText));
  assert.ok(!/diagnosis/i.test(teenText));
  assert.ok(!/psychiatrist/i.test(teenText));
  assert.ok(!/opening question/i.test(teenText));
}

function testSameLocalDataFeedsClinicianBrief() {
  const analysis = sampleAnalysis();
  const card = buildTeenWeekCard(analysis);
  const markdown = formatSessionBriefMarkdown(
    analysis,
    buildMockSessionBrief(analysis, { reason: "mode split" })
  );

  assert.strictEqual(card.entryCount, analysis.dataSources.diaryEntries);
  assert.ok(markdown.includes("# Session Brief"));
  assert.ok(markdown.includes("## 1. User Profile"));
  assert.ok(markdown.includes("## 11. Suggestions for User"));
  assert.ok(markdown.includes("### Mood trajectory"));
  assert.ok(markdown.includes("3/10"));
  assert.ok(markdown.includes("7/10"));
  assert.ok(analysis.tagFrequency.school >= 1);
  assert.ok(/not a PHQ-9|not a clinical assessment/i.test(markdown));
  assert.ok(!/\bPHQ-9:\s*\d/i.test(markdown));
}

function testEmptyTeenWeek() {
  const analysis = analyzeLocalSignals({
    userName: "Alex",
    entries: [],
    checkIns: [],
    summaries: [],
  });
  const card = buildTeenWeekCard(analysis);
  assert.strictEqual(card.readyForSession, false);
  assert.ok(/No mood notes yet/i.test(card.moodGlance.headline));
  assert.strictEqual(card.topTags.length, 0);
}

function main() {
  testModeLens();
  testTeenWeekHidesClinicalJargon();
  testSameLocalDataFeedsClinicianBrief();
  testEmptyTeenWeek();
  console.log("teen-clinician mode unit tests passed");
}

main();
