#!/usr/bin/env node
/**
 * Gold-pack eval for the local Session Brief pipeline (GitHub #49 / Lumo MIN-8).
 *
 * Runs buildLocalChangeBrief only. Does not call Gemini or the network.
 *
 *   node scripts/eval-brief-gold.mjs
 *   node scripts/eval-brief-gold.mjs --self-check-negative
 *
 * Default: every pack under fixtures/gold-packs/ must pass (exit 0).
 * --self-check-negative: exit 0 only when a deliberately wrong expected
 * polarity is reported as a failure.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { buildLocalChangeBrief, snapshotFromChangeBrief } = require("../utils/changeBriefLogic");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = path.join(root, "fixtures", "gold-packs");

const POLARITIES = ["improved", "worse", "new", "stable"];
const INVENTED_SCALE_RE =
  /\b(?:HAM-?[DA]|PHQ-?9|GAD-?7|BDI-?Y|SBQ-?R)\b/i;
const FORBIDDEN_SECRET_RE = /AIza|GEMINI_API_KEY|EXPO_PUBLIC_GEMINI|PINECONE_KEY|sk-[A-Za-z0-9]/;

function argHas(flag) {
  return process.argv.includes(flag);
}

function usage() {
  console.error(
    "Usage: node scripts/eval-brief-gold.mjs [--self-check-negative]"
  );
}

function loadPacks() {
  if (!fs.existsSync(packsDir)) {
    throw new Error(`Missing gold pack directory: ${packsDir}`);
  }
  const files = fs
    .readdirSync(packsDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No gold packs in ${packsDir}`);
  }
  return files.map((name) => {
    const filePath = path.join(packsDir, name);
    const text = fs.readFileSync(filePath, "utf8");
    let pack;
    try {
      pack = JSON.parse(text);
    } catch (error) {
      throw new Error(`${name}: invalid JSON (${error.message})`);
    }
    pack.__file = name;
    pack.__text = text;
    return pack;
  });
}

function casesOf(pack) {
  if (Array.isArray(pack.steps) && pack.steps.length > 0) return pack.steps;
  return [
    {
      id: pack.id,
      now: pack.now,
      inputs: pack.inputs,
      priorSnapshot: pack.priorSnapshot ?? null,
      priorFromStep: pack.priorFromStep,
      windowMode: pack.windowMode,
      expected: pack.expected,
    },
  ];
}

function caseLabel(pack, step) {
  if (Array.isArray(pack.steps) && pack.steps.length > 0) {
    return `${pack.id}/${step.id || "step"}`;
  }
  return pack.id || pack.__file;
}

function normLabel(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function labelScore(expected, actual) {
  const left = normLabel(expected);
  const right = normLabel(actual);
  if (!left || !right) return 0;
  if (left === right) return 3;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (shorter.length < 4) return 0;
  if (longer.includes(shorter)) return 2;
  return 0;
}

function collapsed(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sourceTexts(inputs = {}) {
  const texts = [];
  (inputs.entries || []).forEach((entry) => {
    if (entry?.response) texts.push(String(entry.response));
    else if (entry?.text) texts.push(String(entry.text));
  });
  (inputs.checkIns || []).forEach((checkIn) => {
    (checkIn.messages || []).forEach((message) => {
      if (!message?.text) return;
      if (message.role && message.role !== "user") return;
      texts.push(String(message.text));
    });
  });
  (inputs.summaries || []).forEach((summary) => {
    if (summary?.content) texts.push(String(summary.content));
  });
  return texts.map(collapsed).filter(Boolean);
}

function quoteInSources(quote, sources) {
  let needle = collapsed(quote).replace(/[…]+$/u, "").replace(/\.\.\.$/, "").trim();
  if (!needle) return false;
  return sources.some((source) => source.includes(needle));
}

function evaluateCase(pack, step, snapshots) {
  const failures = [];
  const label = caseLabel(pack, step);
  const expected = step.expected;
  if (!expected || typeof expected !== "object") {
    return { label, failures: [`${label}: missing expected labels`], brief: null };
  }
  if (!step.inputs || typeof step.inputs !== "object") {
    return { label, failures: [`${label}: missing inputs`], brief: null };
  }

  let prior = null;
  if (step.priorFromStep) {
    prior = snapshots.get(step.priorFromStep) || null;
    if (!prior) {
      failures.push(
        `${label}: priorFromStep "${step.priorFromStep}" did not produce a snapshot`
      );
    }
  } else if (step.priorSnapshot) {
    prior = step.priorSnapshot;
  }

  const now = step.now ? new Date(step.now) : new Date("2026-09-06T12:00:00.000Z");
  const brief = buildLocalChangeBrief({
    inputs: step.inputs,
    priorSnapshot: prior,
    now,
    windowMode: step.windowMode || "last-brief",
  });

  const snapshot = snapshotFromChangeBrief(brief, {
    id: `gold-${pack.id}-${step.id || "case"}`,
    createdAt: step.now || now.toISOString(),
  });
  if (step.id) snapshots.set(step.id, snapshot);

  if (expected.kind && brief.kind !== expected.kind) {
    failures.push(`${label}: kind expected ${expected.kind}, got ${brief.kind}`);
  }
  if (expected.windowLabel && brief.windowLabel !== expected.windowLabel) {
    failures.push(
      `${label}: windowLabel expected "${expected.windowLabel}", got "${brief.windowLabel}"`
    );
  }

  const safety = brief.safetySummary || {};
  const expectedSafety = expected.safety || {};
  if (expectedSafety.concern && safety.concern !== expectedSafety.concern) {
    failures.push(
      `${label}: safety concern expected ${expectedSafety.concern}, got ${safety.concern}`
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(expectedSafety, "siOrSelfHarm") &&
    Boolean(safety.siOrSelfHarm) !== Boolean(expectedSafety.siOrSelfHarm)
  ) {
    failures.push(
      `${label}: safety siOrSelfHarm expected ${Boolean(expectedSafety.siOrSelfHarm)}, got ${Boolean(safety.siOrSelfHarm)}`
    );
  }

  const blob = JSON.stringify(brief);
  if (INVENTED_SCALE_RE.test(blob)) {
    failures.push(
      `${label}: output contains an invented scale token (HAM-D / HAM-A / PHQ-9 / GAD-7 / BDI / SBQ)`
    );
  }

  const actualThemes = Array.isArray(brief.themes) ? brief.themes : [];
  const expectedThemes = Array.isArray(expected.themes) ? expected.themes : [];
  const used = new Set();
  expectedThemes.forEach((theme) => {
    if (!POLARITIES.includes(theme?.polarity)) {
      failures.push(
        `${label}: expected theme "${theme?.label}" has polarity "${theme?.polarity}", want one of ${POLARITIES.join(", ")}`
      );
      return;
    }
    const ranked = actualThemes
      .map((actual, index) => ({
        actual,
        index,
        score: labelScore(theme.label, actual.label),
      }))
      .filter((item) => item.score > 0 && !used.has(item.index))
      .sort((a, b) => b.score - a.score);
    if (ranked.length === 0) {
      failures.push(
        `${label}: missing theme "${theme.label}" (${theme.polarity}); actual: ${formatThemes(actualThemes)}`
      );
      return;
    }
    const bestScore = ranked[0].score;
    const top = ranked.filter((item) => item.score === bestScore);
    const polarities = new Set(top.map((item) => item.actual.polarity));
    if (top.length > 1 && polarities.size > 1) {
      failures.push(
        `${label}: theme "${theme.label}" matches more than one polarity (${[...polarities].join(", ")})`
      );
      return;
    }
    const chosen = top[0];
    used.add(chosen.index);
    if (chosen.actual.polarity !== theme.polarity) {
      failures.push(
        `${label}: theme "${theme.label}" polarity expected ${theme.polarity}, got ${chosen.actual.polarity} (matched "${chosen.actual.label}")`
      );
    }
    const requireEvidence = theme.requireEvidence !== false;
    const evidence = Array.isArray(chosen.actual.evidence) ? chosen.actual.evidence : [];
    if (requireEvidence && evidence.length === 0) {
      failures.push(`${label}: theme "${theme.label}" has no evidence quote`);
    }
  });

  if (expected.allowExtraThemes !== true) {
    actualThemes.forEach((theme, index) => {
      if (used.has(index)) return;
      failures.push(
        `${label}: unexpected theme "${theme.label}" (${theme.polarity})`
      );
    });
  }

  const sources = sourceTexts(step.inputs);
  actualThemes.forEach((theme) => {
    (theme.evidence || []).forEach((chip) => {
      const quote = chip?.text || "";
      if (!quote) return;
      if (!quoteInSources(quote, sources)) {
        failures.push(
          `${label}: evidence quote is not contained in pack diary/chat text: "${quote}"`
        );
      }
    });
  });

  return { label, failures, brief };
}

function formatThemes(themes) {
  if (!themes.length) return "(none)";
  return themes.map((theme) => `${theme.label}=${theme.polarity}`).join(", ");
}

function assertQuoteContract() {
  const sources = sourceTexts({
    entries: [
      {
        response: "I am worried about the exam and I can't focus in class at all.",
      },
    ],
    checkIns: [
      {
        messages: [
          { role: "user", text: "School has been exhausting and I feel hopeless." },
          { role: "model", text: "Bot only sentence that must not count." },
        ],
      },
    ],
    summaries: [],
  });
  const checks = [
    ["worried about the exam", true],
    ["School has been exhausting and I feel hopeless.", true],
    ["I am worried about the exam and I can't focus in class at all.", true],
    ["I am worried about the exam and I can't focus…", true],
    ["Bot only sentence that must not count.", false],
    ["This invented quote is not in the pack.", false],
  ];
  checks.forEach(([quote, ok]) => {
    const got = quoteInSources(quote, sources);
    if (got !== ok) {
      throw new Error(
        `quote contract self-test failed for "${quote}" (got ${got}, want ${ok})`
      );
    }
  });
}

function evaluatePack(pack) {
  if (FORBIDDEN_SECRET_RE.test(pack.__text || "")) {
    return [
      {
        label: pack.id || pack.__file,
        failures: [`${pack.__file}: pack text looks like it contains a secret`],
      },
    ];
  }
  const snapshots = new Map();
  return casesOf(pack).map((step) => evaluateCase(pack, step, snapshots));
}

function summarize(results) {
  let failed = 0;
  results.flat().forEach((result) => {
    if (result.failures.length === 0) {
      console.log(`pass  ${result.label}`);
      return;
    }
    failed += 1;
    result.failures.forEach((failure) => console.error(`FAIL  ${failure}`));
  });
  return failed;
}

function flipPolarity(pack) {
  const clone = structuredClone(pack);
  const steps = casesOf(clone);
  const step = [...steps].reverse().find((item) => (item.expected?.themes || []).length > 0);
  if (!step) {
    throw new Error("No expected theme available to flip for --self-check-negative");
  }
  const theme = step.expected.themes[0];
  const original = theme.polarity;
  const wrong = POLARITIES.find((polarity) => polarity !== original);
  theme.polarity = wrong;
  return {
    pack: clone,
    label: theme.label,
    original,
    wrong,
    caseId: caseLabel(clone, step),
  };
}

function main() {
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--self-check-negative");
  if (unknown.length > 0 || argHas("--help") || argHas("-h")) {
    usage();
    process.exit(unknown.length > 0 ? 2 : 0);
  }

  assertQuoteContract();
  const packs = loadPacks();
  const results = packs.map((pack) => evaluatePack(pack));
  const failed = summarize(results);
  const caseCount = results.flat().length;

  if (argHas("--self-check-negative")) {
    if (failed > 0) {
      console.error(
        `self-check-negative: ${failed} gold case(s) failed before the polarity flip`
      );
      process.exit(1);
    }
    const flipped = flipPolarity(packs[0]);
    const negative = evaluatePack(flipped.pack);
    const messages = negative.flatMap((result) => result.failures);
    const detected = messages.some(
      (message) => message.includes("polarity") && message.includes(flipped.label)
    );
    console.log(
      `self-check-negative: flipped "${flipped.label}" ${flipped.original} -> ${flipped.wrong} on ${flipped.caseId}`
    );
    if (!detected) {
      if (messages.length === 0) {
        console.error(
          "self-check-negative: wrong expected polarity was not detected"
        );
      } else {
        console.error(
          "self-check-negative: pack failed, but not on the flipped polarity"
        );
        messages.forEach((message) => console.error(`FAIL  ${message}`));
      }
      process.exit(1);
    }
    console.log(`self-check-negative: detected ${messages.length} failure(s)`);
    messages.forEach((message) => console.log(`  ${message}`));
    console.log("self-check-negative passed");
    process.exit(0);
  }

  if (failed > 0) {
    console.error(`${failed} of ${caseCount} gold case(s) failed`);
    process.exit(1);
  }
  console.log(`${packs.length} pack(s), ${caseCount} case(s), all passed`);
}

main();
