import {
  buildContextQueryFromAnalysis,
  withClinicalContext,
} from "./contextApi";
import { generateGeminiText, isGeminiConfigured } from "./geminiClient";
import { SYSTEM_INSTRUCTION_SESSION_BRIEF } from "./systemInstruction";
import {
  analyzeLocalSignals,
  buildMockSessionBrief,
  buildSynthesisPrompt,
  constrainMoodScaleLanguage,
  formatSessionBriefMarkdown,
  hasEnoughBriefData,
} from "./sessionBriefLogic";
import {
  getCheckIns,
  getChatReports,
  getDiaryEntries,
  getLatestSessionBriefRecord,
  getUserName,
  saveSessionBriefRecord,
} from "./localData";

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
  let narrative;
  let warning = null;

  if (!forceLocal && isGeminiConfigured()) {
    try {
      const { systemInstruction } = await withClinicalContext(
        SYSTEM_INSTRUCTION_SESSION_BRIEF,
        buildContextQueryFromAnalysis(analysis)
      );
      narrative = constrainMoodScaleLanguage(
        await generateGeminiText({
          contents: buildSynthesisPrompt(analysis),
          systemInstruction,
          task: "brief",
        })
      );
      mode = "gemini";
    } catch (error) {
      warning =
        error?.code === "MISSING_API_KEY"
          ? error.message
          : `Gemini was unavailable (${error.message}). Showing an on-device demo brief instead.`;
      narrative = constrainMoodScaleLanguage(
        buildMockSessionBrief(analysis, {
          reason: "Gemini fallback",
        })
      );
    }
  } else {
    warning = isGeminiConfigured()
      ? null
      : "No EXPO_PUBLIC_GEMINI_API_KEY found. This is an on-device demo brief using the same clinician structure.";
    narrative = constrainMoodScaleLanguage(
      buildMockSessionBrief(analysis, {
        reason: "API key not configured",
      })
    );
  }

  const markdown = formatSessionBriefMarkdown(analysis, narrative);
  const record = await saveSessionBriefRecord({
    mode,
    warning,
    markdown,
    analysis,
    narrative,
  });

  return record;
}

export async function loadCachedSessionBrief() {
  return getLatestSessionBriefRecord();
}
