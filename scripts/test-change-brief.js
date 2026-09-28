"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  applyClinicianBriefEdits,
  buildLocalChangeBrief,
  buildChangeBriefPrompt,
  collectSourceIds,
  filterInputsSinceSnapshot,
  formatChangeBriefMarkdown,
  formatSafetyConcernLabel,
  mergeChangeBrief,
  normalizeSnapshot,
  parseChangeBrief,
  saveClinicianCorrectedSnapshot,
  scanSafety,
  shouldPersistGeneratedSnapshot,
  snapshotFromChangeBrief,
  stripInventedScales,
  themesByPolarity,
  usesForbiddenUiWord,
  WINDOW_LABELS,
} = require("../utils/changeBriefLogic");
const { buildTeenWeekCard, analyzeLocalSignals } = require("../utils/sessionBriefLogic");

function baselineInputs() {
  return {
    userName: "Alex",
    entries: [
      {
        date: "2026-09-04",
        createdAt: "2026-09-04T10:00:00.000Z",
        file: "diary-2026-09-04-100000000.json",
        mood: 4,
        tags: ["school", "anxiety"],
        response:
          "I am so worried about the exam and I can't focus in class at all.",
      },
    ],
    checkIns: [
      {
        date: "2026-09-05",
        createdAt: "2026-09-05T11:00:00.000Z",
        file: "checkin-2026-09-05-110000000.json",
        messages: [
          {
            role: "user",
            text: "School has been exhausting and I feel hopeless about the next test.",
          },
        ],
      },
    ],
    summaries: [],
  };
}

function returnInputs() {
  const base = baselineInputs();
  return {
    ...base,
    entries: [
      ...base.entries,
      {
        date: "2026-09-12",
        createdAt: "2026-09-12T09:00:00.000Z",
        file: "diary-2026-09-12-090000000.json",
        mood: 7,
        tags: ["school"],
        response:
          "School felt easier and I managed the homework. I felt okay after talking with Mei.",
      },
      {
        date: "2026-09-13",
        createdAt: "2026-09-13T18:00:00.000Z",
        file: "diary-2026-09-13-180000000.json",
        mood: 3,
        tags: ["anxiety"],
        response:
          "I am still so anxious and panic about ranking. It feels worse than before.",
      },
      {
        date: "2026-09-13",
        createdAt: "2026-09-13T21:00:00.000Z",
        file: "diary-2026-09-13-210000000.json",
        mood: 3,
        tags: ["family"],
        response:
          "Mum and I argued again and I can't sleep. Home feels harder than last week.",
      },
    ],
  };
}

function assertNoDelta(text) {
  assert.ok(!usesForbiddenUiWord(text), `UI copy must not say delta: ${text}`);
}

function testBaselinePath() {
  const brief = buildLocalChangeBrief({
    inputs: baselineInputs(),
    priorSnapshot: null,
    now: new Date("2026-09-06T12:00:00.000Z"),
  });
  assert.strictEqual(brief.kind, "baseline");
  assert.strictEqual(brief.windowLabel, WINDOW_LABELS.firstVisit);
  assert.ok(brief.presentingConcerns.length > 0);
  assert.ok(brief.sessionFocus.length >= 3 && brief.sessionFocus.length <= 5);
  assert.ok(brief.unknowns.length > 0);
  assert.ok(brief.themes.length > 0);
  assert.ok(brief.themes.some((theme) => (theme.evidence || []).length > 0));
  assert.strictEqual(brief.safetySummary.concern, "none");
  assertNoDelta(brief.windowLabel);
  brief.sessionFocus.forEach(assertNoDelta);
  return brief;
}

