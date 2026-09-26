import { useCallback } from "react";
import { Alert, Platform, Share } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { APP_MODE_KEY, APP_MODES } from "../utils/appMode";
import {
  DEMO_PACK_FILENAME,
  downloadDemoPackFile,
  pickDemoPackFile,
} from "../utils/demoPack";
import {
  clearOnDeviceRecords,
  exportDemoPack,
  exportDemoPackSync,
  importDemoPack,
} from "../utils/localData";
import { useAppMode } from "./AppModeContext";

async function finishLoad(navigation, setMode, pack) {
  const mode = pack?.async?.[APP_MODE_KEY];
  if (Platform.OS === "web") {
    window.location.reload();
    return;
  }
  if (mode) {
    await setMode(mode);
  }
  if (navigation?.reset) {
    navigation.reset({ index: 0, routes: [{ name: "Welcome" }] });
    return;
  }
  navigation?.navigate?.("Welcome");
}

export function useDemoPackActions(navigation) {
  const { setMode } = useAppMode();

  const savePack = useCallback(async () => {
    try {
      const immediate = exportDemoPackSync();
      if (immediate != null) {
        downloadDemoPackFile(immediate, DEMO_PACK_FILENAME);
        return;
      }
      const json = await exportDemoPack();
      const directory = FileSystem.documentDirectory;
      if (!directory) {
        throw new Error("This device has no place to store a demo pack.");
      }
      await FileSystem.writeAsStringAsync(`${directory}${DEMO_PACK_FILENAME}`, json);
      try {
        await Share.share({
          title: "MindLink demo pack",
          message: json,
        });
      } catch (error) {
        console.error("Failed to share demo pack:", error);
      }
      Alert.alert(
        "Demo pack saved",
        "Load demo pack restores this dry run after a reset."
      );
    } catch (error) {
      console.error("Failed to save demo pack:", error);
      Alert.alert(
        "Could not save demo pack",
        error?.message || "Try again."
      );
    }
  }, []);

  const loadPack = useCallback(() => {
    const applyJson = async (json) => {
      if (!json) return;
      try {
        const pack = await importDemoPack(json);
        await finishLoad(navigation, setMode, pack);
      } catch (error) {
        console.error("Failed to load demo pack:", error);
        Alert.alert(
          "Could not load demo pack",
          error?.message || "Choose a MindLink demo pack JSON file."
        );
      }
    };

    if (Platform.OS === "web") {
      pickDemoPackFile().then(applyJson);
      return;
    }

    (async () => {
      try {
        const directory = FileSystem.documentDirectory;
        const path = `${directory}${DEMO_PACK_FILENAME}`;
        const info = directory ? await FileSystem.getInfoAsync(path) : { exists: false };
        if (!info.exists) {
          Alert.alert(
            "No demo pack on this device",
            "Save a demo pack first. On web, Load reads the JSON file you downloaded."
          );
          return;
        }
        const json = await FileSystem.readAsStringAsync(path);
        await applyJson(json);
      } catch (error) {
        console.error("Failed to load demo pack:", error);
        Alert.alert(
          "Could not load demo pack",
          error?.message || "Choose a MindLink demo pack JSON file."
        );
      }
    })();
  }, [navigation, setMode]);

  const resetDemo = useCallback(async () => {
    try {
      await clearOnDeviceRecords();
      await AsyncStorage.clear();
      await setMode(APP_MODES.teen);
      if (navigation?.reset) {
        navigation.reset({ index: 0, routes: [{ name: "Welcome" }] });
        return;
      }
      navigation?.navigate?.("Welcome");
    } catch (error) {
      console.error("Failed to reset app:", error);
      Alert.alert("Could not reset demo", error?.message || "Try again.");
    }
  }, [navigation, setMode]);

  const confirmReset = useCallback(() => {
    const message =
      "This wipes diary notes, daily chat, and Session Brief data on this device.";
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(`Reset the demo?\n\n${message}`)) {
        resetDemo();
      }
      return;
    }
    Alert.alert("Reset the demo?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => resetDemo() },
    ]);
  }, [resetDemo]);

  return { savePack, loadPack, confirmReset };
}
