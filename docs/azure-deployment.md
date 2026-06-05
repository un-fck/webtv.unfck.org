# Azure deployment

This guide is everything you need to do **once** on Azure + GitHub to get
production running on Azure Container Apps, plus how each deploy works
thereafter. Vercel stays as-is for preview branches — it no longer fires
crons (`vercel.json` has no `crons` entries), so previews can't double-fire.

Resource group: `rg-transcripts` (East US 2).

## Architecture summary

- One Container App, pinned to 1 replica (`minReplicas = maxReplicas = 1`).
- Same Docker image runs both the web tier and a sidecar `cron` daemon.
  The daemon's crontab is materialised at boot by `docker/entrypoint.sh`
  (which `envsubst`s `${CRON_SECRET}` into `docker/crontab.template`),
  then `exec node server.js` becomes PID 1. Each cron tick is one
  `curl -H "Authorization: Bearer ${CRON_SECRET}" http://127.0.0.1:3000/api/cron/…`
  — the same HTTP route handlers Vercel used to fire externally.
- `docker/crontab.template` is the single source of truth for cron paths
  and schedules. Adding a cron is a 2-line change: one entry in the
  template, one new `app/api/cron/<job>/route.ts` calling `runXxx()`.
- Postgres advisory locks (`withJobLock` in `lib/db.ts`) wrap every cron run
  as belt-and-suspenders for rolling-deploy overlap or any future scale-out.
- Secrets are stored as Container App secrets and exposed to the container
  as env vars via `secretref:`. (Key Vault is a valid alternative if you
  want central rotation/auditing across multiple apps — not needed for a
  single-app deploy.)
- Deploys run from GitHub Actions on push to `main`, authenticating to Azure
  via federated OIDC (no long-lived service-principal secret in GitHub).

## Part A — One-time Azure setup

You can do this in the Azure portal or via `az` CLI. Commands below use `az`
because they're easier to paste and reproduce.

### 1. Install + log in

```bash
brew install azure-cli
az login
az account set --subscription "<your-subscription-id>"
```

### 2. Pick names + region (export as shell vars so you can paste below)

```bash
export RG=rg-transcripts
export LOCATION=eastus2
export ACR_NAME=transcripts                # globally unique, alphanumeric, <50 chars
export CAE_NAME=transcripts-env            # Container Apps environment
export APP_NAME=transcripts                # the Container App itself
```

