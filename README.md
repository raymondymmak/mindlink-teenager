# MindLink - Mental Wellness Assistant

Created by Mak Yiu Man Raymond (麥耀文) and the MindLink team.

## Overview

MindLink is a mobile application designed to serve as a compassionate and supportive mental wellness assistant specifically for Hong Kong teenagers. It helps teenagers articulate symptoms and helps psychiatrists understand them.

The hero clinician deliverable is the **Session Brief**: a structured, scannable note synthesized from on-device journal entries, mood/tags, and chat check-ins.

## Features

- Personalized AI chat for mental health support and regular check-ins.
  - Discreet initial mental health assessment based on the PHQ-9 framework (conversational, not a scored questionnaire).
  - Regular check-ins with short conversations.
  - Crisis modal to provide self-help resources when the user is in distress.
  - Auto-generation of reports which are archived to track progress over time.
- Daily journaling with guided prompts, as well as tracking of mood and topic.
- Local storage of all user data for privacy.
- **Session Brief** for clinicians, including:
  - Mood trajectory from self-rated journal scores.
  - Tag frequency and recurring themes.
  - Stressors mentioned on lower-mood days.
  - A notable user quote.
  - Observational (keyword) signals from user-reported text — not PHQ/HAM scores.
  - Copy / share as plain text.

## Session Brief MVP

### Demo path (no Gemini key)

1. Open the app and enter a preferred name. If `EXPO_PUBLIC_GEMINI_API_KEY` is missing, the app continues to the journal in demo mode.
2. In **Diary**, write a short entry, set a mood (try one day below 4/10), and add tags such as `school` or `anxiety`.
3. Confirm **Generate Brief**, or open **Reports → Brief**.
4. Review the structured Session Brief and use **Copy / Share**.

Optional: from **Chat**, tap **Create Session Brief** after a short check-in. Without a key, live Gemini replies are disabled, but a local brief can still be generated from saved check-in text and journal data.

### Demo path (with Gemini key)

Same as above. Chat uses Gemini directly. The Brief tab synthesizes the on-device analysis with one Gemini write-up. If Gemini fails, the same structured local brief is shown.

### Privacy

- Journal entries, check-ins, chat reports, and Session Briefs are stored on-device (`AsyncStorage` / `localStorage` on web, `expo-file-system` on native).
- When a Gemini key is set, the app calls the **Gemini Developer API directly**. It does not use `gemini-middleman` or any Vercel proxy.
- Payloads are limited to the current chat turn or the already-computed Session Brief observations. Pinecone / RAG is out of scope for this MVP.
- Without a key, brief generation stays on-device.

## Gemini API key

This Expo 53 app reads:

```bash
EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
EXPO_PUBLIC_GEMINI_MODEL=gemini-3.6-flash
```

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Copy `.env.example` to `.env` and paste the key.
3. Restart Expo so the `EXPO_PUBLIC_*` value is inlined.

Expo web only inlines `EXPO_PUBLIC_*` variables. For EAS Hosting, export the web bundle with the public key set from the Cursor secret (do not commit `.env`):

```bash
EXPO_PUBLIC_GEMINI_API_KEY="$GEMINI_KEY" \
EXPO_PUBLIC_GEMINI_MODEL="${EXPO_PUBLIC_GEMINI_MODEL:-gemini-3.6-flash}" \
  npx expo export -p web
npx eas-cli deploy --prod --non-interactive
```

`gemini-2.0-flash` is no longer available. The default is `gemini-3.6-flash` (override with `EXPO_PUBLIC_GEMINI_MODEL`). If the key is missing or Gemini fails, chat shows a clear error and Session Brief falls back to the on-device demo narrative.

The client prefers `@google/genai` and falls back to the official REST endpoint (`generativelanguage.googleapis.com`) if the SDK cannot run in React Native. Never hardcode the key in source.

## Tech Stack

- **Frontend for teenagers**: React Native (with Expo)
- **Frontend for doctors**: React (with Vite) — separate repo (`mindlink-doctor`)
- **LLM**: Gemini Developer API, called from this app (no middleman)

## Scripts

```bash
npm start           # expo start
npm run web         # expo start --web
node scripts/test-session-brief.js
```

## Contributing

For contributions to this project, please contact Mak Yiu Man Raymond at [LinkedIn](https://www.linkedin.com/in/raymondymmak).
