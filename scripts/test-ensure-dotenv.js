"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  METRO_ENV_FILES,
  ensureDotenv,
  existingMetroEnvFiles,
} = require("./ensure-dotenv");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mindlink-dotenv-"));
}

function testCreatesBothStubsWhenMissing() {
  const root = makeTempRoot();
  const result = ensureDotenv(root);
  assert.deepStrictEqual(result.created.sort(), [".env", ".env.development"]);
  assert.strictEqual(result.hasContext, true);
  assert.ok(existingMetroEnvFiles(root).includes(".env"));
  assert.ok(existingMetroEnvFiles(root).includes(".env.development"));
  const env = fs.readFileSync(path.join(root, ".env"), "utf8");
  assert.ok(env.includes("EXPO_PUBLIC_GEMINI_MODEL=auto"));
  assert.ok(!/GEMINI_KEY\s*=\s*\S+/.test(env));
  assert.ok(!/PINECONE/.test(env));
}

function testDoesNotOverwriteExistingEnv() {
  const root = makeTempRoot();
  fs.writeFileSync(path.join(root, ".env"), "EXPO_PUBLIC_GEMINI_API_KEY=keep-me\n");
  const result = ensureDotenv(root);
  assert.ok(result.created.includes(".env.development"));
  assert.ok(!result.created.includes(".env"));
  const env = fs.readFileSync(path.join(root, ".env"), "utf8");
  assert.strictEqual(env, "EXPO_PUBLIC_GEMINI_API_KEY=keep-me\n");
}

function testExistingDevelopmentIsEnoughForContext() {
  const root = makeTempRoot();
  fs.writeFileSync(
    path.join(root, ".env.development"),
    "EXPO_PUBLIC_GEMINI_MODEL=auto\n"
  );
  const before = existingMetroEnvFiles(root);
  assert.deepStrictEqual(before, [".env.development"]);
  const result = ensureDotenv(root);
  assert.ok(result.hasContext);
  assert.ok(fs.existsSync(path.join(root, ".env")));
}

function testTrackedDevelopmentStubHasNoSecrets() {
  const tracked = fs.readFileSync(
    path.join(__dirname, "../.env.development"),
    "utf8"
  );
  assert.ok(tracked.includes("EXPO_PUBLIC_GEMINI_MODEL=auto"));
  assert.ok(!/KEY\s*=\s*[^\s#]+/.test(tracked));
  assert.ok(!/PINECONE/.test(tracked));
}

function testMetroFileListMatchesExpo() {
  assert.deepStrictEqual(METRO_ENV_FILES, [
    ".env",
    ".env.development",
    ".env.local",
    ".env.development.local",
  ]);
}

function main() {
  testCreatesBothStubsWhenMissing();
  testDoesNotOverwriteExistingEnv();
  testExistingDevelopmentIsEnoughForContext();
  testTrackedDevelopmentStubHasNoSecrets();
  testMetroFileListMatchesExpo();
  console.log("ensure-dotenv unit tests passed");
}

main();
