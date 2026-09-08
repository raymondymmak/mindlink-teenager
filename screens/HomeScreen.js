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
import {
  getDiaryEntries,
  requestBriefGeneration,
  saveDiaryEntry,
} from "../utils/localData";

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
          minimumTrackTintColor="#007bff"
          maximumTrackTintColor="#d3d3d3"
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
                <Text style={{ fontWeight: "bold" }}>Date:</Text>{" "}
                {selectedEntry.date}
              </Text>
              <Text style={styles.entryText}>
                <Text style={{ fontWeight: "bold" }}>Mood:</Text>{" "}
                {selectedEntry.mood}/10
              </Text>
              <Text style={styles.entryText}>
                <Text style={{ fontWeight: "bold" }}>Tags:</Text>{" "}
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
              <ActivityIndicator size="large" color="#007bff" />
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
              activeColor="#000000"
              inactiveColor="#333333"
              renderLabel={({ route, focused }) => (
                <Text
                  style={[
                    styles.tabLabel,
                    { color: focused ? "#000000" : "#333333" },
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
    backgroundColor: "#f5f8fa",
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
    fontSize: 28,
    fontWeight: "bold",
    color: "#2e4057",
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    color: "#666",
  },
  promptContainer: {
    backgroundColor: "#e8f4f8",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#007bff",
  },
  promptText: {
    fontSize: 18,
    color: "#2e4057",
    lineHeight: 24,
  },
  diaryContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    minHeight: 250,
  },
  diaryInput: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
    padding: 10,
    minHeight: 230,
  },
  saveButton: {
    backgroundColor: "#007bff",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  moodContainer: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  moodLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2e4057",
    marginBottom: 10,
  },
  tagsContainer: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  tagsLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2e4057",
    marginBottom: 10,
  },
  tagsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tag: {
    backgroundColor: "#e8f4f8",
    borderRadius: 15,
    paddingVertical: 8,
    paddingHorizontal: 12,
    margin: 5,
  },
  selectedTag: {
    backgroundColor: "#007bff",
  },
  tagText: {
    color: "#007bff",
    fontSize: 14,
  },
  selectedTagText: {
    color: "#fff",
  },
  // Styles for history tab
  historyContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  entriesListContainer: {
    flex: 1,
    padding: 16,
  },
  diaryItem: {
    padding: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#007bff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  diaryDate: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  diarySize: {
    fontSize: 14,
    color: "#666",
  },
  entryDetailContainer: {
    flex: 1,
    padding: 16,
  },
  entryText: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
    textAlign: "left",
    padding: 10,
  },
  tabBar: {
    backgroundColor: "#f0f0f0",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  tabIndicator: {
    backgroundColor: "#007bff",
    height: 3,
  },
  tabLabel: {
    color: "#000000",
    fontWeight: "700",
    fontSize: 16,
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
    fontSize: 16,
    color: "#666",
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
    color: "#007bff",
    fontSize: 16,
    fontWeight: "500",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 200,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
});

export default HomeScreen;