function testReturnPathWithEvidence() {
  const baseline = testBaselinePath();
  const snapshot = snapshotFromChangeBrief(baseline, {
    id: "briefSnapshot-2026-09-06-120000000",
    createdAt: "2026-09-06T12:00:00.000Z",
  });
  assert.ok(snapshot.sourceEntryIds.includes("diary-2026-09-04-100000000.json"));

  const window = filterInputsSinceSnapshot(returnInputs(), snapshot);
  assert.strictEqual(window.entries.length, 3);
  assert.strictEqual(window.checkIns.length, 0);

  const brief = buildLocalChangeBrief({
    inputs: returnInputs(),
    priorSnapshot: snapshot,
    now: new Date("2026-09-14T12:00:00.000Z"),
  });
  assert.strictEqual(brief.kind, "change");
  assert.strictEqual(brief.windowLabel, WINDOW_LABELS.sinceLastBrief);
  assert.ok(themesByPolarity(brief.themes, "improved").length >= 1);
  assert.ok(themesByPolarity(brief.themes, "worse").length >= 1);
  assert.ok(themesByPolarity(brief.themes, "new").length >= 1);
  const withEvidence = brief.themes.filter((theme) => theme.evidence.length > 0);
  assert.ok(withEvidence.length >= 1);
  withEvidence.forEach((theme) => {
    theme.evidence.forEach((chip) => {
      assert.ok(chip.text.length > 0);
      assert.ok(chip.sourceType === "diary" || chip.sourceType === "chat");
      assert.ok(chip.createdAt);
    });
  });
  assert.ok(brief.sessionFocus.length >= 3);
  assertNoDelta(JSON.stringify(brief));
  return { snapshot, brief };
}

function testEmptyWindowCarriesSafety() {
  const { snapshot } = testReturnPathWithEvidence();
  snapshot.safetySummary = {
    concern: "elevated",
    siOrSelfHarm: true,
    otherRisk: false,
    items: [{ kind: "si", text: "Prior SI language" }],
    stillOpen: [],
  };
  const brief = buildLocalChangeBrief({
    inputs: returnInputs(),
    priorSnapshot: {
      ...snapshot,
      sourceEntryIds: collectSourceIds(returnInputs()),
    },
    now: new Date("2026-09-14T18:00:00.000Z"),
  });
  assert.strictEqual(brief.emptyWindow, true);
  assert.ok(brief.safetySummary.stillOpen.length >= 1);
  assert.ok(brief.sessionFocus.length >= 3);
}

function testSafetyScanElevated() {
  const items = [
    {
      text: "I want to die and I can't see a way out.",
      sourceType: "diary",
      date: "2026-09-13",
    },
  ];
  const safety = scanSafety(items, null);
  assert.strictEqual(safety.concern, "elevated");
  assert.strictEqual(safety.siOrSelfHarm, true);
}

function testParseAndStripHam() {
  const local = buildLocalChangeBrief({ inputs: baselineInputs() });
  const parsed = parseChangeBrief(
    JSON.stringify({
      kind: "change",
      windowLabel: "delta since last visit",
      safetySummary: { concern: "none", items: [] },
      improved: [
        {
          label: "Mood",
          claim: "Mood lifted. HAM-D 8 and HAM-A 10.",
          evidence: [
            {
              text: "Lunch with Mei helped.",
              sourceType: "diary",
              createdAt: "2026-09-12",
            },
          ],
        },
      ],
      worse: [],
      new: [],
      sessionFocus: ["What felt heaviest?"],
    }),
    local
  );
  assert.strictEqual(parsed.windowLabel, WINDOW_LABELS.sinceLastBrief);
  const blob = JSON.stringify(parsed);
  assert.ok(!/HAM-D\s*:?\s*\d+/i.test(blob));
  assert.ok(!/HAM-A\s*:?\s*\d+/i.test(blob));
  assert.ok(parsed.sessionFocus.length >= 3);
  assert.ok(themesByPolarity(parsed.themes, "improved").length >= 1);
}

