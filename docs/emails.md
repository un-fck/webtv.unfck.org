# Outbound Email: un.org Shared Mailbox via Azure Logic App

All mail the app sends — magic-link sign-in and transcript-ready
notifications — goes out from the **`transcripts-app-noreply@un.org`** shared
mailbox, delivered through an **Azure Logic App relay**. This doc covers why,
how the mailbox is administered, how the Logic App is built and secured, and how
the app switches between the relay and a plain-SMTP fallback.

## Why this exists (motivation)

Sign-in links were landing in recipients' **spam folders**, where they were also
delayed — often past the token lifetime. The root cause was the sending
identity, not the content: mail sent from any non-un.org domain cannot align
SPF/DKIM/DMARC on `un.org`, and Microsoft 365's anti-impersonation filtering
flags a non-un.org sender whose display name carries "UN" branding.

The durable fix is to send from a **real un.org mailbox**, so SPF/DKIM/DMARC
align on `un.org` natively. Direct SMTP into the UN's M365 tenant is gated
(a months-long Graph app-registration review), and Power Automate is blocked by
the tenant DLP policy (it disallows the connectors we'd need). An **Azure Logic
App** runs in our own Azure subscription under Azure RBAC, outside M365's Power
Platform governance, and its Office 365 connector can send from a shared
mailbox. That's the path here.

**Validated result** (external send test): `dkim=pass header.d=un.org`,
`spf=pass smtp.mailfrom=…@un.org`, `dmarc=pass (policy=quarantine)` — all aligned
on un.org — and a strongly-ham spam score → inbox. See "Validating
deliverability" below.

## Architecture

```
Next.js app (Azure App Service, container)
  lib/email/transport.ts  deliver({to,subject,html,text})
        │
        │  HTTPS POST  {auth, to, subject, html, text}
        ▼
Azure Logic App relay  (Consumption)
  HTTP trigger → Condition (auth == secret?) → Send from shared mailbox (V2) → Response
        │
        ▼
Office 365 Outlook connector, authenticated as an SG-SendAs member
        │  sends AS
        ▼
  transcripts-app-noreply@un.org  →  recipient  (aligned SPF/DKIM/DMARC on un.org)
```

The app **renders** every email (full HTML + plain text, all six locales); the
Logic App is a dumb authenticated relay that sends the rendered message
verbatim. Adding a new email type is therefore an app-only change — the Logic
App never needs editing.

The Logic App is a Consumption-plan workflow in the project's Azure subscription
and resource group. The sending web app is the App Service that hosts the
Next.js app; its outbound IPs feed the inbound allowlist (see IP allowlisting).

## The shared mailbox

`transcripts-app-noreply@un.org` is a **Unite Mail shared mailbox** (free tier —
50 GB, no archiving; the app never stores mail, so the free tier is correct).

### Requesting one (iNeed / Unite Self Service)

1. In **Unite Self Service** (iNeed), submit the catalogue item **"Unite Mail -
   Shared Mailbox - Create Request"**.
2. Choose the **free** tier (the paid tier only adds capacity + archiving, which
   an outbound-only mailbox doesn't need).
3. Provisioning creates three security groups used to grant access:
   - `SG-FullAccess-<mailbox name>`
   - `SG-SendAs-<mailbox name>`
   - `SG-SendOnBehalf-<mailbox name>`

### Administering it (the admin ≠ member gotcha)

Being named a **Shared Mailbox Administrator** grants the right to *manage
membership* of those three SGs — it does **not** itself grant mailbox access.
After provisioning you must add yourself (and anyone else) to the groups:

- **`SG-FullAccess`** — needed to open the mailbox in Outlook / OWA. Without it,
  "Open another mailbox" in OWA returns `AccessDeniedException`
  (`StoreObjects.AccessDeniedException`). This is *not* a wrong-address error —
  it means you're not a Full Access member yet.
- **`SG-SendAs`** — needed for the Logic App's "send as the mailbox" to work.
  **This is the one that matters for the relay.** Send As alone does *not*
  auto-mount the mailbox in Outlook, so a working relay can coexist with an
  invisible-in-Outlook mailbox — that's expected.
- **`SG-SendOnBehalf`** — skip. It injects an "on behalf of <person>" line that
  looks wrong on a no-reply sign-in email.

Manage membership in **Unite Self Service → Email Management → My Distribution
Lists**. The page is **search-first**: nothing loads until you click the 🔍
Search icon (submit empty/wildcard to list the SGs you administer — identified
by the "Parent SMB" column). Add members via the Members panel; propagation to
Exchange can take ~15–60 min (auto-mapping in Outlook up to ~24 h).

If the SGs never appear despite the ticket naming you as admin, the admin
assignment didn't propagate — reply on the ticket (or ask the Service Desk to add
you directly to `SG-FullAccess` and `SG-SendAs`).

### Sensitivity labels (MIP)

The tenant auto-applies a Microsoft Information Protection sensitivity label to
outbound mail. On automated (connector) sends there's no interactive prompt, so
a **default label is applied automatically**. Ours is **non-enforcing**
(`ContentBits=0`): it's a classification tag only, mail delivers as plain
readable `multipart/alternative`, DKIM signs the real body. **No action needed.**

The one label to avoid is **"Strictly Confidential – Additional Protection"**
(the 🔒 variant) — it applies encryption/rights-management (OME), so external
recipients would get a "protected message, sign in to view" wrapper instead of a
clickable link, breaking sign-in. Our automated sends do not get that label. If
you ever manually send *from the shared mailbox* for testing and are prompted,
pick **Public** (sign-in links and notifications carry nothing sensitive) — never
the Additional-Protection one.

> Don't confuse the Outlook connector's **"Sensitivity"** advanced parameter
> (the legacy MAPI Normal/Personal/Private/Confidential flag) with MIP labels —
> setting it does nothing to the MIP label and isn't needed.

## The Logic App

Consumption plan (pay-per-execution, effectively $0 at this volume). When
creating it, pick an **allowed region** — the subscription has a
`DenyNotAllowedLocations` policy; check `az policy assignment list` (or Portal →
Policy → Assignments) for the allowed set before creating.

### Workflow

**1. Trigger — "When a HTTP request is received."** Request Body JSON Schema:

```json
{
  "type": "object",
  "properties": {
    "auth":    { "type": "string" },
    "to":      { "type": "string" },
    "subject": { "type": "string" },
    "html":    { "type": "string" },
    "text":    { "type": "string" }
  },
  "required": ["auth", "to", "subject", "html"]
}
```

Saving generates the trigger URL (with a `sig=` SAS token) — this is
`EMAIL_RELAY_URL`. Treat the whole URL as a secret.

**2. Secret gate — Condition (first action).**
`triggerBody()?['auth']` **is equal to** the shared secret.
- **True** branch → send + Response 200.
- **False** branch → **Response**, status `401`.

The secret is passed in the JSON **body** (`auth`), not an HTTP header,
deliberately: header-name casing gets normalized by Node's `fetch` and Azure's
front end, so a case-sensitive header lookup in the workflow can silently never
match. JSON keys keep their exact case.

**3. Send — "Send an email from a shared mailbox (V2)"** (Office 365 Outlook).
- Original Mailbox Address: `transcripts-app-noreply@un.org`
- To: `@{triggerBody()?['to']}`
- Subject: `@{triggerBody()?['subject']}`
- Body: `@{triggerBody()?['html']}`
- Importance: **Normal** (see gotcha below)

**4. Response — status `200`** after the send. This makes the call synchronous:
the app learns success (200), bad secret (401), or — if the send action itself
fails before a Response is reached — a platform `502`. `deliver()` treats any
non-2xx as a failure.

### Two build gotchas (already fixed in the live workflow)

- **Rich-text Body wrapper.** The newer designer's Body is a rich-text editor
  that wraps an inserted dynamic token in `<p class="editor-paragraph">…</p>`.
  For our full `<!DOCTYPE html>…<table>…` emails that's invalid and mis-renders.
  Fix: in **Code view**, set the send action's `Body` to the bare
  `@{triggerBody()?['html']}` (no wrapper) so the rendered HTML passes through
  untouched. (There is no "Is HTML" toggle in this connector version; the Body
  is HTML by default.)
- **Importance defaulted to Low.** The first build sent `Importance: low` /
  `X-Priority: 5` (a mild spam signal and a visible low-priority marker). Set
  Importance to **Normal** (Normal omits the header entirely).

## Security

The relay can send mail *as a real un.org address*, so it's a credential worth
protecting in depth.

1. **Shared secret (`auth`).** Checked as the first workflow action; mismatch →
   401, no send. Generate with `openssl rand -hex 32`. This is
   `EMAIL_RELAY_SECRET` in the app. (Replay is the only residual risk, and
   "replay = send the same email again" is harmless and rate-bounded.)

2. **SAS in the trigger URL.** A second, independent secret. Rotatable in the
   portal by regenerating the trigger's access key, independently of the `auth`
   secret.

3. **Secure Inputs / Outputs.** Enabled on the **trigger** (hides the incoming
   `auth` + the token-bearing body) and on the **Send** action (hides the HTML
   body, which contains the magic-link **token**). Without this, Run history
   stores every token in plaintext for anyone with resource read access. Set via
   each action's ⋯ → Settings.

4. **Inbound IP allowlist.** Workflow settings → Access control configuration →
   **Allowed inbound IP addresses → Specific IP ranges**, set to the App
   Service's outbound IPs (one `a.b.c.d/32` per row). Get them — use the *full
   possible set*, not just the currently-active ones:

   ```bash
   az webapp show -g <resource-group> -n <web-app> \
     --query possibleOutboundIpAddresses -o tsv \
     | tr ',' '\n' | sed 's|$|/32|'
   ```

   Caveats:
   - **Use `possibleOutboundIpAddresses`** (not `outboundIpAddresses`) — App
     Service rotates among the full set; allowlisting only the active ones means
     a scale event silently drops mail.
   - The set is stable for the life of the App Service **Plan** but changes if
     you move to a **different pricing tier** or region — **re-pull and update
     the allowlist after any plan-tier change.**
   - IP-rejected calls are refused *before* a run is created, so they're
     **invisible in Run history** and won't fire the Runs-Failed alert. If the
     IPs rotate, sign-in breaks silently — so also watch app-side `deliver()`
     failures (the `fetch` gets a 403).
   - This is defense-in-depth; the `auth` secret is the primary control. The
     zero-maintenance long-term alternative is a NAT Gateway giving App Service a
     single static egress IP to allowlist once.

5. **Monitoring.** Azure Monitor alerts on the Logic App:
   - **Runs Failed ≥ 1** → catches send errors and a broken connection token.
   - **Triggers Fired** volume spike → catches abuse if URL + secret leak.

### Durability: the connection is bound to a person

The Office 365 connection authenticates as a **human** `SG-SendAs` member (the
shared mailbox has no interactive login). Its OAuth token refreshes silently
until a password reset / MFA re-enrollment / conditional-access change breaks it;
then sends fail and only Run history shows it. Mitigate:

- Keep **all mailbox admins in `SG-SendAs`** so anyone can re-authenticate the
  connection.
- Rely on the **Runs-Failed alert** to surface a broken token quickly.
- To re-auth: open the connection in the Logic App and sign in again.

## App integration

### The transport layer — `lib/email/transport.ts`

A single `deliver({ to, subject, html, text })` is the only send path. It picks
the transport from env at call time:

- **`EMAIL_RELAY_URL` set → Logic App relay.** POSTs
  `{ ...msg, auth: EMAIL_RELAY_SECRET }` as JSON, 10 s timeout, throws on any
  non-2xx. If `EMAIL_RELAY_URL` is set but `EMAIL_RELAY_SECRET` is missing, it
  **throws rather than send unauthenticated**. The `from` is fixed by the Logic
  App, so callers never set it.
- **`EMAIL_RELAY_URL` unset → SMTP fallback.** nodemailer via the `SMTP_*` vars,
  with `requireTLS: true` (mandatory STARTTLS on the submission port — fail
  rather than transmit a token in cleartext if a network attacker strips the TLS
  upgrade).

### Call sites

Both public send functions call `deliver()` — nothing else sends mail:

- `lib/auth/mail.ts` → `sendMagicLink()` (rendered per-locale from the
  `email.magicLink` catalog; `POST /api/auth/request-link`).
- `lib/notifications/mail.ts` → `sendTranscriptReady()` (transcript-ready
  notification; `send-transcript-notifications` cron).

`SITE_TITLE` is exported from `lib/email/transport.ts`; the SMTP transporter and
`mailFrom` are private to that module.

### Environment variables

| Var                  | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `EMAIL_RELAY_URL`    | Logic App HTTP-trigger URL (contains the SAS `sig` — **secret**). Set → relay path. Unset → SMTP. |
| `EMAIL_RELAY_SECRET` | Value sent as the JSON `auth` field; checked by the Logic App. `openssl rand -hex 32`. |
| `SMTP_HOST`          | SMTP fallback host.                                                      |
| `SMTP_PORT`          | SMTP fallback port (default `587`).                                      |
| `SMTP_USER` / `SMTP_PASS` | SMTP fallback credentials.                                          |
| `SMTP_FROM`          | SMTP fallback From address (falls back to `SMTP_USER`).                  |

**Switching / rollback:** the relay is on when `EMAIL_RELAY_URL` is set. To roll
back to SMTP instantly, **unset `EMAIL_RELAY_URL`** — no code change, no deploy
logic beyond the env var. In production both are set in the App Service config;
the `SMTP_*` vars stay in place as the rollback path.

## Validating deliverability

**Internal sends don't count.** un.org → un.org stays inside the Exchange Online
tenant and never crosses a public SMTP boundary, so SPF/DKIM/DMARC are never
evaluated (`AuthAs: Internal`, `dkim=none; dmarc=none` — expected, meaningless).
Always test to an **external** recipient (a personal address on a different
provider).

A pass looks like this at the receiver:

```
Authentication-Results:
  dkim=pass  header.d=un.org header.s=selector1;
  spf=pass   smtp.mailfrom=transcripts-app-noreply@un.org;
  dmarc=pass (policy=quarantine) header.from=un.org
```

All three aligned on `un.org`; un.org publishes `p=quarantine`, which we satisfy.
Confirm inbox (not junk) placement and that the mail is **not** wrapped in an
encryption/"protected message" layer (the MIP-label check above).

Test the Logic App alone with `curl` before wiring the app:

```bash
curl -X POST '<EMAIL_RELAY_URL>' -H 'Content-Type: application/json' \
  -d '{"auth":"<EMAIL_RELAY_SECRET>","to":"you@example.com","subject":"Relay test","html":"<b>hi</b>","text":"hi"}'
# wrong auth → 401, no send; from an allowlisted IP + correct auth → 200 + email
```

Then test the **real templates** end-to-end by setting `EMAIL_RELAY_URL` /
`EMAIL_RELAY_SECRET` in `.env.local`, running `pnpm dev`, and triggering a real
sign-in — this exercises the full `deliver()` path with the actual rendered HTML.

## Runbook

- **Rotate the `auth` secret:** update the Logic App Condition's compare value
  and `EMAIL_RELAY_SECRET` together.
- **Rotate the URL:** regenerate the trigger SAS key in the portal, update
  `EMAIL_RELAY_URL`.
- **Connection token broke (sends failing, Runs-Failed alert):** re-authenticate
  the Office 365 connection in the Logic App (any `SG-SendAs` member).
- **After an App Service plan-tier change:** re-pull
  `possibleOutboundIpAddresses` and update the inbound IP allowlist.
- **Add a new email type:** add a render function that calls `deliver()`; no
  Logic App change. Remember all six locale catalogs for any new user-visible
  strings.
- **Emergency: bypass the relay:** unset `EMAIL_RELAY_URL` → falls back to SMTP.
