import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { buildDiaryRecord, parseDiaryRecord } from "./sessionBriefLogic";

export const STORAGE_KEYS = {
  userName: "@user_name",
  lastReportPath: "@last_report_path",
  lastReportDate: "@last_report_date",
  lastSessionBriefPath: "@last_session_brief_path",
  pendingBrief: "@pending_session_brief",
  dailyChatMessages: "@daily_chat_messages",
  appMode: "@app_mode",
};

function getFormattedDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUniqueStamp(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${hours}${minutes}${seconds}${ms}`;
}

function webStorage() {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

async function listKeys(prefix, suffix) {
  const storage = webStorage();
  if (storage) {
    return Object.keys(storage).filter(
      (key) => key.startsWith(prefix) && (!suffix || key.endsWith(suffix))
    );
  }
  const directory = FileSystem.documentDirectory;
  if (!directory) return [];
  const files = await FileSystem.readDirectoryAsync(directory);
  return files.filter(
    (file) => file.startsWith(prefix) && (!suffix || file.endsWith(suffix))
  );
}

async function readFile(nameOrPath) {
  const storage = webStorage();
  if (storage) {
    return storage.getItem(nameOrPath) || "";
  }
  const path = nameOrPath.includes("/")
    ? nameOrPath
    : `${FileSystem.documentDirectory}${nameOrPath}`;
  return FileSystem.readAsStringAsync(path);
}

async function writeFile(fileName, content) {
  const storage = webStorage();
  if (storage) {
    storage.setItem(fileName, content);
    return fileName;
  }
  const filePath = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(filePath, content);
  return filePath;
}

export async function getUserName() {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEYS.userName)) || "User";
  } catch {
    return "User";
  }
}

export async function getDiaryEntries() {
  const files = await listKeys("diary-", ".json");
  const entries = [];
  for (const file of files) {
    try {
      const raw = await readFile(file);
      if (!raw) continue;
      entries.push(
        parseDiaryRecord(raw, {
          source: "diary",
          file,
          size: raw.length,
        })
      );
    } catch (error) {
      console.error("Failed to parse diary entry:", file, error);
    }
  }
  entries.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  return entries;
}

export async function saveDiaryEntry({
  prompt = "",
  response = "",
  mood,
  tags,
} = {}) {
  const now = new Date();
  const date = getFormattedDate(now);
  const fileName = `diary-${date}-${getUniqueStamp(now)}.json`;
  const record = buildDiaryRecord({
    date,
    prompt,
    response,
    mood,
    tags,
  });
  const serialized = JSON.stringify(record);
  await writeFile(fileName, serialized);
  await AsyncStorage.setItem("@last_diary_entry", record.response);
  await AsyncStorage.setItem("@last_diary_date", date);
  return { ...record, file: fileName, size: serialized.length };
}

export async function getChatReports() {
  const files = await listKeys("userReport-", ".txt");
  const reports = [];
  for (const file of files) {
    try {
      const content = await readFile(file);
      if (!content) continue;
      const datePart = file.replace("userReport-", "").replace(".txt", "");
      reports.push({
        file,
        date: datePart,
        content,
        source: "chat-report",
      });
    } catch (error) {
      console.error("Failed to read chat report:", file, error);
    }
  }
  reports.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return reports;
}

export async function getCheckIns() {
  const files = await listKeys("checkin-", ".json");
  const checkIns = [];
  for (const file of files) {
    try {
      const raw = await readFile(file);
      if (!raw) continue;
      checkIns.push({ ...JSON.parse(raw), file, source: "check-in" });
    } catch (error) {
      console.error("Failed to parse check-in:", file, error);
    }
  }
  checkIns.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  return checkIns;
}

export async function saveCheckIn(messages = []) {
  const now = new Date();
  const date = getFormattedDate(now);
  const fileName = `checkin-${date}-${getUniqueStamp(now)}.json`;
  const record = {
    date,
    createdAt: now.toISOString(),
    messages: messages
      .map((msg) => {
        const text = msg?.parts?.[0]?.text || msg?.text || "";
        if (!text) return null;
        const isUser =
          msg.role === "user" ||
          msg.user?._id === 1 ||
          msg.user?._id === "1";
        return {
          role: isUser ? "user" : "model",
          text,
        };
      })
      .filter(Boolean),
  };
  if (record.messages.length === 0) {
    return null;
  }
  await writeFile(fileName, JSON.stringify(record));
  return record;
}

export async function saveChatReport(content) {
  if (!content) return null;
  const formattedDate = getFormattedDate();
  const fileName = `userReport-${formattedDate}.txt`;
  const path = await writeFile(fileName, content);
  await AsyncStorage.setItem(STORAGE_KEYS.lastReportPath, path);
  await AsyncStorage.setItem(STORAGE_KEYS.lastReportDate, formattedDate);
  return { fileName, path, date: formattedDate };
}

export async function listSavedReports() {
  const files = await listKeys("userReport-", ".txt");
  const details = [];
  for (const file of files) {
    try {
      const content = await readFile(file);
      const datePart = file.replace("userReport-", "").replace(".txt", "");
      details.push({
        name: file,
        path: file,
        date: datePart,
        size: content.length,
      });
    } catch (error) {
      console.error("Failed to list report:", file, error);
    }
  }
  details.sort((a, b) => b.date.localeCompare(a.date));
  return details;
}

export async function readStoredText(pathOrKey) {
  if (!pathOrKey) return "";
  try {
    const storage = webStorage();
    if (storage) {
      return storage.getItem(pathOrKey) || "";
    }
    return await FileSystem.readAsStringAsync(pathOrKey);
  } catch (error) {
    console.error("Failed to read stored text:", error);
    return "";
  }
}

export async function saveSessionBriefRecord(record) {
  const now = new Date();
  const date = getFormattedDate(now);
  const fileName = `sessionBrief-${date}.json`;
  const payload = {
    ...record,
    date,
    updatedAt: now.toISOString(),
  };
  const path = await writeFile(fileName, JSON.stringify(payload));
  await AsyncStorage.setItem(STORAGE_KEYS.lastSessionBriefPath, path);
  return { ...payload, path, fileName };
}

export async function getLatestSessionBriefRecord() {
  const lastPath = await AsyncStorage.getItem(STORAGE_KEYS.lastSessionBriefPath);
  if (lastPath) {
    try {
      const raw = await readStoredText(lastPath);
      if (raw) return JSON.parse(raw);
    } catch (error) {
      console.error("Failed to load last session brief:", error);
    }
  }

  const files = await listKeys("sessionBrief-", ".json");
  files.sort((a, b) => b.localeCompare(a));
  if (files.length === 0) return null;
  try {
    return JSON.parse(await readFile(files[0]));
  } catch {
    return null;
  }
}

export async function requestBriefGeneration() {
  await AsyncStorage.setItem(STORAGE_KEYS.pendingBrief, "1");
}

export async function consumePendingBriefGeneration() {
  const pending = await AsyncStorage.getItem(STORAGE_KEYS.pendingBrief);
  if (pending === "1") {
    await AsyncStorage.removeItem(STORAGE_KEYS.pendingBrief);
    return true;
  }
  return false;
}

export async function saveDailyChatMessages(messages) {
  await AsyncStorage.setItem(
    STORAGE_KEYS.dailyChatMessages,
    JSON.stringify(messages || [])
  );
}

export async function loadDailyChatMessages() {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.dailyChatMessages);
  return raw ? JSON.parse(raw) : [];
}