function testGeminiCannotInventSi() {
  const local = buildLocalChangeBrief({
    inputs: baselineInputs(),
  });
  assert.strictEqual(local.safetySummary.siOrSelfHarm, false);
  assert.notStrictEqual(local.safetySummary.concern, "elevated");
  const merged = mergeChangeBrief(
    {
      kind: "baseline",
      windowLabel: WINDOW_LABELS.firstVisit,
      safetySummary: {
        concern: "elevated",
        siOrSelfHarm: true,
        items: [{ kind: "si", text: "Suicidal ideation language in chat" }],
      },
      sessionFocus: ["Check safety."],
    },
    local
  );
  assert.strictEqual(merged.safetySummary.siOrSelfHarm, false);
  assert.notStrictEqual(merged.safetySummary.concern, "elevated");
}

function testChatReportTemplateDoesNotFlagSafety() {
  const brief = buildLocalChangeBrief({
    inputs: {
      userName: "Alex",
      entries: [
        {
          date: "2026-09-04",
          file: "diary-ok.json",
          mood: 5,
          tags: ["school"],
          response: "I am worried about the exam and I can't focus.",
        },
      ],
      checkIns: [],
      summaries: [
        {
          date: "2026-09-04",
          file: "userReport-2026-09-04.txt",
          content:
            "8. Risk Assessment\nSuicidal Ideation/Self-Harm: no thoughts were disclosed. Not disclosed in conversation.",
        },
      ],
    },
  });
  assert.strictEqual(brief.safetySummary.siOrSelfHarm, false);
  assert.notStrictEqual(brief.safetySummary.concern, "elevated");
}

function testLocalSafetyWinsOverGemini() {
  const local = buildLocalChangeBrief({
    inputs: {
      userName: "Alex",
      entries: [
        {
          date: "2026-09-13",
          file: "diary-si.json",
          mood: 2,
          tags: ["anxiety"],
          response: "I want to die after the exam ranking came out.",
        },
      ],
      checkIns: [],
      summaries: [],
    },
  });
  assert.strictEqual(local.safetySummary.siOrSelfHarm, true);
  const merged = mergeChangeBrief(
    {
      kind: "baseline",
      windowLabel: WINDOW_LABELS.firstVisit,
      safetySummary: { concern: "none", siOrSelfHarm: false, items: [] },
      sessionFocus: ["Check in about school."],
    },
    local
  );
  assert.strictEqual(merged.safetySummary.siOrSelfHarm, true);
  assert.strictEqual(merged.safetySummary.concern, "elevated");
}

function testMarkdownAndPromptCopy() {
  const brief = buildLocalChangeBrief({ inputs: baselineInputs() });
  const markdown = formatChangeBriefMarkdown(brief, {
    analysis: analyzeLocalSignals(baselineInputs()),
  });
  assert.ok(markdown.includes("## Safety"));
  assert.ok(markdown.includes("## Session focus"));
  assert.ok(markdown.includes(WINDOW_LABELS.firstVisit));
  assert.ok(markdown.includes(formatSafetyConcernLabel("none")));
  assert.ok(!markdown.includes("Concern: monitor"));
  assert.ok(!markdown.includes("Concern: none"));
  assert.ok(!markdown.toLowerCase().includes("delta"));
  assert.ok(!/HAM-D:\s*\d+/i.test(markdown));

  const prompt = buildChangeBriefPrompt({
    kind: "change",
    priorSnapshot: snapshotFromChangeBrief(brief),
    analysis: analyzeLocalSignals(baselineInputs()),
    windowAnalysis: analyzeLocalSignals(baselineInputs()),
    evidenceCandidates: [],
    windowLabel: WINDOW_LABELS.sinceLastBrief,
  });
  assert.ok(prompt.includes(WINDOW_LABELS.sinceLastBrief));
  assert.ok(prompt.includes("Never write the word \"delta\""));
  assert.ok(prompt.includes("Never output HAM-D"));
  assert.ok(!usesForbiddenUiWord(WINDOW_LABELS.sinceLastWeek));
}

