# Live / Streaming Speech Models for UN Meeting Interpretation — Landscape Report

Research date: 2026-07-21. Scope, per a mid-research refinement: **text-output systems only** —
live streaming ASR (Category A) and live streaming speech-to-TEXT translation (Category B).
Speech-to-speech (audio-out) interpretation products (Category C) are documented at one line each,
no depth. Six UN languages in scope: English, French, Spanish, Arabic, Chinese (Mandarin), Russian,
plus arbitrary "floor" languages.

Every vendor is marked **KEY-HELD** or **NEEDS-KEY**. We currently hold API keys for: AssemblyAI,
Azure AI Speech, Azure OpenAI, Cohere, DashScope/Alibaba, Deepgram, ElevenLabs, Gemini, Google Cloud,
Groq, Mistral, OpenAI, Soniox, Speechmatics. Everything else needs a new key or self-hosted compute.

Gaps from time-boxed research are marked **NOT RESEARCHED** rather than silently omitted. Vendor
marketing superlatives are explicitly distinguished from documented, sourced numbers throughout —
look for the ⚠ flag.

---

## 1. Summary table — Live streaming ASR (Category A)

| Vendor | Model | Documented latency | ar / zh / ru streaming | Diarization (streaming) | Price (streaming) | Protocol | Key |
|---|---|---|---|---|---|---|---|
| **Soniox** | real-time STT | qualitative "low latency" only, no ms figure | ✅ / ✅ / ✅ | ✅ bundled free | **$0.12/hr** | WebSocket `wss://stt-rt.soniox.com/transcribe-websocket` | **KEY-HELD** |
| **Mistral** | Voxtral Mini Realtime 2602 | **sub-200ms configurable**, documented WER-vs-delay curve | ✅ / ✅ / ✅ (13 langs total) | ❌ explicitly incompatible w/ realtime | **$0.36/hr** ($0.006/min) | WebSocket `wss://api.mistral.ai` | **KEY-HELD** |
| **Alibaba/DashScope** | Fun-ASR realtime | not spec'd (⚠"hundred-ms level" press claim) | ✅ / ✅ / ✅ (30 langs) | ❌ (batch-only) | **not found on official page** | WebSocket, Beijing + Singapore | **KEY-HELD** |
| **Alibaba/DashScope** | Paraformer realtime | not spec'd | ❌ / ✅ / ✅ (8 langs, **no Arabic, no Spanish**) | ❌ | ⚠~$0.12/hr (3rd-party, unverified) | WebSocket, **Beijing region only** | **KEY-HELD**, disqualified by coverage |
| **AssemblyAI** | Universal-3.5 Pro Streaming | **sub-300ms** documented; vendor blog 307ms median | ✅ / ✅ / **❌ no Russian in any streaming model** | ✅ (`speaker_label`) | **$0.15/hr flat** (idle time billed) | WebSocket `wss://streaming.assemblyai.com/v3/ws` | **KEY-HELD**, RU gap |
| **Deepgram** | Nova-3 (mono/multi) | no first-party ms; ⚠competitor bench claims 516ms | ✅ / ✅ / ✅ | ✅ (+150–300ms) | $0.0048–0.0058/min ≈ **$0.29–0.35/hr** | WebSocket `wss://api.deepgram.com/v1/listen` | **KEY-HELD** |
| **Deepgram** | Flux (en / 10-lang multi) | Flux quickstart: **~260ms** end-of-turn; blog: <300ms median, p95 1.5s | en confirmed; **ar/zh/ru in the 10-lang multi list unconfirmed** | not documented | $0.0065–0.0078/min ≈ **$0.39–0.47/hr** | WebSocket `wss://api.deepgram.com/v2/listen` | **KEY-HELD**, coverage TBC |
| **Azure AI Speech** | Speech SDK real-time STT | not documented with rigor | ✅ / ✅ / ✅ | ✅ GA, up to 35 speakers | ⚠official page unfetchable; 3rd-party ~$1/hr + $0.30/hr per feature (unverified) | **SDK-only, no public raw WebSocket** | **KEY-HELD** |
| **Google Cloud** | STT v2 / Chirp 3 | not documented | ✅ / ✅ / ✅ (batch-vs-streaming split unclear per-language) | ✅ | ⚠official pricing page failed to render; unconfirmed | **gRPC only**, no WebSocket | **KEY-HELD** |
| **OpenAI** | `gpt-realtime-whisper` | not published; tunable `delay: minimal…xhigh` knob, no ms values given | **not documented for the streaming model specifically** (batch Whisper family confirms all 3) | ❌ (batch-only `gpt-4o-transcribe-diarize`) | **$0.017/min = $1.02/hr** — most expensive in this table | WebSocket `wss://api.openai.com/v1/realtime`, `session.type=transcription` | **KEY-HELD** |
| **Google Gemini** | Live API (`gemini-3.1-flash-live-preview`) transcription side-channel | no current figure (600ms cited elsewhere is stale/2.0-era) | ✅ / ✅ / ✅ (97 langs total — broadest here) | ❌ | audio-in $3/1M tok ≈ **$0.30/hr** | WebSocket, `google-genai` SDK | **KEY-HELD**, Preview/no-SLA |
| **ElevenLabs** | Scribe v2 Realtime | **~150ms** (marketing headline, no SLA breakdown) | likely (90+ langs) but **not enumerated specifically for realtime** | ❌ explicitly not supported live | **$0.39/hr** | WebSocket, single-use tokens | **KEY-HELD** |
| **Groq** | whisper-large-v3 / turbo | **N/A — batch only**, confirmed in Groq's own ASR Model Guide ("no streaming support") | asserted "99+", never enumerated; ar/zh/ru never named | ❌ | $0.04–0.111/hr (batch) | REST multipart upload, `/audio/transcriptions` | **KEY-HELD**, not a streaming candidate |
| **NVIDIA** | Nemotron ASR Streaming (NIM) | **80/160/560/1120ms** — documented chunk latency, lowest in report | ✅ / ✅(2nd tier) / ✅ (40 locales) | ❌ (diarizer only on a different, non-streaming-complete model) | no public production price; self-host GPU (6–15GB VRAM) | gRPC `:50051` (hosted eval endpoint has no SLA) | **NEEDS-KEY** / self-host |
| **AWS Transcribe** | streaming | not documented; 50–200ms chunk guidance | ✅ / ✅ / ✅ | ✅ up to 30 speakers | **$0.01/min = $0.60/hr** | WebSocket + HTTP/2, SigV4 | **NEEDS-KEY** |
| **Gladia** | live/v2 | ⚠"sub-300ms" marketing, unverified | ✅ / ✅ / ✅ | ❌ (no param found in live API) | $0.25–0.75/hr | WebSocket, token-scoped | **NEEDS-KEY** |
| **Rev.ai** | streaming | not documented | ⚠uncertain — Arabic shown as Async-only in their own table | speaker-switch only, not full diarization | unclear which tier applies | WebSocket | **NEEDS-KEY** |
| **WhisperLive** (OSS, Collabora) | faster-whisper/TensorRT/OpenVINO | not published, needs own benchmark | ✅ / ✅ / ✅ (full Whisper set) | **✅ — only OSS/commercial option with built-in real-time diarization** (pyannote, v0.9.0) | self-host, MIT | WebSocket | **NEEDS-KEY** (self-host) |
| **SimulStreaming** (OSS, ufal) | successor to whisper-streaming | won IWSLT 2025 SimulST track; whisper-streaming itself documented 3.3s | ✅ (99 Whisper langs) + translation to 35 EuroLLM targets | ❌ | self-host, MIT | local/library | **NEEDS-KEY** (self-host) |
| **Moonshine** (OSS, Useful Sensors) | Tiny/Small/Medium streaming | **34/73/107ms** (vendor-reported, MacBook Pro) | ar/zh at smaller "Base" tier only; **Russian ASR absent entirely** | ❌ | self-host, MIT, no key/account at all | on-device | disqualified — no Russian |
| **Kyutai STT** (OSS) | stt-1b-en_fr / stt-2.6b-en | **500ms** / 2.5s documented | **❌ — English/French only** | ❌ | self-host, MIT/Apache-2.0 code, CC-BY weights | local/library | disqualified — no ar/zh/ru |
| **Ultravox Realtime** (Fixie.ai) | hosted | not published (qualitative only) | ✅ / ✅ / ✅ (26 langs, hosted product) | ❌ | free tier 5¢/min incl. TTS; Pro $100/mo | hosted API | **NEEDS-KEY** |

