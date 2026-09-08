import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  APP_MODE_KEY,
  APP_MODES,
  isClinicianMode,
  normalizeAppMode,
} from "../utils/appMode";

const AppModeContext = createContext({
  mode: APP_MODES.teen,
  setMode: async () => {},
  isClinician: false,
});

export function AppModeProvider({ children }) {
  const [mode, setModeState] = useState(APP_MODES.teen);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(APP_MODE_KEY)
      .then((value) => {
        if (!cancelled && value) {
          setModeState(normalizeAppMode(value));
        }
      })
      .catch((error) => {
        console.error("Failed to load app mode:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback(async (next) => {
    const normalized = normalizeAppMode(next);
    setModeState(normalized);
    try {
      await AsyncStorage.setItem(APP_MODE_KEY, normalized);
    } catch (error) {
      console.error("Failed to save app mode:", error);
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      isClinician: isClinicianMode(mode),
    }),
    [mode, setMode]
  );

  return (
    <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
  );
}

export function useAppMode() {
  return useContext(AppModeContext);
}