If `ACR_NAME` is taken (it's a global namespace), append a suffix. These
names must match the `env:` block in
`.github/workflows/deploy-azure.yml` — update the YAML if you change them.

### 3. Create the resource group + ACR

```bash
az group create --name $RG --location $LOCATION

az acr create --resource-group $RG --name $ACR_NAME --sku Basic
```

### 4. Create the Container Apps environment

```bash
az containerapp env create \
  --name $CAE_NAME \
  --resource-group $RG \
  --location $LOCATION
```

### 5. Gather the secret values

We'll write secrets directly into the Container App in step 8. Collect the
values below; the env-var name on the right is what the app code reads.

| App env var                | Value source                                                                    |
| -------------------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Azure Postgres connection string                                                |
| `AUTH_SECRET`              | `openssl rand -hex 32`                                                          |
| `CRON_SECRET`              | `openssl rand -hex 32`                                                          |
| `GEMINI_API_KEY`           | Google AI Studio                                                                |
| `ASSEMBLYAI_API_KEY`       | AssemblyAI dashboard                                                            |
| `DASHSCOPE_API_KEY`        | Alibaba Cloud                                                                   |
| `AZURE_OPENAI_ENDPOINT`    | Azure OpenAI resource                                                           |
| `AZURE_OPENAI_API_KEY`     | Azure OpenAI resource                                                           |
| `AZURE_OPENAI_API_VERSION` | from `.env.example`                                                             |
| `SMTP_HOST`                | e.g. `smtp.mailbox.org`                                                         |
| `SMTP_PORT`                | e.g. `587`                                                                      |
| `SMTP_USER`                | mailbox account                                                                 |
| `SMTP_PASS`                | mailbox app password                                                            |
| `SMTP_FROM`                | the "from" address (or omit; falls back to `SMTP_USER`)                         |
| `SENTRY_DSN`               | Sentry project DSN                                                              |

### 6. Create the Container App (initial deploy)

Bootstrap with a placeholder image so everything else can be wired up; GitHub
Actions swaps in the real image on first push.

```bash
az containerapp create \
  --name $APP_NAME \
  --resource-group $RG \
  --environment $CAE_NAME \
  --image mcr.microsoft.com/k8se/quickstart:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 1 \
  --cpu 1.0 --memory 2.0Gi \
  --system-assigned
```

`--min-replicas 1 --max-replicas 1` pins the app to a single instance. The
job-locks in `withJobLock` cover the brief rolling-deploy overlap window.

### 7. Grant the app access to ACR

```bash
# Get the system-assigned managed identity principal ID
PRINCIPAL_ID=$(az containerapp show --name $APP_NAME --resource-group $RG \
  --query identity.principalId -o tsv)

# Pull from ACR
ACR_ID=$(az acr show --name $ACR_NAME --query id -o tsv)
az role assignment create --assignee $PRINCIPAL_ID --role AcrPull --scope $ACR_ID

# Switch the Container App's registry to managed-identity pull
az containerapp registry set \
  --name $APP_NAME --resource-group $RG \
  --server $ACR_NAME.azurecr.io --identity system
```

### 8. Set secrets + env vars on the Container App

Write each secret value directly into the Container App's native secret store,
then reference them from env vars via `secretref:`.

```bash
az containerapp secret set --name $APP_NAME --resource-group $RG --secrets \
  database-url="postgresql://..." \
  auth-secret="$(openssl rand -hex 32)" \
  cron-secret="$(openssl rand -hex 32)" \
  gemini-api-key="..." \
  assemblyai-api-key="..." \
  dashscope-api-key="..." \
  azure-openai-endpoint="https://....openai.azure.com" \
  azure-openai-api-key="..." \
  azure-openai-api-version="2025-03-01-preview" \
  smtp-host="smtp.mailbox.org" \
  smtp-port="587" \
  smtp-user="..." \
  smtp-pass="..." \
  smtp-from="..." \
  sentry-dsn="..."

# Set env vars (plain + secret refs). BASE_URL is your canonical production URL —
# substitute after you assign a domain or use the Container App's default FQDN.
APP_FQDN=$(az containerapp show --name $APP_NAME --resource-group $RG \
  --query properties.configuration.ingress.fqdn -o tsv)

az containerapp update --name $APP_NAME --resource-group $RG --set-env-vars \
  NODE_ENV=production \
  AZURE_ENV=production \
  BASE_URL=https://$APP_FQDN \
  PG_POOL_MAX=10 \
  DATABASE_URL=secretref:database-url \
  AUTH_SECRET=secretref:auth-secret \
  CRON_SECRET=secretref:cron-secret \
  GEMINI_API_KEY=secretref:gemini-api-key \
  ASSEMBLYAI_API_KEY=secretref:assemblyai-api-key \
  DASHSCOPE_API_KEY=secretref:dashscope-api-key \
  AZURE_OPENAI_ENDPOINT=secretref:azure-openai-endpoint \
  AZURE_OPENAI_API_KEY=secretref:azure-openai-api-key \
  AZURE_OPENAI_API_VERSION=secretref:azure-openai-api-version \
  SMTP_HOST=secretref:smtp-host \
  SMTP_PORT=secretref:smtp-port \
  SMTP_USER=secretref:smtp-user \
  SMTP_PASS=secretref:smtp-pass \
  SMTP_FROM=secretref:smtp-from \
  SENTRY_DSN=secretref:sentry-dsn
```

### 9. Set health probes + termination grace

The Container Apps health-probe API is awkward via `az containerapp update`;
easiest is export → edit YAML → re-import.

```bash
az containerapp show --name $APP_NAME --resource-group $RG -o yaml > app.yaml
```

In `app.yaml`, under `properties.template.containers[0]`, add:

```yaml
probes:
  - type: Liveness
    httpGet:
      path: /api/health
      port: 3000
    periodSeconds: 30
    failureThreshold: 3
  - type: Readiness
    httpGet:
      path: /api/health
      port: 3000
    periodSeconds: 10
```

And under `properties.template`, add:

```yaml
terminationGracePeriodSeconds: 60
```

60s gives in-flight HTTP requests (the cron HTTP routes especially — a
sync-videos tick can take 10s+) time to finish before SIGKILL. The cron
daemon receives SIGTERM via Node (PID 1); its in-flight curl child either
completes or gets cut by SIGKILL, which is fine — the next deploy's
sweep-stuck-pipelines tick recovers anything left in `error`. Apply:

```bash
az containerapp update --name $APP_NAME --resource-group $RG --yaml app.yaml
```

## Part B — One-time GitHub setup

### 1. Configure federated OIDC from GitHub → Azure

No long-lived service-principal secret stored in GitHub.

```bash
APP_REG_NAME=transcripts-github-deploy
az ad app create --display-name $APP_REG_NAME

APP_ID=$(az ad app list --display-name $APP_REG_NAME --query "[0].appId" -o tsv)
az ad sp create --id $APP_ID

# Grant Contributor on the resource group (lets it update the Container App)
SUB_ID=$(az account show --query id -o tsv)
az role assignment create --assignee $APP_ID \
  --role Contributor --scope /subscriptions/$SUB_ID/resourceGroups/$RG

# Allow the ACR push
az role assignment create --assignee $APP_ID --role AcrPush --scope $ACR_ID

# Federate the credential to your GitHub repo (replace OWNER/REPO)
cat > federation.json <<EOF
{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:OWNER/REPO:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
az ad app federated-credential create --id $APP_ID --parameters federation.json
```

### 2. Add GitHub repo secrets

Repo **Settings → Secrets and variables → Actions → New repository secret**.
Add:

| Secret name             | Value                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`       | `$APP_ID` from above                                                             |
| `AZURE_TENANT_ID`       | `az account show --query tenantId -o tsv`                                        |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv`                                              |
| `SENTRY_AUTH_TOKEN`     | Sentry → User Settings → Auth Tokens → create one with `project:releases` scope  |
| `SENTRY_ORG`            | Your Sentry org slug                                                             |
| `SENTRY_PROJECT`        | Your Sentry project slug                                                         |

### 3. Verify the workflow references match your resource names

Open `.github/workflows/deploy-azure.yml` and confirm the `env:` block:

```yaml
AZURE_RESOURCE_GROUP: rg-transcripts
AZURE_CONTAINER_APP: transcripts
AZURE_REGISTRY: transcripts.azurecr.io
IMAGE_NAME: transcripts
```

Edit if you picked different names in step 2.

## Part C — Vercel side (preview branches)

No changes needed. The existing Vercel integration deploys every branch as a
preview. `vercel.json` no longer contains `crons`, so Vercel doesn't fire
any scheduled tasks regardless of which branch it considers "production."
The cron HTTP routes still exist on every deploy and are
`Bearer ${CRON_SECRET}`-authenticated — if you ever want previews to
exercise a cron, hit the route manually with curl.

## Part D — First deploy

```bash
git add -A
git commit -m "Add Azure Container Apps deployment"
git push origin main
```

The `deploy-azure.yml` workflow:

1. Logs into Azure via OIDC.
2. Builds the Docker image with the Sentry build args.
3. Pushes to `transcripts.azurecr.io/transcripts:<sha>` + `:latest`.
4. `az containerapp update --image ...` triggers a new revision.
5. Container Apps brings up the new revision, waits for `/api/health` to
   return 200, then drains the old one.

Watch it in **Actions** on GitHub. Once green, hit `https://<APP_FQDN>` in a
browser.

## Part E — Routine ops

**Tail logs:**

```bash
az containerapp logs show --name $APP_NAME --resource-group $RG --tail 200 --follow
```

**Roll back to a previous revision:**

```bash
az containerapp revision list --name $APP_NAME --resource-group $RG -o table
az containerapp revision activate --name $APP_NAME --resource-group $RG \
  --revision <revision-name>
```

**Manually trigger a cron** (for testing or backfill):

```bash
CRON_SECRET=$(az containerapp secret show --name $APP_NAME --resource-group $RG \
  --secret-name cron-secret --query value -o tsv)
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://$APP_FQDN/api/cron/sync-videos
```

Cron paths (the schedules live in `docker/crontab.template`):

- `/api/cron/process-scheduled` — every 5 min
- `/api/cron/sync-videos` — every 15 min (near window: T-2…T+1)
- `/api/cron/sync-videos?range=far` — every 6 h (T+2…T+7)
- `/api/cron/check-pv` — every 6 h
- `/api/cron/send-transcript-notifications` — every 5 min
- `/api/cron/realign` — hourly
- `/api/cron/sweep-stuck-pipelines` — every 15 min

**Run a one-off admin script** (e.g. `pnpm sync-videos` from your laptop):
still works the same way — scripts read `.env` locally and talk to the same
Postgres. They aren't deployed to Azure (intentionally — kept out of the
image via `.dockerignore`).