function testSnapshotNormalize() {
  const snapshot = normalizeSnapshot({
    id: "briefSnapshot-1",
    createdAt: "2026-09-06T12:00:00.000Z",
    kind: "baseline",
    safetySummary: { concern: "monitor", items: [{ text: "Watch sleep" }] },
    themes: [{ label: "School", polarity: "new", claim: "Exams", evidence: [] }],
    unknowns: ["Sleep"],
    sessionFocus: ["Ask about school"],
    sourceEntryIds: ["diary-1.json"],
  });
  assert.strictEqual(snapshot.kind, "baseline");
  assert.strictEqual(snapshot.themes[0].polarity, "new");
  assert.strictEqual(snapshot.safetySummary.concern, "monitor");
}

function testSafetyConcernLabels() {
  assert.strictEqual(
    formatSafetyConcernLabel("none"),
    "No flags this window"
  );
  assert.strictEqual(
    formatSafetyConcernLabel("monitor"),
    "Follow up in session"
  );
  assert.strictEqual(
    formatSafetyConcernLabel("elevated"),
    "Safety language — review in the room"
  );
  const markdown = formatChangeBriefMarkdown({
    kind: "change",
    windowLabel: WINDOW_LABELS.sinceLastBrief,
    safetySummary: {
      concern: "monitor",
      siOrSelfHarm: false,
      items: [],
      stillOpen: ["Sleep still unclear."],
    },
    themes: [],
    sessionFocus: ["Ask about sleep.", "What felt heaviest?", "Anything to not miss?"],
    unknowns: [],
  });
  assert.ok(markdown.includes("Follow up in session"));
  assert.ok(!markdown.includes("Concern: monitor"));
}

function testInstructionForbidsScores() {
  const instruction = fs.readFileSync(
    path.join(__dirname, "../utils/systemInstruction.js"),
    "utf8"
  );
  const block = instruction.slice(
    instruction.indexOf("SYSTEM_INSTRUCTION_CHANGE_BRIEF")
  );
  assert.ok(block.includes("Never output HAM-D"));
  assert.ok(block.includes("Since last Brief"));
  assert.ok(block.includes("delta"));
}

function testTeenLensUnchanged() {
  const card = buildTeenWeekCard(analyzeLocalSignals(baselineInputs()));
  const text = JSON.stringify(card);
  assert.ok(!/Since last Brief|Session focus|Harder or stuck/i.test(text));
  assert.strictEqual(card.title, "My week");
}

function testStripInventedScales() {
  const cleaned = stripInventedScales("Mood lifted. HAM-D 18 PHQ-9 12.");
  assert.ok(!/HAM-D/.test(cleaned) || !/\d/.test(cleaned.match(/HAM-D.*$/) || ""));
  assert.ok(!/HAM-D\s*18/.test(cleaned));
  assert.ok(!/PHQ-9\s*12/.test(cleaned));
}

function quietReturnInputs() {
  const base = baselineInputs();
  return {
    ...base,
    entries: [
      ...base.entries,
      {
        date: "2026-09-12",
        createdAt: "2026-09-12T09:00:00.000Z",
        file: "diary-2026-09-12-quiet.json",
        mood: 4,
        tags: ["school"],
        response:
          "I went to class and finished the assignment about the school project.",
      },
    ],
  };
}

function schoolTheme(brief) {
  return (brief.themes || []).find((theme) => /school/i.test(theme.label)) || null;
}

