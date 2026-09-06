import { generateGeminiText, isGeminiConfigured } from "./geminiClient";
import { SYSTEM_INSTRUCTION_SESSION_BRIEF } from "./systemInstruction";
import {
  analyzeLocalSignals,
  buildMockSessionBrief,
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

function buildSynthesisPrompt(analysis) {
  return `Write a concise Session Brief for a psychiatrist using ONLY this on-device analysis. Do not invent diagnoses, scale scores, or events.

Structured observations:
${JSON.stringify(analysis, null, 2)}

Required markdown sections:
## Mood trajectory
## Recurring themes
## Stressors on lower-mood days
## Notable quote
## Observational signals from user-reported text
## Suggested opening questions

Rules:
- Mood numbers may be cited only if present in moodTrajectory / moodSummary.
- Observational signals are keyword mentions, not PHQ-9 or HAM scores.
- If a section has no data, say it is not available from on-device data.
- End with a one-line reminder that this is not a diagnosis.`;
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
  let narrative;
  let warning = null;

  if (!forceLocal && isGeminiConfigured()) {
    try {
      narrative = await generateGeminiText({
        contents: buildSynthesisPrompt(analysis),
        systemInstruction: SYSTEM_INSTRUCTION_SESSION_BRIEF,
      });
      mode = "gemini";
    } catch (error) {
      warning =
        error?.code === "MISSING_API_KEY"
          ? error.message
          : `Gemini was unavailable (${error.message}). Showing an on-device demo brief instead.`;
      narrative = buildMockSessionBrief(analysis, {
        reason: "Gemini fallback",
      });
    }
  } else {
    warning = isGeminiConfigured()
      ? null
      : "No EXPO_PUBLIC_GEMINI_API_KEY found. This is an on-device demo brief using the same clinician structure.";
    narrative = buildMockSessionBrief(analysis, {
      reason: "API key not configured",
    });
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
