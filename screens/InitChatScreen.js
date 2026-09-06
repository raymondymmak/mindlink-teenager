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
  Keyboard,
  SafeAreaView,
  Linking,
  Dimensions,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SYSTEM_INSTRUCTION_INITIAL } from "../utils/systemInstruction";
import { Button, Header } from "react-native-elements"; // Import Header component
import * as FileSystem from "expo-file-system"; // Replace RNFS with FileSystem
import { Asset } from "expo-asset";
import {
  generateGeminiText,
  getGeminiModel,
  isGeminiConfigured,
} from "../utils/geminiClient";
import { requestBriefGeneration, saveCheckIn } from "../utils/localData";

const InitChatScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [inputHeight, setInputHeight] = useState(40); // New state for input height
  const flatListRef = useRef(null);
  const [storedName, setStoredName] = useState("");
  const { height: screenHeight, width: screenWidth } = Dimensions.get("window"); // Get screen dimensions

  // Set up the header with a button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={goToMainApp} style={{ marginRight: 12 }}>
          <Text style={{ color: "#007bff", fontWeight: "600" }}>
            Skip to journal
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    const storedName = "";
    const fetchStoredName = async () => {
      try {
        const storedName = await AsyncStorage.getItem("@user_name");
        console.log("Stored name (before):", storedName);
        if (storedName) {
          setStoredName(storedName);
        }
      } catch (error) {
        console.error("Failed to fetch stored name:", error);
      }
    };

    fetchStoredName();
    console.log("Stored name:", storedName);
  }, []);

  const goToMainApp = async () => {
    try {
      await AsyncStorage.setItem("@initial_chat_completed", "true");
    } catch (error) {
      console.error("Failed to mark intro complete:", error);
    }
    navigation.navigate("MainApp");
  };

  const startSessionBrief = async (currentMessages = messages) => {
    try {
      await saveCheckIn(currentMessages);
      await requestBriefGeneration();
      const cleanedMessages = currentMessages.map(
        ({ id, suggestedReplies, ...rest }) => rest
      );
      navigation.navigate("Summary", {
        cleanedMessages,
        isInitialFlow: true,
        openInsights: true,
      });
    } catch (error) {
      console.error("Failed to start Session Brief:", error);
      Alert.alert("Error", "Could not open Session Brief.");
    }
  };

  // TODO DO NOT DELETE uploading pdf file to the API
  const uploadPDF = async (filePath, fileName, mimeType, numBytes) => {
    console.log("Uploading PDF:", filePath, fileName, mimeType);

    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        throw new Error(`File does not exist at path: ${filePath}`);
      }
      console.log("File info:", fileInfo);

      // 1. Get upload URL from Gemini
      const startResponse = await fetch(API_URL_FILE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": 711636, //numBytes, (dk why this doesnt work right now, hardcoded for now)
          "X-Goog-Upload-Header-Content-Type": mimeType,
        },
        body: JSON.stringify({
          file: {
            display_name: fileName,
            mime_type: mimeType,
          },
        }),
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(`Start failed: ${errorData.error.message}`);
      }

      const uploadUrl = startResponse.headers.get("x-goog-upload-url");
      if (!uploadUrl) throw new Error("Failed to get upload URL");

      // 2. Read file content
      const fileContent = await FileSystem.readAsStringAsync(filePath, {
        encoding: "base64",
      });

      console.log("File content length:", fileContent.length);

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType,
          "Content-Length": `${numBytes}`,
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize",
          "Content-Transfer-Encoding": "base64",
        },
        body: fileContent,
      });

      console.log("Upload response status:", uploadResponse.status);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Upload response error:", errorText);
        throw new Error(`Upload failed: ${errorText}`);
      }

      const responseJson = await uploadResponse.json();
      console.log("Upload response:", responseJson);
      console.log("File URI:", responseJson.file.uri);

      return responseJson.file.uri;
    } catch (error) {
      console.error("Upload failed:", error);
      throw error;
    }
  };

  const createCachedContent = async (
    fileUri,
    mimeType,
    systemInstruction,
    ttl
  ) => {
    const requestBody = {
      model: `models/${getGeminiModel()}`,
      contents: [
        {
          parts: [{ file_data: { mime_type: mimeType, file_uri: fileUri } }],
          role: "user",
        },
      ],
      system_instruction: {
        parts: [{ text: systemInstruction }],
        role: "system",
      },
      ttl: ttl,
    };
    console.log("Creating cached content with:", requestBody);

    const response = await fetch(API_URL_CHAT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    console.log("Create cached content response:", response.status);
    console.log("Create cached content response headers:", response.headers);
    console.log("Create cached content response body:", await response.text());

    const data = await response.json();
    return data.name;
  };

  if (false) {
    useEffect(() => {
      const fetchSummary = async () => {
        try {
          setIsLoading(true);

          // Step 1: Download the file to an accessible directory
          const asset = Asset.fromModule(require("./psychevaladults.pdf"));
          await asset.downloadAsync(); // Ensure the asset is downloaded
          const sourceUri = asset.localUri;
          const filePath = `${FileSystem.documentDirectory}psychevaladults.pdf`;
          console.log("filePath:", filePath);

          const fileInfo = await FileSystem.getInfoAsync(filePath);
          if (!fileInfo.exists) {
            await FileSystem.copyAsync({
              from: sourceUri,
              to: filePath,
            });
            console.log("File copied to:", filePath);
          }

          // Step 2: Get file details
          const mimeType = "application/pdf";
          const numBytes = (await FileSystem.getInfoAsync(filePath)).size;
          const DISPLAY_NAME = "psychevaladults.pdf";
          const TTL = 60 * 60 * 24; // 1 day

          console.log("File size:", numBytes);

          // Step 3: Upload the PDF
          const fileUri = await uploadPDF(
            filePath,
            DISPLAY_NAME,
            mimeType,
            numBytes
          );

          // Step 4: Create Cached Content
          const cacheName = await createCachedContent(
            fileUri,
            mimeType,
            SYSTEM_INSTRUCTION_INITIAL,
            TTL
          );
          console.log("Cache created:", cacheName);
        } catch (error) {
          console.error("Error fetching summary:", error);
        } finally {
          setIsLoading(false);
        }
      };

      fetchSummary();
    }, []);
  }

  // Show initial bot message after a delay
  useEffect(() => {
    const showInitialBotMessage = async () => {
      const storedName = await AsyncStorage.getItem("@user_name");
      setTimeout(() => {
        const botMessage = {
          id: Date.now().toString() + "-bot",
          role: "model",
          parts: [
            {
              text: `Hello ${storedName}, welcome to MindLink!

I'm here to be your personal, private guide for exploring your emotions and mental well-being. To start, we'll have a gentle chat to help me understand how best to support you. And when you've shared enough, just press the **"1st Report"** button.

Individual conversations will **never** be stored, and summaries and insights are stored securely and locally on your device only. We will **never** share your personal data without your explicit consent! This is a safe, confidential space just for you. By continuing, you agree to our terms of service and privacy policy.

So, what do you want to talk about today? You can share anything on your mind, or if you prefer, I can suggest some topics to get us started.`,
            },
          ],
          suggestedReplies: [
            "Talk about school",
            "Talk about family",
            "Talk about friends",
            "Talk about stress",
            "Talk about something good",
          ],
        };
        setMessages((prev) => [...prev, botMessage]);
      }, 2500); // artificial delay
    };

    showInitialBotMessage();
  }, []);

  const handleSend = async () => {
    if (!inputMessage.trim()) return;

    const newMessage = {
      id: Date.now().toString(),
      role: "user",
      parts: [{ text: inputMessage.trim() }],
    };

    setMessages((prev) => {
      // Remove suggestedReplies before sending to API
      const messagesForApi = [...prev, newMessage].map(
        ({ suggestedReplies, id, ...rest }) => rest
      );
      sendToApi(messagesForApi);
      return [...prev, newMessage];
    });
    console.log(messages);

    setInputMessage("");
  };

  const sendToApi = async (cleanedMessages) => {
    try {
      setIsLoading(true);

      // debug log for payload outbound
      console.log("Sending request with:", {
        contents: cleanedMessages,
        systemInstruction: {
          role: "user",
          parts: [{ text: "..." }],
        },
      });

      if (!isGeminiConfigured()) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "-error",
            role: "model",
            parts: [
              {
                text: "Gemini is not configured, so live chat is unavailable. Continue to the journal and generate a Session Brief from a diary entry, or add EXPO_PUBLIC_GEMINI_API_KEY and restart Expo.",
              },
            ],
          },
        ]);
        return;
      }

      const botReply = (
        await generateGeminiText({
          contents: cleanedMessages,
          systemInstruction: SYSTEM_INSTRUCTION_INITIAL,
        })
      ).trim();
      if (botReply.includes("[END_OF_CONVERSATION]")) {
        const cleanBotReply = botReply
          .replace("[END_OF_CONVERSATION]", "")
          .trim();
        if (cleanBotReply) {
          const botMessage = {
            id: Date.now().toString() + "-bot",
            role: "model",
            parts: [{ text: cleanBotReply }],
          };
          setMessages((prev) => [...prev, botMessage]);
        }
        setTimeout(() => {
          if (Platform.OS === "web") {
            if (
              window.confirm("Create your first Session Brief from this chat?")
            ) {
              setMessages((currentMessages) => {
                startSessionBrief(currentMessages);
                return currentMessages;
              });
            }
          } else {
            Alert.alert(
              "Create Session Brief?",
              "Generate your first clinician Session Brief from this chat?",
              [
                { text: "Not Yet", style: "cancel" },
                {
                  text: "Yes, Please",
                  onPress: () => {
                    setMessages((currentMessages) => {
                      startSessionBrief(currentMessages);
                      return currentMessages;
                    });
                  },
                },
              ]
            );
          }
        }, 100);
      } else {
        const botMessage = {
          id: Date.now().toString() + "-bot",
          role: "model",
          parts: [{ text: botReply }],
        };
        setMessages((prev) => [...prev, botMessage]);
      }
    } catch (error) {
      console.error("API Error:", error);
      const detail = error?.message ? ` (${error.message})` : "";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-error",
          role: "model",
          parts: [
            {
              text: `Gemini was unavailable${detail}. Live chat could not continue. You can still write a diary entry and generate an on-device Session Brief from Reports → Brief.`,
            },
          ],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const storeChat = async () => {
    try {
      const chatId = "@chat_" + Date.now(); // Generate a unique ID for the chat
      await AsyncStorage.setItem(chatId, JSON.stringify(messages));

      // We no longer mark initial chat as completed here
      // This will be done in the JourneyContinuesScreen
    } catch (e) {
      console.error("Storage error:", e);
    }
  };

  useEffect(() => {
    const saveChatOnExit = () => {
      storeChat();
    };

    // Add event listener for screen exit
    const subscription = Keyboard.addListener(
      "keyboardDidHide",
      saveChatOnExit
    );

    return () => {
      // Cleanup event listener
      subscription.remove();
      saveChatOnExit(); // Ensure chat is saved when component unmounts
    };
  }, [messages]);

  const renderFormattedText = (text) => {
    // First split text by bold markers
    const boldSplit = text.split(/(\*\*.*?\*\*)/g);

    return boldSplit.map((part, boldIndex) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        // Handle bold text
        return (
          <Text key={`bold-${boldIndex}`} style={{ fontWeight: "bold" }}>
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
                  style={{ color: "#007bff", textDecorationLine: "underline" }}
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

  const renderMessage = ({ item }) => (
    <View
      style={[
        styles.messageContainer,
        item.role === "user"
          ? styles.userMessageContainer
          : styles.botMessageContainer,
      ]}
    >
      <Text
        style={
          item.role === "user" ? styles.userMessageText : styles.botMessageText
        }
      >
        {renderFormattedText(item.parts[0].text)}
      </Text>
      {/* Show suggested replies if present on this message */}
      {item.suggestedReplies && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
          {item.suggestedReplies.map((reply, idx) => (
            <TouchableOpacity
              key={idx}
              style={{
                backgroundColor: "#e3eafc",
                borderRadius: 16,
                paddingVertical: 6,
                paddingHorizontal: 14,
                marginRight: 8,
                marginBottom: 8,
              }}
              onPress={() => setInputMessage(reply)}
            >
              <Text style={{ color: "#007bff", fontWeight: "500" }}>
                {reply}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  return Platform.OS === "web" ? (
    // Web version - fixed height layout
    <View style={styles.absoluteContainer}>
      <View style={styles.fixedHeightContainer}>
        {/* Chat area with absolute positioning and fixed height */}
        <View style={styles.chatContainer}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
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
          <TextInput
            style={[
              styles.input,
              { height: Math.min(80, Math.max(40, inputHeight)) },
            ]}
            value={inputMessage}
            onChangeText={setInputMessage}
            placeholder="Type your message..."
            placeholderTextColor="#999"
            editable={!isLoading}
            multiline={true}
            onContentSizeChange={(event) => {
              setInputHeight(event.nativeEvent.contentSize.height);
            }}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
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
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            onLayout={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
          />

          <View style={styles.mobileInputContainer}>
            <TextInput
              style={[
                styles.input,
                { height: Math.min(80, Math.max(40, inputHeight)) },
              ]}
              value={inputMessage}
              onChangeText={setInputMessage}
              placeholder="Type your message..."
              placeholderTextColor="#999"
              editable={!isLoading}
              multiline={true}
              onContentSizeChange={(event) => {
                setInputHeight(event.nativeEvent.contentSize.height);
              }}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Web-specific styles
  absoluteContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#f5f5f5",
    height: "100%",
    width: "100%",
    overflow: "hidden",
  },
  fixedHeightContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "column",
    height: "100%",
  },
  chatContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 64, // Leave space for input container
    backgroundColor: "#f5f5f5",
    overflow: "hidden",
  },

  // Mobile-specific styles
  safeAreaContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
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
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20, // Extra padding at bottom to see last message
  },
  flatListStyle: {
    flex: 1,
    height: "100%",
    width: "100%",
  },
  messageContainer: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  userMessageContainer: {
    alignSelf: "flex-end",
    backgroundColor: "#007bff",
  },
  botMessageContainer: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  userMessageText: {
    fontSize: 16,
    textAlign: "left",
    color: "#fff",
  },
  botMessageText: {
    fontSize: 16,
    textAlign: "left",
    color: "#000",
  },
  inputContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    height: 64, // Fixed height for input container
  },
  input: {
    flex: 1,
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#ddd",
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: "#007bff",
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});

export default InitChatScreen;
