import { Redirect } from "expo-router";

// Matched fallback for React Navigation paths such as /Chat or /MainApp.
// Redirect home instead of mounting a second App instance (that remount
// left clinician view stuck on its spinner).
export default function SpaFallback() {
  return <Redirect href="/" />;
}
