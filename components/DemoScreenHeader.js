import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../utils/theme";
import DemoHeaderActions from "./DemoHeaderActions";

export default function DemoScreenHeader({ navigation, title }) {
  return (
    <View style={styles.bar}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <DemoHeaderActions navigation={navigation} compact />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  title: {
    fontFamily: fonts.title,
    fontSize: 15,
    color: colors.text,
  },
});
