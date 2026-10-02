"use strict";

/**
 * Dry-run demo pack (Save / Load) over the same on-device records as localData.
 * Web writes localStorage; native writes the document directory plus AsyncStorage.
 * This module stays free of React Native so checkpointers can round-trip in Node.
 *
 * Forbidden key markers are assembled at runtime so the client bundle does not
 * contain those substrings.
 */

const { APP_MODE_KEY } = require("./appMode");

const DEMO_PACK_FORMAT = "mindlink-demo-pack";
const DEMO_PACK_VERSION = 1;
const DEMO_PACK_FILENAME = "mindlink-demo-pack.json";

const RECORD_PREFIXES = [
  "diary-",
  "checkin-",
  "userReport-",
  "sessionBrief-",
  "briefSnapshot-",
  "briefEdit-",
];

const DEMO_PACK_ASYNC_KEYS = [
  "@user_name",
  "@last_report_path",
  "@last_report_date",
  "@last_session_brief_path",
  "@last_brief_snapshot_path",
  "@pending_session_brief",
  "@daily_chat_messages",
  APP_MODE_KEY,
  "@last_diary_entry",
  "@last_diary_date",
  "@initial_chat_completed",
];

const PATH_ASYNC_KEYS = new Set([
  "@last_report_path",
  "@last_session_brief_path",
  "@last_brief_snapshot_path",
]);

const DAILY_CHAT_KEY = "@daily_chat_messages";

function forbiddenSecretPatterns() {
  return [
    new RegExp(["AI", "za"].join("")),
    new RegExp(["AQ", "."].join("\\")),
    new RegExp(["GEMINI", "_API", "_KEY"].join("")),
    new RegExp(["EXPO", "_PUBLIC", "_GEMINI"].join("")),
    new RegExp(["GEMINI", "_KEY"].join("")),
    new RegExp(["PINECONE", "_KEY"].join("")),
    new RegExp(["MINDLINK", "_API", "_TOKEN"].join("")),
  ];
}

function basenameRecord(name) {
  const text = String(name || "").trim();
  const parts = text.split(/[/\\]/);
  return parts[parts.length - 1] || text;
}

function isRecordName(name) {
  const base = basenameRecord(name);
  if (base.startsWith("userReport-")) return base.endsWith(".txt");
  if (base.startsWith("diary-")) return base.endsWith(".json");
  if (base.startsWith("checkin-")) return base.endsWith(".json");
  if (base.startsWith("sessionBrief-")) return base.endsWith(".json");
  if (base.startsWith("briefSnapshot-")) return base.endsWith(".json");
  if (base.startsWith("briefEdit-")) return base.endsWith(".json");
  return false;
}

function matchesRecordPrefix(name) {
  const base = basenameRecord(name);
  return RECORD_PREFIXES.some(
    (prefix) => base.startsWith(prefix) || String(name || "").startsWith(prefix)
  );
}

function assertNoSecretMaterial(text, label = "Demo pack") {
  const raw = String(text ?? "");
  const hit = forbiddenSecretPatterns().find((pattern) => pattern.test(raw));
  if (hit) {
    throw new Error(
      `${label} was blocked because it contained key-like material.`
    );
  }
}

function listStorageKeys(storage) {
  if (!storage) return [];
  if (typeof storage.listKeys === "function") {
    return storage.listKeys().filter(Boolean);
  }
  if (typeof storage.length === "number" && typeof storage.key === "function") {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) keys.push(key);
    }
    return keys;
  }
  return [];
}

function createMemoryStorage(initial) {
  const map = new Map();
  if (initial && typeof initial === "object") {
    Object.entries(initial).forEach(([key, value]) => {
      if (value != null) map.set(key, String(value));
    });
  }
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    listKeys() {
      return [...map.keys()];
    },
    clear() {
      map.clear();
    },
  };
}

function clearOnDeviceRecordKeys(storage) {
  listStorageKeys(storage).forEach((key) => {
    if (matchesRecordPrefix(key)) storage.removeItem(key);
  });
}

function sanitizeDailyChat(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw ?? ""));
  } catch {
    return String(raw ?? "");
  }
  if (!Array.isArray(parsed)) return JSON.stringify(parsed);
  const clean = parsed
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const text = String(
        message.text || message.parts?.[0]?.text || ""
      );
      const item = {};
      if (message._id) item._id = String(message._id);
      if (message.id && !item._id) item._id = String(message.id);
      item.text = text;
      if (message.createdAt) item.createdAt = String(message.createdAt);
      if (message.role) item.role = String(message.role);
      if (message.user && typeof message.user === "object") {
        const user = {};
        if (message.user._id != null) user._id = message.user._id;
        if (message.user.name) user.name = String(message.user.name);
        if (Object.keys(user).length > 0) item.user = user;
      }
      if (!item.text && !item._id) return null;
      return item;
    })
    .filter(Boolean);
  return JSON.stringify(clean);
}

function sanitizeAsyncValue(key, value) {
  const text = String(value ?? "");
  if (key === DAILY_CHAT_KEY) return sanitizeDailyChat(text);
  if (PATH_ASYNC_KEYS.has(key)) return basenameRecord(text);
  return text;
}