function testClinicianEditDoesNotInventSafety() {
  const brief = buildLocalChangeBrief({
    inputs: baselineInputs(),
    now: new Date("2026-09-06T12:00:00.000Z"),
  });
  const schoolIndex = brief.themes.findIndex((theme) => /school/i.test(theme.label));
  const anxietyIndex = brief.themes.findIndex((theme) => /anxiety/i.test(theme.label));
  assert.ok(schoolIndex >= 0);
  assert.ok(anxietyIndex >= 0);
  const saved = saveClinicianCorrectedSnapshot(
    brief,
    {
      themes: [
        {
          index: schoolIndex,
          polarity: "worse",
          claim: "Clinician: school pressure is the session priority. HAM-D 18.",
        },
        { index: anxietyIndex, polarity: "drop" },
        {
          index: 99,
          label: "Suicidal ideation",
          polarity: "worse",
          claim: "I want to die",
        },
      ],
      clinicianNote: "Reviewed in room. HAM-D 12. No new scale.",
      safetySummary: {
        concern: "elevated",
        siOrSelfHarm: true,
        items: [{ kind: "si", text: "invented" }],
      },
      moodSummary: { average: 1, count: 9 },
    },
    {
      id: "briefSnapshot-corrected",
      createdAt: "2026-09-06T12:30:00.000Z",
      record: { mode: "local-demo", analysis: { userName: "Alex" } },
    }
  );
  const school = schoolTheme(saved.snapshot);
  assert.ok(school);
  assert.strictEqual(school.polarity, "worse");
  assert.ok(school.claim.includes("session priority"));
  assert.ok(!/HAM-D\s*18/.test(school.claim));
  assert.strictEqual(
    school.evidence.length,
    schoolTheme(brief).evidence.length
  );
  assert.ok(!saved.snapshot.themes.some((theme) => /anxiety/i.test(theme.label)));
  assert.ok(!saved.snapshot.themes.some((theme) => /suicidal/i.test(theme.label)));
  assert.ok(saved.snapshot.clinicianNote.includes("Reviewed in room"));
  assert.ok(!/HAM-D\s*12/.test(saved.snapshot.clinicianNote));
  assert.strictEqual(saved.snapshot.safetySummary.siOrSelfHarm, false);
  assert.notStrictEqual(saved.snapshot.safetySummary.concern, "elevated");
  assert.strictEqual(saved.snapshot.moodSummary.average, brief.moodSummary.average);
  const reloaded = normalizeSnapshot(JSON.parse(JSON.stringify(saved.snapshot)));
  assert.strictEqual(schoolTheme(reloaded).polarity, "worse");
  assert.strictEqual(schoolTheme(reloaded).claim, school.claim);
  assert.ok(saved.record.markdown.includes("session priority"));
  assert.ok(saved.record.markdown.includes("(worse)"));
  assert.ok(saved.record.markdown.includes("## Clinician note"));
  assert.strictEqual(saved.record.changeBrief.clinicianCorrected, true);
  assert.strictEqual(saved.record.snapshotId, "briefSnapshot-corrected");
  assert.ok(!/HAM-D\s*\d+/.test(saved.record.markdown));
}

function testClinicianEditCannotClearLocalSafety() {
  const local = buildLocalChangeBrief({
    inputs: {
      userName: "Alex",
      entries: [
        {
          date: "2026-09-13",
          file: "diary-si.json",
          mood: 2,
          tags: ["anxiety"],
          response: "I want to die after the exam ranking came out.",
        },
      ],
      checkIns: [],
      summaries: [],
    },
  });
  assert.strictEqual(local.safetySummary.siOrSelfHarm, true);
  const edited = applyClinicianBriefEdits(local, {
    themes: [{ index: 0, polarity: "improved", claim: "Looks lighter. PHQ-9 4." }],
    safetySummary: { concern: "none", siOrSelfHarm: false, items: [] },
    clinicianNote: "Denied current plan.",
  });
  assert.strictEqual(edited.safetySummary.siOrSelfHarm, true);
  assert.strictEqual(edited.safetySummary.concern, "elevated");
  assert.ok(!/PHQ-9\s*4/.test(edited.themes[0].claim));
  assert.ok(edited.themes[0].claim.includes("Looks lighter"));
}

