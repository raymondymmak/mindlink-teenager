# EAS Hosting deploy

This Expo app is hosted on [EAS Hosting](https://docs.expo.dev/eas/hosting/deployments-and-aliases/). Preview subdomain: `raymondmak-app1`.

**Cursor agents: do not deploy production unless Raymond explicitly asks.** The default is the `staging` alias.

## Default for Cursor agents — preview / staging

Export the web bundle, then deploy to the stable `staging` alias (not `--prod`):

```bash
npx expo export -p web
eas deploy --alias staging --environment preview --non-interactive
```

If `eas` is not on `PATH`, use `npx eas-cli` in place of `eas`.

If `EXPO_PUBLIC_GEMINI_API_KEY` must be inlined at export time (do not commit `.env`, do not print secrets):

```bash
EXPO_PUBLIC_GEMINI_API_KEY="$GEMINI_KEY" \
EXPO_PUBLIC_GEMINI_MODEL="${EXPO_PUBLIC_GEMINI_MODEL:-auto}" \
  npx expo export -p web
eas deploy --alias staging --environment preview --non-interactive
```

**Report both URLs in the PR. Never assume production was updated.**

| Kind | URL |
| --- | --- |
| Stable staging | `https://raymondmak-app1--staging.expo.app/` |
| Unique preview | `https://raymondmak-app1--<deploymentId>.expo.app/` |

`eas deploy` prints both after a successful deploy. The unique URL uses that deployment’s id.

## Production (do not use unless Raymond explicitly asks)

- URL: `https://raymondmak-app1.expo.app/`
- Command:

```bash
npx expo export -p web
eas deploy --prod --non-interactive
```

Add `--environment production` when using EAS environment variables.

## Promote a preview later

Only when the user says **promote** or **production**:

```bash
eas deploy:alias --prod --id=<deploymentId>
```

Or re-export and run `eas deploy --prod` — same explicit-approval rule.

## Docs

- [EAS Hosting deployments and aliases](https://docs.expo.dev/eas/hosting/deployments-and-aliases/)
