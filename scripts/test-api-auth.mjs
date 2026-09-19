import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_MINDLINK_API_TOKEN,
  MINDLINK_API_TOKEN_HEADER,
  getMindLinkApiToken,
  mindLinkApiHeaders,
} from "../utils/apiAuth.js";

const source = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../utils/apiAuth.js"),
  "utf8"
);
assert.ok(!source.includes("process.env.GEMINI_KEY"));
assert.ok(!source.includes("process.env.PINECONE_KEY"));
assert.ok(!source.includes("AIza"));
assert.ok(!source.includes("AQ."));
assert.ok(source.includes("gate"));

assert.strictEqual(DEFAULT_MINDLINK_API_TOKEN, "mindlink-demo-gate-v1");
assert.strictEqual(MINDLINK_API_TOKEN_HEADER, "X-MindLink-Token");

const original = process.env.EXPO_PUBLIC_MINDLINK_API_TOKEN;
delete process.env.EXPO_PUBLIC_MINDLINK_API_TOKEN;
assert.strictEqual(getMindLinkApiToken(), DEFAULT_MINDLINK_API_TOKEN);

const headers = mindLinkApiHeaders({ Accept: "application/json" });
assert.strictEqual(headers.Authorization, `Bearer ${DEFAULT_MINDLINK_API_TOKEN}`);
assert.strictEqual(headers[MINDLINK_API_TOKEN_HEADER], DEFAULT_MINDLINK_API_TOKEN);
assert.strictEqual(headers["Content-Type"], "application/json");
assert.strictEqual(headers.Accept, "application/json");

process.env.EXPO_PUBLIC_MINDLINK_API_TOKEN = "rotated-gate";
assert.strictEqual(getMindLinkApiToken(), "rotated-gate");
assert.strictEqual(mindLinkApiHeaders().Authorization, "Bearer rotated-gate");

if (original === undefined) delete process.env.EXPO_PUBLIC_MINDLINK_API_TOKEN;
else process.env.EXPO_PUBLIC_MINDLINK_API_TOKEN = original;

console.log("api auth client unit tests passed");
