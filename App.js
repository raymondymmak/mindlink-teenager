// npm start
// npx expo export --platform web => eas deploy => eas deploy --prod
// npx expo start --tunnel

import React from "react";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Platform, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HelmetProvider } from "react-helmet-async";

// Apply global style to prevent zoom on iOS. Guard document so Expo Router
// server rendering (web.output: "server") does not crash in Node.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    input, textarea, select, button {
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
import InitChatScreen from "./screens/InitChatScreen";
import DailyChatScreen from "./screens/DailyChatScreen";
import HomeScreen from "./screens/HomeScreen";
import SummaryScreen from "./screens/SummaryScreen";
import JourneyContinuesScreen from "./screens/JourneyContinuesScreen";
import MyWeekScreen from "./screens/MyWeekScreen";
import ClinicianHomeScreen from "./screens/ClinicianHomeScreen";
import DemoHeaderActions from "./components/DemoHeaderActions";
import { AppModeProvider, useAppMode } from "./src/AppModeContext";
import { APP_MODES } from "./utils/appMode";

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function teenTabIcon(routeName, focused) {
  if (routeName === "Diary") return focused ? "journal" : "journal-outline";
  if (routeName === "Chat") return focused ? "chatbubble" : "chatbubble-outline";
  if (routeName === "MyWeek") return focused ? "sunny" : "sunny-outline";
  return focused ? "ellipse" : "ellipse-outline";
}

function MainAppTabs({ navigation }) {
  const { mode } = useAppMode();
  const headerRight = () => <DemoHeaderActions navigation={navigation} />;

  if (mode === APP_MODES.clinician) {
    return (
      <Tab.Navigator
        key="clinician"
        screenOptions={{
          headerShown: true,
          headerRight,
          tabBarStyle: { display: "none", height: 0 },
        }}
      >
        <Tab.Screen
          name="Session"
          component={ClinicianHomeScreen}
          options={{ title: "Session Brief" }}
        />
      </Tab.Navigator>
    );
  }

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
        tabBarActiveTintColor: "#007bff",
        tabBarInactiveTintColor: "gray",
        headerShown: true,
        headerRight,
      })}
    >
      <Tab.Screen name="Diary" component={HomeScreen} />
      <Tab.Screen name="Chat" component={DailyChatScreen} />
      <Tab.Screen
        name="MyWeek"
        component={MyWeekScreen}
        options={{ title: "My week" }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  // Expo Router's ExpoRoot already mounts a NavigationContainer. The legacy
  // stack/tabs nest under that single container — do not wrap another one.
  return (
    <HelmetProvider>
      <AppModeProvider>
        <Stack.Navigator
          initialRouteName="Welcome"
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen
            name="Chat"
            component={InitChatScreen}
            options={{ headerShown: true }}
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
          <Stack.Screen name="MainApp" component={MainAppTabs} />
        </Stack.Navigator>
      </AppModeProvider>
    </HelmetProvider>
  );
}
