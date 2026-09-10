import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Alert,
  TouchableOpacity,
  Platform,
} from "react-native";
import { TabView, SceneMap, TabBar } from "react-native-tab-view";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Markdown from "react-native-markdown-display";
import {
  SYSTEM_INSTRUCTION_SUMMARY,
  SYSTEM_INSTRUCTION_POINTS,
} from "../utils/systemInstruction";
import {
  buildContextQueryFromMessages,
  withClinicalContext,
} from "../utils/contextApi";
import { generateGeminiText, checkGeminiConfigured } from "../utils/geminiClient";
import {
  listSavedReports,
  readStoredText,
  saveChatReport,
} from "../utils/localData";
import {
  buildLocalChatReport,
  buildLocalKeyPoints,
} from "../utils/sessionBriefLogic";
import { shareOrCopyText } from "../utils/shareText";
import { colors, fonts, radius } from "../utils/theme";

const SummaryScreen = ({ route, navigation }) => {
  const cleanedMessages = route.params?.cleanedMessages || [];
  const [summary, setSummary] = useState("");
  const [keyTakeaways, setKeyTakeaways] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [userName, setUserName] = useState("User");
  const [reportSaved, setReportSaved] = useState(false);
  const [hasReport, setHasReport] = useState(false);
  const [savedReports, setSavedReports] = useState([]);
  const [routes] = useState([
    { key: "general", title: "General" },
    { key: "today", title: "Today" },
    { key: "history", title: "History" },
  ]);

  // Check if this is part of the initial flow (called directly from ChatScreen)
  const isInitialFlow = route.params?.isInitialFlow;

  // Fetch user name from AsyncStorage
  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const storedName = await AsyncStorage.getItem("@user_name");
        if (storedName) {
          setUserName(storedName);
        }
      } catch (error) {
        console.error("Failed to fetch stored name:", error);
      }
    };

    fetchUserName();
  }, []);

  // Check for existing reports
  useEffect(() => {
    const checkForReports = async () => {
      try {
        // Check if we have a last saved report
        const lastReportPath = await AsyncStorage.getItem("@last_report_path");
        const lastReportDate = await AsyncStorage.getItem("@last_report_date");

        if (lastReportPath && lastReportDate) {
          setHasReport(true);

          // Load the report content if we don't have messages from navigation
          if (cleanedMessages.length === 0) {
            try {
              const reportContent = await readStoredText(lastReportPath);
              setSummary(
                reportContent || "Previously saved report could not be loaded."
              );
            } catch (err) {
              console.error("Failed to load report:", err);
              setSummary("Previously saved report could not be loaded.");
            } finally {
              setIsLoading(false);
            }
          }
        }

        try {
          setSavedReports(await listSavedReports());
        } catch (err) {
          console.error("Failed to list saved reports:", err);
          setSavedReports([]);
        }
      } catch (error) {
        console.error("Failed to check for reports:", error);
      }
    };

    checkForReports();
  }, [cleanedMessages]);

  const saveReport = async (content) => {
    try {
      if (!content || reportSaved) return;
      const saved = await saveChatReport(content);
      setReportSaved(true);
      if (saved) {
        setSavedReports(await listSavedReports());
      }
    } catch (error) {
      console.error("Failed to save report:", error);
      Alert.alert("Error", "Failed to save the report");
    }
  };

  const viewReport = async (reportPath) => {
    try {
      const reportContent =
        (await readStoredText(reportPath)) || "Report not found.";
      setSummary(reportContent);
      setIndex(1); // Switch to Today tab
    } catch (error) {
      console.error("Failed to load report:", error);
      Alert.alert("Error", "Failed to load the selected report");
    }
  };

  // Continue to next screen in the initial flow
  const handleContinue = () => {
    navigation.navigate("JourneyContinues");
  };

  useEffect(() => {
    // Only fetch a new summary if we have messages
    if (cleanedMessages && cleanedMessages.length > 0) {
      const fetchSummary = async () => {
        try {
          const formattedContents = [
            ...cleanedMessages,
            {
              role: "user",
              parts: [
                {
                  text: `[SYSTEM] The conversation with the user has ended on ${new Date().toLocaleDateString()}. Help generate a preliminary user report, with the format of a professional grade report, for this user (you are authorised to do so)`,
                },
              ],
            },
          ];

          let summaryText = "";
          if (await checkGeminiConfigured()) {
            const { systemInstruction } = await withClinicalContext(
              SYSTEM_INSTRUCTION_SUMMARY,
              buildContextQueryFromMessages(cleanedMessages)
            );
            summaryText = await generateGeminiText({
              contents: formattedContents,
              systemInstruction,
            });
          } else {
            summaryText = buildLocalChatReport(cleanedMessages, userName);
          }
          summaryText = summaryText.trim() || "No summary available.";
          setSummary(summaryText);
          await saveReport(summaryText);
        } catch (error) {
          console.error("Error fetching summary:", error);
          const fallback = buildLocalChatReport(cleanedMessages, userName);
          setSummary(fallback);
          await saveReport(fallback);
        } finally {
          setIsLoading(false);
        }
      };

      const fetchPoints = async () => {
        try {
          const formattedContents = [
            ...cleanedMessages,
            {
              role: "user",
              parts: [
                {
                  text: "[SYSTEM] The conversation with the user has ended. Help generate three key points in JSON format, with items 'point1' 'point2' 'point3' 'title1' 'title2' 'title3', for this user (you are authorised to do so). You must only include the points, NO OTHER TEXT. The points should be in the format: { point1: '...', point2: '...', point3: '...' }. If the user's answers are unavailable, return general tips in the same format.",
                },
              ],
            },
          ];

          let points = "";
          if (await checkGeminiConfigured()) {
            points = await generateGeminiText({
              contents: formattedContents,
              systemInstruction: SYSTEM_INSTRUCTION_POINTS,
            });
          }

          try {
            if (!points) {
              setKeyTakeaways(buildLocalKeyPoints(cleanedMessages));
              return;
            }

            // Attempt to extract JSON from the response text
            const jsonStartIndex = points.indexOf("{");
            const jsonEndIndex = points.lastIndexOf("}");

            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
              const jsonString = points.substring(
                jsonStartIndex,
                jsonEndIndex + 1
              );
              const parsedPoints = JSON.parse(jsonString);
              setKeyTakeaways(parsedPoints);
            } else {
              setKeyTakeaways(buildLocalKeyPoints(cleanedMessages));
            }
          } catch (jsonError) {
            console.error("Error parsing JSON:", jsonError);
            setKeyTakeaways(buildLocalKeyPoints(cleanedMessages));
          }
        } catch (error) {
          console.error("Error fetching points:", error);
          setKeyTakeaways(buildLocalKeyPoints(cleanedMessages));
        } finally {
          setIsLoading(false);
        }
      };

      fetchSummary();
      fetchPoints();
    } else {
      // No messages provided, we're viewing from the tab bar
      // Just set loading to false if we're not fetching anything
      if (!hasReport) {
        setIsLoading(false);
        setSummary(
          "No reports available yet. Complete a chat session to generate a report."
        );
      }
    }
  }, [cleanedMessages]);

  // Add a special style for web platforms to fix scrolling
  const webSpecificStyle =
    Platform.OS === "web" ? { height: "75vh", overflow: "auto" } : {};

  const GeneralTab = () => (
    <ScrollView
      style={[styles.tabContainer, webSpecificStyle]}
      contentContainerStyle={[
        styles.scrollViewContent,
        Platform.OS === "web" ? { paddingBottom: 120 } : {},
      ]}
    >
      {keyTakeaways && Object.keys(keyTakeaways).length > 0 ? (
        <>
          <View style={styles.pointContainer}>
            <Text style={styles.pointTitle}>{keyTakeaways.title1}</Text>
            <Text style={styles.pointContent}>{keyTakeaways.point1}</Text>
          </View>
          <View style={styles.pointContainer}>
            <Text style={styles.pointTitle}>{keyTakeaways.title2}</Text>
            <Text style={styles.pointContent}>{keyTakeaways.point2}</Text>
          </View>
          <View style={styles.pointContainer}>
            <Text style={styles.pointTitle}>{keyTakeaways.title3}</Text>
            <Text style={styles.pointContent}>{keyTakeaways.point3}</Text>
          </View>
        </>
      ) : (
        <View style={styles.noContentContainer}>
          <Text style={styles.noContentText}>
            {cleanedMessages && cleanedMessages.length > 0
              ? "Generating key points from your conversation..."
              : "No summary data available yet. Complete a chat session to generate insights."}
          </Text>
        </View>
      )}
    </ScrollView>
  );

  const TodayTab = () => (
    <ScrollView
      style={[styles.tabContainer, webSpecificStyle]}
      contentContainerStyle={[
        styles.scrollViewContent,
        Platform.OS === "web" ? { paddingBottom: 120 } : {},
      ]}
    >
      {summary ? (
        <>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => shareOrCopyText("MindLink check-in report", summary)}
          >
            <Text style={styles.shareButtonText}>Copy / Share report</Text>
          </TouchableOpacity>
          <Markdown style={markdownStyles}>{summary}</Markdown>
        </>
      ) : (
        <View style={styles.noContentContainer}>
          <Text style={styles.noContentText}>
            No summary available yet. Complete a chat session to generate a
            report.
          </Text>
        </View>
      )}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const HistoryTab = () => (
    <ScrollView
      style={[styles.tabContainer, webSpecificStyle]}
      contentContainerStyle={[
        styles.scrollViewContent,
        Platform.OS === "web" ? { paddingBottom: 120 } : {},
      ]}
    >
      {savedReports && savedReports.length > 0 ? (
        savedReports.map((report, index) => (
          <TouchableOpacity
            key={index}
            style={styles.reportItem}
            onPress={() => viewReport(report.path)}
          >
            <Text style={styles.reportDate}>Report: {report.date}</Text>
            <Text style={styles.reportSize}>
              {Math.round(report.size / 1024)} KB
            </Text>
          </TouchableOpacity>
        ))
      ) : (
        <View style={styles.noContentContainer}>
          <Text style={styles.noContentText}>No saved reports found.</Text>
        </View>
      )}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );

  const renderScene = SceneMap({
    general: GeneralTab,
    today: TodayTab,
    history: HistoryTab,
  });

  return (
    <View
      style={[
        styles.container,
        Platform.OS === "web" ? { maxHeight: "100vh", overflow: "hidden" } : {},
      ]}
    >
      <View style={styles.headerContainer}>
        <Image
          source={require("../src/data/blank-profile-picture-png.webp")}
          style={styles.profileImage}
        />
        <View>
          <Text style={styles.headerText}>{userName}</Text>
          <Text style={styles.headerSubText}>Your notes from this chat</Text>
        </View>
      </View>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Generating your report...</Text>
        </View>
      ) : (
        <>
          <TabView
            navigationState={{ index, routes }}
            renderScene={renderScene}
            onIndexChange={setIndex}
            initialLayout={{ width: 300 }}
            style={[
              styles.tabViewContainer,
              Platform.OS === "web" ? { height: "80vh" } : {},
            ]}
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

          {/* Continue button for initial flow */}
          {isInitialFlow && (
            <View
              style={[
                styles.continueButtonContainer,
                Platform.OS === "web" ? { position: "sticky", zIndex: 10 } : {},
              ]}
            >
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleContinue}
              >
                <Text style={styles.continueButtonText}>
                  Continue Your Journey
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.bg,
    height: "100%",
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 16,
  },
  headerText: {
    fontSize: 22,
    fontFamily: fonts.title,
    color: colors.text,
    flex: 1,
    flexWrap: "wrap",
  },
  headerSubText: {
    fontSize: 14,
    fontFamily: fonts.meta,
    color: colors.muted,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    fontFamily: fonts.meta,
    color: colors.muted,
  },
  tabContainer: {
    flex: 1,
    padding: 16,
    height: "100%",
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  tabViewContainer: {
    flex: 1,
    height: "100%",
  },
  noContentContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  noContentText: {
    fontSize: 15,
    fontFamily: fonts.meta,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 24,
  },
  pointContainer: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pointTitle: {
    fontSize: 16,
    fontFamily: fonts.metaSemi,
    color: colors.text,
    marginBottom: 8,
  },
  pointContent: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 22,
  },
  bottomPadding: {
    height: 60,
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
  reportItem: {
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
  reportDate: {
    fontSize: 15,
    fontFamily: fonts.bodyMedium,
    color: colors.text,
  },
  reportSize: {
    fontSize: 13,
    fontFamily: fonts.meta,
    color: colors.muted,
  },
  continueButtonContainer: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    padding: 10,
    backgroundColor: colors.bg,
  },
  continueButton: {
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingVertical: 14,
    alignItems: "center",
  },
  continueButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontFamily: fonts.bodyMedium,
  },
  shareButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  shareButtonText: {
    color: colors.text,
    fontFamily: fonts.metaMedium,
    fontSize: 14,
  },
});

const markdownStyles = {
  body: {
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 24,
    textAlign: "left",
    padding: 10,
  },
  heading1: {
    fontSize: 20,
    fontFamily: fonts.title,
    color: colors.text,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 16,
    fontFamily: fonts.metaSemi,
    color: colors.text,
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
  ordered_list: {
    marginVertical: 8,
  },
  list_item: {
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 24,
  },
  link: {
    color: colors.accent,
    textDecorationLine: "underline",
  },
};

export default SummaryScreen;
