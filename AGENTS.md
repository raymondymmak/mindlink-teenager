# Agent notes

## Deploy

Open PRs against **`main` only**. GitHub Actions deploys:

- PRs → EAS Hosting **staging** (`https://raymondmak-app1--staging.expo.app/`)
- merge/push to `main` → **production** (`https://raymondmak-app1.expo.app/`)

Do **not** run `eas deploy --prod`. Do **not** run `eas deploy` unless you are debugging CI (staging only). Full rules and required secrets (`EXPO_TOKEN`, EAS `GEMINI_KEY` / `PINECONE_KEY` / `MINDLINK_API_TOKEN`): [DEPLOY.md](./DEPLOY.md).

## Cursor Cloud specific instructions

Expo **dev** web will red-screen the whole app if Metro’s `expo/virtual/env.js` context is empty.

In development Metro builds that virtual module as `require.context` over:

- `.env`
- `.env.development`
- `.env.local`
- `.env.development.local`

If **none** of those files exist, calling the context throws `Error: No modules in context`. Optional chaining (`dotEnvModules(file)?.default`) does not catch a throw, so `App` never mounts. `.env` is gitignored, so a VM that only has `.env.example` will hit this. Production `expo export` inlines `EXPO_PUBLIC_*` at export time and does not use that virtual module.

**Before `npx expo start`:**

```bash
node scripts/ensure-dotenv.js
```

That writes secret-free stubs for `.env` and `.env.development` when they are missing. It never overwrites an existing `.env` and never writes API keys. `postinstall`, `prestart`, and `.cursor/environment.json` `install` / `start` / `expo-web` already run it.

`.env.development` is committed (secret-free, `EXPO_PUBLIC_GEMINI_MODEL=auto`) so a fresh checkout has a non-empty Metro context even before the script runs.

If you see the overlay anyway:

1. Confirm `.env` or `.env.development` exists at the repo root (not only `.env.example`).
2. Run `node scripts/ensure-dotenv.js`.
3. Restart Expo with `--reset-cache`.
4. Do not commit `.env` or print `GEMINI_KEY` / `PINECONE_KEY`.
5. Never put `GEMINI_KEY` in `EXPO_PUBLIC_*`. Chat/Brief go through `POST /api/gemini`; configured-ness is `POST /api/gemini` `{ "health": true }` → `{ configured }` (send `Authorization: Bearer` / `X-MindLink-Token` matching `MINDLINK_API_TOKEN`). Unset `EXPO_PUBLIC_GEMINI_API_KEY` before `npx expo export`. `EXPO_PUBLIC_MINDLINK_API_TOKEN` is a public *gate*, not a capability secret — still rate-limited.
