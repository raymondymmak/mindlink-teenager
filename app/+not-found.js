import { Redirect } from "expo-router";

// React Navigation screen names (Chat, MainApp, Diary, …) can show up in the
// URL. This app is one Expo Router route wrapping that stack — reload of a
// nested path should open the app, not the default Unmatched screen.
export default function NotFound() {
  return <Redirect href="/" />;
}
