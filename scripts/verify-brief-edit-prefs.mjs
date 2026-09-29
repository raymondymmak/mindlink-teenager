#!/usr/bin/env node
/**
 * Clinician Brief correction preferences (Lumo MIN-9 / GitHub #51).
 *
 * Preference memory only: a saved correction is logged and later Generate
 * calls see it as soft context. This does not fine-tune weights and does not
 * write gold-pack fixtures.
 *
 *   node scripts/verify-brief-edit-prefs.mjs --log
 *   node scripts/verify-brief-edit-prefs.mjs --inject
 *
 * --log
 *   A Save corrections diff becomes a briefEdit record (theme id, before →
 *   after polarity/claim, drop, note, timestamp), round-trips through the
 *   demo pack, and strips invented scale scores.
 *
 * --inject
 *   That record is reloaded and applied on the next generate path: the
 *   Gemini prompt contains the preference bullets, and the local Brief nudges
 *   a matching theme when evidence does not contradict it. Empty history
 *   leaves Generate unchanged. Preferences cannot invent an SI flag.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const logic = require("../utils/changeBriefLogic.js");
const demoPack = require("../utils/demoPack.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  BRIEF_EDIT_PREFIX,
  applyBriefPreferences,
  buildBriefCorrectionRecord,
  buildBriefPreferenceContext,
  buildChangeBriefPrompt,
  buildLocalChangeBrief,
  normalizeBriefEditRecord,
  snapshotFromChangeBrief,
  WINDOW_LABELS,
} = logic;

const {
  applyDemoPackToStorage,
  createMemoryStorage,
  exportDemoPackFromStorage,
  isRecordName,
} = demoPack;

const SAVED_AT = "2026-09-06T12:30:00.000Z";

function argHas(flag) {
  return process.argv.includes(flag);
}

function usage() {
  console.error(
    "Usage: node scripts/verify-brief-edit-prefs.mjs --log | --inject"
  );
}

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

function generatedBrief() {
  return buildLocalChangeBrief({
    inputs: baselineInputs(),
    priorSnapshot: null,
    now: new Date("2026-09-06T12:00:00.000Z"),
  });
}

function themeIndex(brief, pattern) {
  return (brief.themes || []).findIndex((theme) => pattern.test(theme.label));
}

function themeBy(brief, pattern) {
  return (brief.themes || []).find((theme) => pattern.test(theme.label)) || null;
}

function correctionEdits(brief) {
  const schoolIndex = themeIndex(brief, /school/i);
  const anxietyIndex = themeIndex(brief, /anxiety/i);
  assert.ok(schoolIndex >= 0, "baseline brief has no school theme");
  assert.ok(anxietyIndex >= 0, "baseline brief has no anxiety theme");
  return {
    schoolIndex,
    anxietyIndex,
    edits: {
      themes: [
        {
          index: schoolIndex,
          polarity: "improved",
          claim:
            "Clinician marked school as lighter than the draft. HAM-D 18.",
        },
        { index: anxietyIndex, drop: true },
      ],
      clinicianNote: "Carry school as improved. PHQ-9 11.",
    },
  };
}

function loggedCorrection(brief) {
  const { edits } = correctionEdits(brief);
  return buildBriefCorrectionRecord(brief, edits, {
    id: "briefEdit-2026-09-06-123000000",
    savedAt: SAVED_AT,
    snapshotId: "briefSnapshot-clinician-corrected",
  });
}

function readEditRecords(storage) {
  return storage
    .listKeys()
    .filter(
      (key) => key.startsWith(BRIEF_EDIT_PREFIX) && key.endsWith(".json")
    )
    .map((key) => normalizeBriefEditRecord(JSON.parse(storage.getItem(key))))
    .filter(Boolean)
    .sort((left, right) => String(left.savedAt).localeCompare(String(right.savedAt)));
}

function assertNoTeenEditUi() {
  ["screens", "components"].forEach((dir) => {
    const absolute = path.join(root, dir);
    fs.readdirSync(absolute).forEach((name) => {
      if (!name.endsWith(".js")) return;
      if (name === "ClinicianHomeScreen.js") return;
      const text = fs.readFileSync(path.join(absolute, name), "utf8");
      assert.doesNotMatch(
        text,
        /Edit corrections|save-brief-corrections|saveBriefEditRecord|Clinician preference memory/
      );
    });
  });
}

function runLog() {
  const brief = generatedBrief();
  const beforeSchool = themeBy(brief, /school/i);
  assert.equal(beforeSchool.polarity, "new");
  const record = loggedCorrection(brief);
  assert.ok(record, "a real correction was not logged");
  assert.equal(record.id, "briefEdit-2026-09-06-123000000");
  assert.equal(record.savedAt, SAVED_AT);
  assert.equal(record.snapshotId, "briefSnapshot-clinician-corrected");
  assert.match(record.note, /Carry school as improved/);
  assert.equal(/PHQ-9\s*11/i.test(record.note), false);
  assert.equal(/HAM-D\s*\d+/i.test(JSON.stringify(record)), false);

  const school = record.corrections.find((item) => item.themeId === "school");
  const anxiety = record.corrections.find((item) => item.themeId === "anxiety");
  assert.ok(school, "school correction missing");
  assert.equal(school.label, beforeSchool.label);
  assert.equal(school.beforePolarity, "new");
  assert.equal(school.beforeClaim, beforeSchool.claim);
  assert.equal(school.afterPolarity, "improved");
  assert.match(school.afterClaim, /lighter than the draft/);
  assert.equal(school.drop, false);
  assert.ok(anxiety, "anxiety drop missing");
  assert.equal(anxiety.drop, true);
  assert.equal(anxiety.afterPolarity, null);
  assert.equal(anxiety.beforePolarity, themeBy(brief, /anxiety/i).polarity);

  assert.equal(
    buildBriefCorrectionRecord(brief, {}, { savedAt: SAVED_AT }),
    null
  );

  const fileName = `${record.id}.json`;
  assert.equal(isRecordName(fileName), true);
  const storage = createMemoryStorage();
  storage.setItem(fileName, JSON.stringify(record));
  storage.setItem(
    "diary-2026-09-04-100000000.json",
    JSON.stringify({ date: "2026-09-04", response: "class" })
  );
  const packed = exportDemoPackFromStorage(storage, SAVED_AT);
  assert.match(packed, /briefEdit-2026-09-06-123000000\.json/);
  const restored = createMemoryStorage();
  applyDemoPackToStorage(restored, packed);
  const reloaded = readEditRecords(restored);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].corrections.find((item) => item.themeId === "school").afterPolarity, "improved");
  assert.equal(reloaded[0].corrections.find((item) => item.themeId === "anxiety").drop, true);
  assert.equal(reloaded[0].savedAt, SAVED_AT);

  assertNoTeenEditUi();
  const clinician = fs.readFileSync(
    path.join(root, "screens/ClinicianHomeScreen.js"),
    "utf8"
  );
  assert.match(clinician, /Save corrections/);
  assert.match(clinician, /saveClinicianCorrectedSnapshot/);

  console.log(
    `log: id=${record.id} school=${school.beforePolarity}->${school.afterPolarity} anxietyDrop=${anxiety.drop} demoPack=yes`
  );
}

function promptArgs(priorSnapshot) {
  return {
    kind: "change",
    priorSnapshot,
    analysis: null,
    windowAnalysis: null,
    evidenceCandidates: [],
    windowLabel: WINDOW_LABELS.sinceLastBrief,
  };
}

function runInject() {
  const brief = generatedBrief();
  const record = loggedCorrection(brief);
  const storage = createMemoryStorage();
  storage.setItem(`${record.id}.json`, JSON.stringify(record));
  const preferences = buildBriefPreferenceContext(readEditRecords(storage));
  assert.equal(preferences.empty, false);
  assert.ok(preferences.bullets.some((line) => /school/i.test(line)));
  assert.ok(
    preferences.bullets.some((line) =>
      /Prefer similar framing when evidence matches/.test(line)
    )
  );
  assert.ok(
    preferences.bullets.some((line) => /lighter than the draft/.test(line))
  );
  assert.ok(preferences.bullets.some((line) => /removed/i.test(line) && /anxiety/i.test(line)));
  assert.equal(/HAM-D\s*\d+/i.test(preferences.text), false);
  assert.equal(/PHQ-9\s*\d+/i.test(preferences.text), false);

  const rawSnapshot = snapshotFromChangeBrief(brief, {
    id: "briefSnapshot-raw",
    createdAt: "2026-09-06T12:00:00.000Z",
  });
  const now = new Date("2026-09-14T12:00:00.000Z");
  const inputs = quietReturnInputs();
  const without = buildLocalChangeBrief({
    inputs,
    priorSnapshot: rawSnapshot,
    now,
  });
  const withPrefs = buildLocalChangeBrief({
    inputs,
    priorSnapshot: rawSnapshot,
    now,
    preferences,
  });
  assert.equal(themeBy(without, /school/i)?.polarity, "worse");
  assert.equal(themeBy(withPrefs, /school/i)?.polarity, "improved");
  assert.deepEqual(withPrefs.safetySummary, without.safetySummary);
  assert.equal(withPrefs.safetySummary.siOrSelfHarm, false);
  assert.notEqual(withPrefs.safetySummary.concern, "elevated");
  assert.equal(/HAM-D\s*\d+/i.test(JSON.stringify(withPrefs)), false);
  assert.equal(
    JSON.stringify(withPrefs.themes).includes("lighter than the draft"),
    false
  );

  const barePrompt = buildChangeBriefPrompt(promptArgs(rawSnapshot));
  const emptyPrompt = buildChangeBriefPrompt({
    ...promptArgs(rawSnapshot),
    preferences: buildBriefPreferenceContext([]),
  });
  const nullPrompt = buildChangeBriefPrompt({
    ...promptArgs(rawSnapshot),
    preferences: null,
  });
  assert.equal(emptyPrompt, barePrompt);
  assert.equal(nullPrompt, barePrompt);
  const injected = buildChangeBriefPrompt({
    ...promptArgs(rawSnapshot),
    preferences,
  });
  assert.notEqual(injected, barePrompt);
  assert.match(injected, /Clinician preference memory/);
  assert.match(injected, /Prefer similar framing when evidence matches/);
  assert.match(injected, /lighter than the draft/);
  assert.match(injected, /Do not invent suicidal-ideation flags/);
  assert.equal(/HAM-D\s*18/i.test(injected), false);

  const unchanged = buildLocalChangeBrief({
    inputs,
    priorSnapshot: rawSnapshot,
    now,
    preferences: buildBriefPreferenceContext([]),
  });
  const missing = buildLocalChangeBrief({
    inputs,
    priorSnapshot: rawSnapshot,
    now,
    preferences: buildBriefPreferenceContext(null),
  });
  assert.deepEqual(unchanged, without);
  assert.deepEqual(missing, without);
  assert.equal(buildBriefPreferenceContext(undefined).empty, true);
  assert.doesNotThrow(() =>
    buildLocalChangeBrief({
      inputs: baselineInputs(),
      priorSnapshot: null,
      now: new Date("2026-09-06T12:00:00.000Z"),
      preferences: null,
    })
  );

  const contradicted = applyBriefPreferences(
    {
      ...without,
      themes: [
        {
          label: "School / academic pressure",
          polarity: "worse",
          claim: "School / academic pressure looks harder or stuck since last Brief.",
          evidence: [
            {
              text: "School is harder and I feel exhausted about the exam.",
              sourceType: "diary",
            },
          ],
        },
      ],
    },
    preferences
  );
  assert.equal(themeBy(contradicted, /school/i).polarity, "worse");
  assert.equal(contradicted.safetySummary.siOrSelfHarm, false);

  const engine = fs.readFileSync(
    path.join(root, "utils/sessionBriefEngine.js"),
    "utf8"
  );
  const localData = fs.readFileSync(
    path.join(root, "utils/localData.js"),
    "utf8"
  );
  assert.match(engine, /buildBriefCorrectionRecord/);
  assert.match(engine, /saveBriefEditRecord\(correction\)/);
  assert.match(engine, /buildBriefPreferenceContext/);
  assert.match(engine, /listBriefEditRecords/);
  assert.match(engine, /preferences,/);
  assert.match(localData, /export async function saveBriefEditRecord/);
  assert.match(localData, /export async function listBriefEditRecords/);
  assert.match(localData, /briefEdit-/);

  console.log(
    `inject: without=${themeBy(without, /school/i)?.polarity} with=${themeBy(withPrefs, /school/i)?.polarity} prompt=yes emptyUnchanged=yes`
  );
}

function main() {
  const log = argHas("--log");
  const inject = argHas("--inject");
  if (!log && !inject) {
    usage();
    process.exit(1);
  }
  if (log) runLog();
  if (inject) runInject();
}

main();
