import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  TextInput, 
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkGeminiConfigured, useGeminiConfigured } from '../utils/geminiClient';
import { Helmet } from 'react-helmet-async';
import { colors, fonts, radius } from '../utils/theme';
import { releaseWebKeyboardViewport } from '../utils/webViewport';
import { useDemoPackActions } from '../components/useDemoPackActions';

const WelcomeScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const { configured: geminiReady, ready: geminiStatusReady } = useGeminiConfigured();
  const { loadPack } = useDemoPackActions(navigation);

  useEffect(() => {
    const loadName = async () => {
      try {
        const storedName = await AsyncStorage.getItem('@user_name');
        if (storedName) {
          setName(storedName);
        }
      } catch (error) {
        console.error('Failed to load name from storage:', error);
      }
    };

    loadName();
  }, []);

  useEffect(() => {
    const skipScreen = async () => {
      try {
        const initialChatCompleted = await AsyncStorage.getItem('@initial_chat_completed');
        if (initialChatCompleted === 'true') {
          navigation.navigate('MainApp');
        }  
      } catch (error) {
        console.error('Failed to check chat status:', error);
      }
    };

    skipScreen();
  }, []);

  const handleNavigate = async () => {
    try {
      Keyboard.dismiss();
      if (Platform.OS === 'web') {
        await releaseWebKeyboardViewport();
      }
      await AsyncStorage.setItem('@user_name', name);
      const initialChatCompleted = await AsyncStorage.getItem('@initial_chat_completed');
      
      if (initialChatCompleted === 'true' || !(await checkGeminiConfigured())) {
        await AsyncStorage.setItem('@initial_chat_completed', 'true');
        navigation.navigate('MainApp');
      } else {
        navigation.navigate('Chat');
      }
    } catch (error) {
      console.error('Failed to save data or check chat status:', error);
      navigation.navigate('Chat');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {Platform.OS === 'web' && (
        <Helmet>
          <meta 
            name="viewport" 
            content="width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no" 
          />
        </Helmet>
      )}
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView contentContainerStyle={{flexGrow: 1}} bounces={false}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.hero}>
              <Text style={styles.kicker}>MindLink</Text>
              <Text style={styles.welcomeText}>A quiet place for notes and check-ins</Text>
            </View>
          </TouchableWithoutFeedback>
          <View style={styles.bottomContainer}>
            <Text style={styles.label}>How do you want us to call you?</Text>
            {geminiStatusReady && !geminiReady ? (
              <Text style={styles.demoNote}>
                Demo mode: Gemini is not configured on the server. You can journal in Teen mode, then open Clinician view from the top of the screen. Set server-only GEMINI_KEY to enable live chat.
              </Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                autoCapitalize='words'
                autoCorrect={false}
                inputMode="text" 
                autoComplete="name"
                textContentType="name"
                fontSize={16}
              />
              <TouchableOpacity
                onPress={handleNavigate}
                onPressIn={() => {
                  Keyboard.dismiss();
                }}
                style={[styles.button, name.trim() === '' && styles.buttonDisabled]}
                disabled={name.trim() === ''}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={loadPack}
              style={styles.loadPackButton}
              accessibilityRole="button"
              accessibilityLabel="Load demo pack"
              accessibilityHint="Restores a saved JSON pack of diary, chat, and Session Brief data"
              testID="load-demo-pack-welcome"
              {...(Platform.OS === 'web' ? { title: 'Load demo pack' } : {})}
            >
              <Text style={styles.loadPackText}>Load demo pack</Text>
            </TouchableOpacity>
            <Text style={styles.demoNote}>
              After Reset, load a saved pack to bring back the dry-run diary, daily chat, and Session Brief.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    minHeight: 220,
  },
  kicker: {
    fontFamily: fonts.metaSemi,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 28,
    fontFamily: fonts.title,
    color: colors.text,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  bottomContainer: {
    padding: 20,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.accent,
    borderRadius: radius,
  },
  buttonText: {
    color: colors.surface,
    fontFamily: fonts.bodyMedium,
  },
  label: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: fonts.metaSemi,
    color: colors.text,
  },
  demoNote: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: fonts.meta,
    color: colors.muted,
    lineHeight: 18,
  },
  input: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    marginRight: 10,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  buttonDisabled: {
    backgroundColor: colors.border,
  },
  loadPackButton: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
  },
  loadPackText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.metaMedium,
  },
});

export default WelcomeScreen;
