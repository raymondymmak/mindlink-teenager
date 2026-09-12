import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Linking,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SYSTEM_INSTRUCTION from "../utils/systemInstruction";
import {
  buildContextQueryFromMessages,
  withClinicalContext,
} from "../utils/contextApi";
import { generateGeminiText, checkGeminiConfigured } from "../utils/geminiClient";
import {
  loadDailyChatMessages,
  readStoredText,
  requestBriefGeneration,
  saveCheckIn,
  saveDailyChatMessages,
} from "../utils/localData";
import { colors, fonts, radius } from "../utils/theme";
import { useReleaseWebKeyboardViewportOnFocus } from "../components/WebViewportReset";

const DailyChatScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [inputHeight, setInputHeight] = useState(40);
  const flatListRef = useRef(null);
  const [userName, setUserName] = useState("");
  const [crisisModalVisible, setCrisisModalVisible] = useState(false);
  const [crisisModalShown, setCrisisModalShown] = useState(false);
  useReleaseWebKeyboardViewportOnFocus();

  // Crisis keywords that trigger the modal
  const crisisKeywords = [
    "suicide",
    "kill myself",
    "end my life",
    "can't go on",
    "want to die",
    "hopeless",
    "worthless",
    "no way out",
    "give up",
    "self-harm",
    "cut myself",
    "hurt myself",
    "overdose",
    "jump off",
    "hang myself",
    "take my life",
    "死", // Chinese for 'die'
    "自殺", // Chinese for 'suicide'
  ];

  // Helper function to create unique IDs - simplified to use just Date.now()
  const createUniqueId = (prefix) => `${prefix}-${Date.now()}`;

  // Fetch user name and load messages
  useEffect(() => {
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

    fetchUserName();

    // Load previous messages if any
    const loadMessages = async () => {
      try {
        const savedMessages = await loadDailyChatMessages();
        if (savedMessages && savedMessages.length > 0) {
          setMessages(savedMessages);
        } else {
          // Show welcome message if no previous messages
          const initialMessage = {
            _id: createUniqueId("initial-message"),
            text: `Hi ${
              userName || "there"
            }! How are you feeling today? I'm here to listen and chat with you.`,
            createdAt: new Date(),
            user: {
              _id: 2,
              name: "MindLink",
              avatar: require("../src/data/blank-profile-picture-png.webp"),
            },
          };

          setMessages([initialMessage]);
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    };

    loadMessages();
  }, [userName]);

  useEffect(() => {
    if (messages.length > 0) {
      saveDailyChatMessages(messages).catch((error) =>
        console.error("Failed to persist daily chat:", error)
      );
    }
  }, [messages]);

  const saveCheckInForSession = async (currentMessages = messages) => {
    try {
      await saveCheckIn(currentMessages);
      await requestBriefGeneration();
      const message =
        "Check-in saved. See My week for a glance, or open Clinician view from the top of the screen.";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Saved", message);
      }
    } catch (error) {
      console.error("Failed to save check-in:", error);
      Alert.alert("Error", "Could not save this check-in.");
    }
  };

  const checkCrisis = (text) => {
    const lower = text.toLowerCase();
    return crisisKeywords.some((keyword) => lower.includes(keyword));
  };

  const showCrisisModal = () => setCrisisModalVisible(true);
  const hideCrisisModal = () => setCrisisModalVisible(false);

  const sendMessage = async () => {
    if (inputMessage.trim() === "") return;

    // Crisis detection
    if (checkCrisis(inputMessage) && !crisisModalShown) {
      showCrisisModal();
      setCrisisModalShown(true);
    }

    const userMessage = {
      _id: createUniqueId("user"),
      text: inputMessage.trim(),
      createdAt: new Date(),
      user: {
        _id: 1,
        name: "User",
      },
    };

    // Add user message to chat
    setMessages((previousMessages) => [...previousMessages, userMessage]);

    // Clear input
    setInputMessage("");

    // Show loading state
    setIsLoading(true);

    try {
      // Format message for API
      const formattedContents = [
        ...messages.map((msg) => ({
          role: msg.user._id === 1 ? "user" : "model",
          parts: [{ text: msg.text }],
        })),
        {
          role: "user",
          parts: [{ text: inputMessage.trim() }],
        },
      ];

      if (!(await checkGeminiConfigured())) {
        const botMessage = {
          _id: createUniqueId("bot"),
          text: "Gemini is not configured on the server, so I can't continue the live chat. You can still write a diary entry and open Clinician view from the top of the screen.",
          createdAt: new Date(),
          user: {
            _id: 2,
            name: "MindLink",
            avatar: require("../src/data/blank-profile-picture-png.webp"),
          },
        };
        setMessages((previousMessages) => [...previousMessages, botMessage]);
        return;
      }

      let latestReport = "";
      try {
        const lastReportPath = await AsyncStorage.getItem("@last_report_path");
        if (lastReportPath) {
          const reportContent = await readStoredText(lastReportPath);
          if (reportContent) {
            latestReport = `\n\nLatest User Report:\n${reportContent}`;
          }
        }
      } catch (err) {
        console.error("Failed to load latest report:", err);
      }

      const { systemInstruction } = await withClinicalContext(
        `${SYSTEM_INSTRUCTION}\n\n\n${userName}${latestReport}`,
        buildContextQueryFromMessages(formattedContents)
      );
      const botResponse = (
        await generateGeminiText({
          contents: formattedContents,
          systemInstruction,
        })
      ).trim();

      // Check for the end-of-conversation token
      if (botResponse.includes("[END_OF_CONVERSATION]")) {
        // Remove the token from the message displayed to the user
        const cleanBotResponse = botResponse
          .replace("[END_OF_CONVERSATION]", "")
          .trim();

        // Add the final bot message to the chat
        if (cleanBotResponse) {
          const botMessage = {
            _id: createUniqueId("bot"),
            text: cleanBotResponse,
            createdAt: new Date(),
            user: {
              _id: 2,
              name: "MindLink",
              avatar: require("../src/data/blank-profile-picture-png.webp"),
            },
          };
          // Use a function with the latest state to avoid stale closures
          setMessages((previousMessages) => [...previousMessages, botMessage]);
        }

        // Use a timeout to ensure the state update is rendered before showing the alert
        setTimeout(() => {
          if (Platform.OS === "web") {
            if (
              window.confirm(
                "Save today's check-in?"
              )
            ) {
              setMessages((currentMessages) => {
                saveCheckInForSession(currentMessages);
                return currentMessages;
              });
            }
          } else {
            Alert.alert(
              "Save check-in?",
              "Keep today's chat so it can show in My week and clinician view?",
              [
                { text: "Not Yet", style: "cancel" },
                {
                  text: "Yes, Please",
                  onPress: () => {
                    setMessages((currentMessages) => {
                      saveCheckInForSession(currentMessages);
                      return currentMessages;
                    });
                  },
                },
              ]
            );
          }
        }, 100); // A short delay
      } else if (botResponse) {
        const botMessage = {
          _id: createUniqueId("bot"),
          text: botResponse,
          createdAt: new Date(),
          user: {
            _id: 2,
            name: "MindLink",
            avatar: require("../src/data/blank-profile-picture-png.webp"),
          },
        };

        setMessages((previousMessages) => [...previousMessages, botMessage]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const detail = error?.message ? ` (${error.message})` : "";
      Alert.alert(
        "Gemini unavailable",
        `Live chat could not continue${detail}. You can still write a diary entry and open Clinician view from the top of the screen.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const renderFormattedText = (text) => {
    // First split text by bold markers
    const boldSplit = text.split(/(\*\*.*?\*\*)/g);

    return boldSplit.map((part, boldIndex) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        // Handle bold text
        return (
          <Text key={`bold-${boldIndex}`} style={{ fontFamily: fonts.bodyMedium }}>
            {part.slice(2, -2)}
          </Text>
        );
      }

      // For non-bold text, check for phone numbers 2896 0000 and 2382 0000
      const phoneRegex = /(2896\s*0000|2382\s*0000)/g;
      const phoneParts = part.split(phoneRegex);

      if (phoneParts.length === 1) {
        // No phone numbers found
        return <Text key={`text-${boldIndex}`}>{part}</Text>;
      }

      // Process parts with phone numbers
      return (
        <Text key={`text-${boldIndex}`}>
          {phoneParts.map((subPart, phoneIndex) => {
            // If this part matches our target phone numbers
            if (subPart === "2896 0000" || subPart === "2382 0000") {
              return (
                <Text
                  key={`phone-${boldIndex}-${phoneIndex}`}
                  style={{ color: colors.accent, textDecorationLine: "underline" }}
                  onPress={() =>
                    Linking.openURL(`tel:${subPart.replace(/\s/g, "")}`)
                  }
                >
                  {subPart}
                </Text>
              );
            }
            return (
              <Text key={`text-${boldIndex}-${phoneIndex}`}>{subPart}</Text>
            );
          })}
        </Text>
      );
    });
  };

  const renderMessage = ({ item }) => {
    // Ensure user object exists to prevent crashes
    const user = item.user || { _id: 2 }; // Default to bot if no user object

    return (
      <View
        style={[
          styles.messageContainer,
          user._id === 1
            ? styles.userMessageContainer
            : styles.botMessageContainer,
        ]}
      >
        <Text
          style={
            user._id === 1 ? styles.userMessageText : styles.botMessageText
          }
        >
          {renderFormattedText(item.text || "")}
        </Text>
      </View>
    );
  };

  return (
    <>
      {/* Crisis Modal */}
      <Modal
        visible={crisisModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={hideCrisisModal}
      >
        <View style={styles.crisisOverlay}>
          <View style={styles.crisisCard}>
            <Text style={styles.crisisTitle}>If you are in crisis:</Text>
            <Text style={styles.crisisLead}>
              Please reach out immediately to a trusted adult or one of these
              24/7 hotlines:
            </Text>
            <TouchableOpacity
              onPress={() => {
                Linking.openURL("tel:28960000");
              }}
              style={styles.crisisLinkWrap}
            >
              <Text style={styles.crisisLink}>
                Suicide Prevention Hotline:{" "}
                <Text style={styles.crisisLinkStrong}>2896 0000</Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Linking.openURL("tel:23820000");
              }}
              style={styles.crisisLinkWrapLast}
            >
              <Text style={styles.crisisLink}>
                Samaritans 24hr Hotline:{" "}
                <Text style={styles.crisisLinkStrong}>2382 0000</Text>
              </Text>
            </TouchableOpacity>
            <Text style={styles.crisisBody}>
              If you feel unsafe, please call emergency services (999) or go to
              the nearest hospital.
            </Text>
            <TouchableOpacity
              onPress={hideCrisisModal}
              style={styles.crisisUnderstand}
              accessibilityRole="button"
              accessibilityLabel="I Understand"
            >
              <Text style={styles.crisisUnderstandText}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Main UI */}
      {Platform.OS === "web" ? (
        // Web version - fixed height layout
        <View style={styles.absoluteContainer}>
          <View style={styles.fixedHeightContainer}>
            {/* Chat area with absolute positioning and fixed height */}
            <View style={styles.chatContainer}>
              <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(item) =>
                  item._id || item.id || `msg-${Date.now()}-${Math.random()}`
                }
                contentContainerStyle={styles.messagesList}
                onContentSizeChange={() =>
                  flatListRef.current?.scrollToEnd({ animated: true })
                }
                onLayout={() =>
                  flatListRef.current?.scrollToEnd({ animated: false })
                }
                showsVerticalScrollIndicator={true}
                scrollEnabled={true}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={10}
                style={styles.flatListStyle}
              />
            </View>

            {/* Input area with absolute positioning at bottom */}
            <View style={styles.inputContainer}>
              <TouchableOpacity
                style={styles.briefInlineButton}
                onPress={() => saveCheckInForSession(messages)}
              >
                <Text style={styles.briefLinkText}>Save</Text>
              </TouchableOpacity>
              <TextInput
                style={[
                  styles.input,
                  { height: Math.min(80, Math.max(40, inputHeight)) },
                ]}
                value={inputMessage}
                onChangeText={setInputMessage}
                placeholder="Type your message..."
                placeholderTextColor={colors.muted}
                editable={!isLoading}
                multiline={true}
                onContentSizeChange={(event) => {
                  setInputHeight(event.nativeEvent.contentSize.height);
                }}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={styles.sendButton}
                onPress={sendMessage}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.sendButtonText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        // Mobile version - with keyboard avoiding view
        <SafeAreaView style={styles.safeAreaContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={85}
            style={styles.keyboardAvoidView}
          >
            <View style={styles.mobileContainer}>
              <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(item) =>
                  item._id || item.id || `msg-${Date.now()}-${Math.random()}`
                }
                contentContainerStyle={styles.messagesList}
                onContentSizeChange={() =>
                  flatListRef.current?.scrollToEnd({ animated: true })
                }
                onLayout={() =>
                  flatListRef.current?.scrollToEnd({ animated: false })
                }
              />

              <TouchableOpacity
                style={styles.briefLink}
                onPress={() => saveCheckInForSession(messages)}
              >
                <Text style={styles.briefLinkText}>Save check-in</Text>
              </TouchableOpacity>
              <View style={styles.mobileInputContainer}>
                <TextInput
                  style={[
                    styles.input,
                    { height: Math.min(80, Math.max(40, inputHeight)) },
                  ]}
                  value={inputMessage}
                  onChangeText={setInputMessage}
                  placeholder="Type your message..."
                  placeholderTextColor={colors.muted}
                  editable={!isLoading}
                  multiline={true}
                  onContentSizeChange={(event) => {
                    setInputHeight(event.nativeEvent.contentSize.height);
                  }}
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={styles.sendButton}
                  onPress={sendMessage}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.surface} />
                  ) : (
                    <Text style={styles.sendButtonText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  absoluteContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  fixedHeightContainer: {
    flex: 1,
    flexDirection: "column",
    width: "100%",
    height: "100%",
  },
  chatContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  safeAreaContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  keyboardAvoidView: {
    flex: 1,
  },
  mobileContainer: {
    flex: 1,
    flexDirection: "column",
  },
  mobileInputContainer: {
    flexDirection: "row",
    padding: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  flatListStyle: {
    flex: 1,
    height: "100%",
    width: "100%",
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  messageContainer: {
    maxWidth: "80%",
    padding: 10,
    borderRadius: radius,
    marginBottom: 8,
  },
  userMessageContainer: {
    alignSelf: "flex-end",
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  botMessageContainer: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userMessageText: {
    fontSize: 15,
    fontFamily: fonts.body,
    textAlign: "left",
    color: colors.surface,
  },
  botMessageText: {
    fontSize: 15,
    fontFamily: fonts.body,
    textAlign: "left",
    color: colors.text,
  },
  inputContainer: {
    flexDirection: "row",
    padding: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 64,
  },
  input: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    fontFamily: fonts.body,
    color: colors.text,
  },
  sendButton: {
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonText: {
    color: colors.surface,
    fontFamily: fonts.bodyMedium,
  },
  briefLink: {
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  briefInlineButton: {
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  briefLinkText: {
    color: colors.accent,
    fontFamily: fonts.metaMedium,
    fontSize: 13,
  },
  crisisOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  crisisCard: {
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: 24,
    width: "85%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  crisisTitle: {
    fontSize: 20,
    fontFamily: fonts.title,
    marginBottom: 12,
    color: colors.danger,
    textAlign: "center",
  },
  crisisLead: {
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    marginBottom: 16,
    textAlign: "center",
  },
  crisisLinkWrap: {
    marginBottom: 8,
  },
  crisisLinkWrapLast: {
    marginBottom: 16,
  },
  crisisLink: {
    color: colors.accent,
    fontSize: 16,
    textDecorationLine: "underline",
  },
  crisisLinkStrong: {
    fontFamily: fonts.bodyMedium,
  },
  crisisBody: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    marginBottom: 16,
    textAlign: "center",
  },
  crisisUnderstand: {
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  crisisUnderstandText: {
    color: colors.surface,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
  },
});

export default DailyChatScreen;
