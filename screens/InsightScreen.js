import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { getGeminiStatusLabel, isGeminiConfigured } from "../utils/geminiClient";
import {
  generateSessionBriefArtifact,
  loadCachedSessionBrief,
} from "../utils/sessionBriefEngine";
import { consumePendingBriefGeneration } from "../utils/localData";
import { shareOrCopyText } from "../utils/shareText";

const InsightScreen = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [brief, setBrief] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const cached = await loadCachedSessionBrief();
        const shouldGenerate = await consumePendingBriefGeneration();
        if (cancelled) return;
        if (cached) {
          setBrief(cached);
        }
        if (shouldGenerate) {
          await runGeneration();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load Session Brief.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const runGeneration = async () => {
    setIsGenerating(true);
    setError("");
    try {
      const record = await generateSessionBriefArtifact();
      setBrief(record);
    } catch (err) {
      setError(err.message || "Failed to generate Session Brief.");
    } finally {
      setIsGenerating(false);
      setIsLoading(false);
    }
  };

  const handleShare = () => {
    shareOrCopyText("MindLink Session Brief", brief?.markdown || "");
  };

  if (isLoading && !brief) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Loading Session Brief…</Text>
      </View>
    );
  }

  const analysis = brief?.analysis;
  const geminiReady = isGeminiConfigured();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <Text style={styles.header}>Session Brief</Text>
      <Text style={styles.audienceNote}>
        Written for a clinician before or during a session. Stored on this
        device. Teen-facing chat stays separate.
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
          onPress={runGeneration}
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
            Save a diary entry (mood + tags) or finish a short check-in, then
            generate a clinician Session Brief here.
          </Text>
        </View>
      ) : null}

      {analysis ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data used</Text>
            <Text style={styles.sectionContent}>
              {analysis.dataSources.diaryEntries} journal entries ·{" "}
              {analysis.dataSources.checkIns} check-ins ·{" "}
              {analysis.dataSources.chatReports} chat reports
            </Text>
            <Text style={styles.sectionContent}>
              {analysis.moodSummary.count > 0
                ? `Self-rated mood: avg ${analysis.moodSummary.average}/10 (range ${analysis.moodSummary.min}–${analysis.moodSummary.max}). ${analysis.moodSummary.trend}`
                : "No self-rated mood scores stored yet."}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mood trajectory</Text>
            {analysis.moodTrajectory.length > 0 ? (
              analysis.moodTrajectory.map((mood) => (
                <Text key={`${mood.date}-${mood.mood}`} style={styles.sectionContent}>
                  {mood.date}: {mood.mood}/10
                </Text>
              ))
            ) : (
              <Text style={styles.sectionContent}>
                No journal mood scores available.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tag frequency</Text>
            {Object.keys(analysis.tagFrequency).length > 0 ? (
              Object.entries(analysis.tagFrequency).map(([tag, count]) => (
                <Text key={tag} style={styles.sectionContent}>
                  #{tag}: {count}
                </Text>
              ))
            ) : (
              <Text style={styles.sectionContent}>No diary tags selected yet.</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recurring themes</Text>
            {analysis.themes.length > 0 ? (
              analysis.themes.map((theme) => (
                <Text key={theme} style={styles.sectionContent}>
                  • {theme}
                </Text>
              ))
            ) : (
              <Text style={styles.sectionContent}>
                Not enough repeated topics yet.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Lower-mood stressors</Text>
            <Text style={styles.sectionContent}>
              {analysis.correlations.summary}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notable quote</Text>
            <Text style={styles.quote}>
              {analysis.criticalQuote?.quote
                ? `“${analysis.criticalQuote.quote}”`
                : "No user quote extracted yet."}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Observational signals (user-reported)
            </Text>
            <Text style={styles.finePrint}>
              Keyword mentions from journal/check-in text. Not a PHQ-9 score or
              diagnosis.
            </Text>
            {analysis.observationalSignals.length > 0 ? (
              analysis.observationalSignals.map((signal) => (
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

      {brief?.markdown ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clinician narrative</Text>
          <Markdown style={markdownStyles}>{brief.markdown}</Markdown>
        </View>
      ) : null}
    </ScrollView>
  );
};

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
  container: {
    flex: 1,
    backgroundColor: "#f5f8fa",
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
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

export default InsightScreen;
