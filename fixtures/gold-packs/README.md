# Session Brief gold packs

Frozen fictional packs for the local Session Brief pipeline. `scripts/eval-brief-gold.mjs` runs `buildLocalChangeBrief` and checks Option D labels. It does not call Gemini.

```bash
node scripts/eval-brief-gold.mjs
node scripts/eval-brief-gold.mjs --self-check-negative
npm run test:brief-gold
```

`--self-check-negative` flips one expected polarity and exits 0 only when that mistake is reported. CI runs both commands on pull requests (see `.github/workflows/eas-hosting.yml`, job `brief-gold`).

## Add a pack

1. Add `fixtures/gold-packs/<id>.json`. Use fictional diary and chat only. Do not put API keys or real session notes in the file.
2. Set `id`, `inputs` (`userName`, `entries`, `checkIns`, `summaries`), `now`, and `expected`.
3. Diary text lives on `entries[].response`. Chat text lives on `checkIns[].messages[]` with `"role": "user"`. Give every record a stable `file` id.
4. Under `expected`, set `kind` (`baseline` or `change`), `windowLabel` (`First visit`, `Since last Brief`, or `Since last week`), `safety.concern` (`none`, `monitor`, or `elevated`), `safety.siOrSelfHarm`, and every theme the local pipeline emits.
5. Theme `polarity` is `improved`, `worse`, `new`, or `stable`. Labels match loosely (case, punctuation, or a shorter label contained in the pipeline label, at least 4 characters). List the full theme set. An extra theme fails the pack unless that case sets `"allowExtraThemes": true`.
6. Each expected theme must have at least one evidence quote, and that quote must be copied from the pack's diary or user chat text. Set `"requireEvidence": false` on a theme only when the pipeline truly has no quote.
7. For a return window, use `steps`. The later step sets `"priorFromStep": "<earlier step id>"`. The eval builds that prior snapshot with `snapshotFromChangeBrief` from the earlier step's local brief. A raw `priorSnapshot` object is also accepted.
8. Run the two commands above. Update `expected` only when the new labels are the behavior you intend to lock.

Single-case shape:

```json
{
  "format": "mindlink-gold-pack",
  "version": 1,
  "id": "my-pack",
  "now": "2026-09-06T12:00:00.000Z",
  "inputs": { "userName": "Jordan", "entries": [], "checkIns": [], "summaries": [] },
  "priorSnapshot": null,
  "expected": {
    "kind": "baseline",
    "windowLabel": "First visit",
    "safety": { "concern": "none", "siOrSelfHarm": false },
    "themes": [{ "label": "School / academic pressure", "polarity": "new" }]
  }
}
```

Packs in this folder today:

- `baseline-first-visit.json` — first visit, themes `new`, safety `none`.
- `return-change-window.json` — since last Brief, with `improved`, `worse`, and `new`.
- `safety-si-language.json` — suicidal ideation language must set `concern: elevated` and `siOrSelfHarm: true`.
