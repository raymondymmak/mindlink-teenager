import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TabView, TabBar } from "react-native-tab-view";
import Slider from "@react-native-community/slider";
import { getDiaryEntries, requestBriefGeneration, saveDiaryEntry } from "../utils/localData";
import { colors, fonts, radius } from "../utils/theme";

const AVAILABLE_TAGS = [
  "school",
  "family",
  "friends",
  "anxiety",
  "procrastination",
  "lonely",
];

function formatDiarySize(size) {
  const bytes = Number(size) || 0;
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round((bytes / 1024) * 10) / 10} KB`;
}

function DiaryWriteTab({ userName, date, prompt, onSave }) {
  const [localDiaryEntry, setLocalDiaryEntry] = useState("");
  const [localMoodValue, setLocalMoodValue] = useState(5);
  const [localSelectedTags, setLocalSelectedTags] = useState([]);
  const payloadRef = useRef({
    response: "",
    mood: 5,
    tags: [],
  });
  const textInputRef = React.useRef(null);

  payloadRef.current = {
    response: localDiaryEntry,
    mood: localMoodValue,
    tags: [...localSelectedTags],
  };

  const toggleTagLocal = (tag) => {
    setLocalSelectedTags((prevTags) =>
      prevTags.includes(tag)
        ? prevTags.filter((t) => t !== tag)
        : [...prevTags, tag]
    );
  };

  const handleSave = async () => {
    const snapshot = {
      response: payloadRef.current.response,
      mood: payloadRef.current.mood,
      tags: [...payloadRef.current.tags],
    };
    if (!snapshot.response.trim()) {
      Alert.alert("Empty Entry", "Please write something before saving.");
      return;
    }
    const saved = await onSave(snapshot);
    if (saved !== false) {
      setLocalDiaryEntry("");
      setLocalSelectedTags([]);
      setLocalMoodValue(5);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {userName}!</Text>
        <Text style={styles.date}>{date}</Text>
      </View>

      <View style={styles.promptContainer}>
        <Text style={styles.promptText}>{prompt}</Text>
      </View>

      <View style={styles.diaryContainer}>
        <TextInput
          ref={textInputRef}
          style={styles.diaryInput}
          multiline={true}
          placeholder="Write your thoughts here..."
          value={localDiaryEntry}
          onChangeText={setLocalDiaryEntry}
          textAlignVertical="top"
          autoFocus={false}
          autoCorrect={false}
          keyboardType="default"
          blurOnSubmit={false}
        />
      </View>

      <View style={styles.moodContainer}>
        <Text style={styles.moodLabel}>
          How are you feeling? (1-10): {localMoodValue}
        </Text>
        <Slider
          style={{ width: "100%", height: 40 }}
          minimumValue={1}
          maximumValue={10}
          step={1}
          value={localMoodValue}
          onValueChange={setLocalMoodValue}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
        />
      </View>

      <View style={styles.tagsContainer}>
        <Text style={styles.tagsLabel}>Add tags:</Text>
        <View style={styles.tagsWrapper}>
          {AVAILABLE_TAGS.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[
                styles.tag,
                localSelectedTags.includes(tag) && styles.selectedTag,
              ]}
              onPress={() => toggleTagLocal(tag)}
            >
              <Text
                style={[
                  styles.tagText,
                  localSelectedTags.includes(tag) && styles.selectedTagText,
                ]}
              >
                #{tag}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save Entry</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function formatDisplayDate(datePart) {
  try {
    const [year, month, day] = String(datePart || "").split("-");
    const entryDate = new Date(year, month - 1, day);
    if (Number.isNaN(entryDate.getTime())) return datePart || "";
    return entryDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return datePart || "";
  }
}

const HomeScreen = ({ navigation }) => {
  const [prompt, setPrompt] = useState("");
  const [userName, setUserName] = useState("User");
  const [date, setDate] = useState("");
  const [savedDiaries, setSavedDiaries] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [routes] = useState([
    { key: "write", title: "Write" },
    { key: "history", title: "History" },
  ]);

  useEffect(() => {
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    setDate(formattedDate);

    const fetchUserName = async () => {
      try {
        const storedName = await AsyncStorage.getItem("@user_name");
        if (storedName) {
          setUserName(storedName);
        }
      } catch (error) {
        console.error("Failed to fetch user name:", error);
      }
    };

    const getDailyPrompt = () => {
      const prompts = [
        "How are you feeling today? Share your thoughts and emotions.",
        "What's one thing that made you smile today?",
        "What are you grateful for today?",
        "Is there anything that's bothering you that you'd like to talk about?",
        "What are your goals for today?",
        "How did you sleep last night? How is your energy level today?",
        "Describe your mood today using three words.",
        "What's something you're looking forward to today or this week?",
        "If you could change one thing about today, what would it be?",
        "What's something you did today that you're proud of?",
      ];
      const dayOfMonth = currentDate.getDate();
      return prompts[dayOfMonth % prompts.length];
    };

    fetchUserName();
    setPrompt(getDailyPrompt());
    loadDiaryEntries();
  }, []);

  const loadDiaryEntries = async () => {
    try {
      setIsLoading(true);
      const entries = await getDiaryEntries();
      const diaryDetails = entries
        .slice()
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
        .map((entry) => ({
          name: entry.file,
          path: entry.file,
          date: entry.date,
          displayDate: formatDisplayDate(entry.date),
          size: entry.size || 0,
          mood: entry.mood,
          tags: entry.tags || [],
          response: entry.response || "",
        }));
      setSavedDiaries(diaryDetails);
    } catch (err) {
      console.error("Failed to list saved diaries:", err);
      setSavedDiaries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const viewDiaryEntry = (diary) => {
    setSelectedEntry({
      type: "json",
      date: diary.date,
      mood: diary.mood,
      tags: diary.tags || [],
      response: diary.response || "",
    });
  };

  const handleSaveEntry = async ({ response, mood, tags }) => {
    try {
      await saveDiaryEntry({
        prompt,
        response,
        mood,
        tags: Array.isArray(tags) ? [...tags] : tags,
      });
      await requestBriefGeneration();
      if (Platform.OS === "web") {
        window.alert(
          "Entry saved. Check My week for a glance — a clinician can open their view from the top of the screen."
        );
      } else {
        Alert.alert(
          "Entry saved",
          "Check My week for a glance. A clinician can open their view from the top of the screen."
        );
      }
      loadDiaryEntries();
      return true;
    } catch (error) {
      console.error("Failed to save diary entry:", error);
      Alert.alert("Error", "Failed to save your diary entry");
      return false;
    }
  };

  const renderHistory = () => (
    <View style={styles.historyContainer}>
      {selectedEntry ? (
        <ScrollView style={styles.entryDetailContainer}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setSelectedEntry(null)}
          >
            <Text style={styles.backButtonText}>← Back to all entries</Text>
          </TouchableOpacity>
          {selectedEntry.type === "json" ? (
            <View>
              <Text style={styles.entryText}>
                <Text style={{ fontFamily: fonts.metaSemi, color: colors.text }}>Date:</Text>{" "}
                {selectedEntry.date}
              </Text>
              <Text style={styles.entryText}>
                <Text style={{ fontFamily: fonts.metaSemi, color: colors.text }}>Mood:</Text>{" "}
                {selectedEntry.mood}/10
              </Text>
              <Text style={styles.entryText}>
                <Text style={{ fontFamily: fonts.metaSemi, color: colors.text }}>Tags:</Text>{" "}
                {selectedEntry.tags && selectedEntry.tags.length > 0
                  ? selectedEntry.tags.map((tag) => `#${tag}`).join(", ")
                  : "None"}
              </Text>
              <Text style={[styles.entryText, { marginTop: 16 }]}>
                {selectedEntry.response}
              </Text>
            </View>
          ) : (
            <Text style={styles.entryText}>{selectedEntry.response}</Text>
          )}
          <View style={styles.bottomPadding} />
        </ScrollView>
      ) : (
        <>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Loading diary entries...</Text>
            </View>
          ) : (
            <ScrollView style={styles.entriesListContainer}>
              {savedDiaries.length > 0 ? (
                savedDiaries.map((diary, diaryIndex) => (
                  <TouchableOpacity
                    key={diary.name || diaryIndex}
                    style={styles.diaryItem}
                    onPress={() => viewDiaryEntry(diary)}
                  >
                    <Text style={styles.diaryDate}>{diary.displayDate}</Text>
                    <Text style={styles.diarySize}>
                      {formatDiarySize(diary.size)}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.noContentContainer}>
                  <Text style={styles.noContentText}>
                    No diary entries found. Start writing to create your first
                    entry!
                  </Text>
                </View>
              )}
              <View style={styles.bottomPadding} />
            </ScrollView>
          )}
        </>
      )}
    </View>
  );

  const renderScene = ({ route }) => {
    if (route.key === "write") {
      return (
        <DiaryWriteTab
          userName={userName}
          date={date}
          prompt={prompt}
          onSave={handleSaveEntry}
        />
      );
    }
    if (route.key === "history") {
      return renderHistory();
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        enabled
      >
        <TabView
          navigationState={{ index, routes }}
          renderScene={renderScene}
          onIndexChange={setIndex}
          initialLayout={{ width: 300 }}
          swipeEnabled={false} // Disable swipe to prevent focus issues
          renderTabBar={(props) => (
            <TabBar
              {...props}
              indicatorStyle={styles.tabIndicator}
              style={styles.tabBar}
              activeColor={colors.text}
              inactiveColor={colors.muted}
              renderLabel={({ route, focused }) => (
                <Text
                  style={[
                    styles.tabLabel,
                    { color: focused ? colors.text : colors.muted },
                  ]}
                >
                  {route.title}
                </Text>
              )}
            />
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 22,
    fontFamily: fonts.title,
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    fontFamily: fonts.meta,
    color: colors.muted,
  },
  promptContainer: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  promptText: {
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 24,
  },
  diaryContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 250,
  },
  diaryInput: {
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 24,
    padding: 10,
    minHeight: 230,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontFamily: fonts.bodyMedium,
  },
  moodContainer: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moodLabel: {
    fontSize: 13,
    fontFamily: fonts.metaSemi,
    color: colors.text,
    marginBottom: 10,
  },
  tagsContainer: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagsLabel: {
    fontSize: 13,
    fontFamily: fonts.metaSemi,
    color: colors.text,
    marginBottom: 10,
  },
  tagsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tag: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    margin: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedTag: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  tagText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.meta,
  },
  selectedTagText: {
    color: colors.accent,
    fontFamily: fonts.metaMedium,
  },
  historyContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  entriesListContainer: {
    flex: 1,
    padding: 16,
  },
  diaryItem: {
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 0,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  diaryDate: {
    fontSize: 15,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
  },
  diarySize: {
    fontSize: 13,
    fontFamily: fonts.meta,
    color: colors.muted,
  },
  entryDetailContainer: {
    flex: 1,
    padding: 16,
  },
  entryText: {
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 24,
    textAlign: "left",
    padding: 10,
  },
  tabBar: {
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabIndicator: {
    backgroundColor: colors.text,
    height: 2,
  },
  tabLabel: {
    color: colors.text,
    fontFamily: fonts.metaMedium,
    fontSize: 14,
    textTransform: "capitalize",
  },
  noContentContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 200,
  },
  noContentText: {
    fontSize: 15,
    fontFamily: fonts.meta,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 24,
  },
  bottomPadding: {
    height: 60,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: fonts.metaMedium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 200,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontFamily: fonts.meta,
    color: colors.muted,
  },
});

export default HomeScreen;
