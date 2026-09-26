# MindLink - Mental Wellness Assistant

Created by Raymond Mak and the MindLink team.

## Overview

MindLink is a mobile application designed to serve as a compassionate and supportive mental wellness assistant specifically for Hong Kong teenagers. It helps teenagers articulate symptoms and helps psychiatrists understand them.

**Demo only — not medical advice or a substitute for care.** Designed for clinician dry-runs and teen wellness demos; on-device demo data is fictional.

**Demo v1** is one Expo app with two lenses over the same on-device `localData`: **Teen** (capture + a thin My week card) and **Clinician** (Session Brief beside source panels). Mode is not two databases.

The hero clinician deliverable is the **Session Brief**: a structured, scannable note synthesized from on-device journal entries, mood/tags, and chat check-ins.

Design system (spec + static HTML samples; Expo UI unchanged until approved): [DESIGN.md](./DESIGN.md).

## Features

- Personalized AI chat for mental health support and regular check-ins.
  - Discreet initial mental health assessment based on the PHQ-9 framework (conversational, not a scored questionnaire).
  - Regular check-ins with short conversations.
  - Crisis modal to provide self-help resources when the user is in distress.
  - Auto-generation of reports which are archived to track progress over time.
- Daily journaling with guided prompts, as well as tracking of mood and topic.
- **Teen mode**: Diary, Chat, and a thin **My week** card (mood glance, top tags, ready for session?) — no full Session Brief.
- **Clinician mode**: Session Brief beside mood trajectory, tag frequency, and key quotes / stressors. Opened from **Developer settings** → **Show clinician view**.
- Local storage of all user data for privacy. Both modes read the same on-device store.
- **Session Brief** for clinicians, including:
  - Mood trajectory from self-rated journal scores.
  - Tag frequency and recurring themes.
  - Stressors mentioned on lower-mood days.
  - A notable user quote.
  - Observational (keyword) signals from user-reported text — not PHQ/HAM scores.
  - Copy / share as plain text.

## Teen / Clinician demo path

1. Open the app and enter a preferred name. If server `GEMINI_KEY` is missing, the app continues to Teen mode (journal) in demo mode.
2. In **Diary**, write a short entry, set a mood (try one day below 4/10), and add tags such as `school` or `anxiety`. **Chat** can also save a check-in.
3. Open **Developer settings** in the header (gear). The menu holds **Show clinician view**, **Save pack**, **Load pack**, and **Reset Demo**. **My week** stays friendly (mood glance, top tags) — not the full Brief.
4. Choose **Show clinician view**. The clinician shell shows Session Brief beside source panels built from the same local data.
5. Open **Developer settings** and choose **Show teen view** to return. **Reset Demo** in that menu asks for confirmation, then clears on-device data and returns to the welcome screen.
6. **Save pack** in **Developer settings** downloads one JSON file (diary, daily chat, check-ins, Session Brief, and Brief snapshots). On the welcome screen, **Load demo pack** restores that file after a reset. The same **Load pack** control is in **Developer settings** once you are back in the app.

Sample pack with no keys: [`fixtures/demo-pack.json`](./fixtures/demo-pack.json). Checkpointers:

```bash
node scripts/verify-demo-pack.mjs --expect-loaded
node scripts/verify-demo-pack.mjs --roundtrip
node scripts/verify-developer-settings.mjs --structure
node scripts/verify-developer-settings.mjs --actions
```

Those two commands run in-process against the storage helpers (no browser). Optional Playwright proof against local web or staging:

```bash
DEMO_PACK_BASE_URL=http://127.0.0.1:8081 node scripts/verify-demo-pack.mjs --roundtrip --browser
STAGING_BASE_URL=https://raymondmak-app1--staging.expo.app node scripts/verify-demo-pack.mjs --expect-loaded --browser
```

`npm install --no-save playwright && npx playwright install chromium` once in that environment. Playwright is not a project dependency, so the EAS deploy install stays the same.

Optional: from intro chat, **Finish early** still wraps up to the teen notes screen, then Home. The Brief is generated in Clinician view, not as the teen home.

