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
  NOT_DISCLOSED,
  parseStructuredBrief,
  REPORT_SECTIONS,
} from "../utils/sessionBriefLogic";
import { consumePendingBriefGeneration } from "../utils/localData";
import { shareOrCopyText } from "../utils/shareText";
import { colors, fonts, radius } from "../utils/theme";

const SCALE_SECTIONS = new Set(["presentingConcerns", "anxietyStressLevels"]);

function resolveBriefSections(brief) {
  if (brief?.sections) {
    return {
      sections: brief.sections,
      rawFallback: brief.rawFallback || "",
    };
  }
  if (brief?.narrative) {
    return parseStructuredBrief(brief.narrative);
  }
  return { sections: null, rawFallback: "" };
}

function ReportSectionCard({ section, body }) {
  const empty = !body || body === NOT_DISCLOSED;
  return (
    <View style={styles.reportCard}>
      <View style={styles.reportCardHeader}>
        <View style={styles.reportNumber}>
          <Text style={styles.reportNumberText}>{section.number}</Text>
        </View>
        <Text style={styles.reportCardTitle}>{section.title}</Text>
      </View>
      {SCALE_SECTIONS.has(section.id) ? (
        <Text style={styles.scaleDisclaimer}>
          HAM-D / HAM-A figures, if shown, are preliminary and
          conversation-derived — not administered instruments or diagnoses.
        </Text>
      ) : null}
      {empty ? (
        <Text style={[styles.reportCardBody, styles.reportCardEmpty]}>
          {NOT_DISCLOSED}
        </Text>
      ) : (
        <Markdown style={markdownStyles}>{body}</Markdown>
      )}
    </View>
  );
}

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
  const structuredBrief = resolveBriefSections(brief);

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
            <ActivityIndicator color={colors.surface} />
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

      {brief ? (
        <View style={styles.reportBlock}>
          <Text style={styles.sectionTitle}>Preliminary clinician report</Text>
          <Text style={styles.finePrint}>
            Same 11-section harness on every regenerate. Missing evidence stays
            “Not disclosed in conversation” — the layout does not reshuffle.
          </Text>
          {REPORT_SECTIONS.map((section) => (
            <ReportSectionCard
              key={section.id}
              section={section}
              body={structuredBrief.sections?.[section.id]}
            />
          ))}
          {structuredBrief.rawFallback ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Unstructured model notes</Text>
              <Text style={styles.finePrint}>
                The model did not return parseable 11-section JSON. Scaffold
                above is unchanged.
              </Text>
              <Markdown style={markdownStyles}>
                {structuredBrief.rawFallback}
              </Markdown>
            </View>
          ) : null}
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
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 24,
  },
  heading1: {
    fontSize: 18,
    fontFamily: fonts.title,
    color: colors.text,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 16,
    fontFamily: fonts.metaSemi,
    color: colors.text,
    marginTop: 8,
    marginBottom: 6,
  },
  strong: {
    fontFamily: fonts.bodyMedium,
  },
  em: {
    fontStyle: "italic",
  },
  bullet_list: {
    marginVertical: 8,
  },
  list_item: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 24,
  },
};

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
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
    borderRightColor: colors.border,
  },
  paneSources: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  column: {
    flex: 1,
  },
  columnContent: {
    padding: 16,
    paddingBottom: 48,
  },
  kicker: {
    fontSize: 11,
    fontFamily: fonts.metaSemi,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  panelsKicker: {
    fontSize: 11,
    fontFamily: fonts.metaSemi,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  header: {
    fontSize: 22,
    fontFamily: fonts.title,
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  audienceNote: {
    fontSize: 14,
    fontFamily: fonts.meta,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 12,
  },
  statusBanner: {
    borderRadius: radius,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusReady: {
    backgroundColor: colors.accentSoft,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  statusDemo: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  statusTitle: {
    fontSize: 13,
    fontFamily: fonts.metaSemi,
    color: colors.text,
    marginBottom: 4,
  },
  statusBody: {
    fontSize: 13,
    fontFamily: fonts.meta,
    color: colors.muted,
    lineHeight: 18,
  },
  actions: {
    gap: 10,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontFamily: fonts.bodyMedium,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: radius,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.metaMedium,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  errorBox: {
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontFamily: fonts.meta,
    lineHeight: 20,
  },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: fonts.title,
    color: colors.text,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 22,
  },
  section: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panel: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelTitle: {
    fontSize: 13,
    fontFamily: fonts.metaSemi,
    color: colors.text,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fonts.metaSemi,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 4,
  },
  finePrint: {
    fontSize: 12,
    fontFamily: fonts.meta,
    color: colors.muted,
    marginBottom: 8,
    lineHeight: 18,
  },
  shareStatus: {
    fontSize: 13,
    fontFamily: fonts.meta,
    color: colors.muted,
    textAlign: "center",
  },
  quote: {
    fontSize: 15,
    fontFamily: fonts.body,
    fontStyle: "italic",
    color: colors.muted,
    lineHeight: 24,
    padding: 10,
  },
  reportBlock: {
    marginBottom: 8,
  },
  reportCard: {
    marginBottom: 10,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  reportNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  reportNumberText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.monoMedium,
    textAlign: "center",
    includeFontPadding: false,
  },
  reportCardTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 24,
    fontFamily: fonts.metaSemi,
    color: colors.text,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  reportCardBody: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 22,
  },
  reportCardEmpty: {
    color: colors.muted,
    fontFamily: fonts.metaItalic,
  },
  scaleDisclaimer: {
    fontSize: 12,
    fontFamily: fonts.meta,
    color: colors.muted,
    lineHeight: 17,
    marginBottom: 8,
  },
});
