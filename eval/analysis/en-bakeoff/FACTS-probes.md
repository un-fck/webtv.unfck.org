# Established facts — measured, not read

Everything here was produced by hitting the live APIs from this machine on **2026-07-28**, or by
querying billing for our own subscription. Raw evidence in
`/Volumes/SSDAStorage/un-en-bakeoff/logs/`. Documentation claims are marked as such and are
**not** treated as facts.

## 1. Cost — the §14.5 procurement math was wrong

§14.5 recorded `azure-llm-speech` as *"~gpt-4o class … ~$0 marginal … already procured"*, and
AssemblyAI at $0.23/hr. Both numbers are wrong.

| | source | rate |
| --- | --- | ---: |
| Azure fast transcription / LLM Speech — **list** | Azure Retail Prices API, `productName eq 'Azure Speech'`, northeurope, USD | **$0.36 / audio-hour** |
| Azure — **what we are actually charged** | Cost Management `query` on subscription `EOSG-DEV`, 2026-06-01→07-28 | **$0.306 / audio-hour** |
| AssemblyAI Universal-3.5 Pro (async) | assemblyai.com/pricing | **$0.21 / audio-hour** |

**Azure LLM Speech is not free, and it is not cheaper.** It is **1.46× AssemblyAI's price** at
our discounted rate, 1.71× at list.

Evidence for the effective rate — the invoice for our own Speech resource:

```
Fast Transcription Speech To Text   qty = 227.914444 h   cost = $69.741820   → $0.30600/h
S1 Speech Translation               qty =   0.680278 h   cost = $ 1.448992   → $2.13000/h
```

Both meters come out at exactly **0.8500 / 0.8520 × the retail list price**, i.e. a uniform
15% agreement discount. Two independent meters agreeing to 4 decimal places is what makes this
a measurement rather than a guess.

$69.74 has already been spent on this resource — the §14/§15 sweeps. So "already procured"
means *the bill goes to the UN's Azure subscription instead of the user's credit card*. That is
a real and possibly decisive benefit, but it is **not** a cost saving; it is 1.46× the cost,
paid by someone else.

### The meter question, settled

The API returns the billed quantity in a response header, which lets us tie request → meter
directly rather than inferring:

| request | `csp-billing-usage` header |
| --- | --- |
| enhanced mode, default model | `CognitiveServices.SpeechServices.LLMSpeechTranscribe=82` |
| classic fast transcription | `CognitiveServices.SpeechServices.BatchSpeechtoTextSync=82` |
| `enhancedMode.model=mai-transcribe-1.5` | `CognitiveServices.SpeechServices.LLMSpeechMAITranscribe1=82` |

`LLMSpeechTranscribe` does **not** appear in the public retail price catalogue — so the doc
claim "LLM Speech shares pricing with Fast Transcription" could not be verified from the price
list. It is confirmed from the other end instead: the only Speech usage on this resource is our
own eval sweeps, and it all landed on the **`Fast Transcription Speech To Text`** line item.
So enhanced mode does bill to the fast-transcription meter — verified against an invoice.

**Billing unit = seconds of audio, rounded up.** 81.319 s → `82`; 274.416 s → `275`. Billing is
on *audio duration*, not processing time, tokens, or bytes — so it is fully predictable in
advance and identical between the two vendors' units.

## 2. Model identity and pinning

- The default enhanced-mode model is **unnamed and unpinnable**. `enhancedMode.model` accepts
  only `mai-transcribe-1.5` (and `mai-transcribe-1`); `"default"`, `"latest"`, `"speech-llm"`
  are all rejected with *"Requested MAI transcription model 'X' is not supported."*
- **Only two api-versions answer at all**: `2025-10-15` (200) and `2024-11-15` (200).
  `2025-05-15-preview`, `2026-01-15-preview` and a nonsense version all 404. So there is no
  preview/pinned channel to hide on — and note the two live versions **do not produce identical
  segmentation**: on the same 81 s file, `2024-11-15` returned **9 phrases** and `2025-10-15`
  returned **8**, with identical text (767 chars). Same words, different segmentation.
- **Serving region is `North Europe`** (`x-ms-region` header), matching the resource. No
  evidence of out-of-region processing.
- Our resource is kind **`AIServices`** (Foundry), not classic `SpeechServices`. This is the
  likely explanation for the hostname behaviour recorded in `azure-llm-speech.ts` (works on
  `services.ai.azure.com`, 400 on `cognitiveservices.azure.com`) — Microsoft's docs show the
  `cognitiveservices` hostname because they assume a classic Speech resource. Our note is
  probably right *for our resource kind*; it is not a universal vendor fact.

## 3. Entity biasing — the §15.5a blocker is confirmed, and worse than documented

§15.5a found azure-llm renders "UN80" correctly 6 times and mangles it ~50 times into "UNAT" /
"UNAD". The fix would be keyterm biasing. It is not available:

| attempt | result |
| --- | --- |
| `enhancedMode.phraseList: [...]` | HTTP 200 — but output **byte-identical** to no phrase list (767 chars, 8 phrases). Accepted and ignored. |
| top-level `phraseList: [...]` | **HTTP 400** `"Definition": ["Invalid JSON format."]` |
| `enhancedMode.prompt: "…Key terms: UN80 Initiative."` | **HTTP 400** `"Definition": ["Invalid JSON format."]` |

The last one matters most. Microsoft's *documented* substitute for keyterm biasing on enhanced
mode is exactly this `prompt` field — and the live API at `2025-10-15` rejects it as a schema
violation. **On our endpoint there is currently no working way to tell the model that "UN80" is
a word.**

By contrast, AssemblyAI's transcript object exposes `keyterms_prompt`, `word_boost`,
`boost_param`, `prompt` and `custom_spelling` as first-class fields (observed in a live
response). Whether they *fix* UN80 is a separate question — but the mechanism exists on one
vendor and not the other.

## 4. Other measured API facts

- **`confidence` is `0` on every phrase** — confirmed on live output, matching the docs.
- **`maxSpeakers` caps at 35**, not 20: `36` → `400 "Max speakers should be less than or equal
  to 35."` Our production config sends **20**, so we are voluntarily capping below the
  ceiling on large open debates. Cheap thing to fix.
- **Azure will not accept a URL.** `contentUrls` → `400 "Audio data must be provided."`;
  `audioUrl` → `400 RecordingsUriNotFound`. Multipart upload is the only path, so the upload
  leg is unavoidable and confound C2 stands.
- **Enhanced mode is deterministic** on repeat: two identical requests returned byte-identical
  text (767 chars) with different wall-clock (2480 / 2439 ms) — so it is recomputing, not
  serving a cache, and repeat runs measure timing noise rather than model sampling noise.
- **`mai-transcribe-1.5` runs on our resource** and is *nameable and pinnable* — the one thing
  the default model cannot offer. But on the same clip it returned **1 phrase, no word
  timestamps, no diarization** regardless of whether `diarization` was requested, confirming the
  documented limitation. It also ignored `transcribeStyle: "verbatim"` and `phraseList`
  (byte-identical 794-char output in all three variants). It is faster (1.5–1.9 s vs 2.4–3.4 s).

## 5. AssemblyAI, measured

- `speech_model_used: "universal-3-5-pro"` — confirmed the Pro model actually served the
  English request, not a silent fallback to universal-2.
- `/v2/upload` works and is fast (636 KB in 660 ms), so both arms can be fed **the identical
  local file**, which is what makes a matched comparison possible.
- On the 81 s clip: upload 660 ms + job 4 829 ms at 1 s polling. Azure did the same clip in
  ~3 s total including upload.