function testCorrectedPriorChangesNextBrief() {
  const baseline = buildLocalChangeBrief({
    inputs: baselineInputs(),
    now: new Date("2026-09-06T12:00:00.000Z"),
  });
  const schoolIndex = baseline.themes.findIndex((theme) =>
    /school/i.test(theme.label)
  );
  const rawSnapshot = snapshotFromChangeBrief(baseline, {
    id: "briefSnapshot-raw",
    createdAt: "2026-09-06T12:00:00.000Z",
  });
  const corrected = saveClinicianCorrectedSnapshot(
    baseline,
    {
      themes: [
        {
          index: schoolIndex,
          polarity: "improved",
          claim: "Clinician marked school as lighter than the draft.",
        },
      ],
      clinicianNote: "Carry school as improved.",
    },
    {
      id: "briefSnapshot-corrected-return",
      createdAt: "2026-09-06T12:00:00.000Z",
    }
  ).snapshot;

  const inputs = quietReturnInputs();
  const uncorrected = buildLocalChangeBrief({
    inputs,
    priorSnapshot: rawSnapshot,
    now: new Date("2026-09-14T12:00:00.000Z"),
  });
  const next = buildLocalChangeBrief({
    inputs,
    priorSnapshot: corrected,
    now: new Date("2026-09-14T12:00:00.000Z"),
  });
  assert.strictEqual(schoolTheme(uncorrected)?.polarity, "worse");
  assert.ok(!schoolTheme(next) || schoolTheme(next).polarity === "stable");
  assert.notStrictEqual(schoolTheme(next)?.polarity, "worse");
  assert.ok(next.themes.every((theme) => theme.polarity !== "worse" || !/school/i.test(theme.label)));

  const empty = buildLocalChangeBrief({
    inputs: baselineInputs(),
    priorSnapshot: corrected,
    now: new Date("2026-09-14T12:00:00.000Z"),
  });
  assert.strictEqual(empty.emptyWindow, true);
  assert.strictEqual(empty.safetySummary.siOrSelfHarm, false);
  assert.notStrictEqual(empty.safetySummary.concern, "elevated");
  assert.strictEqual(shouldPersistGeneratedSnapshot(corrected, empty), false);
  assert.ok(
    !JSON.stringify(empty.themes).includes("lighter than the draft")
  );
  assert.ok(!/HAM-D\s*\d+/.test(JSON.stringify(empty)));
  const prompt = buildChangeBriefPrompt({
    kind: "change",
    priorSnapshot: corrected,
    analysis: analyzeLocalSignals(baselineInputs()),
    windowAnalysis: analyzeLocalSignals(baselineInputs()),
    evidenceCandidates: [],
    windowLabel: WINDOW_LABELS.sinceLastBrief,
  });
  assert.ok(prompt.includes("Carry school as improved."));
  assert.ok(prompt.includes("lighter than the draft"));
}

function testLastWeekLabel() {
  const baseline = buildLocalChangeBrief({ inputs: baselineInputs() });
  const snapshot = snapshotFromChangeBrief(baseline, {
    id: "briefSnapshot-week",
    createdAt: "2026-09-06T12:00:00.000Z",
  });
  const brief = buildLocalChangeBrief({
    inputs: returnInputs(),
    priorSnapshot: snapshot,
    windowMode: "last-week",
    now: new Date("2026-09-14T12:00:00.000Z"),
  });
  assert.strictEqual(brief.windowLabel, WINDOW_LABELS.sinceLastWeek);
  assertNoDelta(brief.windowLabel);
}

function main() {
  testBaselinePath();
  testReturnPathWithEvidence();
  testEmptyWindowCarriesSafety();
  testSafetyScanElevated();
  testParseAndStripHam();
  testGeminiCannotInventSi();
  testChatReportTemplateDoesNotFlagSafety();
  testLocalSafetyWinsOverGemini();
  testMarkdownAndPromptCopy();
  testSnapshotNormalize();
  testSafetyConcernLabels();
  testInstructionForbidsScores();
  testTeenLensUnchanged();
  testStripInventedScales();
  testClinicianEditDoesNotInventSafety();
  testClinicianEditCannotClearLocalSafety();
  testCorrectedPriorChangesNextBrief();
  testLastWeekLabel();
  console.log("change-brief unit tests passed");
}

main();
