import { Alert, Platform, Share } from "react-native";

export async function shareOrCopyText(title, text) {
  const body = text || "";
  if (!body.trim()) {
    Alert.alert("Nothing to share", "Generate a Session Brief first.");
    return false;
  }

  try {
    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text: body });
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(body);
        Alert.alert("Copied", `${title} copied to the clipboard.`);
        return true;
      }
      if (typeof window !== "undefined") {
        window.prompt(`Copy ${title}:`, body);
        return true;
      }
    }

    const result = await Share.share({ title, message: body });
    return result.action !== Share.dismissedAction;
  } catch (error) {
    console.error("Failed to share text:", error);
    Alert.alert("Share failed", "Could not copy or share this brief.");
    return false;
  }
}
