# EAS Hosting deploy

This Expo app is hosted on [EAS Hosting](https://docs.expo.dev/eas/hosting/deployments-and-aliases/). Preview subdomain: `raymondmak-app1`.

**CI owns staging and production.** Cursor agents open PRs to `main` and do **not** run `eas deploy` (especially never `eas deploy --prod`) unless they are debugging this GitHub Actions workflow.

## How deploys happen

Workflow: [`.github/workflows/eas-hosting.yml`](./.github/workflows/eas-hosting.yml)

| Trigger | Command | URL |
| --- | --- | --- |
| Pull request targeting `main` (or **Actions → EAS Hosting → Run workflow**) | `eas deploy --alias staging --environment preview --non-interactive` | https://raymondmak-app1--staging.expo.app/ |
| Push / merge to `main` | `eas deploy --prod --environment production --non-interactive` | https://raymondmak-app1.expo.app/ |

Each deploy also gets a unique preview URL (`https://raymondmak-app1--<deploymentId>.expo.app/`). The `staging` alias is overwritten by the latest PR (or manual) deploy. Production is only updated by CI on `main`.

Export always unsets `EXPO_PUBLIC_GEMINI_API_KEY` so Metro cannot embed a client key. Server secrets are applied at deploy time via `--environment` (preview vs production).

Pushes to non-`main` branches do **not** deploy. Open a PR to hit staging. That avoids double-deploying the same alias from branch pushes and PRs.

## Cursor agents

1. Open PRs against **`main` only**. Do not merge to production yourself.
2. Do **not** run `eas deploy --prod`.
3. Do **not** run `eas deploy` at all unless you are debugging CI (then staging only, or re-run the workflow).
4. After a PR is opened, GitHub Actions deploys **staging**. After merge, it deploys **production**.
5. Report the staging URL in the PR. Never assume production was updated until the `main` workflow succeeds.

## Secrets Raymond must confirm

CI cannot invent tokens. The first merge after this workflow lands may fail until these exist, then **re-run** the failed job.

### GitHub Actions

| Secret | Where | Purpose |
| --- | --- | --- |
| `EXPO_TOKEN` | GitHub → **Settings → Secrets and variables → Actions** | Authenticates `eas` in CI. Create at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens). |

Do not commit this token. Do not put API keys in GitHub secrets for Hosting — Gemini/Pinecone are EAS environment variables (below).

### EAS environments (expo.dev → project → Environment variables)

Use **sensitive** visibility, not `secret` (EAS Hosting cannot deploy `secret` visibility). Never `EXPO_PUBLIC_*` for keys.

| Variable | EAS environments | Notes |
| --- | --- | --- |
| `GEMINI_KEY` | **preview** and **production** | Server-only. Used by `POST /api/gemini`. |
| `PINECONE_KEY` | **preview** and **production** | Server-only. Used by `POST /api/context`. |

`EXPO_PUBLIC_GEMINI_MODEL=auto` is not a secret and may be present. Do not set `EXPO_PUBLIC_GEMINI_API_KEY`.

If preview/production vars are missing, staging/prod deploys still go out but chat/RAG run in demo mode.

## Debugging CI (agents: staging only)

If the workflow fails and you need a local reproduction:

```bash
unset EXPO_PUBLIC_GEMINI_API_KEY
npx expo export -p web
eas deploy --alias staging --environment preview --non-interactive
```

If `eas` is not on `PATH`, use `npx eas-cli` in place of `eas`. Prefer **Actions → Re-run jobs** (or `workflow_dispatch`) over a local deploy.

## Manual production (humans only)

Do not use this from a Cursor agent. CI on `main` is the production path.

```bash
unset EXPO_PUBLIC_GEMINI_API_KEY
npx expo export -p web
eas deploy --prod --environment production --non-interactive
```

To promote an existing deployment without rebuilding:

```bash
eas deploy:alias --prod --id=<deploymentId>
```

## Docs

- [EAS Hosting deployments and aliases](https://docs.expo.dev/eas/hosting/deployments-and-aliases/)
- [EAS environment variables with Hosting](https://docs.expo.dev/eas/environment-variables/usage/)
- [expo/expo-github-action](https://github.com/expo/expo-github-action)
