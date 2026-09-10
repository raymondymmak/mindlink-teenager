# MindLink design system

Approved visual spec for the Expo restyle (issue [#22](https://github.com/raymondymmak/mindlink-teenager/issues/22)). Behavior is unchanged: Teen/Clinician, 11-section Brief, tags, mood 1–10, Finish early, Reset, RAG.

- Visual north star: [EECS Atlas](https://eecs-atlas.sethw.dev/) — clean, paper, destination-first.
- Samples: [`design-samples/`](./design-samples/) (`_base.css`, `teen-diary.html`, `clinician-brief.html`, `chat.html`)
- Implementation: `utils/theme.js` + `components/useAppFonts.js`. Screens import tokens; do not restyle by inventing new colors.

---

## Principles

1. **Quiet chrome.** The header is a hairline bar: title on the left, actions on the right. No gradients, blobs, glass, drop shadows, or illustrated mascots.
2. **One red control.** **Reset Demo** is the only filled danger button. Everything else is stone + one blue accent.
3. **Mode is a lens.** Teen and Clinician read the same on-device `localData`. The toggle is a ghost button, not a second product.
4. **Clinical, not cute.** Session Brief looks like a note a psychiatrist can scan in a minute. Teen screens stay friendly without becoming a sticker pack.
5. **Type stack (Atlas).** Space Grotesk for titles and primary body. IBM Plex Sans for meta (captions, tabs, section labels, helper text). IBM Plex Mono only for rare code/IDs — never as general UI. No Inter / Poppins / Nunito.
6. **Preserve behavior.** Visual work later must not drop Teen/Clinician, the 11-section Brief harness, tags, mood 1–10, Finish early, Reset, or RAG.

Anti-slop (do not introduce):

- Purple-to-blue gradients, glow, neon, 3D cards, 24px radii, heavy shadows
- Emoji as UI, “Your AI companion ✨”, auto-playing blobs
- Dark mode as a first pass (Atlas-like paper is the default)
- Bootstrap `#007bff` leftover once the restyle lands — samples already use `--accent`

---

## Tokens

Map these 1:1 into React Native `StyleSheet` later. Samples define them in `design-samples/_base.css`.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#FAFAF9` | Screen background (stone-50) |
| `--surface` | `#FFFFFF` | Cards, header, composer |
| `--text` | `#1C1917` | Primary copy |
| `--muted` | `#78716C` | Secondary copy, kickers, empty states |
| `--border` | `#E7E5E4` | Hairline 1px only |
| `--accent` | `#1D4ED8` | Primary actions, links, selected tags, user bubbles |
| `--accent-soft` | `#EFF6FF` | Prompt well, selected chip fill, focus ring |
| `--danger` | `#B91C1C` | **Reset Demo only** (and crisis copy, not chrome) |
| `--radius` | `8px` | Buttons, cards, inputs, bubbles |
| `--font` | `"Space Grotesk", system-ui, sans-serif` | Titles and primary body |
| `--font-meta` | `"IBM Plex Sans", system-ui, sans-serif` | Captions, tabs, section labels, helper text, chrome |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, monospace` | Code and IDs only (e.g. `POST /api/context`, section index) |

Spacing: 4 / 8 / 12 / 16 / 24 / 32. Header height 48px. No box-shadow.

Type roles:

- **Space Grotesk** — screen titles (`h1`), diary/chat body, report paragraph text, composer.
- **IBM Plex Sans** — kickers, ledes, tabs, section labels (`h2` / `.label`), helper/disclaimer/note, chips, mood captions, header actions. Small meta must look professional, not mono.
- **IBM Plex Mono** — `<code>` and numeric IDs (outlined section index). Not tags, not tabs, not body.

Atlas’s own site pairs Grotesk with Plex Mono. After review, **meta stays Plex Sans** so small captions/tabs/labels feel professional — do not put general UI in Mono.

Load via Google Fonts in samples (`_base.css` `@import`). Later Expo: `@expo-google-fonts/space-grotesk`, `@expo-google-fonts/ibm-plex-sans`, and mono only if a code/ID surface needs it.

Sizes: 11px kicker (uppercase, muted, Plex Sans), 13px chrome, 14–15px body (Grotesk), 22px screen title (Grotesk, weight 600, slight negative tracking). Do not use 800-weight colored headings.

---

## Layout patterns

### Header recipes

**MainApp (Diary, Chat check-in, My week, Clinician):**

`[ screen title ] ……………… [ Show clinician view | Show teen view ] [ Reset Demo ]`

- Mode toggle: ghost, 1px `--border`, 13px, not filled blue.
- Reset: filled `--danger`, 13px, weight 600. Label stays **Reset Demo**.
- They sit **next to each other** on the right (`DemoHeaderActions`).

**Intro chat only:**

`[ Chat ] ……………… [ Finish early ]`

- Finish early is accent **text**, not a red button, not a primary fill.
- It wraps up to the teen **Summary**, then Home. It must **not** open Clinician / Session Brief.

### Teen

- Bottom tabs: Diary · Chat · My week. Active = `--accent` text, inactive = `--muted`. No floating tab pill.
- **Diary:** greeting + date, prompt in `--accent-soft`, multiline note, mood **1–10** slider with numeric readout, tags as outlined chips (selected = `--accent-soft` + `--accent` text, not inverted white-on-blue pills), Save as filled accent.
- **My week:** glance only (mood chips, top tags, ready-for-session copy). Never render the 11-section Brief here.
- **Chat (check-in):** transcript + composer. Optional compact **Save** (check-in) beside the field. User bubble = accent fill; assistant = surface + hairline.

### Clinician

- Same header row; label is **Show teen view**.
- Wide: Brief column (~1.2) | source panels (~0.9), hairline divider. Narrow: stack Brief then panels.
- Brief is the **fixed 11-section harness** (order never reshuffles):

  1. User Profile
  2. Presenting Concerns
  3. Mood & Affective State
  4. Anxiety & Stress Levels
  5. Cognitive & Perceptual State
  6. Functioning
  7. HEADSS Contextual Factors
  8. Risk Assessment
  9. Strengths & Protective Factors
  10. Key Insights & Potential Areas of Concern
  11. Suggestions for User

- Empty section body: italic muted **Not disclosed in conversation**.
- Sections 2 and 4 may show the HAM-D / HAM-A disclaimer (conversation-derived, not an administered instrument).
- Section index is a **24px outlined circle**, not a filled blue badge.
- Source panels stay: mood trajectory (n/10), tag frequency, key quotes / stressors, observational keyword signals (not PHQ scores).
- Actions: **Generate / Regenerate Session Brief** (accent fill), **Copy / Share** (ghost).

---

## Do / don’t

| Do | Don’t |
| --- | --- |
| Hairline `#E7E5E4` borders | 2–3px borders, colored left bars on every card |
| Reset red; mode toggle ghost | Make Reset blue, or make the mode toggle a filled primary |
| Mood scale **1–10** everywhere | 1–5, stars, emoji meters |
| Keep tag set: school, family, friends, anxiety, procrastination, lonely | Invent a new taxonomy in the restyle |
| One app, two modes | Split into two apps / two stores |
| Space Grotesk + IBM Plex Sans | Inter, Poppins, Nunito, or Plex Mono as general UI |
| Plex Mono for code/IDs only | Mono on tabs, labels, captions, or helper copy |
| Crisis copy can use `--danger` text | Red header, red Send, red tabs |
| Cite Atlas as the density/quiet bar | Clone Atlas copy or course-planner layout |

---

## Implementation notes

The samples are **approved**. Expo screens import `colors`, `fonts`, `type`, and `radius` from `utils/theme.js` — do not paste leftover hex into StyleSheets.

When changing visuals later:

1. Read this file and `design-samples/_base.css`. Match them; do not “improve” the palette.
2. Touch presentation only: `screens/*`, `components/DemoHeaderActions.js`, `App.js` tab/header options. **Do not** change `utils/localData.js`, `utils/sessionBriefLogic.js` harness keys, `utils/sessionBriefEngine.js`, `app/api/context+api.js`, Gemini routing, or storage keys.
3. Keep `#FAFAF9` / `#1D4ED8` / radius 8. Header actions stay in `DemoHeaderActions` (toggle then Reset). Fonts load via `useAppFonts` (`@expo-google-fonts/space-grotesk`, `ibm-plex-sans`, `ibm-plex-mono` for IDs only).
4. Intro `InitChatScreen` keeps **Finish early** in `headerRight`. MainApp screens keep toggle + Reset.
5. Clinician `REPORT_SECTIONS` order and empty string stay. Wide split already exists in `ClinicianHomeScreen` (`width >= 960`).
6. Web: keep `usePinWebPathToRoot` and the Expo Router shell. Do not add a second `NavigationContainer`.
7. Verify: save diary with tags + mood 3/10 → My week glance → Show clinician view → 11 sections + panels → Show teen view → Finish early on intro still goes Summary → Home → Reset Demo clears and returns to Welcome. Chat/Brief still call `POST /api/context` when configured.
8. Do not print `GEMINI_KEY` / `PINECONE_KEY`.

React Native mapping (`utils/theme.js`):

```js
colors: { bg, surface, text, muted, border, accent, accentSoft, danger }
fonts: { body, title, meta, mono, … }
type: { title, body, meta, mono } // fontFamily + color roles
radius: 8
```

---

## Out of scope

- New features, new Brief sections, new tags, new mood scale
- Dark mode, i18n pass
- Using IBM Plex Mono for captions, tabs, or section labels
- Changing RAG, Gemini models, or env handling (see `AGENTS.md` for Metro `.env`)
- Copying Atlas course-planner IA into MindLink

---

## Sample index

| File | What to judge |
| --- | --- |
| [`design-samples/teen-diary.html`](./design-samples/teen-diary.html) | Hairline cards, mood 1–10, chips, **Show clinician view** beside red **Reset Demo**, teen tabs |
| [`design-samples/chat.html`](./design-samples/chat.html) | Transcript, composer, **Finish early** as text, same demo actions |
| [`design-samples/clinician-brief.html`](./design-samples/clinician-brief.html) | 11-section harness, source panels, **Show teen view** + Reset |

Visual implementation is in the Expo app (`utils/theme.js`). Samples remain the reference.
