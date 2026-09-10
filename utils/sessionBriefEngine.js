import {
  buildContextQueryFromAnalysis,
  withClinicalContext,
} from "./contextApi";
import {
  generateGeminiText,
  checkGeminiConfigured,
} from "./geminiClient";
import {
  SYSTEM_INSTRUCTION_SESSION_BRIEF,
  SYSTEM_INSTRUCTION_SUMMARY,
} from "./systemInstruction";
import {
  analyzeLocalSignals,
  buildLocalReportSections,
  buildSynthesisPrompt,
  constrainMoodScaleLanguage,
  formatReportSectionsMarkdown,
  formatSessionBriefMarkdown,
  hasEnoughBriefData,
  parseStructuredBrief,
} from "./sessionBriefLogic";
import {
  getCheckIns,
  getChatReports,
  getDiaryEntries,
  getLatestSessionBriefRecord,
  getUserName,
  saveSessionBriefRecord,
} from "./localData";

function sessionBriefSystemInstruction() {
  return `${SYSTEM_INSTRUCTION_SUMMARY}\n\n${SYSTEM_INSTRUCTION_SESSION_BRIEF}`;
}

function applyMoodConstraintToSections(sections) {
  const next = {};
  Object.entries(sections || {}).forEach(([key, value]) => {
    next[key] = constrainMoodScaleLanguage(value);
  });
  return next;
}

export async function loadSessionBriefInputs() {
  const [entries, checkIns, summaries, userName] = await Promise.all([
    getDiaryEntries(),
    getCheckIns(),
    getChatReports(),
    getUserName(),
  ]);
  return { entries, checkIns, summaries, userName };
}

export async function generateSessionBriefArtifact({ forceLocal = false } = {}) {
  const inputs = await loadSessionBriefInputs();
  if (!hasEnoughBriefData(inputs)) {
    const error = new Error(
      "Not enough on-device data yet. Save a journal entry or finish a short check-in, then generate again."
    );
    error.code = "INSUFFICIENT_DATA";
    throw error;
  }

  const analysis = analyzeLocalSignals(inputs);
  let mode = "local-demo";
  let sections;
  let rawFallback = "";
  let warning = null;

  const geminiReady = await checkGeminiConfigured();
  if (!forceLocal && geminiReady) {
    try {
      const { systemInstruction } = await withClinicalContext(
        sessionBriefSystemInstruction(),
        buildContextQueryFromAnalysis(analysis)
      );
      const raw = await generateGeminiText({
        contents: buildSynthesisPrompt(analysis),
        systemInstruction,
        task: "brief",
      });
      const parsed = parseStructuredBrief(raw);
      sections = applyMoodConstraintToSections(parsed.sections);
      rawFallback = constrainMoodScaleLanguage(parsed.rawFallback || "");
      mode = "gemini";
    } catch (error) {
      warning =
        error?.code === "MISSING_API_KEY"
          ? error.message
          : `Gemini was unavailable (${error.message}). Showing an on-device demo brief instead.`;
      sections = buildLocalReportSections(analysis, {
        reason: "Gemini fallback",
      });
    }
  } else {
    warning = geminiReady
      ? null
      : "Gemini is not configured on the server (GEMINI_KEY). This is an on-device demo brief using the same clinician structure.";
    sections = buildLocalReportSections(analysis, {
      reason: "API key not configured",
    });
  }

  const narrative = formatReportSectionsMarkdown(sections);
  const markdown = formatSessionBriefMarkdown(analysis, {
    sections,
    rawFallback,
  });
  const record = await saveSessionBriefRecord({
    mode,
    warning,
    markdown,
    analysis,
    narrative,
    sections,
    rawFallback,
  });

  return record;
}

export async function loadCachedSessionBrief() {
  return getLatestSessionBriefRecord();
}