### Demo path (with Gemini key)

Same as above. Chat and Session Brief POST to `/api/gemini`. Before each chat turn or Session Brief synthesis, the app also POSTs `{ query }` to this project's `/api/context` and appends returned `context` to the system instruction. If that context call fails, Gemini continues without retrieved context. If Gemini fails, the same structured local brief is shown.

### Privacy

- Journal entries, check-ins, chat reports, and Session Briefs are stored on-device (`AsyncStorage` / `localStorage` on web, `expo-file-system` on native).
- When server `GEMINI_KEY` is set, chat and Session Brief POST to this project's `/api/gemini`. The client never embeds a Gemini key. Chat uses **Gemini 3.5 Flash-Lite**; Session Brief uses **Gemini 3.5 Flash** (and falls back to Lite, then the on-device narrative, if Flash is rate-limited). There is no Gemini Developer API "Auto" model id — `EXPO_PUBLIC_GEMINI_MODEL=auto` is this in-app split.
- Clinical procedure snippets come from **this repo's** `POST /api/context` (EAS Hosting API route). The Expo client never embeds `PINECONE_KEY` or talks to Pinecone.
- Payloads to Gemini are the current chat turn or the already-computed Session Brief observations, plus optional retrieved context in the system preamble.
- Without a key, brief generation stays on-device.

## Gemini API key

Gemini generate and embeddings run on Expo Router API routes. Set a **server-only** key (never `EXPO_PUBLIC_*`):

```bash
GEMINI_KEY=your_key_here
EXPO_PUBLIC_GEMINI_MODEL=auto
```

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Copy `.env.example` to `.env` and set `GEMINI_KEY` (local API routes read it from the environment).
3. Restart Expo. Do **not** put the key in `EXPO_PUBLIC_GEMINI_API_KEY` — Expo inlines those into the web JS.

```http
POST /api/gemini { "health": true } → { "configured": true|false }
POST /api/gemini { "contents", "systemInstruction", "task": "chat"|"brief" } → { "text" }
```

Both `/api/gemini` and `/api/context` require `Authorization: Bearer <MINDLINK_API_TOKEN>` or `X-MindLink-Token`. The Expo client sends `EXPO_PUBLIC_MINDLINK_API_TOKEN` (a public *gate*, default `mindlink-demo-gate-v1` — not `GEMINI_KEY`). Missing/wrong token → **401**. More than **30 unauthenticated requests / 10 min** (one deployment-wide bucket on EAS Hosting, which does not expose a stable client IP; per IP when `CF-Connecting-IP` is present) or **120 authenticated requests / 10 min / token** → **429**. The counter is a named Workers cache shared across isolates (`caches.default` is not available on EAS Hosting).

EAS Hosting serves the SPA HTML for `GET /api/*`, so configured-ness is a POST like generate. `GET /api/gemini` still works in local Metro.

On web, the client calls same-origin `/api/gemini`. Native / Node defaults to `https://raymondmak-app1.expo.app/api/gemini` unless `EXPO_PUBLIC_GEMINI_API_URL` is set. Demo mode is decided by that health check, not by shipping the key to the browser.

**Deploy is CI-first:** [DEPLOY.md](./DEPLOY.md). Pull requests deploy **staging**; merges to `main` deploy **production**. Cursor agents must not run `eas deploy --prod`. Unset `EXPO_PUBLIC_GEMINI_API_KEY` before `npx expo export`. Put `GEMINI_KEY` on the EAS **preview** (and production) environment as **sensitive**. GitHub Actions needs repo secret `EXPO_TOKEN`.

`gemini-2.0-flash` is no longer available. Default routing is `auto`: chat/check-ins on `gemini-3.5-flash-lite`, Session Brief on `gemini-3.5-flash`. Pin `EXPO_PUBLIC_GEMINI_MODEL` or server `GEMINI_MODEL` to a specific id (including `gemini-3.6-flash`) to override. If the key is missing or Gemini fails, chat shows a clear error and Session Brief falls back to the on-device demo narrative.

