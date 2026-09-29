#!/usr/bin/env node
/**
 * Clinician Brief correction checkpointers (Lumo MIN-7 / GitHub #47).
 *
 * In-process — no browser, no Expo server:
 *   node scripts/verify-clinician-brief-edit.mjs --snapshot
 *   node scripts/verify-clinician-brief-edit.mjs --return-path
 *
 * --snapshot
 *   Mutate polarity and claim, save the corrected snapshot into an in-memory
 *   store (same briefSnapshot key shape as on-device storage), reload it, and
 *   require the edits — not the pre-edit generate output.
 *
 * --return-path
 *   A corrected prior changes the next buildLocalChangeBrief. A quiet school
 *   note stays out of the "worse" bucket after the clinician marks school
 *   improved. An empty window does not replace that snapshot and does not
 *   invent SI flags or clinical scale scores.
 *
 * Demo packs: Load restores the packed snapshot. Corrections saved after Load
 * write a new latest snapshot on the device; Save pack after that includes it.
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
  buildChangeBriefPrompt,
  buildLocalChangeBrief,
  normalizeSnapshot,
  saveClinicianCorrectedSnapshot,
  shouldPersistGeneratedSnapshot,
  WINDOW_LABELS,
} = logic;

const { createMemoryStorage } = demoPack;

const LAST_SNAPSHOT_KEY = "@last_brief_snapshot_path";
const LAST_BRIEF_KEY = "@last_session_brief_path";

function argHas(flag) {
  return process.argv.includes(flag);
}

function usage() {
  console.error(
    "Usage: node scripts/verify-clinician-brief-edit.mjs --snapshot | --return-path"
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

function schoolTheme(brief) {
  return (
    (brief?.themes || []).find((theme) => /school/i.test(theme.label)) || null
  );
}

function generatedBrief() {
  return buildLocalChangeBrief({
    inputs: baselineInputs(),
    priorSnapshot: null,
    now: new Date("2026-09-06T12:00:00.000Z"),
  });
}

function writeRecord(storage, name, value) {
  storage.setItem(name, JSON.stringify(value));
  return name;
}

function persistCorrection(storage, prepared) {
  const snapshotId = prepared.snapshot.id;
  const snapshotName = `${snapshotId}.json`;
  writeRecord(storage, snapshotName, prepared.snapshot);
  storage.setItem(LAST_SNAPSHOT_KEY, snapshotName);
  const briefName = "sessionBrief-corrected.json";
  writeRecord(storage, briefName, prepared.record);
  storage.setItem(LAST_BRIEF_KEY, briefName);
  return { snapshotName, briefName };
}

function reloadSnapshot(storage) {
  const name = storage.getItem(LAST_SNAPSHOT_KEY);
  assert.ok(name, "latest snapshot path missing");
  const raw = storage.getItem(name);
  assert.ok(raw, "snapshot file missing");
  return normalizeSnapshot(JSON.parse(raw));
}

function reloadBrief(storage) {
  const name = storage.getItem(LAST_BRIEF_KEY);
  assert.ok(name, "latest session brief path missing");
  return JSON.parse(storage.getItem(name));
}

function assertNoInventedFlags(snapshot, before) {
  assert.equal(snapshot.safetySummary.siOrSelfHarm, before.safetySummary.siOrSelfHarm);
  assert.equal(snapshot.safetySummary.concern, before.safetySummary.concern);
  assert.equal(snapshot.moodSummary?.average, before.moodSummary?.average);
  const blob = JSON.stringify(snapshot);
  assert.equal(/HAM-D\s*\d+/i.test(blob), false);
  assert.equal(/PHQ-?9\s*\d+/i.test(blob), false);
}

function runSnapshot() {
  const brief = generatedBrief();
  const beforeSchool = schoolTheme(brief);
  assert.ok(beforeSchool, "baseline brief has no school theme");
  assert.equal(beforeSchool.polarity, "new");
  const schoolIndex = brief.themes.findIndex((theme) => /school/i.test(theme.label));
  const anxietyIndex = brief.themes.findIndex((theme) =>
    /anxiety/i.test(theme.label)
  );
  assert.ok(anxietyIndex >= 0, "baseline brief has no anxiety theme");

  const prepared = saveClinicianCorrectedSnapshot(
    brief,
    {
      themes: [
        {
          index: schoolIndex,
          polarity: "worse",
          claim:
            "Clinician: school is harder than the draft said. HAM-D 18.",
        },
        { index: anxietyIndex, drop: true },
      ],
      clinicianNote: "Short note for next visit. PHQ-9 11.",
      safetySummary: { concern: "elevated", siOrSelfHarm: true, items: [] },
    },
    {
      id: "briefSnapshot-clinician-corrected",
      createdAt: "2026-09-06T12:30:00.000Z",
      now: new Date("2026-09-06T12:30:00.000Z"),
      record: { mode: "local-demo", analysis: { userName: "Alex" } },
    }
  );

  const storage = createMemoryStorage();
  persistCorrection(storage, prepared);
  const reloaded = reloadSnapshot(storage);
  const briefRecord = reloadBrief(storage);
  const school = schoolTheme(reloaded);

  assert.ok(school, "reloaded snapshot dropped the edited school theme");
  assert.equal(school.polarity, "worse");
  assert.match(school.claim, /harder than the draft/);
  assert.notEqual(school.claim, beforeSchool.claim);
  assert.equal(/HAM-D\s*18/i.test(school.claim), false);
  assert.equal(
    reloaded.themes.some((theme) => /anxiety/i.test(theme.label)),
    false
  );
  assert.match(reloaded.clinicianNote, /Short note for next visit/);
  assert.equal(/PHQ-9\s*11/i.test(reloaded.clinicianNote), false);
  assertNoInventedFlags(reloaded, brief);
  assert.equal(briefRecord.changeBrief.themes.find((theme) => /school/i.test(theme.label)).polarity, "worse");
  assert.match(briefRecord.markdown, /harder than the draft/);
  assert.match(briefRecord.markdown, /## Clinician note/);
  assert.equal(briefRecord.snapshotId, reloaded.id);

  console.log(
    `snapshot: polarity=${school.polarity} themes=${reloaded.themes.length} noteSaved=yes`
  );
}

function runReturnPath() {
  const brief = generatedBrief();
  const schoolIndex = brief.themes.findIndex((theme) => /school/i.test(theme.label));
  const prepared = saveClinicianCorrectedSnapshot(
    brief,
    {
      themes: [
        {
          index: schoolIndex,
          polarity: "improved",
          claim: "Clinician marked school as lighter than the draft.",
        },
      ],
      clinicianNote: "Carry school as improved. HAM-D 9.",
    },
    {
      id: "briefSnapshot-clinician-return",
      createdAt: "2026-09-06T12:00:00.000Z",
      now: new Date("2026-09-06T12:00:00.000Z"),
      record: { mode: "local-demo" },
    }
  );

  const storage = createMemoryStorage();
  persistCorrection(storage, prepared);
  const corrected = reloadSnapshot(storage);
  assert.equal(schoolTheme(corrected)?.polarity, "improved");
  assert.equal(/HAM-D\s*9/i.test(corrected.clinicianNote), false);

  const rawPrior = normalizeSnapshot(
    JSON.parse(JSON.stringify(saveClinicianCorrectedSnapshot(brief, {}, {
      id: "briefSnapshot-raw-prior",
      createdAt: "2026-09-06T12:00:00.000Z",
    }).snapshot))
  );
  // Empty edits still mark clinicianCorrected, but themes stay at generate polarity.
  assert.equal(schoolTheme(rawPrior)?.polarity, "new");

  const inputs = quietReturnInputs();
  const now = new Date("2026-09-14T12:00:00.000Z");
  const uncorrected = buildLocalChangeBrief({
    inputs,
    priorSnapshot: rawPrior,
    now,
  });
  const next = buildLocalChangeBrief({
    inputs,
    priorSnapshot: corrected,
    now,
  });
  assert.equal(schoolTheme(uncorrected)?.polarity, "worse");
  assert.notEqual(schoolTheme(next)?.polarity, "worse");
  assert.equal(next.safetySummary.siOrSelfHarm, false);

  const empty = buildLocalChangeBrief({
    inputs: baselineInputs(),
    priorSnapshot: corrected,
    now,
  });
  assert.equal(empty.emptyWindow, true);
  assert.equal(empty.safetySummary.siOrSelfHarm, false);
  assert.notEqual(empty.safetySummary.concern, "elevated");
  assert.equal(shouldPersistGeneratedSnapshot(corrected, empty), false);
  assert.equal(
    JSON.stringify(empty.themes).includes("lighter than the draft"),
    false
  );
  assert.equal(/HAM-D\s*\d+/i.test(JSON.stringify(empty)), false);

  const prompt = buildChangeBriefPrompt({
    kind: "change",
    priorSnapshot: corrected,
    analysis: null,
    windowAnalysis: null,
    evidenceCandidates: [],
    windowLabel: WINDOW_LABELS.sinceLastBrief,
  });
  assert.match(prompt, /Carry school as improved/);

  const screen = fs.readFileSync(
    path.join(root, "screens/ClinicianHomeScreen.js"),
    "utf8"
  );
  const engine = fs.readFileSync(
    path.join(root, "utils/sessionBriefEngine.js"),
    "utf8"
  );
  assert.match(screen, /Edit corrections/);
  assert.match(screen, /Save corrections/);
  assert.match(screen, /saveClinicianCorrectedSnapshot/);
  assert.match(engine, /export async function saveClinicianCorrectedSnapshot/);
  assert.match(engine, /saveBriefSnapshot\(prepared\.snapshot\)/);
  assert.match(engine, /shouldPersistGeneratedSnapshot/);

  console.log(
    `return-path: uncorrected=${schoolTheme(uncorrected)?.polarity} correctedNext=${schoolTheme(next)?.polarity || "omitted"} emptyWindow=${empty.emptyWindow} persist=${shouldPersistGeneratedSnapshot(corrected, empty)}`
  );
}

function main() {
  const snapshot = argHas("--snapshot");
  const returnPath = argHas("--return-path");
  if (!snapshot && !returnPath) {
    usage();
    process.exit(1);
  }
  if (snapshot) runSnapshot();
  if (returnPath) runReturnPath();
}

main();
