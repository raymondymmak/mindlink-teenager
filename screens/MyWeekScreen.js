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
        <ActivityIndicator size="large" color="#007bff" />
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
    backgroundColor: "#f5f8fa",
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f8fa",
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
  },
  hello: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#2e4057",
    marginBottom: 6,
  },
  lede: {
    fontSize: 15,
    color: "#555",
    lineHeight: 22,
    marginBottom: 18,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e4ebf1",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#007bff",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  moodHeadline: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2e4057",
    marginBottom: 4,
  },
  moodDetail: {
    fontSize: 15,
    color: "#555",
    lineHeight: 22,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 8,
  },
  moodChip: {
    backgroundColor: "#e8f4f8",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  moodChipText: {
    color: "#2e4057",
    fontWeight: "700",
    fontSize: 14,
  },
  tagChip: {
    backgroundColor: "#eef6ff",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tagChipText: {
    color: "#007bff",
    fontWeight: "600",
    fontSize: 14,
  },
  empty: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
  },
  readyCard: {
    borderColor: "#b7e0c2",
    backgroundColor: "#f3fbf5",
  },
  notReadyCard: {
    borderColor: "#f0d9a6",
    backgroundColor: "#fff9ef",
  },
  readyBody: {
    fontSize: 16,
    color: "#333",
    lineHeight: 22,
  },
});