Never hardcode the key in source. Never print `GEMINI_KEY`.

## Pinecone RAG in this repo

Chat, Session Brief, and embeddings run on Expo Router API routes (`web.output: "server"`). Retrieval is `app/api/context+api.js`; generate is `app/api/gemini+api.js`. The existing React Navigation UI is wrapped by a thin `app/_layout.js` / `app/index.js` shell so we do not migrate screens to file-based routing.

```http
POST /api/context
{ "query": "..." } → { "context": "...", "matches": [...] }
```

Server behavior:

1. Embed `query` with `gemini-embedding-001` at **768** dimensions.
2. Query Pinecone index `mindlink-knowledge-base`.
3. Return `{ context, matches }` where `matches[].text` comes from metadata.

Server env aliases (never `EXPO_PUBLIC_*`):

- `PINECONE_KEY` or `PINECONE_API_KEY`
- `GEMINI_KEY` or `GEMINI_API_KEY`

Set them on EAS as **sensitive** (not `secret` — EAS Hosting cannot deploy secret visibility):

```bash
npx eas-cli env:create preview --name PINECONE_KEY --value "$PINECONE_KEY" --visibility sensitive --non-interactive
npx eas-cli env:create preview --name GEMINI_KEY --value "$GEMINI_KEY" --visibility sensitive --non-interactive
npx eas-cli env:create preview --name MINDLINK_API_TOKEN --value "$MINDLINK_API_TOKEN" --visibility sensitive --non-interactive
npx eas-cli env:create production --name PINECONE_KEY --value "$PINECONE_KEY" --visibility sensitive --non-interactive
npx eas-cli env:create production --name GEMINI_KEY --value "$GEMINI_KEY" --visibility sensitive --non-interactive
npx eas-cli env:create production --name MINDLINK_API_TOKEN --value "$MINDLINK_API_TOKEN" --visibility sensitive --non-interactive
```

Set `MINDLINK_API_TOKEN` on EAS preview + production to the same value as `EXPO_PUBLIC_MINDLINK_API_TOKEN` (see [DEPLOY.md](./DEPLOY.md)). Unauthenticated callers cannot generate or retrieve RAG text.

`@react-navigation/native` is pinned to `^7.3.18` so Expo Router's server export can load `createScreenFactory`. The teenager UI is still the existing React Navigation `App.js`, wrapped by a one-route `app/` shell. Nested stack/tab names can appear in the URL; `app/+not-found.js` redirects those reloads to `/`, and the web app pins the address bar to `/` so in-app navigation does not remount the shell.

On web, the client calls same-origin `/api/context`. Native / Node defaults to `https://raymondmak-app1.expo.app/api/context` unless `EXPO_PUBLIC_CONTEXT_API_URL` is set. If the context API is down, chat and brief synthesis continue without RAG.

This project does **not** depend on `gemini-middleman` for RAG.

## Tech Stack

- **Frontend**: One Expo app. Teen and Clinician are modes over the same on-device data.
- **LLM**: Gemini Developer API via this repo `POST /api/gemini` (server `GEMINI_KEY`)
- **RAG**: this repo `POST /api/context` → Gemini embeddings + Pinecone `mindlink-knowledge-base`

## Deploy

EAS Hosting is **CI-first**. Open a PR to `main` for staging; merging to `main` deploys production. Cursor agents must not `eas deploy --prod`. See [DEPLOY.md](./DEPLOY.md).

## Scripts

```bash
npm start           # expo start
npm run web         # expo start --web
node scripts/test-session-brief.js
node scripts/test-teen-week.js
node scripts/test-gemini-client.mjs
node scripts/test-gemini-generate.mjs
node scripts/test-gemini-api.mjs
node scripts/test-api-auth.mjs
node scripts/test-api-guard.mjs
node scripts/test-context-api.mjs
node scripts/test-context-route.mjs
node scripts/test-retrieve-context.mjs
npm run test:demo-pack
```

## Contributing

For contributions to this project, please contact Raymond Mak at [LinkedIn](https://www.linkedin.com/in/raymondymmak).