**Excluded outright:** Fireworks AI — entire audio product line discontinued 2026-06-10, endpoints now
404/401 (`docs.fireworks.ai/updates/changelog`). NVIDIA Canary family — offline-only, no streaming
profile exists at all despite marketing.

---

## 2. Summary table — Live streaming speech-to-text translation (Category B)

| Vendor | Product | Language pairs (streaming) | Latency | Price | Protocol | Key |
|---|---|---|---|---|---|---|
| **Soniox** | real-time translation (one-way + two-way) | **3,600+ pairs**; ar/zh/ru confirmed both source & target | not published | not separately priced (points to general pricing page) | Same unified WebSocket as ASR; translation tokens tagged `translation_status` alongside transcript | **KEY-HELD** |
| **Alibaba/DashScope** | Gummy (ASR+translation) | 21 source langs incl. ar/zh/ru/es/fr/en | not spec'd | **¥0.00015/s ≈ $0.075/hr** — cheapest in this table | Same DashScope WebSocket family as Fun-ASR | **KEY-HELD** |
| **Azure AI Speech** | Speech Translation (dedicated product, confirmed via direct fetch) | Core "Speech to text translation" covers most of the STT locale list; separate **"LLM speech translation"** mode confirms Arabic ✅, Chinese ✅, **Russian not listed** for that specific mode | not documented in ms | **$2.50/hr Standard, covers up to 2 target languages**; each extra target billed via Translator text pricing ($10/1M chars × weighting coefficient) — the one genuinely official, verified price point in this whole report | **SDK/CLI only**, no public WebSocket | **KEY-HELD** |
| **Google Gemini** | Live Translate (translate-tuned Live variant) | ✅ / ✅ / ✅ confirmed both directions | 3.95s/2.21s/4.25s across 3 metrics per an independent benchmark (arXiv:2604.04847) | audio-in $3.50/1M tok (~$0.005/min), audio-out $21/1M tok (~$0.032/min) — pricier than the plain ASR Live tier | WebSocket, `google-genai` SDK | **KEY-HELD** |
| **OpenAI** | `gpt-realtime-translate` | Input 70+ langs incl. ar/zh/ru; **spoken output restricted to 13 languages excluding Arabic** — text-output coverage for the full input set is undocumented, needs direct testing | ⚠3rd-party bench of the *general* conversational model (not translate-specific): 6.89s (arXiv:2604.04847) | **$0.034/min = $2.04/hr** | WebSocket `/v1/realtime/translations` | **KEY-HELD**, Arabic gap needs verifying for text mode specifically |
| **Speechmatics** | real-time translation | **NOT RESEARCHED** — both docs URLs attempted 404'd in this session; historically Speechmatics has marketed a translation output alongside its real-time transcription config, but this could not be confirmed or sourced before the research budget closed | — | — | — | **KEY-HELD**, needs a direct account-console check |
| **Deepgram** | — | No streaming translation product found; ASR-only vendor | — | — | — | n/a |
| **AssemblyAI** | — | No streaming translation product found; ASR-only vendor | — | — | — | n/a |
| **Meta Seamless-Streaming / SeamlessM4T v2** | open weights, no live API | M4T v2: 101 in / **35 out** incl. ar/zh/ru; SeamlessExpressive: only 6 langs, **excludes ar & ru** | Paper AL ≈ 1.68s (X→En) / 1.98s (En→X) | self-host; **M4T v2 is CC-BY-NC (non-commercial only)** — a real licensing blocker for production use | local/library, no hosted API | **NEEDS-KEY** (self-host + licensing review) |
| **Kyutai Hibiki** | open weights, no live API | **French→English only** | not published | self-host | local/library | disqualified — language coverage |

---

## 3. Category C — Speech-to-speech (audio-out) interpretation: documentation only

Per the scope refinement, these get one line each — public API existence and rough cost, no
latency/architecture deep-dive.

