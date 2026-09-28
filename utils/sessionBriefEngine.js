import {
  buildContextQueryFromAnalysis,
  withClinicalContext,
} from "./contextApi";
import {
  generateGeminiText,
  checkGeminiConfigured,
} from "./geminiClient";
import { SYSTEM_INSTRUCTION_CHANGE_BRIEF } from "./systemInstruction";
import {
  analyzeLocalSignals,
  buildLocalReportSections,
  constrainMoodScaleLanguage,
  formatReportSectionsMarkdown,
  hasEnoughBriefData,
} from "./sessionBriefLogic";
import {
  buildChangeBriefPrompt,
  buildLocalChangeBrief,
  collectEvidenceItems,
  filterInputsSinceLastWeek,
  filterInputsSinceSnapshot,
  formatChangeBriefMarkdown,
  parseChangeBrief,
  saveClinicianCorrectedSnapshot as prepareClinicianCorrectedSnapshot,
  shouldPersistGeneratedSnapshot,
  snapshotFromChangeBrief,
} from "./changeBriefLogic";
import {
  getCheckIns,
  getChatReports,
  getDiaryEntries,
  getLatestBriefSnapshot,
  getLatestSessionBriefRecord,
  getUserName,
  saveBriefSnapshot,
  saveSessionBriefRecord,
} from "./localData";

function applyMoodConstraintToSections(sections) {
  const next = {};
  Object.entries(sections || {}).forEach(([key, value]) => {
    next[key] = constrainMoodScaleLanguage(value);
  });
  return next;
}

function windowInputsForBrief(inputs, priorSnapshot, windowMode) {
  if (windowMode === "last-week") {
    return filterInputsSinceLastWeek(inputs);
  }
  if (priorSnapshot) {
    return filterInputsSinceSnapshot(inputs, priorSnapshot);
  }
  return inputs;
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

export async function generateSessionBriefArtifact({
  forceLocal = false,
  windowMode = "last-brief",
  persistSnapshot = true,
} = {}) {
  const inputs = await loadSessionBriefInputs();
  if (!hasEnoughBriefData(inputs)) {
    const error = new Error(
      "Not enough on-device data yet. Save a journal entry or finish a short check-in, then generate again."
    );
    error.code = "INSUFFICIENT_DATA";
    throw error;
  }

  const priorSnapshot = await getLatestBriefSnapshot();
  const analysis = analyzeLocalSignals(inputs);
  const scopedInputs = windowInputsForBrief(inputs, priorSnapshot, windowMode);
  const windowAnalysis = priorSnapshot
    ? analyzeLocalSignals({ ...scopedInputs, userName: inputs.userName })
    : analysis;
  const evidenceCandidates = collectEvidenceItems(
    priorSnapshot ? scopedInputs : inputs
  );

  const localChange = buildLocalChangeBrief({
    inputs,
    priorSnapshot,
    windowMode,
  });

  let changeBrief = localChange;
  let mode = "local-demo";
  let warning = null;

  const geminiReady = await checkGeminiConfigured();
  if (!forceLocal && geminiReady) {
    try {
      const { systemInstruction } = await withClinicalContext(
        SYSTEM_INSTRUCTION_CHANGE_BRIEF,
        buildContextQueryFromAnalysis(windowAnalysis)
      );
      const raw = await generateGeminiText({
        contents: buildChangeBriefPrompt({
          kind: localChange.kind,
          priorSnapshot,
          analysis,
          windowAnalysis,
          evidenceCandidates,
          windowLabel: localChange.windowLabel,
        }),
        systemInstruction,
        task: "brief",
      });
      changeBrief = parseChangeBrief(raw, localChange);
      mode = "gemini";
    } catch (error) {
      warning =
        error?.code === "MISSING_API_KEY"
          ? error.message
          : `Gemini was unavailable (${error.message}). Showing an on-device change Brief instead.`;
      changeBrief = localChange;
    }
  } else {
    warning = geminiReady
      ? null
      : "Gemini is not configured on the server (GEMINI_KEY). This is an on-device change Brief using mood, tags, and risk language from stored notes.";
    changeBrief = localChange;
  }

  const sections = applyMoodConstraintToSections(
    buildLocalReportSections(analysis, {
      reason: mode === "gemini" ? "fuller note" : "Gemini fallback",
    })
  );
  const narrative = formatReportSectionsMarkdown(sections);
  const markdown = formatChangeBriefMarkdown(changeBrief, {
    analysis,
    sections,
  });

  let snapshot = priorSnapshot;
  if (
    persistSnapshot &&
    shouldPersistGeneratedSnapshot(priorSnapshot, changeBrief)
  ) {
    snapshot = await saveBriefSnapshot(
      snapshotFromChangeBrief(changeBrief, {
        now: new Date(),
      })
    );
  }
  changeBrief = {
    ...changeBrief,
    snapshotId: snapshot?.id || null,
    priorSnapshotId: priorSnapshot?.id || null,
  };

  const record = await saveSessionBriefRecord({
    mode,
    warning,
    markdown,
    analysis,
    narrative,
    sections,
    rawFallback: "",
    changeBrief,
    snapshotId: snapshot?.id || null,
    priorSnapshotId: priorSnapshot?.id || null,
  });

  return record;
}

export async function saveClinicianCorrectedSnapshot({
  changeBrief,
  edits = {},
  record = null,
  now = new Date(),
} = {}) {
  if (!changeBrief) {
    const error = new Error(
      "Generate a Session Brief before saving corrections."
    );
    error.code = "NO_BRIEF";
    throw error;
  }
  const prepared = prepareClinicianCorrectedSnapshot(changeBrief, edits, {
    now,
    record,
  });
  const snapshot = await saveBriefSnapshot(prepared.snapshot);
  const nextBrief = {
    ...prepared.changeBrief,
    snapshotId: snapshot.id,
  };
  const markdown = formatChangeBriefMarkdown(nextBrief, {
    analysis: record?.analysis,
    sections: record?.sections,
  });
  const savedRecord = await saveSessionBriefRecord({
    ...(record || {}),
    mode: record?.mode || prepared.record.mode,
    warning: record?.warning ?? null,
    markdown,
    analysis: record?.analysis,
    narrative: record?.narrative,
    sections: record?.sections,
    rawFallback: record?.rawFallback || "",
    changeBrief: nextBrief,
    snapshotId: snapshot.id,
    priorSnapshotId: nextBrief.priorSnapshotId,
  });
  return { changeBrief: nextBrief, snapshot, record: savedRecord };
}

export async function loadCachedSessionBrief() {
  return getLatestSessionBriefRecord();
}

export async function loadLatestBriefSnapshot() {
  return getLatestBriefSnapshot();
}
