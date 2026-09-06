import assert from "assert";
import {
  DEFAULT_GEMINI_MODEL,
  getGeminiApiKey,
  getGeminiModel,
  generateGeminiText,
  isGeminiConfigured,
} from "../utils/geminiClient.js";

assert.strictEqual(DEFAULT_GEMINI_MODEL, "gemini-3.6-flash");
assert.ok(!DEFAULT_GEMINI_MODEL.includes("2.0-flash"));

const originalModel = process.env.EXPO_PUBLIC_GEMINI_MODEL;
delete process.env.EXPO_PUBLIC_GEMINI_MODEL;
assert.strictEqual(getGeminiModel(), "gemini-3.6-flash");
process.env.EXPO_PUBLIC_GEMINI_MODEL = "gemini-3.5-flash-lite";
assert.strictEqual(getGeminiModel(), "gemini-3.5-flash-lite");
if (originalModel === undefined) {
  delete process.env.EXPO_PUBLIC_GEMINI_MODEL;
} else {
  process.env.EXPO_PUBLIC_GEMINI_MODEL = originalModel;
}

const configured = isGeminiConfigured();
assert.strictEqual(configured, Boolean(getGeminiApiKey()));
console.log(
  `gemini client unit tests passed (configured=${configured}, model=${getGeminiModel()})`
);

if (!configured) {
  console.log("skipping live Gemini call: no API key in environment");
  process.exit(0);
}

const text = await generateGeminiText({
  contents: "Reply with exactly: pong",
});
assert.ok(text.toLowerCase().includes("pong"), `unexpected live reply: ${text}`);
console.log(`live Gemini generate ok via ${getGeminiModel()}`);