- **Palabra.ai** — real, self-serve streaming API (WebSocket/WebRTC); marketing says "60+" languages, SDK docs say "25+" (unresolved discrepancy); ar/zh/ru named; $60/mo (3 hrs) to $1,000/mo (50 hrs) tiered plans. **NEEDS-KEY.**
- **KUDO AI** — audio output only in "Presentation mode"; two-way "Conversational mode" degrades to captions-only; no third-party developer API, Teams-native widget only; custom quote pricing. **NEEDS-KEY** (and arguably not a usable integration regardless).
- **Camb.ai (Chatterbox)** — marketed as real-time conversational speech-to-speech translation but **no visible public API docs/endpoint schema found** for Chatterbox specifically (Camb.ai's separate Dubbing/Streams products *do* have documented APIs). **NEEDS-KEY**, weakest-evidenced claim in the set.
- **Wordly** — conference-interpretation SaaS; **NOT RESEARCHED** in this pass (deprioritized under the scope cut); typical of this category is no public developer API.
- **Interactio** — primarily a human-remote-simultaneous-interpretation platform with an "AI Voice & Text Translation" add-on mode; a third-party aggregator states outright "Interactio does not offer an API"; AI mode billed separately at $89/hr (1–9 hrs) down to $59/hr (500+ hrs). **NEEDS-KEY** (no API exists to hold a key for).
- **Interprefy** — **NOT RESEARCHED** in this pass (deprioritized under the scope cut).
- **DeepL Voice** — flagship "DeepL Voice for Meetings" is **captions-only today** ("Live voice-to-voice translation coming soon" per DeepL's own product page); a separate DeepL Voice API supports audio output but is gated behind a **closed beta**; text/caption output available to paid API customers. **NEEDS-KEY** (no key held; audio path not GA anyway).
- **Kyutai Hibiki** — open weights, no hosted API, French→English only (see Category B table above — same disqualification applies to any S2S use).
- **Meta SeamlessExpressive** — open weights, no hosted API, gated request form, only 6 languages excluding Arabic and Russian (see Category B table).

---

## 4. Per-vendor detail — KEY-HELD candidates (protocol/API shape for implementation)

### Soniox
- ASR endpoint: `wss://stt-rt.soniox.com/transcribe-websocket`. Config field `enable_speaker_diarization: true` adds a `speaker` field to each token in the live stream, at no extra cost.
- Translation: same unified connection carries transcript **and** translation tokens together — translated tokens are tagged via a `translation_status` field rather than opened on a separate socket. One-way and two-way translation modes are both available.
- Coverage: 60+ languages for ASR with free code-switching mid-utterance; 3,600+ language pairs for translation. Arabic, Chinese, Russian all confirmed in both products.
- Pricing: $0.12/hr for ASR ($2.00 per 1M audio tokens, ~30,000 tokens/hour); translation pricing not separately broken out on the public pricing page.
- Sources: [soniox.com/docs/stt/rt/real-time-transcription](https://soniox.com/docs/stt/rt/real-time-transcription), [soniox.com/docs/translation/supported-languages](https://soniox.com/docs/translation/supported-languages), [soniox.com/pricing](https://soniox.com/pricing/).

### Mistral Voxtral
- Model: `voxtral-mini-transcribe-realtime-2602`; SDK call `client.audio.realtime.transcribe_stream()`; default host `wss://api.mistral.ai`. Audio: 16-bit PCM LE, 8–48kHz, mono. Event types: `RealtimeTranscriptionSessionCreated`, `TranscriptionStreamTextDelta`, `TranscriptionStreamDone`, `RealtimeTranscriptionError`.
- Latency is a first-class configurable parameter (`target_streaming_delay_ms`), and Mistral is the **only vendor in this report that publishes an explicit latency/accuracy tradeoff curve**: at 480ms delay, WER stays within 1–2% of the batch model; at 2.4s it matches the batch model exactly.
- The realtime model is also released open-weight (Apache 2.0, `Voxtral-Mini-4B-Realtime-2602` on Hugging Face, with vLLM/Red Hat deployment recipes) — a genuine hedge against a hosted-API discontinuation (relevant given the Fireworks precedent below).
- Coverage: 13 languages total — en, zh, hi, es, ar, fr, pt, ru, de, ja, ko, it, nl. All 6 UN languages covered; narrowest overall list of any commercial vendor here, so weak for arbitrary extra floor languages.
- Diarization explicitly incompatible with realtime mode per the docs ("Use either one or the other").
- Pricing: realtime $0.006/min = $0.36/hr; batch $0.003/min = $0.18/hr.
- Source: [mistral.ai/news/voxtral-transcribe-2](https://mistral.ai/news/voxtral-transcribe-2/), [docs.mistral.ai/studio-api/audio/speech_to_text/realtime_transcription](https://docs.mistral.ai/studio-api/audio/speech_to_text/realtime_transcription).

### Alibaba / DashScope (Fun-ASR + Gummy)
- Endpoints are region-specific and non-interchangeable: `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference` or `wss://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference` (Singapore — the internationally-usable region). Auth via `Authorization: Bearer <key>` at handshake. Flow: connect → send `run-task` → stream binary mono audio → send `finish-task` → receive `task-finished`.
- Fun-ASR realtime supports 30 languages including Arabic, Chinese, Russian, Spanish, French, English — confirmed directly from the SDK docs. Paraformer realtime is **China-Beijing-only** and covers just 8 languages excluding Arabic and Spanish — disqualified for our use, don't use it even though it's the "default"/older model.
- Gummy is the combined ASR+translation product: 21 source languages, same region/protocol pattern, priced at ¥0.00015/second ≈ $0.075/hour — the cheapest streaming option identified in this entire report.
- Billing meters **speech-detected duration only, not silence** — a real cost advantage for UN meetings with long procedural gaps between statements.
- Gap: no official per-hour price was found for Fun-ASR realtime specifically (only Gummy's price is public) — pull this from the DashScope console before committing budget.
- No diarization on any DashScope realtime product (batch-only, via `diarizationEnabled(true)`).
- Sources: [help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk), [help.aliyun.com/zh/model-studio/real-time-speech-translation](https://help.aliyun.com/zh/model-studio/real-time-speech-translation).

### AssemblyAI
- Endpoint: `wss://streaming.assemblyai.com/v3/ws`. `Universal-3.5 Pro Streaming` documents sub-300ms latency; a company blog (self-reported, not independently verified) claims 307ms median vs. a competitor's 516ms.
- **Hard gap: no AssemblyAI streaming model supports Russian**, confirmed explicitly on both their FAQ and migration-guide pages. The 18-language Universal-3.5 Pro list covers Arabic and Chinese but not Russian. This should be treated as disqualifying for a full 6-language deployment, though it may still be worth benchmarking for the other five languages given its documented latency lead.
- Diarization: yes, live, via a `speaker_label` field on turn events plus per-word `speaker`; `max_speakers` configurable 1–10.
- Pricing: $0.15/hr flat, billed for the entire WebSocket session duration including idle time (not metered to speech only, unlike DashScope).
- Sources: [assemblyai.com/docs/speech-to-text/universal-streaming](https://www.assemblyai.com/docs/speech-to-text/universal-streaming), [assemblyai.com/docs/faq/language-support-for-real-time-transcription](https://www.assemblyai.com/docs/faq/language-support-for-real-time-transcription).

### Deepgram
- Nova-3: `wss://api.deepgram.com/v1/listen`. Nova-3 Multilingual and per-language Monolingual variants both list Arabic (multiple dialect codes), Chinese, Russian.
- Flux (voice-agent-oriented turn model): `wss://api.deepgram.com/v2/listen?model=flux-general-en`. Flux's own quickstart documents ~260ms end-of-turn detection; a company blog claims sub-300ms median/1.5s p95 — treat the comparative superiority claims over competitors as vendor marketing. **Flux's 10-language multilingual variant does not have its language list published anywhere found** — do not assume Arabic/Chinese/Russian are included without checking directly; Nova-3 is the safer choice for full 6-language coverage today.
- Diarization live via `diarize_model=latest`/`v1` (the newer v2 diarizer is batch-only and errors on a streaming connection).
- Pricing: Nova-3 Monolingual $0.0048/min, Multilingual $0.0058/min; Flux $0.0065–0.0078/min. Deepgram's page notes these may be "limited-time promotional rates."
- Sources: [developers.deepgram.com/docs/live-streaming-audio](https://developers.deepgram.com/docs/live-streaming-audio), [developers.deepgram.com/docs/flux/quickstart](https://developers.deepgram.com/docs/flux/quickstart), [deepgram.com/pricing](https://deepgram.com/pricing).

### Azure AI Speech (STT + dedicated Speech Translation)
- **No public raw WebSocket** — real continuous streaming is SDK-only (C#, C++, Go, Java, JS, Objective-C, Python, Swift). The only public HTTP path ("REST API for short audio") caps at 60s of audio, final-results-only, no partials — not usable for live meeting capture. This is the one real integration-cost outlier among all KEY-HELD vendors: every other vendor here is directly callable over a socket, Azure forces an SDK dependency.
- Real-time diarization is GA via the `ConversationTranscriber` SDK class (≥1.31.0), up to 35 speakers.
- **Speech Translation** is a genuinely distinct, dedicated, confirmed-real product (not marketing) — "Speech to text translation," "Speech to speech translation," "Multi-lingual speech translation" (no source language pinned, mid-session language switching, described as supporting "live streaming translations into English" specifically for that auto-detect mode), and "Live Interpreter" (low-latency S2S, out of scope per our text-only refinement). Confirmed pricing anchor, directly from Microsoft's own page: **$2.50/hr Standard tier, covering up to 2 target languages**; each additional target language beyond 2 is billed via Azure Translator's text pricing ($10 per 1M characters), multiplied by a documented "weighting coefficient" (~3x in Microsoft's own worked example) to account for intermediate/interim translation results being billed too, not just finals.
- One documentation wrinkle: their "LLM speech translation" mode (a newer variant, distinct from the standard neural Speech Translation product) lists Arabic and Chinese as supported but **does not list Russian** — worth clarifying which translation mode (standard vs. LLM) we'd actually be routed to before assuming Russian works end-to-end.
- Sources: [learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-translation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-translation) (fetched directly), [learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=stt), [techcommunity.microsoft.com real-time diarization GA announcement](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/announcing-general-availability-of-real-time-diarization/4147556).

### Google Cloud Speech-to-Text v2 / Chirp
- **gRPC only** — the docs state explicitly "Streaming speech recognition is available through gRPC only." No WebSocket option exists. Hard 25KB limit per streamed message.
- Arabic, Chinese, Russian all appear in the Chirp/Chirp 2/Chirp 3 language catalog, but the docs do not clearly separate streaming-vs-batch support per language in one table.
- Diarization supported for both `speech:recognize` and streaming, per Google's own multiple-voices doc.
- Pricing: official pricing page resisted scraping in this research pass (JS-heavy); an unverified search-derived figure suggested ~$0.016 per 15-second billing increment — do not rely on this without confirming in the console.
- Sources: [docs.cloud.google.com/speech-to-text/v2/docs/streaming-recognize](https://docs.cloud.google.com/speech-to-text/v2/docs/streaming-recognize), [docs.cloud.google.com/speech-to-text/docs/multiple-voices](https://docs.cloud.google.com/speech-to-text/docs/multiple-voices).

### OpenAI Realtime API
- Three distinct paths exist and are easy to conflate: (a) a purpose-built transcription session type on the Realtime WebSocket (`wss://api.openai.com/v1/realtime`, `session.type=transcription`) using `gpt-realtime-whisper`/`gpt-4o-transcribe`/`gpt-4o-mini-transcribe`/legacy `whisper-1` — this is the live-mic-streaming path; (b) `/v1/audio/transcriptions` with `stream=true`, which streams *output* over SSE but still requires a bounded, already-recorded audio payload as *input* — not suitable for live capture; (c) `gpt-realtime-translate`, a dedicated speech-to-speech translation model at `/v1/realtime/translations`.
- `gpt-realtime-whisper` pricing is a flat **$0.017/minute ($1.02/hour)** — the single most expensive streaming ASR option in this entire report, roughly 2.6–2.8x Voxtral Realtime or ElevenLabs Realtime.
- **Language coverage for the streaming transcription model is an unresolved documentation gap**: the `gpt-realtime-whisper` model page lists no explicit language table (only "designed for multilingual transcription... accuracy can vary by language"), unlike the batch Whisper family which explicitly lists Arabic/Chinese/Russian. Given three of our six required languages sit in this gap, direct empirical testing is needed before relying on this model.
- For translation: `gpt-realtime-translate` documents 70+ input languages (including ar/zh/ru) but **spoken output is restricted to only 13 languages, and Arabic is absent from that output list**. Whether the same model can be configured for *text-only* translated output (bypassing the 13-language spoken-output restriction) is undocumented and worth testing directly, since our stated use case (text-out only) may sidestep this specific limitation.
- No diarization in any streaming/realtime mode (batch-only `gpt-4o-transcribe-diarize`).
- A possible 60-minute session cap was found in the *conversational* Realtime guide but not confirmed in the *transcription*-specific guide — unresolved, worth testing directly given UN sessions routinely run longer.
- Sources: [developers.openai.com/api/docs/guides/realtime-transcription](https://developers.openai.com/api/docs/guides/realtime-transcription), [developers.openai.com/api/docs/guides/realtime-translation](https://developers.openai.com/api/docs/guides/realtime-translation), [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing).

### Google Gemini Live API
- Architecturally an audio-to-audio conversational agent; transcription/translation-as-text is obtained as a side-channel by setting `input_audio_transcription` in the session config and ignoring/suppressing the model's spoken response — structurally less direct than OpenAI's or Mistral's purpose-built transcription session types, but functional.
- Current model naming as of this research: `gemini-3.1-flash-live-preview` for general Live use; a separately-named translate-tuned variant (referred to in Google's announcements as Gemini Live Translate) for the translation-specific product — pricing differs between the two (translate variant's audio-output token price is notably higher, $21/1M vs $12/1M for the general Live model), so don't assume these are simply the same model with a different system prompt.
- Broadest confirmed language coverage of any commercial vendor in this report: 97 languages, explicitly including Arabic, Chinese (both zh-CN and zh-TW), and Russian.
- No 600ms "official" latency figure currently holds — that number is specific to the older Gemini 2.0 Live model and is stale for the 3.1 generation, which publishes no ms figure of its own.
- Session mechanics matter for a long UN meeting: WebSocket connections cap at ~10 minutes with a ~60s pre-disconnect warning; audio-only sessions run out of context around 15 minutes without compression; **session resumption tokens** (valid 2h, server-side state retained up to 24h) and **context window compression** are the documented mechanisms for continuing beyond those limits — this needs to be built into any integration, not assumed away.
- All Live models are explicitly labeled "Preview" with no SLA or deprecation policy guarantee. The published rate-limits documentation does not cover the Live API at all — a real operational gap to resolve with Google directly before production reliance.
- No diarization parameter exists in the Live API.
- Sources: [ai.google.dev/gemini-api/docs/live](https://ai.google.dev/gemini-api/docs/live), [ai.google.dev/gemini-api/docs/live-api/capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities), [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing), [firebase.google.com/docs/ai-logic/live-api/limits-and-specs](https://firebase.google.com/docs/ai-logic/live-api/limits-and-specs).

### ElevenLabs Scribe v2 Realtime
- WebSocket, authenticated with single-use server-issued tokens (15-minute expiry) via `/tokens/singleUse/create`. Event types: `SESSION_STARTED`, `PARTIAL_TRANSCRIPT`, `COMMITTED_TRANSCRIPT`, `ERROR` — genuine interim + finalized transcript streaming, optional word-level timestamps.
- Latency marketed as ~150ms; no independently-verified p50/p95 breakdown exists.
- Diarization explicitly **not** supported in realtime, in ElevenLabs' own words ("This isn't a priority at the moment for a realtime model") — batch Scribe v2 supports up to 32 speakers, unusually high, but that capability is unavailable live.
- Pricing: realtime $0.39/hr flat, no add-ons available in realtime mode (unlike batch, which has paid entity-detection/keyterm add-ons).
- Sources: [elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming), [elevenlabs.io/realtime-speech-to-text](https://elevenlabs.io/realtime-speech-to-text), [elevenlabs.io/pricing/api](https://elevenlabs.io/pricing/api).

### Speechmatics
- Real-time endpoint: `wss://eu.rt.speechmatics.com/v2/` (or `global.rt.speechmatics.com`), JWT-authenticated. Latency is a tunable `max_delay` parameter (0.7–4s range, default 4s) trading context for accuracy — this is the one documented, controllable figure; a separate marketing claim of "<1 second" should be read as directional, not a spec.
- **Melia (their newest, 2026 multilingual/code-switching model) is batch-only — not yet available for real-time.** Real-time today runs on the older Enhanced/Standard model generation (internally "Ursa 2"), which covers Arabic, Chinese, Russian as part of a 56+ language catalog, though the docs did not clearly confirm the streaming-vs-batch split per language in this research pass.
- Diarization: fully supported live (`diarization: speaker/channel/channel_and_speaker`, `max_speakers`, `speaker_sensitivity`).
- **Pricing could not be reliably pinned down** — the official pricing page surfaced only a "from $0.129/hr" headline (likely the cheapest batch tier); third-party sources cited conflicting real-time figures nearly 2x apart from each other ($1.04–2.15/hr range). Needs a direct account/sales check before use in cost modeling.
- **Real-time translation output specifically (Category B) was not confirmed in this research pass** — both docs URLs attempted returned 404. Flagged as **NOT RESEARCHED**; worth a direct account-console check since Speechmatics is already a production vendor for us (Melia batch floor-track transcription).
- Sources: [docs.speechmatics.com/api-ref/realtime-transcription-websocket](https://docs.speechmatics.com/api-ref/realtime-transcription-websocket), [speechmatics.com/company/articles-and-news/introducing-melia-multilingual-speech-to-text-model](https://www.speechmatics.com/company/articles-and-news/introducing-melia-multilingual-speech-to-text-model).

### Groq (excluded from the live/streaming shortlist)
- Groq's own ASR Model Guide states plainly: **"Support for file-based transcription only — no streaming support."** Endpoints are `POST /openai/v1/audio/transcriptions` and `/audio/translations`, synchronous multipart upload, OpenAI-Whisper-compatible. This is a fast **batch** product, not a candidate for live transcription, despite being commonly discussed alongside streaming vendors.
- Do not confuse with **xAI/Grok** (`api.x.ai`), a different company, which does have a documented `wss://.../v1/stt` streaming endpoint — an easy mix-up in secondary sources.
- Pricing (batch only): whisper-large-v3 $0.111/hr, whisper-large-v3-turbo $0.04/hr, distil-whisper-large-v3-en (English only) $0.02/hr — notably cheap for batch/offline work, and worth keeping in mind for any non-real-time use case (e.g., a fast fallback re-transcription path), just not for live capture.
- Source: [console.groq.com/docs/speech-to-text](https://console.groq.com/docs/speech-to-text).

---

## 5. Standard latency metrics in simultaneous MT/speech-translation research

| Metric | Introduced by | Venue | What it measures |
|---|---|---|---|
| AP (Average Proportion) | Cho & Esipova, 2016 | arXiv:1606.02012 | Fraction of source consumed per output token — largely superseded, still used as a baseline |
| CW (Consecutive Wait) | Gu et al., 2017 | — | Longest run of consecutive source reads between writes — largely superseded |
| **AL (Average Lagging)** | Ma et al., 2019 ("STACL") | ACL 2019, pp. 3025–3036, [arXiv:1810.08398](https://arxiv.org/abs/1810.08398) | Average number of source words/positions the system lags behind an idealized word-synchronous policy |
| **DAL (Differentiable AL)** | Cherry & Foster, 2019 | [arXiv:1906.00048](https://arxiv.org/abs/1906.00048) (appears to be an arXiv-only preprint, no confirmed peer-reviewed venue) | Recursively-defined delay that removes AL's non-differentiable cutoff, usable as a training signal |
| **SimulEval / computation-aware AL** | Ma, Dousti, Wang, Gu, Pino, 2020 | EMNLP 2020 System Demos, [arXiv:2007.16193](https://arxiv.org/pdf/2007.16193) | De facto standard evaluation toolkit; adds real wall-clock inference time on top of idealized AL |
| **LAAL (Length-Adaptive AL)** | Papi, Gaido, Negri, Turchi, 2022 | 3rd AutoSimTrans Workshop, [ACL 2022.autosimtrans-1.2](https://aclanthology.org/2022.autosimtrans-1.2/) | Fixes AL's over-generation loophole: normalizes by `max(|hyp|, |ref|)/|src|` instead of just the reference length |
| **ATD (Average Token Delay)** | Kano, Sudoh, Nakamura, 2022/2023 | Interspeech 2023; extended [arXiv:2311.14353](https://arxiv.org/html/2311.14353) | Tracks token **end** (completion) time rather than start position — the metric most relevant to real audio-out latency, since it penalizes systems that burst-generate long output after appearing to "start" instantly |
| CA* | 2024 | [arXiv:2410.16011](https://arxiv.org/abs/2410.16011) | Fixes a systematic overestimation bug in the standard computation-aware AL formula |
| YAAL / LongYAAL | 2025 | [arXiv:2509.17349](https://arxiv.org/html/2509.17349v2) | Newest proposed replacement; meta-evaluates all the above and finds they frequently disagree on which system is "faster" |

**"Computation-aware" is a measurement mode, not a separate metric** — it can be layered onto AL, LAAL, or DAL. The idealized (non-computation-aware) version assumes model inference is instantaneous and measures only the read/write scheduling policy; the computation-aware version adds the model's actual wall-clock inference time, which is the number that actually corresponds to what a listener experiences from a deployed API. In IWSLT system papers, computation-aware AL/LAAL routinely runs **1–2 seconds higher** than the idealized figure for the same system (e.g., CMU 2024: idealized LAAL 2.22s vs. computation-aware 3.16s). **A 2024 paper (CA*) found the standard computation-aware formula has a real bug** — it treats read/write as strictly sequential when real systems pipeline them, causing the reported delay to inflate with input length even when a listener's actual experienced lag stays constant (their example: 46.6% overshoot on a 25-second input; the flawed metric kept growing from 6.85s at 25s of speech to 23.46s at 100s of speech under a corrected ground truth that stayed flat). **This is directly relevant to any hour-long UN-meeting benchmark: do not trust an off-the-shelf SimulEval computation-aware number for long-form audio without the CA* correction.**

**Best single source defining all these together:** [arXiv:2509.17349](https://arxiv.org/html/2509.17349v2), "Better Late Than Never: Meta-Evaluation of Latency Metrics for Simultaneous Speech-to-Text Translation" (2025).

### IWSLT Simultaneous Translation shared task — SOTA and a real gap for our language set

The task has run since 2020, built on the SimulEval toolkit. **Critical finding: Arabic, Russian, and Spanish have never appeared in any IWSLT Simultaneous Speech Translation shared task edition, 2020 through 2026.** The task has consistently centered on En↔{German, Japanese, Chinese}, with Czech→English and (as of 2026, via the new MCIF benchmark) Italian added. Half of our six UN languages fall entirely outside this academic tradition — any Arabic/Russian/Spanish latency numbers for our use case will have to come from our own or vendor benchmarks, not from IWSLT.

Concrete numbers (AL/LAAL in seconds; CA = computation-aware):

- **IWSLT 2024**: CMU system BLEU 29.5 at AL 1.96s (LAAL 2.22s, LAAL-CA 3.16s) on a general direction; FBK's off-the-shelf SeamlessM4T-based system: En-De BLEU 27.37 (AL 1.82s, CA 3.01s), En-Ja BLEU 22.19 (AL 2.00s, CA 4.02s), En-Zh BLEU 20.56 (AL 1.94s, CA 3.39s), Cs-En BLEU 18.03 (AL 1.99s, CA 3.76s). ([arXiv:2408.07452](https://arxiv.org/abs/2408.07452), [arXiv:2406.14177](https://arxiv.org/html/2406.14177v1))
- **IWSLT 2025**: CMU, using a Qwen2.5-7B decoder: **En-Zh BLEU 44.3** (StreamLAAL 2.2s, CA 2.7s), En-De BLEU 25.1 (StreamLAAL 1.7s, CA 2.3s) — nearly double the 2024 En-Zh quality at essentially the same latency budget, attributed to the shift from bespoke wait-k architectures to large pretrained LLM decoders combined with attention-based (AlignAtt) read/write policies. ([arXiv:2506.13143](https://arxiv.org/html/2506.13143v1))
- **IWSLT 2026**: co-located with ACL 2026 (San Diego, July 2026), built on the new MCIF benchmark (English/German/Italian/Chinese). Absolute BLEU/COMET/AL numbers for this edition could not be extracted (PDF parsing of the findings paper failed repeatedly) — only a relative year-over-year quality gain (+5.82 XCOMET-XL for one system) was confirmed. **Flagged as an open item.**

**Overall trend**: 2019 text-only wait-k policies (STACL) → 2020/21 IWSLT institutionalizes a dedicated speech track with formal latency buckets (Low ≤1s / Medium ≤2s / High ≤4s AL) → 2024 top systems hit BLEU 27–30 (De) / 20–22 (Zh/Ja) within a ~2s AL budget (~3–4s computation-aware) → 2025 the same ~2–2.7s computation-aware budget yields BLEU 44.3 (Zh) / 25.1 (De), roughly doubling Chinese quality at flat latency due to LLM-backbone adoption.

---

## 6. Human simultaneous interpreter Ear-Voice Span (EVS)

EVS (also "décalage") is the time lag between a speaker's utterance and the interpreter's corresponding rendition — the standard human analogue to AI systems' AL/LAAL. The field frames it through Daniel Gile's Effort Models (interpreters operate near a processing-capacity ceiling — the "tightrope hypothesis") and Barbara Moser-Mercer's broader cognitive research on interpreter attention allocation.

**Reported numeric ranges, with explicit confidence flags** (no single canonical number exists in the literature — treat any of these as a range, not a constant):

| Value | Context | Confidence |
|---|---|---|
| ~3s average | English→Korean, ~800 sentences | **Secondary only** — primary source (ResearchGate) returned HTTP 403, could not verify |
| 2.68s average | European Parliament, French/Dutch (Defrancq 2015) | **Secondary only** — could not fetch a primary source |
| up to 4.7s in some conditions | Timarová, Dragsted & Hansen (2011), "Time lag in translation and interpreting," in *Methods and Strategies of Process Research* (John Benjamins) | Paper genuinely exists and is correctly attributed; the specific 4.7s figure itself comes from a secondary aggregator, not our own read of the chapter |
| "2–4s is commonly cited" | General field characterization | Composite/rough approximation, not traceable to one paper |

**The most rigorous, directly-confirmed primary source found is Janikowski & Chmiel (2025), *Interpreting* 27(1), pp. 28–51** ([DOI 10.1075/intp.00116.jan](https://www.jbe-platform.com/content/journals/10.1075/intp.00116.jan), confirmed via direct fetch of the publisher page). Using the Polish Interpreting Corpus and linear mixed-effects models, they find EVS is modulated by interpreting direction, delivery type, source/target speech rate, interpreter experience, word type, **and the position of the sentence/word within the text** — plus substantial individual variation between interpreters — and found *no* significant relationship between working-memory capacity and EVS (contradicting a long-standing assumption in the field). This is the strongest available evidence that **EVS is a distribution shaped by many covariates, not a fixed constant to benchmark against**, and their "position within the text" finding is the closest verified evidence to the question of **lag drift within a long turn** — no study found tracked continuous EVS drift within a single turn as its primary object, but this finding directly implies EVS is not constant across a turn's duration.

### Language-pair effects: verb-final/SOV languages need longer EVS (mechanism confirmed; magnitude not pinned down)

Two genuinely primary, directly-verified sources support this:
1. **Seeber (2011, *Interpreting* 13(2)) and Seeber & Kerzel (2012, SAGE)** — used pupillometry (task-evoked pupil dilation as an online cognitive-load proxy) to show significantly higher cognitive load for German verb-final constructions interpreted into English, exactly where an interpreter must hold a clause in memory awaiting the sentence-final verb.
2. **Collard, Przybyl & Defrancq (2018), *Meta* 63(3), pp. 695–716** ([erudit.org](https://www.erudit.org/en/journals/meta/1900-v1-n1-meta04634/1060169ar/), confirmed via direct fetch) — a corpus of 3,460 European Parliament subordinate clauses, French interpreted into German/Dutch (both SOV targets), finding interpreters compress the "verbal brace"/middle field under real-time pressure to avoid the longest possible wait for the clause-final verb.

**Important correction:** the oft-repeated "5–6 seconds for SOV language pairs" figure that circulates in secondary sources is **not traceable to either of these papers** and should not be cited as a hard number — neither paper reports EVS in seconds. The mechanism (verb-final syntax → longer EVS/higher cognitive load) is robustly supported; the magnitude is not.

### Arabic and Chinese specifically

- **Arabic**: dedicated research exists — the **WAW Corpus** (Temnikova, Abdelali, Djabri, Hedaya, RANLP 2019 HiTIT workshop, [ACL Anthology W19-8713](https://aclanthology.org/W19-8713/)) is a dedicated English↔Arabic interpreted-speech corpus with an automated ASR+alignment method for computing décalage. The paper's existence and methodology are confirmed; **the actual numeric décalage values could not be extracted** in this research pass (PDF parsing failed repeatedly) — a genuine, acknowledged gap that would need a manual read of the full paper.
- **Chinese**: a 2025 PLOS ONE study on "Ear-Eye-Voice Span" in Chinese-English simultaneous interpreting *with a written transcript alongside audio* exists and is peer-reviewed ([PMC12225871](https://pmc.ncbi.nlm.nih.gov/articles/PMC12225871/)), using eye-tracking to study speech-rate and experience effects — confirmed to exist, but no specific numeric EVS value was extracted from it in this pass.

### UN interpreters specifically

**No dedicated, peer-reviewed EVS study specifically measuring United Nations staff interpreters was found.** The academic EVS literature is built almost entirely on European Parliament corpora or lab/student experiments, not UN meeting recordings. Given comparable AIIC-equivalent professional accreditation and broadly similar speech genres (prepared political statements, procedural language, occasional off-script remarks), it is a reasonable **engineering approximation, explicitly an analogy rather than a direct measurement**, to use the EP-corpus-derived range (roughly 2.5–5 seconds) as a stand-in for UN interpreter behavior. One caveat specific to the UN that no EVS study addresses: UN meetings sometimes use **relay interpretation** (e.g., Arabic↔Russian routed through an English or French relay booth), which would add latency beyond what any single-hop EVS figure captures.

**Bottom line for comparing against AI systems**: human EVS (~2.5–5s, highly variable, not standardized the way IWSLT's computation-aware LAAL is for machines) sits in roughly the same numeric range as 2024–2025 SOTA computation-aware SimulST latency (~2.3–4s) — but the two are measured with fundamentally different rigor, and any single human EVS number quoted in comparisons should be presented as a range with the confidence caveats above, not a precise point estimate.

---

## 7. Ranked shortlist — candidates to benchmark

Ranked for a text-output-only bake-off (ASR + streaming translation) against our 6 UN languages, given our held keys.

1. **Soniox — ASR + translation, KEY-HELD.** Cheapest confirmed streaming ASR ($0.12/hr), all 6 languages confirmed for both ASR and translation (3,600+ pairs), free bundled diarization, single vendor spans both Category A and B. Top priority: cheapest way to get one apples-to-apples read across both categories at once.

2. **Mistral Voxtral Realtime — ASR, KEY-HELD.** Only vendor publishing an explicit latency/WER tradeoff curve (sub-200ms configurable, <2% WER penalty at 480ms) — makes it the easiest to reason about for a real latency budget. All 6 UN languages, competitive price ($0.36/hr), and Apache-2.0 open weights as a hedge against provider risk (see Fireworks below). Weakness: narrowest language list overall (13), so not the best choice if arbitrary floor languages matter.

3. **Alibaba/DashScope Gummy — ASR + translation, KEY-HELD.** Cheapest streaming option in the whole report ($0.075/hr), combines ASR and translation in one product, all 6 languages confirmed, silence-aware billing suits UN meetings' procedural gaps. Caveat: region-locked endpoints (must use Singapore, not Beijing, for us) and Fun-ASR's own per-hour price is still unconfirmed.

4. **Azure AI Speech (STT + dedicated Speech Translation) — KEY-HELD.** Already a production vendor for us (batch fr/es/ar/ru). The dedicated Speech Translation product gave us the single most solidly-verified official price point in this whole report ($2.50/hr for 2 targets) and all 6 ASR languages are confirmed. Real cost: SDK-only, no public WebSocket, so integration is heavier than every other candidate here — worth testing specifically to quantify that cost, and to resolve whether the "LLM speech translation" mode's missing Russian applies to us.

5. **Google Gemini Live — ASR text-mode + Live Translate, KEY-HELD.** Broadest confirmed language coverage (97 languages) of any commercial vendor — the best candidate if arbitrary floor-language coverage matters beyond the 6 UN languages. Real risks worth testing directly: Preview-only status with no SLA, undocumented current latency, and session-length limits (~10–15 min) that require implementing resumption/compression correctly for multi-hour UN sessions.

6. **AssemblyAI Universal-3.5 Pro Streaming — ASR, KEY-HELD, partial.** Best-documented latency figure of the commercial ASR vendors (sub-300ms) and confirmed diarization, but disqualified for full 6-language coverage by the confirmed absence of Russian in any streaming model. Still worth benchmarking for en/fr/es/ar/zh specifically if its latency/accuracy lead holds up, with a different provider needed for Russian regardless.

7. **Deepgram Nova-3 — ASR, KEY-HELD.** Established, well-documented vendor, all 6 languages confirmed, diarization included, mid-pack pricing. A safe, unglamorous baseline to include precisely because it's the most conventional/well-trodden option here. Flux is worth a follow-up once its multilingual language list is confirmed, but shouldn't be relied on for the 6-language requirement yet.

8. **OpenAI Realtime (`gpt-realtime-whisper` + `gpt-realtime-translate`) — KEY-HELD.** Already integrated in our production pipeline as a fallback provider, so there's an operational reason to test it regardless of ranking. Purpose specifically: resolve the undocumented ar/zh/ru streaming-language gap for the transcription model, and test whether translated-text-only output sidesteps the 13-language spoken-output restriction (which excludes Arabic) on the translation model. Currently the most expensive ASR candidate here ($1.02/hr) — a real strike unless its quality or the text-mode workaround makes it worth the premium.

9. **Google Cloud STT v2 / Chirp — ASR, KEY-HELD.** Worth a quick bench since the key is already held and language coverage looks broad, but the gRPC-only protocol and unconfirmed official pricing make it a lower priority than the WebSocket-native options above; a reasonable tie-breaker only if the leaders disappoint on accuracy.

10. **Speechmatics real-time (Enhanced/Standard) — ASR, KEY-HELD.** Already a production vendor for us (Melia batch floor-track transcription since 2026-07-10), so there's a natural question of whether their older real-time tier could extend that role to live floor transcription even though Melia itself isn't real-time yet. Needs a direct account/sales conversation to resolve pricing (public sources conflicted by ~2x) and to check whether real-time translation output actually exists as a product — both genuine unknowns after this research pass, not just unconfirmed details.

11. **WhisperLive (self-hosted OSS) — ASR, NEEDS-KEY (compute only).** The only candidate in this entire report — commercial or open-source — with built-in real-time speaker diarization (pyannote-based, added June 2026). Worth a bench specifically to test whether self-hosted diarization is good enough to use directly, given every commercial vendor here drops diarization in streaming mode. Lower priority than the commercial options above only because it requires standing up and maintaining our own GPU inference, not because of any documented capability gap.

12. **Groq (batch, not streaming) — explicitly excluded from the live shortlist, KEY-HELD.** Recorded here only to document the reasoning for exclusion: Groq's own docs confirm no streaming support at all ("file-based transcription only"). Not a candidate for live capture; could be revisited separately as a very cheap ($0.04/hr) fast-batch fallback for post-hoc re-transcription, which is a different use case than this report's scope.

**Note on vendor concentration risk**: Fireworks AI built a full audio-streaming product line and discontinued it entirely within about 13 months (last audio feature added 2025-05-20, whole line deprecated 2026-06-10, confirmed via their own changelog). This is a useful cautionary data point when weighing how much production dependence to place on any single smaller/newer vendor (e.g., DashScope, Mistral, Soniox) versus keeping a documented fallback path — Mistral's Apache-2.0 open-weight release is the only candidate above that offers a built-in hedge against this exact failure mode.
