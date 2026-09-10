import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, fonts, radius } from "../utils/theme";

const JourneyContinuesScreen = ({ navigation }) => {
  const handleContinue = async () => {
    try {
      // Mark that the initial onboarding flow is complete
      await AsyncStorage.setItem("@initial_chat_completed", "true");

      // Navigate to the main app
      navigation.navigate("MainApp");
    } catch (error) {
      console.error("Failed to save completion status:", error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.contentContainer}>
        <Image
          source={require("../src/data/blank-profile-picture-png.webp")}
          style={styles.image}
        />

        <Text style={styles.title}>Your MindLink Journey Continues</Text>

        <Text style={styles.message}>
          Thank you for sharing your thoughts with us. Your mental well-being
          journey is just beginning. The next steps will help you track your
          progress and provide daily support.
        </Text>

        <TouchableOpacity style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>Continue to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 30,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.title,
    color: colors.text,
    marginBottom: 20,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  message: {
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 40,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 30,
    alignItems: "center",
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontFamily: fonts.bodyMedium,
  },
});

export default JourneyContinuesScreen;
