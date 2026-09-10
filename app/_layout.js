import { Slot } from "expo-router";
import { ThemeProvider, DefaultTheme } from "@react-navigation/native";
import { useAppFonts } from "../components/useAppFonts";
import { createNavigationTheme } from "../utils/theme";

const navigationTheme = createNavigationTheme(DefaultTheme);

export default function RootLayout() {
  useAppFonts();
  return (
    <ThemeProvider value={navigationTheme}>
      <Slot />
    </ThemeProvider>
  );
}
