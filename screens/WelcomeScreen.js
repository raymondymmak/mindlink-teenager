import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  TextInput, 
  ImageBackground, 
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isGeminiConfigured } from '../utils/geminiClient';

// Import Helmet for web-specific meta tags
import { Helmet } from 'react-helmet-async';

const WelcomeScreen = ({ navigation }) => {
  const [name, setName] = useState('');

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
          // If initial chat is completed, go to MainApp (HomeScreen)
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
      // Save the user name
      await AsyncStorage.setItem('@user_name', name);
      
      // redundancy check to ensure not complete initial chat
      // Check if the initial chat is completed
      const initialChatCompleted = await AsyncStorage.getItem('@initial_chat_completed');
      
      if (initialChatCompleted === 'true' || !isGeminiConfigured()) {
        // Skip intro chat when it is already done, or when Gemini is not configured.
        await AsyncStorage.setItem('@initial_chat_completed', 'true');
        navigation.navigate('MainApp');
      } else {
        navigation.navigate('Chat');
      }
    } catch (error) {
      console.error('Failed to save data or check chat status:', error);
      // Default to ChatScreen if there's an error
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
            <ImageBackground
              source={{ uri: 'https://thumbs.dreamstime.com/b/mental-health-assessment-blurred-background-copy-space-concept-path-psychology-choice-future-defocused-motion-minimalistic-296432156.jpg' }}
              style={styles.imageBackground}
            >
              <Text style={styles.welcomeText}>  Welcome to MindLink  </Text>
            </ImageBackground>
          </TouchableWithoutFeedback>
          <View style={styles.bottomContainer}>
            <Text style={styles.label}>How do you want us to call you?</Text>
            {!isGeminiConfigured() ? (
              <Text style={styles.demoNote}>
                Demo mode: no Gemini API key is set. You can journal in Teen mode, then open Clinician view from the top of the screen. Add EXPO_PUBLIC_GEMINI_API_KEY to enable live chat.
              </Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                value={name}
                onChangeText={setName}
                autoCapitalize='words'
                autoCorrect={false}
                // These properties help prevent zoom on iOS Safari
                inputMode="text" 
                autoComplete="name"
                textContentType="name"
                // Font size of at least 16px helps prevent zoom on iOS Safari
                fontSize={16}
              />
              <TouchableOpacity
                onPress={handleNavigate}
                style={[styles.button, name.trim() === '' && styles.buttonDisabled]}
                disabled={name.trim() === ''}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  imageBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  bottomContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  button: {
    padding: 10,
    backgroundColor: '#007bff',
    borderRadius: 5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  label: {
    marginTop: 20,
    fontSize: 16,
    fontWeight: 'bold',
  },
  demoNote: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  input: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    marginRight: 10,
    fontSize: 16, // Set to at least 16px to prevent iOS Safari from zooming
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
});

export default WelcomeScreen;