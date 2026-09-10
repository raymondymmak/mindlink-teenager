"use strict";

/**
 * Metro builds expo/virtual/env.js as require.context over:
 *   .env, .env.development, .env.local, .env.development.local
 * If none of those files exist, the context is empty and calling it throws:
 *   Error: No modules in context
 * Optional chaining (dotEnvModules(file)?.default) does not catch a throw,
 * so the root App never mounts.
 *
 * This script writes secret-free stubs when those files are missing.
 * It never overwrites an existing file and never writes API keys.
 */

const fs = require("fs");
const path = require("path");

const METRO_ENV_FILES = [
  ".env",
  ".env.development",
  ".env.local",
  ".env.development.local",
];

const STUB = `# Generated for Metro expo/virtual/env.js (dev-only).
# Copy .env.example to .env for a local Gemini key. Never put secrets in git.
EXPO_PUBLIC_GEMINI_MODEL=auto
`;

function metroEnvPaths(rootDir) {
  return METRO_ENV_FILES.map((name) => path.join(rootDir, name));
}

function existingMetroEnvFiles(rootDir) {
  return METRO_ENV_FILES.filter((name) =>
    fs.existsSync(path.join(rootDir, name))
  );
}

function ensureDotenv(rootDir) {
  const created = [];
  const envPath = path.join(rootDir, ".env");
  const developmentPath = path.join(rootDir, ".env.development");

  if (!fs.existsSync(developmentPath)) {
    fs.writeFileSync(developmentPath, STUB);
    created.push(".env.development");
  }
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, STUB);
    created.push(".env");
  }

  return {
    created,
    existing: existingMetroEnvFiles(rootDir),
    hasContext: existingMetroEnvFiles(rootDir).length > 0,
  };
}

function main() {
  const rootDir = path.join(__dirname, "..");
  const result = ensureDotenv(rootDir);
  if (result.created.length > 0) {
    console.log(
      `ensure-dotenv: created ${result.created.join(", ")} so Metro has an env context`
    );
  }
  if (!result.hasContext) {
    console.error(
      "ensure-dotenv: Metro env context is still empty. Create a .env file before expo start."
    );
    process.exit(1);
  }
}

module.exports = {
  METRO_ENV_FILES,
  STUB,
  ensureDotenv,
  existingMetroEnvFiles,
  metroEnvPaths,
};

if (require.main === module) {
  main();
}
