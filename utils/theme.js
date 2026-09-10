"use strict";

const colors = {
  bg: "#FAFAF9",
  surface: "#FFFFFF",
  text: "#1C1917",
  muted: "#78716C",
  border: "#E7E5E4",
  accent: "#1D4ED8",
  accentSoft: "#EFF6FF",
  danger: "#B91C1C",
};

const radius = 8;

const fonts = {
  body: "SpaceGrotesk_400Regular",
  bodyMedium: "SpaceGrotesk_500Medium",
  title: "SpaceGrotesk_600SemiBold",
  meta: "IBMPlexSans_400Regular",
  metaItalic: "IBMPlexSans_400Regular_Italic",
  metaMedium: "IBMPlexSans_500Medium",
  metaSemi: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
};

const type = {
  title: { fontFamily: fonts.title, color: colors.text },
  body: { fontFamily: fonts.body, color: colors.text },
  meta: { fontFamily: fonts.meta, color: colors.muted },
  mono: { fontFamily: fonts.mono, color: colors.muted },
};

const headerScreenOptions = {
  headerStyle: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    elevation: 0,
    shadowOpacity: 0,
    shadowColor: "transparent",
  },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerTitleStyle: {
    fontFamily: fonts.title,
    fontSize: 15,
    color: colors.text,
  },
  headerTitleAlign: "left",
};

const tabBarScreenOptions = {
  tabBarActiveTintColor: colors.accent,
  tabBarInactiveTintColor: colors.muted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarLabelStyle: {
    fontFamily: fonts.meta,
    fontSize: 11,
  },
};

function createNavigationTheme(DefaultTheme) {
  return {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

module.exports = {
  colors,
  radius,
  fonts,
  type,
  headerScreenOptions,
  tabBarScreenOptions,
  createNavigationTheme,
};
