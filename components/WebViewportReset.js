import { useCallback, useEffect } from "react";
import { Keyboard, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  installWebViewportReset,
  releaseWebKeyboardViewport,
} from "../utils/webViewport";

export function WebViewportReset() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      return undefined;
    }
    return installWebViewportReset();
  }, []);
  return null;
}

export function useReleaseWebKeyboardViewportOnFocus() {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "web") {
        return undefined;
      }
      Keyboard.dismiss();
      releaseWebKeyboardViewport();
      const timer = setTimeout(() => {
        releaseWebKeyboardViewport();
      }, 350);
      return () => clearTimeout(timer);
    }, [])
  );
}
