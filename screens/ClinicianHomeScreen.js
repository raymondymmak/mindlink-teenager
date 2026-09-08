import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { getGeminiStatusLabel, isGeminiConfigured } from "../utils/geminiClient";
import {
  generateSessionBriefArtifact,
  loadCachedSessionBrief,
  loadSessionBriefInputs,
} from "../utils/sessionBriefEngine";
import {
  analyzeLocalSignals,
  hasEnoughBriefData,
} from "../utils/sessionBriefLogic";
import { consumePendingBriefGeneration } from "../utils/localData";
import { shareOrCopyText } from "../utils/shareText";

function Panel({ title, children }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function ClinicianHomeScreen() {
  const { width } = useWindowDimensions();
  const split = width >= 960;
  const [isGenerating, setIsGenerating] = useState(false);
  const [brief, setBrief] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");
  const [shareStatus, setShareStatus] = useState("");

  const runGeneration = useCallback(async ({ forceLocal = false } = {}) => {
    setIsGenerating(true);
    setError("");
    try {
      const record = await generateSessionBriefArtifact({ forceLocal });
      setBrief(record);
      if (record?.analysis) setAnalysis(record.analysis);
    } catch (err) {
      setError(err.message || "Failed to generate Session Brief.");
    } finally {
      setIsGenerating(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const inputs = await loadSessionBriefInputs();
        if (cancelled) return;
        if (hasEnoughBriefData(inputs)) {
          setAnalysis(analyzeLocalSignals(inputs));
        }
        const cached = await loadCachedSessionBrief();
        if (cancelled) return;
        if (cached) {
          setBrief(cached);
          if (cached.analysis) setAnalysis(cached.analysis);
        }
        const shouldGenerate = await consumePendingBriefGeneration();
        if (cancelled) return;
        if (!cached && hasEnoughBriefData(inputs)) {
          await runGeneration({ forceLocal: true });
          if (cancelled) return;
        }
        if (shouldGenerate || (!cached && hasEnoughBriefData(inputs))) {
          runGeneration({ forceLocal: false });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load Session Brief.");
        }
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [runGeneration]);

  const handleShare = async () => {
    const shared = await shareOrCopyText(
      "MindLink Session Brief",
      brief?.markdown || ""
    );
    setShareStatus(shared ? "Brief copied or handed to the share sheet." : "");
  };

  const geminiReady = isGeminiConfigured();
  const liveAnalysis = analysis || brief?.analysis;
  const trajectory = liveAnalysis?.moodTrajectory || [];
  const tagEntries = Object.entries(liveAnalysis?.tagFrequency || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const quote = liveAnalysis?.criticalQuote?.quote;
  const stressors = liveAnalysis?.correlations;
  const excerpts = stressors?.excerpts || [];

  const briefColumn = (
    <ScrollView
      style={styles.column}
      contentContainerStyle={styles.columnContent}
    >
      <Text style={styles.kicker}>Clinician view</Text>
      <Text style={styles.header}>Session Brief</Text>
      <Text style={styles.audienceNote}>
        Same on-device diary and chat notes as Teen mode. This shell is the
        clinician lens — not a second database.
      </Text>

      <View
        style={[
          styles.statusBanner,
          geminiReady && brief?.mode === "gemini"
            ? styles.statusReady
            : styles.statusDemo,
        ]}
      >
        <Text style={styles.statusTitle}>
          {brief?.mode === "gemini"
            ? "Synthesized with Gemini"
            : getGeminiStatusLabel()}
        </Text>
        <Text style={styles.statusBody}>
          {brief?.warning ||
            (geminiReady
              ? "Journal, check-in, and local report data stay on-device except for this Gemini synthesis call."
              : "Set EXPO_PUBLIC_GEMINI_API_KEY to replace the local demo narrative with a Gemini synthesis. Structure and on-device analysis stay the same.")}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => runGeneration({ forceLocal: false })}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {brief ? "Regenerate Session Brief" : "Generate Session Brief"}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, !brief && styles.buttonDisabled]}
          onPress={handleShare}
          disabled={!brief}
        >
          <Text style={styles.secondaryButtonText}>Copy / Share</Text>
        </TouchableOpacity>
        {shareStatus ? (
          <Text style={styles.shareStatus}>{shareStatus}</Text>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!brief && !error ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No brief yet</Text>
          <Text style={styles.emptyText}>
            Switch back to teen view, save a diary entry or check-in, then
            return here. Panels on the right use the same local data.
          </Text>
        </View>
      ) : null}

      {liveAnalysis ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data used</Text>
            <Text style={styles.sectionContent}>
              {liveAnalysis.dataSources?.diaryEntries || 0} journal entries ·{" "}
              {liveAnalysis.dataSources?.checkIns || 0} check-ins ·{" "}
              {liveAnalysis.dataSources?.chatReports || 0} chat reports
            </Text>
            <Text style={styles.sectionContent}>
              {liveAnalysis.moodSummary.count > 0
                ? `Self-rated mood (1–10): avg ${liveAnalysis.moodSummary.average}/10 (range ${liveAnalysis.moodSummary.min}–${liveAnalysis.moodSummary.max}). ${liveAnalysis.moodSummary.trend}`
                : "No self-rated mood scores stored yet."}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Suggested opening questions</Text>
            {(liveAnalysis.openingQuestions || []).length > 0 ? (
              liveAnalysis.openingQuestions.map((question) => (
                <Text key={question} style={styles.sectionContent}>
                  • {question}
                </Text>
              ))
            ) : (
              <Text style={styles.sectionContent}>
                Generate a brief to get suggested openers.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Observational signals (user-reported)
            </Text>
            <Text style={styles.finePrint}>
              Keyword mentions from journal/check-in text. Not a PHQ-9 score or
              diagnosis.
            </Text>
            {(liveAnalysis.observationalSignals || []).length > 0 ? (
              liveAnalysis.observationalSignals.map((signal) => (
                <Text key={signal.id} style={styles.sectionContent}>
                  • {signal.label} — {signal.mentionCount} mention
                  {signal.mentionCount === 1 ? "" : "s"} in{" "}
                  {signal.sources.join(", ")}
                </Text>
              ))
            ) : (
              <Text style={styles.sectionContent}>
                No PHQ-adjacent phrases detected in stored user text.
              </Text>
            )}
          </View>
        </>
      ) : null}

      {brief?.narrative ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clinician notes</Text>
          <Markdown style={markdownStyles}>{brief.narrative}</Markdown>
        </View>
      ) : null}
    </ScrollView>
  );

  const sourcePanels = (
    <ScrollView
      style={styles.column}
      contentContainerStyle={styles.columnContent}
    >
      <Text style={styles.panelsKicker}>Source panels</Text>
      <Panel title="Mood trajectory">
        {trajectory.length > 0 ? (
          trajectory.map((mood, index) => (
            <Text
              key={`${mood.date}-${mood.mood}-${index}`}
              style={styles.sectionContent}
            >
              {mood.date}: {mood.mood}/10
            </Text>
          ))
        ) : (
          <Text style={styles.sectionContent}>
            No journal mood scores available.
          </Text>
        )}
      </Panel>

      <Panel title="Tag frequency">
        {tagEntries.length > 0 ? (
          tagEntries.map(([tag, count]) => (
            <Text key={tag} style={styles.sectionContent}>
              #{tag}: {count}
            </Text>
          ))
        ) : (
          <Text style={styles.sectionContent}>No diary tags selected yet.</Text>
        )}
      </Panel>

      <Panel title="Key quotes / stressors">
        <Text style={styles.quote}>
          {quote ? `“${quote}”` : "No user quote extracted yet."}
        </Text>
        <Text style={[styles.sectionContent, { marginTop: 10 }]}>
          {stressors?.summary ||
            "No lower-mood journal days with tags yet."}
        </Text>
        {excerpts.map((excerpt, index) => (
          <Text
            key={`${excerpt.date}-${index}`}
            style={styles.sectionContent}
          >
            {excerpt.date} ({excerpt.mood}/10): {excerpt.text}
          </Text>
        ))}
      </Panel>
    </ScrollView>
  );

  return (
    <View style={[styles.shell, split && styles.shellSplit]}>
      <View style={[styles.pane, split && styles.paneBrief]}>{briefColumn}</View>
      <View style={[styles.pane, split && styles.paneSources]}>
        {sourcePanels}
      </View>
    </View>
  );
}

const markdownStyles = {
  body: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
  },
  heading1: {
    fontSize: 22,
    color: "#2e4057",
    fontWeight: "bold",
    marginBottom: 8,
  },
  heading2: {
    fontSize: 18,
    color: "#007bff",
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 6,
  },
  strong: {
    fontWeight: "bold",
  },
  em: {
    fontStyle: "italic",
  },
  bullet_list: {
    marginVertical: 8,
  },
  list_item: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
  },
};

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: "#eef2f6",
  },
  shellSplit: {
    flexDirection: "row",
  },
  pane: {
    flex: 1,
    minWidth: 0,
  },
  paneBrief: {
    flex: 1.2,
    borderRightWidth: 1,
    borderRightColor: "#d5dee7",
  },
  paneSources: {
    flex: 1,
    backgroundColor: "#f7fafc",
  },
  column: {
    flex: 1,
  },
  columnContent: {
    padding: 16,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#eef2f6",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    color: "#007bff",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  panelsKicker: {
    fontSize: 12,
    fontWeight: "800",
    color: "#5b6b7c",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  header: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#2e4057",
    marginBottom: 8,
  },
  audienceNote: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
    marginBottom: 12,
  },
  statusBanner: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  statusReady: {
    backgroundColor: "#e8f4f8",
    borderWidth: 1,
    borderColor: "#b6d7ea",
  },
  statusDemo: {
    backgroundColor: "#fff6e5",
    borderWidth: 1,
    borderColor: "#f0d9a6",
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2e4057",
    marginBottom: 4,
  },
  statusBody: {
    fontSize: 13,
    color: "#444",
    lineHeight: 18,
  },
  actions: {
    gap: 10,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: "#007bff",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  secondaryButton: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#007bff",
  },
  secondaryButtonText: {
    color: "#007bff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  errorBox: {
    backgroundColor: "#fdecea",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#8a1f11",
    fontSize: 14,
    lineHeight: 20,
  },
  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2e4057",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 15,
    color: "#555",
    lineHeight: 22,
  },
  section: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  panel: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d5dee7",
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#2e4057",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#007bff",
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
    marginBottom: 4,
  },
  finePrint: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
    lineHeight: 18,
  },
  shareStatus: {
    fontSize: 13,
    color: "#2e7d32",
    textAlign: "center",
  },
  quote: {
    fontSize: 16,
    fontStyle: "italic",
    color: "#555",
    lineHeight: 24,
    textAlign: "center",
    padding: 10,
    backgroundColor: "#f8f9fa",
    borderRadius: 5,
  },
});
