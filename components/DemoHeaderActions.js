import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { APP_MODES, modeToggleLabel } from "../utils/appMode";
import { colors, fonts, radius } from "../utils/theme";
import { useAppMode } from "./AppModeContext";
import { useDemoPackActions } from "./useDemoPackActions";

function DeveloperSettingsMenu({
  anchor,
  toggleLabel,
  mode,
  onClose,
  onToggleMode,
  onSave,
  onLoad,
  onReset,
}) {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalFill} pointerEvents="box-none">
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Close developer settings"
        />
        <View
          style={[styles.menu, { top: anchor.top, right: anchor.right }]}
          accessibilityRole="menu"
          testID="developer-settings-menu"
          pointerEvents="auto"
        >
          <Pressable
            onPress={onToggleMode}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            accessibilityRole="menuitem"
            accessibilityLabel={toggleLabel}
            accessibilityHint={
              mode === APP_MODES.teen
                ? "Opens the clinician Session Brief using the same on-device notes"
                : "Returns to the teen diary and chat view"
            }
            testID="developer-settings-mode"
            {...(Platform.OS === "web" ? { title: toggleLabel } : {})}
          >
            <Text style={styles.itemText}>{toggleLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onSave}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            accessibilityRole="menuitem"
            accessibilityLabel="Save pack"
            accessibilityHint="Downloads a JSON pack of diary, daily chat, and Session Brief data"
            testID="save-demo-pack"
            {...(Platform.OS === "web" ? { title: "Save pack" } : {})}
          >
            <Text style={styles.itemText}>Save pack</Text>
          </Pressable>
          <Pressable
            onPress={onLoad}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            accessibilityRole="menuitem"
            accessibilityLabel="Load pack"
            accessibilityHint="Restores a saved JSON pack into on-device diary, chat, and Session Brief"
            testID="load-demo-pack"
            {...(Platform.OS === "web" ? { title: "Load pack" } : {})}
          >
            <Text style={styles.itemText}>Load pack</Text>
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            onPress={onReset}
            style={({ pressed }) => [styles.resetItem, pressed && styles.resetItemPressed]}
            accessibilityRole="menuitem"
            accessibilityLabel="Reset Demo"
            accessibilityHint="Asks for confirmation, then clears saved data and returns to the welcome screen"
            testID="reset-demo"
            {...(Platform.OS === "web" ? { title: "Reset Demo" } : {})}
          >
            <Text style={styles.resetItemText}>Reset Demo</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function DemoHeaderActions({ navigation, compact = false }) {
  const { mode, setMode } = useAppMode();
  const { savePack, loadPack, confirmReset } = useDemoPackActions(navigation);
  const { width: windowWidth } = useWindowDimensions();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 52, right: 12 });
  const toggleLabel = modeToggleLabel(mode);

  const toggleMode = () => {
    setMode(mode === APP_MODES.clinician ? APP_MODES.teen : APP_MODES.clinician);
  };

  const closeThen = (action) => () => {
    setOpen(false);
    action();
  };

  const openMenu = () => {
    const node = triggerRef.current;
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, width, height) => {
        setAnchor({
          top: y + height + 6,
          right: Math.max(8, windowWidth - (x + width)),
        });
        setOpen(true);
      });
      return;
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof window === "undefined") return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <View style={[styles.anchor, compact && styles.anchorCompact]}>
      <Pressable
        ref={triggerRef}
        collapsable={false}
        onPress={open ? () => setOpen(false) : openMenu}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        accessibilityRole="button"
        accessibilityLabel="Developer settings"
        accessibilityHint="Opens demo tools: mode, save pack, load pack, and reset"
        accessibilityState={{ expanded: open }}
        testID="developer-settings"
        {...(Platform.OS === "web" ? { title: "Developer settings" } : {})}
      >
        <Ionicons
          name="settings-outline"
          size={15}
          color={colors.muted}
          accessible={false}
          importantForAccessibility="no"
        />
        <Text style={styles.triggerText} numberOfLines={1}>
          Developer settings
        </Text>
      </Pressable>
      {open ? (
        <DeveloperSettingsMenu
          anchor={anchor}
          toggleLabel={toggleLabel}
          mode={mode}
          onClose={() => setOpen(false)}
          onToggleMode={closeThen(toggleMode)}
          onSave={closeThen(savePack)}
          onLoad={closeThen(loadPack)}
          onReset={closeThen(confirmReset)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    alignItems: "flex-end",
    justifyContent: "center",
    marginRight: 10,
  },
  anchorCompact: {
    width: "100%",
    marginRight: 0,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
  },
  triggerPressed: {
    backgroundColor: colors.bg,
  },
  triggerText: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.metaMedium,
  },
  modalFill: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  menu: {
    position: "absolute",
    minWidth: 232,
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingTop: 4,
    zIndex: 2,
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  itemPressed: {
    backgroundColor: colors.bg,
  },
  itemText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.meta,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  resetItem: {
    marginHorizontal: 6,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.danger,
    borderRadius: radius,
  },
  resetItemPressed: {
    opacity: 0.9,
  },
  resetItemText: {
    color: colors.surface,
    fontSize: 13,
    fontFamily: fonts.metaSemi,
  },
});