function collectRecords(storage) {
  return listStorageKeys(storage)
    .filter((key) => isRecordName(key))
    .sort()
    .map((key) => ({
      name: basenameRecord(key),
      content: storage.getItem(key) ?? "",
    }));
}

function collectAsyncValues(storage) {
  const asyncValues = {};
  DEMO_PACK_ASYNC_KEYS.forEach((key) => {
    const value = storage.getItem(key);
    if (value == null || value === "") return;
    asyncValues[key] = sanitizeAsyncValue(key, value);
  });
  return asyncValues;
}

function buildDemoPack({ records = [], asyncValues = {}, exportedAt } = {}) {
  const pack = {
    format: DEMO_PACK_FORMAT,
    version: DEMO_PACK_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    records: [],
    async: {},
  };
  records.forEach((record) => {
    const name = basenameRecord(record?.name);
    if (!isRecordName(name)) return;
    pack.records.push({
      name,
      content: String(record?.content ?? ""),
    });
  });
  pack.records.sort((left, right) => left.name.localeCompare(right.name));
  DEMO_PACK_ASYNC_KEYS.forEach((key) => {
    if (asyncValues[key] == null || asyncValues[key] === "") return;
    pack.async[key] = sanitizeAsyncValue(key, asyncValues[key]);
  });
  const json = JSON.stringify(pack, null, 2);
  assertNoSecretMaterial(json);
  return json;
}

function exportDemoPackFromStorage(storage, exportedAt) {
  return buildDemoPack({
    records: collectRecords(storage),
    asyncValues: collectAsyncValues(storage),
    exportedAt,
  });
}

function parseDemoPack(input) {
  const pack = typeof input === "string" ? JSON.parse(input) : input;
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    throw new Error("This file is not a MindLink demo pack.");
  }
  if (pack.format !== DEMO_PACK_FORMAT) {
    throw new Error("This file is not a MindLink demo pack.");
  }
  if (pack.version !== DEMO_PACK_VERSION) {
    throw new Error("This demo pack version is not supported.");
  }
  if (!Array.isArray(pack.records)) {
    throw new Error("This demo pack is missing its saved records.");
  }
  assertNoSecretMaterial(JSON.stringify(pack));
  return pack;
}

function planDemoPackRestore(input) {
  const pack = parseDemoPack(input);
  const records = [];
  pack.records.forEach((record) => {
    const name = basenameRecord(record?.name);
    if (!isRecordName(name)) return;
    records.push({
      name,
      content: String(record?.content ?? ""),
    });
  });
  const asyncWrites = {};
  const source = pack.async && typeof pack.async === "object" ? pack.async : {};
  DEMO_PACK_ASYNC_KEYS.forEach((key) => {
    if (source[key] == null || source[key] === "") return;
    asyncWrites[key] = sanitizeAsyncValue(key, source[key]);
  });
  return { pack, records, asyncWrites };
}

function applyDemoPackToStorage(storage, input) {
  const plan = planDemoPackRestore(input);
  clearOnDeviceRecordKeys(storage);
  DEMO_PACK_ASYNC_KEYS.forEach((key) => storage.removeItem(key));
  const written = new Map();
  plan.records.forEach((record) => {
    storage.setItem(record.name, record.content);
    written.set(record.name, record.name);
  });
  Object.entries(plan.asyncWrites).forEach(([key, value]) => {
    const stored = PATH_ASYNC_KEYS.has(key)
      ? written.get(value) || basenameRecord(value)
      : value;
    storage.setItem(key, stored);
  });
  return plan.pack;
}

function countStoredRecords(storage, prefix, suffix) {
  return listStorageKeys(storage).filter((key) => {
    const base = basenameRecord(key);
    return base.startsWith(prefix) && (!suffix || base.endsWith(suffix));
  }).length;
}

function readDailyChatMessages(storage) {
  const raw = storage.getItem(DAILY_CHAT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function downloadDemoPackFile(json, filename = DEMO_PACK_FILENAME) {
  if (typeof document === "undefined") {
    throw new Error("Demo pack download is only available on web.");
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function pickDemoPackFile() {
  if (typeof document === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.setAttribute("data-testid", "demo-pack-file-input");
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) {
        finish(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => finish(String(reader.result || ""));
      reader.onerror = () => finish(null);
      reader.readAsText(file);
    });
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

module.exports = {
  APP_MODE_KEY,
  DEMO_PACK_FORMAT,
  DEMO_PACK_VERSION,
  DEMO_PACK_FILENAME,
  RECORD_PREFIXES,
  DEMO_PACK_ASYNC_KEYS,
  PATH_ASYNC_KEYS,
  DAILY_CHAT_KEY,
  basenameRecord,
  isRecordName,
  matchesRecordPrefix,
  assertNoSecretMaterial,
  listStorageKeys,
  createMemoryStorage,
  clearOnDeviceRecordKeys,
  sanitizeDailyChat,
  buildDemoPack,
  exportDemoPackFromStorage,
  parseDemoPack,
  planDemoPackRestore,
  applyDemoPackToStorage,
  countStoredRecords,
  readDailyChatMessages,
  downloadDemoPackFile,
  pickDemoPackFile,
};
