import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { APP_MODES, modeToggleLabel } from "../utils/appMode";
import { colors, fonts, radius } from "../utils/theme";
import { useAppMode } from "./AppModeContext";
import { useDemoPackActions } from "./useDemoPackActions";

export default function DemoHeaderActions({ navigation, compact = false }) {
  const { mode, setMode } = useAppMode();
  const { savePack, loadPack, confirmReset } = useDemoPackActions(navigation);
  const toggleLabel = modeToggleLabel(mode);

  const toggleMode = () => {
    setMode(mode === APP_MODES.clinician ? APP_MODES.teen : APP_MODES.clinician);
  };

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <TouchableOpacity
        onPress={toggleMode}
        style={styles.ghostButton}
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityHint={
          mode === APP_MODES.teen
            ? "Opens the clinician Session Brief using the same on-device notes"
            : "Returns to the teen diary and chat view"
        }
        {...(Platform.OS === "web" ? { title: toggleLabel } : {})}
      >
        <Text style={styles.ghostButtonText}>{toggleLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={savePack}
        style={styles.ghostButton}
        accessibilityRole="button"
        accessibilityLabel="Save demo pack"
        accessibilityHint="Downloads a JSON pack of diary, daily chat, and Session Brief data"
        testID="save-demo-pack"
        {...(Platform.OS === "web" ? { title: "Save demo pack" } : {})}
      >
        <Text style={styles.ghostButtonText}>Save pack</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={loadPack}
        style={styles.ghostButton}
        accessibilityRole="button"
        accessibilityLabel="Load demo pack"
        accessibilityHint="Restores a saved JSON pack into on-device diary, chat, and Session Brief"
        testID="load-demo-pack"
        {...(Platform.OS === "web" ? { title: "Load demo pack" } : {})}
      >
        <Text style={styles.ghostButtonText}>Load pack</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={confirmReset}
        style={styles.resetButton}
        accessibilityRole="button"
        accessibilityLabel="Reset Demo"
        accessibilityHint="Asks for confirmation, then clears saved data and returns to the welcome screen"
        testID="reset-demo"
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
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    marginRight: 10,
    gap: 8,
  },
  rowCompact: {
    width: "100%",
    marginRight: 0,
  },
  ghostButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
  },
  ghostButtonText: {
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
