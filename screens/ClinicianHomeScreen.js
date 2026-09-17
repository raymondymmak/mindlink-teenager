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
import { getGeminiStatusLabel, useGeminiConfigured } from "../utils/geminiClient";
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
import {
  formatSafetyConcernLabel,
  themesByPolarity,
  WINDOW_LABELS,
} from "../utils/changeBriefLogic";
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

function formatChipDate(value) {
  const raw = String(value || "");
  const isoDay = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return "";
  const [year, month, day] = isoDay.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function windowCaption(changeBrief) {
  if (!changeBrief) return "";
  if (changeBrief.kind === "baseline") {
    return "No prior Brief snapshot — saving this visit as the next comparison point.";
  }
  const start = formatChipDate(changeBrief.windowStart);
  const end = formatChipDate(changeBrief.windowEnd);
  if (start && end) return `${start} – ${end}`;
  return "Notes after the last saved Brief.";
}

function concernTone(concern) {
  if (concern === "elevated") return "elevated";
  if (concern === "monitor") return "monitor";
  return "none";
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

function EvidenceChip({ evidence }) {
  if (!evidence?.text) return null;
  const source = evidence.sourceType === "diary" ? "diary" : "chat";
  const when = formatChipDate(evidence.createdAt);
  return (
    <View style={styles.chip}>
      <Text style={styles.chipQuote}>“{evidence.text}”</Text>
      <Text style={styles.chipMeta}>
        {source}
        {when ? ` · ${when}` : ""}
      </Text>
    </View>
  );
}

function ClaimCard({ theme }) {
  return (
    <View style={styles.claimCard}>
      <Text style={styles.claimText}>{theme.claim}</Text>
      {(theme.evidence || []).length > 0 ? (
        <View style={styles.chipRow}>
          {theme.evidence.slice(0, 2).map((evidence, index) => (
            <EvidenceChip
              key={`${theme.label}-${index}-${evidence.text}`}
              evidence={evidence}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.finePrint}>No quote stored for this claim.</Text>
      )}
    </View>
  );
}

function ChangeSection({ title, themes, emptyLabel }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {themes.length > 0 ? (
        themes.map((theme, index) => (
          <ClaimCard key={`${theme.label}-${index}`} theme={theme} />
        ))
      ) : (
        <Text style={styles.emptyMuted}>{emptyLabel}</Text>
      )}
    </View>
  );
}

function SafetyStrip({ safety }) {
  const summary = safety || {
    concern: "none",
    siOrSelfHarm: false,
    otherRisk: false,
    items: [],
    stillOpen: [],
  };
  const tone = concernTone(summary.concern);
  return (
    <View
      style={[
        styles.safetyStrip,
        tone === "elevated" && styles.safetyElevated,
        tone === "monitor" && styles.safetyMonitor,
      ]}
      accessibilityRole="summary"
    >
      <Text style={styles.safetyKicker}>Safety</Text>
      <Text
        style={[
          styles.safetyConcern,
          tone === "elevated" && styles.safetyConcernElevated,
        ]}
      >
        {formatSafetyConcernLabel(summary.concern)}
      </Text>
      <Text style={styles.sectionContent}>
        {summary.siOrSelfHarm
          ? "Suicidal ideation or self-harm language is present in this window. Review the original wording in the room."
          : "No suicidal ideation or self-harm language detected in this window."}
      </Text>
      {summary.otherRisk ? (
        <Text style={styles.sectionContent}>
          Other risk language was flagged in stored notes.
        </Text>
      ) : null}
      {(summary.items || []).map((item) => (
        <Text key={item.text} style={styles.sectionContent}>
          • {item.text}
        </Text>
      ))}
      {(summary.stillOpen || []).length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>
            Still open from last Brief
          </Text>
          {summary.stillOpen.map((item) => (
            <Text key={item} style={styles.sectionContent}>
              • {item}
            </Text>
          ))}
        </>
      ) : null}
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
  const [showFullerNote, setShowFullerNote] = useState(false);
  const [windowMode, setWindowMode] = useState("last-brief");
  const { configured: geminiReady } = useGeminiConfigured();

  const runGeneration = useCallback(
    async ({
      forceLocal = false,
      nextWindowMode,
      persistSnapshot = true,
    } = {}) => {
      const mode = nextWindowMode || windowMode;
      setIsGenerating(true);
      setError("");
      try {
        const record = await generateSessionBriefArtifact({
          forceLocal,
          windowMode: mode,
          persistSnapshot,
        });
        setBrief(record);
        if (record?.analysis) setAnalysis(record.analysis);
        if (nextWindowMode) setWindowMode(nextWindowMode);
      } catch (err) {
        setError(err.message || "Failed to generate Session Brief.");
      } finally {
        setIsGenerating(false);
      }
    },
    [windowMode]
  );

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
        const needsChangeBrief = !cached?.changeBrief;
        if (needsChangeBrief && hasEnoughBriefData(inputs)) {
          await runGeneration({ forceLocal: true, persistSnapshot: false });
          if (cancelled) return;
        }
        if (
          shouldGenerate ||
          (needsChangeBrief && hasEnoughBriefData(inputs))
        ) {
          runGeneration({ forceLocal: false, persistSnapshot: true });
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

  const liveAnalysis = analysis || brief?.analysis;
  const changeBrief = brief?.changeBrief || null;
  const trajectory = liveAnalysis?.moodTrajectory || [];
  const tagEntries = Object.entries(liveAnalysis?.tagFrequency || {}).sort(
    (a, b) => b[1] - a[1]
  );
  const quote = liveAnalysis?.criticalQuote?.quote;
  const stressors = liveAnalysis?.correlations;
  const excerpts = stressors?.excerpts || [];
  const structuredBrief = resolveBriefSections(brief);
  const isBaseline = !changeBrief || changeBrief.kind === "baseline";
  const improved = themesByPolarity(changeBrief?.themes, "improved");
  const worse = themesByPolarity(changeBrief?.themes, "worse");
  const newer = themesByPolarity(changeBrief?.themes, "new");
  const hasSnapshot = Boolean(brief?.snapshotId || changeBrief?.snapshotId);
  const showWindowSwitch = Boolean(brief?.priorSnapshotId);

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

      <View style={styles.windowPill}>
        <Text style={styles.windowLabel}>
          {changeBrief?.windowLabel ||
            (hasSnapshot
              ? WINDOW_LABELS.sinceLastBrief
              : WINDOW_LABELS.firstVisit)}
        </Text>
        <Text style={styles.windowCaption}>
          {windowCaption(changeBrief) ||
            "Generate a Brief to save a snapshot for next time."}
        </Text>
      </View>

      {showWindowSwitch ? (
        <View style={styles.windowSwitch}>
          <TouchableOpacity
            style={[
              styles.windowOption,
              windowMode === "last-brief" && styles.windowOptionOn,
            ]}
            onPress={() => runGeneration({ nextWindowMode: "last-brief" })}
            disabled={isGenerating}
          >
            <Text
              style={[
                styles.windowOptionText,
                windowMode === "last-brief" && styles.windowOptionTextOn,
              ]}
            >
              {WINDOW_LABELS.sinceLastBrief}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.windowOption,
              windowMode === "last-week" && styles.windowOptionOn,
            ]}
            onPress={() => runGeneration({ nextWindowMode: "last-week" })}
            disabled={isGenerating}
          >
            <Text
              style={[
                styles.windowOptionText,
                windowMode === "last-week" && styles.windowOptionTextOn,
              ]}
            >
              {WINDOW_LABELS.sinceLastWeek}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
              : "Set server-only GEMINI_KEY to replace the local demo narrative with a Gemini synthesis. Structure and on-device analysis stay the same.")}
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
              {brief ? "Refresh Session Brief" : "Generate Session Brief"}
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
        {brief?.snapshotId ? (
          <Text style={styles.shareStatus}>
            Snapshot saved for next time — later notes compare{" "}
            {WINDOW_LABELS.sinceLastBrief.toLowerCase()}.
          </Text>
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

      {changeBrief || liveAnalysis ? (
        <SafetyStrip safety={changeBrief?.safetySummary} />
      ) : null}

      {liveAnalysis ? (
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
      ) : null}

      {changeBrief && isBaseline ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Presenting concerns</Text>
            {(changeBrief.presentingConcerns || []).map((item) => (
              <Text key={item} style={styles.sectionContent}>
                • {item}
              </Text>
            ))}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Themes</Text>
            {(changeBrief.themes || []).length > 0 ? (
              changeBrief.themes.map((theme, index) => (
                <ClaimCard key={`${theme.label}-${index}`} theme={theme} />
              ))
            ) : (
              <Text style={styles.emptyMuted}>
                No themes extracted from stored notes yet.
              </Text>
            )}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unknowns</Text>
            {(changeBrief.unknowns || []).map((item) => (
              <Text key={item} style={styles.sectionContent}>
                • {item}
              </Text>
            ))}
          </View>
        </>
      ) : null}

      {changeBrief && !isBaseline ? (
        <>
          {changeBrief.emptyWindow ? (
            <Text style={styles.emptyMuted}>
              No new diary or chat notes since last Brief. Safety and session
              focus carry forward.
            </Text>
          ) : null}
          <ChangeSection
            title="Improved"
            themes={improved}
            emptyLabel="None noted in this window."
          />
          <ChangeSection
            title="Harder or stuck"
            themes={worse}
            emptyLabel="None noted in this window."
          />
          <ChangeSection
            title="New since last time"
            themes={newer}
            emptyLabel="None noted in this window."
          />
        </>
      ) : null}

      {changeBrief ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Session focus</Text>
          <Text style={styles.finePrint}>Clarify in the room</Text>
          {(changeBrief.sessionFocus || []).map((item) => (
            <Text key={item} style={styles.sectionContent}>
              • {item}
            </Text>
          ))}
        </View>
      ) : null}

      {brief ? (
        <View style={styles.reportBlock}>
          <TouchableOpacity
            style={styles.fullerToggle}
            onPress={() => setShowFullerNote((value) => !value)}
            accessibilityRole="button"
          >
            <Text style={styles.fullerToggleText}>
              {showFullerNote ? "Hide fuller note" : "Show fuller note"}
            </Text>
            <Text style={styles.finePrint}>
              Optional 11-section export. Not the default clinician view.
            </Text>
          </TouchableOpacity>
          {showFullerNote
            ? REPORT_SECTIONS.map((section) => (
                <ReportSectionCard
                  key={section.id}
                  section={section}
                  body={structuredBrief.sections?.[section.id]}
                />
              ))
            : null}
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

      <Panel title="Observational signals (user-reported)">
        <Text style={styles.finePrint}>
          Keyword mentions from journal/check-in text. Not a PHQ-9 score or
          diagnosis.
        </Text>
        {(liveAnalysis?.observationalSignals || []).length > 0 ? (
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
  windowPill: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  windowLabel: {
    fontSize: 13,
    fontFamily: fonts.metaSemi,
    color: colors.text,
    marginBottom: 4,
  },
  windowCaption: {
    fontSize: 13,
    fontFamily: fonts.meta,
    color: colors.muted,
    lineHeight: 18,
  },
  windowSwitch: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  windowOption: {
    flex: 1,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    alignItems: "center",
  },
  windowOptionOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  windowOptionText: {
    fontSize: 12,
    fontFamily: fonts.metaMedium,
    color: colors.muted,
  },
  windowOptionTextOn: {
    color: colors.accent,
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
  emptyMuted: {
    fontSize: 14,
    fontFamily: fonts.metaItalic,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 8,
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
  fullerToggle: {
    marginBottom: 10,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fullerToggleText: {
    fontSize: 14,
    fontFamily: fonts.metaSemi,
    color: colors.accent,
    marginBottom: 4,
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
  safetyStrip: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  safetyMonitor: {
    backgroundColor: colors.accentSoft,
  },
  safetyElevated: {
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  safetyKicker: {
    fontSize: 11,
    fontFamily: fonts.metaSemi,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  safetyConcern: {
    fontSize: 16,
    fontFamily: fonts.title,
    color: colors.text,
    marginBottom: 8,
  },
  safetyConcernElevated: {
    color: colors.danger,
  },
  claimCard: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  claimText: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  chipRow: {
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.accentSoft,
    borderRadius: radius,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  chipQuote: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 18,
    marginBottom: 4,
  },
  chipMeta: {
    fontSize: 11,
    fontFamily: fonts.meta,
    color: colors.muted,
  },
});
