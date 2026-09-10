import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  analyzeLocalSignals,
  buildTeenWeekCard,
} from "../utils/sessionBriefLogic";
import { loadSessionBriefInputs } from "../utils/sessionBriefEngine";
import { colors, fonts, radius } from "../utils/theme";

export default function MyWeekScreen() {
  const [card, setCard] = useState(null);
  const [userName, setUserName] = useState("there");
  const [isLoading, setIsLoading] = useState(true);

  const loadWeek = useCallback(async () => {
    try {
      const inputs = await loadSessionBriefInputs();
      setUserName(inputs.userName || "there");
      const analysis = analyzeLocalSignals(inputs);
      setCard(buildTeenWeekCard(analysis));
    } catch (error) {
      console.error("Failed to load My week:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWeek();
    }, [loadWeek])
  );

  if (isLoading && !card) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading your week…</Text>
      </View>
    );
  }

  const mood = card?.moodGlance || {};
  const tags = card?.topTags || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.hello}>Hi {userName}</Text>
      <Text style={styles.lede}>
        A light glance at what you saved this week. Nothing clinical here.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{card?.title || "My week"}</Text>
        <Text style={styles.moodHeadline}>{mood.headline}</Text>
        <Text style={styles.moodDetail}>{mood.detail}</Text>
        {mood.recent?.length > 0 ? (
          <View style={styles.chipRow}>
            {mood.recent.map((item, index) => (
              <View
                key={`${item.date || "mood"}-${index}`}
                style={styles.moodChip}
              >
                <Text style={styles.moodChipText}>{item.mood}/10</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Top tags</Text>
        {tags.length > 0 ? (
          <View style={styles.chipRow}>
            {tags.map((item) => (
              <View key={item.tag} style={styles.tagChip}>
                <Text style={styles.tagChipText}>
                  #{item.tag}
                  {item.count > 1 ? ` · ${item.count}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>
            Tag a diary entry with school, friends, or whatever fits.
          </Text>
        )}
      </View>

      <View
        style={[
          styles.card,
          card?.readyForSession ? styles.readyCard : styles.notReadyCard,
        ]}
      >
        <Text style={styles.cardTitle}>{card?.readyTitle}</Text>
        <Text style={styles.readyBody}>{card?.readyBody}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  loadingText: {
    marginTop: 12,
    fontFamily: fonts.meta,
    color: colors.muted,
  },
  hello: {
    fontSize: 22,
    fontFamily: fonts.title,
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  lede: {
    fontSize: 14,
    fontFamily: fonts.meta,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: 18,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: fonts.metaSemi,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  moodHeadline: {
    fontSize: 22,
    fontFamily: fonts.title,
    color: colors.text,
    marginBottom: 4,
  },
  moodDetail: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 22,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 8,
  },
  moodChip: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moodChipText: {
    color: colors.text,
    fontFamily: fonts.metaMedium,
    fontSize: 13,
  },
  tagChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  tagChipText: {
    color: colors.accent,
    fontFamily: fonts.metaMedium,
    fontSize: 13,
  },
  empty: {
    fontSize: 14,
    fontFamily: fonts.meta,
    color: colors.muted,
    lineHeight: 22,
  },
  readyCard: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  notReadyCard: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  readyBody: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 22,
  },
});
