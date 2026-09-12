// npm start
// npx expo export --platform web => eas deploy => eas deploy --prod
// npx expo start --tunnel

import React, { useEffect } from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Platform, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HelmetProvider } from "react-helmet-async";
import { useAppFonts } from "./components/useAppFonts";
import {
  colors,
  headerScreenOptions,
  tabBarScreenOptions,
} from "./utils/theme";

// Apply global style to prevent zoom on iOS. Guard document so Expo Router
// server rendering (web.output: "server") does not crash in Node.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #root {
      background: ${colors.bg};
      color: ${colors.text};
      height: 100%;
    }
    #root {
      display: flex;
      flex-direction: column;
    }
    input, textarea, select {
      font-size: 16px !important;
    }
  `;
  document.head.appendChild(style);

  // Override default TextInput behavior
  const originalRender = TextInput.render;
  if (typeof originalRender === "function") {
    TextInput.render = function (...args) {
      const oldProps = args[0] || {};
      const newProps = {
        ...oldProps,
        style: [{ fontSize: 16 }, oldProps.style],
      };
      args[0] = newProps;
      return originalRender.apply(this, args);
    };
  }
}

import WelcomeScreen from "./screens/WelcomeScreen";
import IntroChatScreen from "./screens/InitChatScreen";
import CheckInChatScreen from "./screens/DailyChatScreen";
import DiaryScreen from "./screens/HomeScreen";
import SummaryScreen from "./screens/SummaryScreen";
import JourneyContinuesScreen from "./screens/JourneyContinuesScreen";
import MyWeekScreen from "./screens/MyWeekScreen";
import ClinicianBriefScreen from "./screens/ClinicianHomeScreen";
import DemoHeaderActions from "./components/DemoHeaderActions";
import { AppModeProvider, useAppMode } from "./components/AppModeContext";
import { WebViewportReset } from "./components/WebViewportReset";
import { APP_MODES } from "./utils/appMode";

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function usePinWebPathToRoot() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      return undefined;
    }
    const originalPush = window.history.pushState.bind(window.history);
    const originalReplace = window.history.replaceState.bind(window.history);
    const pin = () => {
      if (window.location.pathname !== "/") {
        originalReplace(window.history.state, "", "/");
      }
    };
    window.history.pushState = function pushStatePinned(...args) {
      const result = originalPush(...args);
      pin();
      return result;
    };
    window.history.replaceState = function replaceStatePinned(...args) {
      const result = originalReplace(...args);
      pin();
      return result;
    };
    pin();
    window.addEventListener("popstate", pin);
    return () => {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
      window.removeEventListener("popstate", pin);
    };
  }, []);
}

function teenTabIcon(routeName, focused) {
  if (routeName === "Diary") return focused ? "journal" : "journal-outline";
  if (routeName === "Chat") return focused ? "chatbubble" : "chatbubble-outline";
  if (routeName === "MyWeek") return focused ? "sunny" : "sunny-outline";
  return focused ? "ellipse" : "ellipse-outline";
}

function ClinicianSessionShell({ headerRight }) {
  return (
    <Tab.Navigator
      key="clinician"
      screenOptions={{
        ...headerScreenOptions,
        headerShown: true,
        headerRight,
        tabBarStyle: { display: "none", height: 0 },
      }}
    >
      <Tab.Screen
        name="Session"
        component={ClinicianBriefScreen}
        options={{ title: "Session Brief" }}
      />
    </Tab.Navigator>
  );
}

function TeenTabs({ headerRight }) {
  return (
    <Tab.Navigator
      key="teen"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons
            name={teenTabIcon(route.name, focused)}
            size={size}
            color={color}
          />
        ),
        ...headerScreenOptions,
        ...tabBarScreenOptions,
        headerShown: true,
        headerRight,
      })}
    >
      <Tab.Screen name="Diary" component={DiaryScreen} />
      <Tab.Screen name="Chat" component={CheckInChatScreen} />
      <Tab.Screen
        name="MyWeek"
        component={MyWeekScreen}
        options={{ title: "My week" }}
      />
    </Tab.Navigator>
  );
}

function ModeShell({ navigation }) {
  const { mode } = useAppMode();
  const headerRight = () => <DemoHeaderActions navigation={navigation} />;

  if (mode === APP_MODES.clinician) {
    return <ClinicianSessionShell headerRight={headerRight} />;
  }

  return <TeenTabs headerRight={headerRight} />;
}

export default function App() {
  // Expo Router's ExpoRoot already mounts a NavigationContainer. The legacy
  // stack/tabs nest under that single container — do not wrap another one.
  // Keep the address bar on `/` so nested screen names do not remount this
  // shell via Expo Router (that left clinician view stuck on its spinner).
  usePinWebPathToRoot();
  useAppFonts();
  return (
    <HelmetProvider>
      <WebViewportReset />
      <AppModeProvider>
        <Stack.Navigator
          initialRouteName="Welcome"
          screenOptions={{
            ...headerScreenOptions,
            headerShown: false,
          }}
        >
          {/* Route names stay Welcome / Chat / Summary / JourneyContinues / MainApp. */}
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen
            name="Chat"
            component={IntroChatScreen}
            options={{ headerShown: true, title: "Chat" }}
          />
          <Stack.Screen
            name="Summary"
            component={SummaryScreen}
            options={{
              headerShown: true,
              headerLeft: null,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="JourneyContinues"
            component={JourneyContinuesScreen}
          />
          <Stack.Screen name="MainApp" component={ModeShell} />
        </Stack.Navigator>
      </AppModeProvider>
    </HelmetProvider>
  );
}
