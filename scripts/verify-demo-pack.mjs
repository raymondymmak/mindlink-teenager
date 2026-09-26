#!/usr/bin/env node
/**
 * MindLink demo-pack checkpointers (Lumo MIN-5).
 *
 * In-process — no browser, no Expo server. This is what CI and Lumo run:
 *   node scripts/verify-demo-pack.mjs --expect-loaded
 *   node scripts/verify-demo-pack.mjs --roundtrip
 *
 * --expect-loaded
 *   Loads fixtures/demo-pack.json through the same apply path as Load, then
 *   requires at least one diary record and one BriefSnapshot.
 *
 * --roundtrip
 *   Saves a pack from a seeded store, wipes records the way Reset does
 *   (clearOnDeviceRecords + full AsyncStorage clear), Loads the pack back,
 *   and checks diary, daily chat, Session Brief, and BriefSnapshot.
 *
 * Optional browser proof (Playwright). Not required for the commands above.
 * Point it at local Expo web or staging, then pass --browser:
 *   DEMO_PACK_BASE_URL=http://127.0.0.1:8081 node scripts/verify-demo-pack.mjs --roundtrip --browser
 *   STAGING_BASE_URL=https://raymondmak-app1--staging.expo.app node scripts/verify-demo-pack.mjs --expect-loaded --browser
 * Install once in the environment that runs the browser (not a project dependency):
 *   npm install --no-save playwright && npx playwright install chromium
 * If Playwright's Chromium build is missing, the script falls back to installed Google Chrome
 * (`PLAYWRIGHT_CHANNEL=chrome` forces that). If neither DEMO_PACK_BASE_URL nor
 * STAGING_BASE_URL is set, --browser exits with instructions.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const demoPack = require("../utils/demoPack.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(root, "fixtures", "demo-pack.json");

const {
  applyDemoPackToStorage,
  buildDemoPack,
  clearOnDeviceRecordKeys,
  countStoredRecords,
  createMemoryStorage,
  exportDemoPackFromStorage,
  readDailyChatMessages,
} = demoPack;

const FORBIDDEN = /AIza|AQ\.|GEMINI_API_KEY|EXPO_PUBLIC_GEMINI/;

const DIARY_NAME = "diary-2026-09-20-120000000.json";
const DIARY_TEXT = "Exam week has me worried and I cannot focus in class.";
const CHAT_TEXT = "I kept thinking about the exam and could not sleep.";
const BRIEF_TEXT = "School pressure is the main presenting theme in this dry run.";
const SNAPSHOT_NAME = "briefSnapshot-2026-09-20-120000000.json";

function argHas(flag) {
  return process.argv.includes(flag);
}

function usage() {
  console.error(
    "Usage: node scripts/verify-demo-pack.mjs --expect-loaded | --roundtrip [--browser]"
  );
}

function assertFixtureFileClean() {
  assert.ok(fs.existsSync(fixturePath), "fixtures/demo-pack.json is missing");
  const text = fs.readFileSync(fixturePath, "utf8");
  assert.equal(
    FORBIDDEN.test(text),
    false,
    "fixtures/demo-pack.json contains forbidden key material"
  );
  return text;
}

function counts(storage) {
  return {
    diary: countStoredRecords(storage, "diary-", ".json"),
    snapshots: countStoredRecords(storage, "briefSnapshot-", ".json"),
    briefs: countStoredRecords(storage, "sessionBrief-", ".json"),
    chat: readDailyChatMessages(storage),
  };
}

function expectLoadedInProcess(fixtureText) {
  const storage = createMemoryStorage();
  applyDemoPackToStorage(storage, fixtureText);
  const state = counts(storage);
  assert.ok(state.diary >= 1, `expected diary >= 1, got ${state.diary}`);
  assert.ok(
    state.snapshots >= 1,
    `expected BriefSnapshot >= 1, got ${state.snapshots}`
  );
  const diary = storage.getItem(DIARY_NAME) || "";
  assert.ok(diary.includes(DIARY_TEXT), "loaded diary text missing");
  assert.ok(
    state.chat.some((message) => String(message.text || "").includes(CHAT_TEXT)),
    "loaded daily chat missing"
  );
  console.log(
    `expect-loaded: diary=${state.diary} briefSnapshots=${state.snapshots} dailyChat=${state.chat.length}`
  );
}

function wipeLikeReset(storage) {
  clearOnDeviceRecordKeys(storage);
  storage.clear();
}

function roundtripInProcess(fixtureText) {
  const storage = createMemoryStorage();
  storage.setItem(
    DIARY_NAME,
    JSON.stringify({
      date: "2026-09-20",
      prompt: "How are you feeling today?",
      response: DIARY_TEXT,
      mood: 3,
      tags: ["school", "anxiety"],
      createdAt: "2026-09-20T12:00:00.000Z",
    })
  );
  storage.setItem(
    "checkin-2026-09-20-120500000.json",
    JSON.stringify({
      date: "2026-09-20",
      createdAt: "2026-09-20T12:05:00.000Z",
      messages: [{ role: "user", text: CHAT_TEXT }],
    })
  );
  storage.setItem(
    "userReport-2026-09-20.txt",
    "Local check-in note for Alex\n\nExam week has been hard to focus through.\n"
  );
  storage.setItem(
    "sessionBrief-2026-09-20.json",
    JSON.stringify({
      mode: "local-demo",
      markdown: `# Session Brief\n\n${BRIEF_TEXT}\n`,
      snapshotId: "briefSnapshot-2026-09-20-120000000",
      date: "2026-09-20",
    })
  );
  storage.setItem(
    SNAPSHOT_NAME,
    JSON.stringify({
      id: "briefSnapshot-2026-09-20-120000000",
      createdAt: "2026-09-20T12:10:00.000Z",
      kind: "baseline",
      windowLabel: "First visit",
    })
  );
  storage.setItem(
    "@daily_chat_messages",
    JSON.stringify([
      {
        _id: "demo-user-1",
        text: CHAT_TEXT,
        createdAt: "2026-09-20T12:05:00.000Z",
        user: { _id: 1, name: "Alex", avatar: { uri: "file://not-a-pack-field" } },
      },
    ])
  );
  storage.setItem("@user_name", "Alex");
  storage.setItem("@app_mode", "clinician");
  storage.setItem(
    "@last_brief_snapshot_path",
    "/var/mobile/Containers/Data/briefSnapshot-2026-09-20-120000000.json"
  );
  storage.setItem("@last_diary_entry", DIARY_TEXT);
  storage.setItem("do-not-export", "leave-this-out");

  const saved = exportDemoPackFromStorage(storage, "2026-09-20T12:10:00.000Z");
  assert.equal(FORBIDDEN.test(saved), false, "saved pack contains forbidden key material");
  assert.equal(saved.includes("leave-this-out"), false, "pack included a non-record key");
  assert.equal(saved.includes("not-a-pack-field"), false, "pack included chat avatar data");
  assert.equal(saved.includes("/var/mobile"), false, "pack included a device path");
  const parsed = JSON.parse(saved);
  assert.equal(parsed.format, "mindlink-demo-pack");
  assert.ok(parsed.records.some((record) => record.name === DIARY_NAME));
  assert.ok(parsed.records.some((record) => record.name === SNAPSHOT_NAME));
  assert.ok(parsed.records.some((record) => record.name === "sessionBrief-2026-09-20.json"));

  wipeLikeReset(storage);
  assert.equal(countStoredRecords(storage, "diary-", ".json"), 0);
  assert.equal(countStoredRecords(storage, "briefSnapshot-", ".json"), 0);
  assert.equal(readDailyChatMessages(storage).length, 0);
  assert.equal(storage.getItem("sessionBrief-2026-09-20.json"), null);

  applyDemoPackToStorage(storage, saved);
  const restored = counts(storage);
  assert.ok(restored.diary >= 1, "round-trip lost diary");
  assert.ok(restored.snapshots >= 1, "round-trip lost BriefSnapshot");
  assert.ok(restored.briefs >= 1, "round-trip lost Session Brief");
  assert.ok(
    restored.chat.some((message) => message.text === CHAT_TEXT),
    "round-trip lost daily chat"
  );
  assert.equal(storage.getItem("@user_name"), "Alex");
  assert.equal(storage.getItem("@app_mode"), "clinician");
  assert.equal(
    storage.getItem("@last_brief_snapshot_path"),
    SNAPSHOT_NAME
  );
  assert.ok(String(storage.getItem(DIARY_NAME)).includes(DIARY_TEXT));
  assert.ok(String(storage.getItem("sessionBrief-2026-09-20.json")).includes(BRIEF_TEXT));
  assert.equal(storage.getItem("do-not-export"), null);

  const fromFixture = createMemoryStorage();
  applyDemoPackToStorage(fromFixture, fixtureText);
  const reexported = exportDemoPackFromStorage(fromFixture, "2026-09-20T12:10:00.000Z");
  wipeLikeReset(fromFixture);
  applyDemoPackToStorage(fromFixture, reexported);
  const fixtureState = counts(fromFixture);
  assert.ok(fixtureState.diary >= 1 && fixtureState.snapshots >= 1);
  assert.ok(
    fixtureState.chat.some((message) => String(message.text || "").includes(CHAT_TEXT))
  );

  assert.throws(
    () =>
      buildDemoPack({
        records: [{ name: DIARY_NAME, content: ["AI", "za"].join("") + "SyExample" }],
      }),
    /key-like material/
  );

  console.log(
    `roundtrip: diary=${restored.diary} briefSnapshots=${restored.snapshots} briefs=${restored.briefs} dailyChat=${restored.chat.length}`
  );
}

function browserBaseUrl() {
  const configured = process.env.DEMO_PACK_BASE_URL || process.env.STAGING_BASE_URL || "";
  return configured.replace(/\/$/, "");
}

async function resetBrowserStorage(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByTestId("load-demo-pack-welcome").waitFor({ timeout: 45000 });
}

async function openDeveloperSettings(page) {
  const trigger = page.getByTestId("developer-settings");
  await trigger.waitFor({ state: "visible", timeout: 45000 });
  const save = page.getByTestId("save-demo-pack");
  if (await save.isVisible().catch(() => false)) return;
  await trigger.click();
  await save.waitFor({ state: "visible", timeout: 15000 });
}

async function loadPackThroughUi(page, filePath, testId) {
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 15000 });
  await page.getByTestId(testId).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);
  await openDeveloperSettings(page);
}

async function readBrowserState(page) {
  return page.evaluate(() => {
    const keys = Object.keys(window.localStorage);
    const chatRaw = window.localStorage.getItem("@daily_chat_messages") || "[]";
    let chat = [];
    try {
      const parsed = JSON.parse(chatRaw);
      chat = Array.isArray(parsed) ? parsed : [];
    } catch {
      chat = [];
    }
    return {
      diary: keys.filter((key) => key.startsWith("diary-") && key.endsWith(".json")).length,
      snapshots: keys.filter(
        (key) => key.startsWith("briefSnapshot-") && key.endsWith(".json")
      ).length,
      briefs: keys.filter((key) => key.startsWith("sessionBrief-") && key.endsWith(".json"))
        .length,
      chatTexts: chat.map((message) => String(message?.text || "")),
      diaryBody: keys
        .filter((key) => key.startsWith("diary-"))
        .map((key) => window.localStorage.getItem(key) || "")
        .join("\n"),
    };
  });
}

async function runBrowser(mode) {
  const baseUrl = browserBaseUrl();
  if (!baseUrl) {
    console.error(
      "Set DEMO_PACK_BASE_URL (local Expo web) or STAGING_BASE_URL (staging) for --browser."
    );
    console.error(
      "Example: DEMO_PACK_BASE_URL=http://127.0.0.1:8081 node scripts/verify-demo-pack.mjs --roundtrip --browser"
    );
    process.exit(1);
  }
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("Playwright is not installed in this environment.");
    console.error("  npm install --no-save playwright && npx playwright install chromium");
    process.exit(1);
  }

  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHANNEL) {
    launchOptions.channel = process.env.PLAYWRIGHT_CHANNEL;
  }
  let browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (error) {
    if (launchOptions.channel) throw error;
    browser = await chromium.launch({ headless: true, channel: "chrome" });
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await resetBrowserStorage(page, baseUrl);
    await loadPackThroughUi(page, fixturePath, "load-demo-pack-welcome");
    const loaded = await readBrowserState(page);
    assert.ok(loaded.diary >= 1, "browser load did not restore diary");
    assert.ok(loaded.snapshots >= 1, "browser load did not restore a BriefSnapshot");
    assert.ok(
      loaded.diaryBody.includes(DIARY_TEXT),
      "browser diary text missing after Load"
    );
    if (mode === "expect-loaded") {
      console.log(
        `browser expect-loaded: diary=${loaded.diary} briefSnapshots=${loaded.snapshots} url=${baseUrl}`
      );
      return;
    }

    await openDeveloperSettings(page);
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
    await page.getByTestId("save-demo-pack").click();
    const download = await downloadPromise;
    const savedPath = path.join(os.tmpdir(), `mindlink-demo-pack-${Date.now()}.json`);
    await download.saveAs(savedPath);
    const savedText = fs.readFileSync(savedPath, "utf8");
    assert.equal(FORBIDDEN.test(savedText), false, "downloaded pack contains forbidden key material");
    assert.equal(JSON.parse(savedText).format, "mindlink-demo-pack");

    await openDeveloperSettings(page);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("reset-demo").click();
    await page.getByTestId("load-demo-pack-welcome").waitFor({ timeout: 45000 });
    const wiped = await readBrowserState(page);
    assert.equal(wiped.diary, 0, "Reset left diary records behind");
    assert.equal(wiped.snapshots, 0, "Reset left BriefSnapshots behind");

    await loadPackThroughUi(page, savedPath, "load-demo-pack-welcome");
    const restored = await readBrowserState(page);
    assert.ok(restored.diary >= 1, "browser round-trip lost diary");
    assert.ok(restored.snapshots >= 1, "browser round-trip lost BriefSnapshot");
    assert.ok(restored.briefs >= 1, "browser round-trip lost Session Brief");
    assert.ok(
      restored.chatTexts.some((text) => text.includes(CHAT_TEXT)),
      "browser round-trip lost daily chat"
    );
    assert.ok(restored.diaryBody.includes(DIARY_TEXT), "browser round-trip diary text mismatch");
    console.log(
      `browser roundtrip: diary=${restored.diary} briefSnapshots=${restored.snapshots} briefs=${restored.briefs} url=${baseUrl}`
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  const expectLoaded = argHas("--expect-loaded");
  const roundtrip = argHas("--roundtrip");
  const browser = argHas("--browser");
  if (!expectLoaded && !roundtrip) {
    usage();
    process.exit(1);
  }
  const fixtureText = assertFixtureFileClean();
  if (expectLoaded) expectLoadedInProcess(fixtureText);
  if (roundtrip) roundtripInProcess(fixtureText);
  if (browser) {
    await runBrowser(roundtrip ? "roundtrip" : "expect-loaded");
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
