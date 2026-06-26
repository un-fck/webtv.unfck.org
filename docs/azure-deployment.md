# Azure deployment & operations

Production runs on **Azure App Service** (Linux container). The codebase still
builds on Vercel too, but Vercel ignores the `Dockerfile`, fires no crons, and
is not the live site — the public site (transcripts.un.org) is the Azure app.

## Topology

One container image runs the Next.js standalone server (`node server.js`) **plus
a system `cron` sidecar** that `curl`s the `/api/cron/*` routes on localhost
(Azure has no platform cron). See `Dockerfile`, `docker/entrypoint.sh`,
`docker/crontab.template`. Everything — web pages, API routes, the cron sidecar,
and the **in-process transcription worker** — runs in the _same Node process_ on
each instance. There is no separate worker tier (yet).

Cron sidecar fires (must match `docker/crontab.template`): `process-scheduled`
(5 min), `sync-videos` near (15 min) / far (6 h), `check-pv` (6 h),
`send-transcript-notifications` (5 min), `realign` (hourly), `liveness-sweep`
(15 min). All authenticate `Authorization: Bearer ${CRON_SECRET}`.

## Resources (all in `eastus2`)

| Resource                 | Name                                     | Resource group   | Notes                                                             |
| ------------------------ | ---------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| App Service              | `un-transcripts`                         | `rg-transcripts` | Linux container, `WEBSITES_PORT=3000`, health probe `/api/health` |
| App Service plan         | `transcripts-app-service-plan`           | `rg-transcripts` | Premium v3 (P1v3 = 2 vCPU / 8 GB)                                 |
| Autoscale                | `transcripts-autoscale`                  | `rg-transcripts` | out @ CPU>65% / mem>75%, in @ CPU<30%                             |
| Container registry       | `transcripts` (`transcripts.azurecr.io`) | `rg-transcripts` | image `transcripts/transcripts:<git-sha>`                         |
| Postgres                 | `un80-dev-pg`                            | `UN80-DEV`       | **shared** flexible server (PG16) — see warning below             |
| Key Vault (subscription) | `kv-admdpome…`                           | `UN80-DEV`       | not yet wired into `un-transcripts`                               |

## Deploy

GitHub Actions `.github/workflows/main_un-transcripts.yml` on push to `main`:
build the Docker image → push to ACR → deploy to the App Service **Production**
slot. (CI currently authenticates with ACR admin creds + a publish profile;
migrating to managed identity / OIDC is a tracked hardening item.)

## Operating it from the CLI

```bash
# Status
az appservice plan show -g rg-transcripts -n transcripts-app-service-plan \
  --query "{sku:sku.name, instances:sku.capacity}" -o json
az webapp list-instances -g rg-transcripts -n un-transcripts --query "length(@)" -o tsv
az monitor autoscale show -g rg-transcripts -n transcripts-autoscale \
  --query "{min:profiles[0].capacity.minimum, max:profiles[0].capacity.maximum}" -o json

# Scale OUT (the right lever — see below). Floor for a known surge:
az monitor autoscale update -g rg-transcripts -n transcripts-autoscale --min-count 4 --count 4
# Raise the ceiling (costs nothing until used):
az monitor autoscale update -g rg-transcripts -n transcripts-autoscale --max-count 10
# Back down afterwards:
az monitor autoscale update -g rg-transcripts -n transcripts-autoscale --min-count 2 --count 2

# Always On (no cold starts; required for the cron sidecar to stay warm)
az webapp config set -g rg-transcripts -n un-transcripts --always-on true
```

## Scale OUT, not UP

The app is a **single Node process per instance**, so it can't use more than
~1–1.5 cores no matter the SKU. **CPU is the constraint** under load (not
memory). Add _instances_ (autoscale), don't buy a bigger SKU — a P2v3/P3v3 would
waste cores and the extra RAM. The DB has plenty of headroom, so the read path
scales out cheaply.

## Metric gotchas (these cost real debugging time — read before trusting a chart)

- **Memory: ignore plan `MemoryPercentage`.** It's a host-level metric and is
  misleading on Linux App Service (it has read ~96% while the app used <0.5 GB).
  Use the **site** metric `MemoryWorkingSet` (bytes) for true per-app memory.
- **`AverageResponseTime`: use the `Average` aggregation only.** It's a
  pre-averaged metric; its `Maximum` aggregation is meaningless (comes out
  _below_ the average). True tail latency (p95/p99) is not in platform metrics —
  it needs Application Insights (not currently configured).
- **`connections_failed` on the DB** is a steady low trickle of internet
  scanners hitting the permissive dev network rule — **not** app pool
  exhaustion. Cross-check against `active_connections` (peak ~65 vs an ~859
  ceiling) before concluding the DB is stressed.

## Monitoring notebooks

Both pull metrics through the **authenticated `az` CLI** (no service principal)
and need `uv sync` (matplotlib/pandas). Run with `uv run jupyter lab`.

- `analysis/live_monitoring.ipynb` — real-time pulse: CPU, real app memory,
  traffic / 5xx / latency, and a traffic-light health snapshot.
- `analysis/capacity_advisor.ipynb` — **run-all → a verdict** on whether to
  change the setup, with the exact `az` command per recommendation. Separates a
  short "act-now" window (so a resolved incident doesn't trigger false reds)
  from a 24 h context window. Uses real memory; not the host metric.
