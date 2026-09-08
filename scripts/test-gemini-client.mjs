import assert from "assert";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_LITE_MODEL,
  GEMINI_STANDARD_MODEL,
  getGeminiApiKey,
  getGeminiModel,
  generateGeminiText,
  isAutoGeminiRouting,
  isGeminiConfigured,
  resolveGeminiModel,
} from "../utils/geminiClient.js";

assert.strictEqual(DEFAULT_GEMINI_MODEL, "auto");
assert.strictEqual(GEMINI_LITE_MODEL, "gemini-3.5-flash-lite");
assert.strictEqual(GEMINI_STANDARD_MODEL, "gemini-3.5-flash");
assert.ok(!GEMINI_LITE_MODEL.includes("2.0-flash"));
assert.ok(!GEMINI_STANDARD_MODEL.includes("2.0-flash"));

const originalModel = process.env.EXPO_PUBLIC_GEMINI_MODEL;
delete process.env.EXPO_PUBLIC_GEMINI_MODEL;
assert.strictEqual(isAutoGeminiRouting(), true);
assert.strictEqual(resolveGeminiModel("chat"), GEMINI_LITE_MODEL);
assert.strictEqual(resolveGeminiModel("brief"), GEMINI_STANDARD_MODEL);
assert.strictEqual(getGeminiModel(), GEMINI_LITE_MODEL);

process.env.EXPO_PUBLIC_GEMINI_MODEL = "auto";
assert.strictEqual(resolveGeminiModel("chat"), GEMINI_LITE_MODEL);
assert.strictEqual(resolveGeminiModel("brief"), GEMINI_STANDARD_MODEL);

process.env.EXPO_PUBLIC_GEMINI_MODEL = "gemini-3.5-flash-lite";
assert.strictEqual(isAutoGeminiRouting(), false);
assert.strictEqual(resolveGeminiModel("brief"), "gemini-3.5-flash-lite");
assert.strictEqual(getGeminiModel(), "gemini-3.5-flash-lite");

if (originalModel === undefined) {
  delete process.env.EXPO_PUBLIC_GEMINI_MODEL;
} else {
  process.env.EXPO_PUBLIC_GEMINI_MODEL = originalModel;
}

const configured = isGeminiConfigured();
assert.strictEqual(configured, Boolean(getGeminiApiKey()));
console.log(
  `gemini client unit tests passed (configured=${configured}, chat=${resolveGeminiModel("chat")}, brief=${resolveGeminiModel("brief")})`
);

if (!configured) {
  console.log("skipping live Gemini call: no API key in environment");
  process.exit(0);
}

const text = await generateGeminiText({
  contents: "Reply with exactly: pong",
  task: "chat",
});
assert.ok(text.toLowerCase().includes("pong"), `unexpected live reply: ${text}`);
console.log(`live Gemini generate ok via ${resolveGeminiModel("chat")}`);
