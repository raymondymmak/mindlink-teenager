import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppMode } from "./AppModeContext";
import { APP_MODES, modeToggleLabel } from "../utils/appMode";
import { clearOnDeviceRecords } from "../utils/localData";
import { colors, fonts, radius } from "../utils/theme";

export default function DemoHeaderActions({ navigation }) {
  const { mode, setMode } = useAppMode();
  const toggleLabel = modeToggleLabel(mode);

  const resetDemo = async () => {
    try {
      await clearOnDeviceRecords();
      await AsyncStorage.clear();
      await setMode(APP_MODES.teen);
      navigation.navigate("Welcome");
    } catch (error) {
      console.error("Failed to reset app:", error);
    }
  };

  const toggleMode = () => {
    setMode(mode === APP_MODES.teen ? APP_MODES.clinician : APP_MODES.teen);
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={toggleMode}
        style={styles.modeButton}
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityHint={
          mode === APP_MODES.teen
            ? "Opens the clinician Session Brief using the same on-device notes"
            : "Returns to the teen diary and chat view"
        }
        {...(Platform.OS === "web" ? { title: toggleLabel } : {})}
      >
        <Text style={styles.modeButtonText}>{toggleLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={resetDemo}
        style={styles.resetButton}
        accessibilityRole="button"
        accessibilityLabel="Reset Demo"
        accessibilityHint="Clears saved data and returns to the welcome screen"
        {...(Platform.OS === "web" ? { title: "Reset Demo" } : {})}
      >
        <Text style={styles.resetButtonText}>Reset Demo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
    gap: 8,
  },
  modeButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
  },
  modeButtonText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.metaMedium,
  },
  resetButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.danger,
    borderRadius: radius,
  },
  resetButtonText: {
    color: colors.surface,
    fontSize: 13,
    fontFamily: fonts.metaSemi,
  },
});
