import React, { useState, useEffect } from "react";
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
import * as FileSystem from "expo-file-system";
import { TabView, SceneMap, TabBar } from "react-native-tab-view";
import Slider from "@react-native-community/slider";
import { requestBriefGeneration } from "../utils/localData";

const HomeScreen = ({ navigation }) => {
  const [diaryEntry, setDiaryEntry] = useState("");
  const [prompt, setPrompt] = useState("");
  const [userName, setUserName] = useState("User");
  const [date, setDate] = useState("");
  const [savedDiaries, setSavedDiaries] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [moodValue, setMoodValue] = useState(5);
  const [selectedTags, setSelectedTags] = useState([]);
  const [routes] = useState([
    { key: "write", title: "Write" },
    { key: "history", title: "History" },
  ]);

  const availableTags = [
    "school",
    "family",
    "friends",
    "anxiety",
    "procrastination",
    "lonely",
  ];

  useEffect(() => {
    // Get current date
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    setDate(formattedDate);

    // Fetch user name
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

    // Generate daily prompt
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

      // Get a semi-random prompt based on the date
      const dayOfMonth = currentDate.getDate();
      const promptIndex = dayOfMonth % prompts.length;
      return prompts[promptIndex];
    };

    fetchUserName();
    setPrompt(getDailyPrompt());
    loadDiaryEntries();
  }, []);

  const toggleTag = (tag) => {
    setSelectedTags((prevTags) =>
      prevTags.includes(tag)
        ? prevTags.filter((t) => t !== tag)
        : [...prevTags, tag]
    );
  };

  // Load saved diary entries
  const loadDiaryEntries = async () => {
    try {
      setIsLoading(true);
      let diaryDetails = [];
      if (Platform.OS === "web") {
        // On web, scan localStorage keys
        const files = Object.keys(window.localStorage).filter(
          (key) => key.startsWith("diary-") && key.endsWith(".json")
        );
        diaryDetails = files.map((file) => {
          const content = window.localStorage.getItem(file) || "";
          let datePart = "";
          let displayDate = "";
          try {
            const parsed = JSON.parse(content);
            datePart = parsed.date;
            const [year, month, day] = datePart.split("-");
            const entryDate = new Date(year, month - 1, day);
            displayDate = entryDate.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          } catch {
            // fallback for old format
            datePart = file.replace("diary-", "").replace(".json", "");
            displayDate = datePart;
          }
          return {
            name: file,
            path: file,
            date: datePart,
            displayDate,
            size: content.length,
          };
        });
      } else {
        const directory = FileSystem.documentDirectory;
        const files = await FileSystem.readDirectoryAsync(directory);
        // Prefer .json files
        const diaryFiles = files.filter(
          (file) => file.startsWith("diary-") && file.endsWith(".json")
        );
        diaryDetails = await Promise.all(
          diaryFiles.map(async (file) => {
            const filePath = `${directory}${file}`;
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            let datePart = "";
            let displayDate = "";
            try {
              const content = await FileSystem.readAsStringAsync(filePath);
              const parsed = JSON.parse(content);
              datePart = parsed.date;
              const [year, month, day] = datePart.split("-");
              const entryDate = new Date(year, month - 1, day);
              displayDate = entryDate.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              });
            } catch {
              // fallback for old format
              datePart = file.replace("diary-", "").replace(".json", "");
              displayDate = datePart;
            }
            return {
              name: file,
              path: filePath,
              date: datePart,
              displayDate,
              size: fileInfo.size,
            };
          })
        );
      }
      // Sort by date (most recent first)
      diaryDetails.sort((a, b) => b.date.localeCompare(a.date));
      setSavedDiaries(diaryDetails);
    } catch (err) {
      console.error("Failed to list saved diaries:", err);
      setSavedDiaries([]);
    } finally {
      setIsLoading(false);
    }
  };

  // View a saved diary entry
  const viewDiaryEntry = async (entryPath) => {
    try {
      let entryContent = "";
      if (Platform.OS === "web") {
        entryContent = window.localStorage.getItem(entryPath) || "";
      } else {
        entryContent = await FileSystem.readAsStringAsync(entryPath);
      }
      try {
        // Try to parse as JSON, if it fails, it's an old format
        const parsedContent = JSON.parse(entryContent);
        // Show all fields for new format
        setSelectedEntry({
          type: "json",
          date: parsedContent.date,
          mood: parsedContent.mood,
          tags: parsedContent.tags,
          response: parsedContent.response,
        });
      } catch (e) {
        // Old format, just show the raw text
        setSelectedEntry({ type: "text", response: entryContent });
      }
    } catch (error) {
      console.error("Failed to load diary entry:", error);
      Alert.alert("Error", "Failed to load the selected diary entry");
    }
  };

  // Tab for writing new entries
  const WriteTab = () => {
    // Use local state instead of parent state
    const [localDiaryEntry, setLocalDiaryEntry] = useState(diaryEntry);
    const [localMoodValue, setLocalMoodValue] = useState(moodValue);
    const [localSelectedTags, setLocalSelectedTags] = useState(selectedTags);
    const textInputRef = React.useRef(null);

    // Sync local state with parent state
    useEffect(() => {
      setLocalDiaryEntry(diaryEntry);
    }, [diaryEntry]);

    // Handle tag toggle locally
    const toggleTagLocal = (tag) => {
      setLocalSelectedTags((prevTags) =>
        prevTags.includes(tag)
          ? prevTags.filter((t) => t !== tag)
          : [...prevTags, tag]
      );
    };

    // Handle saving from local state
    const handleSave = () => {
      if (!localDiaryEntry.trim()) {
        Alert.alert("Empty Entry", "Please write something before saving.");
        return;
      }
      setDiaryEntry(localDiaryEntry);
      setMoodValue(localMoodValue);
      setSelectedTags(localSelectedTags);
      // Save using the local values
      saveDiaryWithContent(localDiaryEntry, localMoodValue, localSelectedTags);
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

        {/* Mood Slider */}
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

        {/* Tags */}
        <View style={styles.tagsContainer}>
          <Text style={styles.tagsLabel}>Add tags:</Text>
          <View style={styles.tagsWrapper}>
            {availableTags.map((tag) => (
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
  };

  // Update saveDiaryWithContent to accept mood and tags
  const saveDiaryWithContent = async (
    content,
    mood = moodValue,
    tags = selectedTags
  ) => {
    if (!content.trim()) {
      Alert.alert("Empty Entry", "Please write something before saving.");
      return;
    }
    try {
      // Format date for filename and storage (always zero-padded)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      const ms = String(now.getMilliseconds()).padStart(3, "0");
      const formattedDate = `${year}-${month}-${day}`;
      // Unique filename for each entry
      const uniqueSuffix = `${hours}${minutes}${seconds}${ms}`;
      const fileName = `diary-${formattedDate}-${uniqueSuffix}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      // Create diary entry with header
      const entryData = {
        date: formattedDate, // always YYYY-MM-DD
        prompt: prompt,
        response: content,
        mood: mood,
        tags: tags,
      };
      const entryWithHeader = JSON.stringify(entryData);
      if (Platform.OS === "web") {
        window.localStorage.setItem(fileName, entryWithHeader);
        await AsyncStorage.setItem("@last_diary_entry", content);
        await AsyncStorage.setItem("@last_diary_date", formattedDate);
      } else {
        await FileSystem.writeAsStringAsync(filePath, entryWithHeader);
        await AsyncStorage.setItem("@last_diary_entry", content);
        await AsyncStorage.setItem("@last_diary_date", formattedDate);
      }
      const goToBrief = async () => {
        await requestBriefGeneration();
        navigation.navigate("Reports", { openInsights: true });
      };
      if (Platform.OS === "web") {
        if (
          window.confirm(
            "Entry saved. Generate a Session Brief for a clinician?"
          )
        ) {
          await goToBrief();
        }
      } else {
        Alert.alert(
          "Entry Saved",
          "Your diary entry has been saved. Generate a Session Brief for a clinician?",
          [
            { text: "Later", style: "cancel" },
            { text: "Generate Brief", onPress: goToBrief },
          ]
        );
      }
      setDiaryEntry(""); // Clear the input after saving
      setSelectedTags([]); // Clear tags
      setMoodValue(5); // Reset mood
      // Reload diary entries to show the new one
      loadDiaryEntries();
    } catch (error) {
      console.error("Failed to save diary entry:", error);
      Alert.alert("Error", "Failed to save your diary entry");
    }
  };

  // Tab for viewing diary history
  const HistoryTab = () => (
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
                savedDiaries.map((diary, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.diaryItem}
                    onPress={() => viewDiaryEntry(diary.path)}
                  >
                    <Text style={styles.diaryDate}>{diary.displayDate}</Text>
                    <Text style={styles.diarySize}>
                      {Math.round(diary.size / 1024)} KB
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

  // Memoize the tabs to prevent unnecessary re-renders
  const writeTab = React.useMemo(
    () => WriteTab,
    [diaryEntry, prompt, userName, date]
  );
  const historyTab = React.useMemo(
    () => HistoryTab,
    [savedDiaries, selectedEntry, isLoading]
  );

  const renderScene = SceneMap({
    write: writeTab,
    history: historyTab,
  });

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