**Cost watch:** Container Apps idle-pinned at 1 replica with 1 vCPU / 2 GiB
≈ ~$40–60/month. ACR Basic is ~$5/month. Postgres + the AI APIs dominate
the bill anyway.

## Part F — Post-deploy verification

1. `https://<APP_FQDN>/api/health` returns `{"status":"ok"}`.
2. After 5 min, logs should show the curl output from the cron daemon —
   one line per tick per route, typically including the HTTP status. The
   route handlers themselves log structured `[cron:sync-videos]` etc. lines
   inside `withJobLock`, which appear via Node's stdout.
3. `psql "$DATABASE_URL"` then
   `SELECT * FROM pg_locks WHERE locktype = 'advisory' AND classid IN (1, 2);`
   should show active locks while a job runs.
4. Trigger a transcription end-to-end (sign in, click Transcribe on a recent
   video) and verify the pipeline completes — confirms `after()` survives on
   the long-lived container.
5. Force a deploy mid-pipeline (push a no-op commit while a transcription is
   running): the next `[cron:sweep-stuck-pipelines]` tick within 15 min
   should flip the killed row to `error`.
6. Check `sent_transcript_notifications` after a notification cron tick: each
   `(user, transcript)` appears at most once even if you also hit
   `/api/cron/send-transcript-notifications` manually from curl during the
   tick.

## Adding a new cron job later

1. Create `lib/cron/<job>.ts` exporting `runXxx()`. Wrap the body in
   `withJobLock("<job-name>", ...)` from `lib/db.ts`.
2. Create `app/api/cron/<job>/route.ts` as a thin auth-gated wrapper calling
   `runXxx()` (mirror any of the existing `app/api/cron/*/route.ts` files —
   they all share the same shape).
3. Add a line to `docker/crontab.template`:
   ```
   <schedule> root curl -fsSL -H "Authorization: Bearer ${CRON_SECRET}" http://127.0.0.1:3000/api/cron/<job>
   ```

That's it — Azure picks up the new cron on next deploy. Vercel previews
expose the HTTP route (auth-gated) but won't fire it automatically.
