# Live/streaming ASR APIs + interpreter-lag literature

Research notes for the UN interpretation-lag benchmark. Compiled 2026-07-21.
Where a figure could not be confirmed from a live source this session, it is
marked **NOT FOUND** rather than guessed. A few figures come from a provider's
own marketing copy quoting a *competitor's* benchmark (flagged inline) — treat
those as directional, not authoritative.

---

## GAP 1 — Streaming/live ASR

### Summary table — providers we hold keys for

| Provider / model | Protocol | Partial latency | Final/endpoint latency | Arabic | Chinese | Russian | Streaming price/hr | Diarization (streaming) | Word timestamps (streaming) |
|---|---|---|---|---|---|---|---|---|---|
| **AssemblyAI Universal-Streaming** (English) | WS `wss://streaming.assemblyai.com/v3/ws` | ~300ms word emission (immutable) | P99 ~1012ms | No | No | No | $0.15/hr | No | Yes (ms) |
| **AssemblyAI Universal-3 Pro Streaming** | same WS, new tier | P50 ~150ms, P90 ~240ms after VAD | ~250ms typical w/ 100ms VAD | Yes (99+ langs claimed) | Yes | Yes | $0.45/hr base (+$0.12/hr diarization, +$0.05/hr prompting) | Yes (native turn detection) | Yes |
| **Deepgram Nova-3** | WS (exact live URL not reconfirmed this session — see note) | NOT FOUND (competitor claims 516ms median, P99 1907ms — per AssemblyAI's blog, unverified independently) | — | Yes | Yes | Yes | $0.0048/min mono ($0.288/hr) PAYG; $0.0058/min multi ($0.348/hr) — "limited-time promo" | Yes | Yes |
| **Speechmatics real-time (Melia/enhanced)** | WS `wss://eu.rt.speechmatics.com/v2/` or `wss://global.rt.speechmatics.com/v2/` | tunable via `max_delay` 0.7–4s | = `max_delay` | Yes | Yes | Yes | "Pro tier from $0.129/hr" (20% discount available); Standard tier cheaper but "does not provide turnaround-time benefits" in real-time | Yes (`diarization_config`) | Yes (seconds) |
| **Azure AI Speech** | SDK-mediated (see note — no documented raw streaming WS wire spec) | NOT FOUND | NOT FOUND | Yes (18 locale variants) | Yes (zh-CN + regional variants) | Yes (ru-RU) | NOT FOUND (page timed out repeatedly; retail-price API query returned empty) | Yes (separate "conversation transcription"/diarization feature) | Yes |
| **Azure OpenAI Realtime** (`gpt-realtime-whisper`, `gpt-realtime-translate`) | WebRTC (~100ms), WebSocket (~200ms), SIP; endpoints `/openai/v1/realtime` and `/openai/v1/realtime/translations` | ~100–200ms (connection-method dependent, not transcription-specific) | 60-min max session | Multilingual, quality varies — no explicit list | same | same | "billed by the hour" — exact $ NOT FOUND | Not documented | Not documented for transcription deltas |
| **OpenAI Realtime transcription** (direct API) | WS (same protocol family; `wss://api.openai.com/v1/realtime` — not independently reconfirmed this session) | `delay` param: minimal/low/medium/high/xhigh (ms not published) | — | Not documented | Not documented | Not documented | NOT FOUND | No | No (text deltas only, no per-word timing in the event stream) |
| **Gemini Live API** | Stateful WSS (exact endpoint not confirmed this session) | NOT FOUND | NOT FOUND | Not enumerated (70+ langs claimed) | — | — | NOT FOUND | Not documented | Not documented |
| **Alibaba DashScope `paraformer-realtime-v2`** | WS — endpoint given by one doc fetch as `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1`, **not independently cross-verified — confirm against the DashScope console before building an adapter** | SDK exposes `get_first_package_delay()`/`get_last_package_delay()`; no published SLA number found | same | **No** | Yes | Yes | NOT FOUND (pricing pages 404'd) | Not documented | Yes (`words` array, `begin_time`/`end_time`) |
| **Cohere Transcribe** | Batch/file only (25MB cap) — **no streaming API** | n/a | n/a | Yes (14 langs total; a separate "Transcribe Arabic" variant is referenced on Cohere's site but not detailed in the docs page fetched) | Yes | **No** (not in the 14-language list) | Contact sales | No | No |
| **Groq (`whisper-large-v3[-turbo]`)** | Batch REST only — **no streaming API** | n/a (189×–216× real-time processing speed) | n/a | Not enumerated | Not enumerated | Not enumerated | $0.111/hr (v3), $0.04/hr (v3-turbo) — batch pricing | No | Yes (`timestamp_granularities: ["word"]`) |
| **Mistral Voxtral "Realtime"** | Protocol NOT FOUND (REST vs WS unclear from docs) | "sub-200ms" (marketing claim) | NOT FOUND | Not enumerated | Not enumerated | Not enumerated | NOT FOUND | **No** — diarization explicitly incompatible with realtime mode | Not confirmed for realtime (yes for batch "Voxtral Mini Transcribe 2") |
| **ElevenLabs Scribe v2 Realtime** | WS (exact URL 404'd on every doc path tried this session) | "<150ms" (marketing claim) | NOT FOUND | Yes ("High Accuracy" tier, ≤10% WER) | Yes ("High Accuracy") | Yes ("Excellent Accuracy", ≤5% WER) | "from $0.40/hr" | Yes | Yes (`committed_transcript_with_timestamps`, seconds) |
| **Google Cloud Speech-to-Text (Chirp 3, v2 API)** | gRPC only for `StreamingRecognize` — no REST | NOT FOUND | NOT FOUND | Not confirmed per-language for streaming specifically | Not confirmed | Not confirmed | NOT FOUND (pricing page repeatedly failed to load) | Not confirmed for streaming (yes in batch/Chirp 3 description) | Not confirmed for streaming |

### Note-only mentions (as requested)

| System | Protocol | Latency | ar/zh/ru | Notes |
|---|---|---|---|---|
| **AWS Transcribe streaming** | SDK (preferred), HTTP/2, or WebSocket | Chunk-size dependent; AWS recommends 50–200ms audio chunks | Widely documented to include all three but exact per-language streaming confirmation NOT FOUND this session (check the "Data input" column of the supported-languages table) | Session-duration hard limits apply; retry with exponential backoff on `LimitExceededException` |
| **Gladia** | `POST /v2/live` returns a session `id` + `url` (WS with embedded auth token) | NOT FOUND | Yes, all three (80+ languages total) | Diarization/timestamps-in-streaming and pricing NOT FOUND from the fetched page |
| **Rev.ai** | Node/Python SDK over streaming WS | NOT FOUND | NOT FOUND | Docs page had no technical detail beyond SDK install instructions |
| **NVIDIA Riva / Parakeet** | gRPC + Protocol Buffers | Sub-utterance intermediate transcripts ("as soon as available") — no ms figure published | Yes (ar-AR, zh-CN, ru-RU) | Diarization via Sortformer, **beta, only with Parakeet-CTC/Conformer-CTC** in streaming; self-hosted (Docker/K8s) or NGC — not a metered per-hour API, so "price per audio hour" doesn't directly apply |
| **Whisper-streaming** (ufal, open source) | LocalAgreement policy wrapping faster-whisper/whisper-timestamped/OpenAI API/mlx-whisper backends | 3.3s reported latency on unsegmented long-form test set | Yes (full Whisper 99-language coverage) | Project's own README says it's "becoming outdated in 2025, replaced by SimulStreaming" |
| **Moonshine** (Useful Sensors, MIT license) | On-device streaming w/ caching, no fixed input window | Tiny 34–69ms, Small 73–165ms, Medium 107–269ms (MacBook Pro / Linux x86); up to 802ms on Raspberry Pi 5 | STT covers en/es/zh/ja/ko/vi/uk/ar — **no Russian STT** (Russian appears only in the separate TTS language list) | Custom grapheme-to-phoneme avoids GPL espeak-ng dependency |
| **Kyutai STT** (delayed streams modeling) | Local/self-hosted; MIT (Python) + Apache (Rust) code, CC-BY-4.0 weights | 1B model ≈0.5s delay; 2.6B model ≈2.5s delay | **English/French only** — no Arabic, Chinese, or Russian | 1 H100 can serve ~400 concurrent streams in real time |

### Concrete wire-format detail (for adapter implementation)

**AssemblyAI Universal-Streaming** — `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=...`; results arrive as `{"type":"Turn","transcript":"...","end_of_turn":bool,"words":[{"text":...,"start":ms,"end":ms}]}`. Streaming is billed on **WebSocket session duration**, not audio duration — idle time is billed. ([AssemblyAI docs](https://www.assemblyai.com/docs/speech-to-text/universal-streaming), [pricing](https://www.assemblyai.com/pricing), [Universal-Streaming launch blog](https://www.assemblyai.com/blog/introducing-universal-streaming), [Universal-3 Pro Streaming blog](https://www.assemblyai.com/blog/universal-3-pro-streaming))

**Speechmatics real-time** — connect to `wss://{eu|global}.rt.speechmatics.com/v2/`, send a `StartRecognition` message (`audio_format`, `transcription_config` incl. language + optional `diarization_config`), receive `AddPartialTranscript` (mutable) and `AddTranscript` (final) messages, each with a `results` array carrying `start_time`/`end_time` (seconds), confidence, and optional speaker labels. `max_delay` (0.7–4s) is the direct latency/finality dial. ([Speechmatics real-time API reference](https://docs.speechmatics.com/rt-api-ref))

**Azure AI Speech** — Microsoft does **not** publish a plain WebSocket wire spec for continuous recognition the way the others do; the documented path is the Speech SDK (C#/C++/Go/Java/JS/Python/Swift/Obj-C), which manages the socket internally, or the REST short-audio endpoint (`https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`, capped at 60s, non-streaming). **This is an important implementation constraint**: an adapter against Azure AI Speech effectively means depending on the SDK (or reverse-engineering its private protocol), not writing a bespoke WS client. ([Speech SDK overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-sdk), [language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=stt))

**Azure OpenAI / OpenAI Realtime transcription** — `session.update` with `session.type: "transcription"`, e.g.:
```json
{"type":"session.update","session":{"type":"transcription",
 "audio":{"input":{"format":{"type":"audio/pcm","rate":24000},
 "transcription":{"model":"gpt-realtime-whisper","language":"en"}}}}}
```
Results stream as `conversation.item.input_audio_transcription.delta` (incremental text) and `.completed` (final). No word-level timestamps or diarization are documented in this event stream — it is a transcript-text stream, not a rich ASR output. On Azure, use the GA endpoint `/openai/v1/realtime` (voice-agent) or `/openai/v1/realtime/translations` (dedicated speech-translation session type) rather than date-versioned URLs. ([Azure OpenAI Realtime how-to](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio), [OpenAI realtime-transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription))

**Gemini Live** — confirmed only that it's a "stateful WebSocket connection (WSS)"; Google's own copy frames it around live **speech-to-speech dialogue** with transcription as a side artifact ("audio transcriptions" of both user and model turns), not a dedicated transcription-only product — so it is a materially different fit than the others in this table. Exact endpoint URL, config/result JSON shapes, latency, and pricing for the transcription side-channel were **NOT FOUND** in this pass. ([Gemini Live API docs](https://ai.google.dev/gemini-api/docs/live))

**Alibaba DashScope `paraformer-realtime-v2`** — config carries `model`, `sample_rate`, `format` (PCM/WAV/MP3/Opus/Speex/AAC/AMR), `language_hints` (`zh`,`en`,`ja`,`yue`,`ko`,`de`,`fr`,`ru` — no `ar`). Results: `{"begin_time":...,"end_time":...,"text":...,"words":[...]}` (8kHz variant also emits `emo_tag`/`emo_confidence`). **The WebSocket host/path returned by the doc fetch looked non-canonical (workspace-scoped `maas.aliyuncs.com` host) — treat as unverified and confirm directly in the DashScope console/SDK before wiring an adapter.** ([Alibaba Cloud DashScope docs](https://www.alibabacloud.com/help/en/model-studio/paraformer-real-time-speech-recognition-python-sdk))

**Soniox** — could not retrieve the API reference page this session (404 on the guessed path); no wire-format detail obtained. **NOT FOUND.**

---

## GAP 2 — Interpreter lag and latency metrics

### Summary table — human Ear-Voice Span (EVS)

| Study | Year | Language pair | Corpus / N | Key EVS finding |
|---|---|---|---|---|
| Lee, T-H. | 2004 | English→Korean | 800 sentences, computer-aided | Mean EVS **≈3 seconds** |
| Janikowski & Chmiel | 2025 | Polish↔ (PINC corpus) | Polish Interpreting Corpus | EVS modulated by interpreting direction, speech delivery type (read vs. spontaneous), source **and** target speech rate, interpreter experience, word type, position in sentence/text; **no significant effect of working memory**; numeric mean not captured in this pass |
| Defrancq | 2015 | French→Dutch | 32 European Parliament sessions (2008) | Short EVS (1–2s) correlates significantly only with **cognate use**, not with syntactic transcodage or self-repairs — challenges the assumption that short EVS is inherently risky |
| Collard & Defrancq | 2018 | French→Dutch/German (predictors study) | EPICG (Ghent EP corpus) | "Predictors of EVS" — sex was one studied variable; full numeric breakdown not captured in this pass |
| Collard | 2019 | French→German/Dutch (SOV targets) | 3,460 subordinate clauses, EPICG | Interpreters shorten the German "middle field" (conjunction→verb span) by **≈21%** (4.27 vs. 5.41 words) and Dutch by **≈19%**; German interpreters lean on **extraposition** (~90% of cases mirror French source order) as a memory-management strategy — a structural, not purely temporal, adaptation to verb-final targets |
| Plevoets & Defrancq | 2018 | French→Dutch | European Parliament | Disfluency rate (uh/um) used as a cognitive-load proxy correlated with EVS-related demand |
| Seeber & Kerzel | 2011 | German (verb-final vs. verb-initial constructions) | Pupillometry study | **Larger pupil dilation** (= higher cognitive load) for verb-final constructions — direct physiological evidence that holding subject/object in memory pending a late verb is costlier, consistent with EVS theory |
| Christoffels & de Groot | 2004 | — (shadowing/paraphrasing/interpreting comparison) | Lab study | Simultaneity of comprehension+production interacts with the transformation component; concurrent articulation interferes with memory (lower recall vs. delayed condition) |
| Moser-Mercer et al. (cited secondhand via Ma et al. 2019) | 1998 | — | — | Interpreter error rates **grow exponentially** after just minutes of continuous interpreting — not verified independently this session, cited only via the STACL paper's introduction |

**EVS drift within a long speech**: **NOT FOUND** as a dedicated result this session. The closest adjacent finding is the Moser-Mercer fatigue/error-growth citation above (quality, not EVS-in-seconds, degrades with duration) and Janikowski & Chmiel's finding that EVS tracks speech rate dynamically — implying interpreters continuously re-adjust lag rather than drifting monotonically, but no study directly measuring EVS-vs-elapsed-time-in-speech was located.

**EVS by language pair / word order**: no single study in this set reports directly comparable EVS-in-seconds across German/Japanese/Chinese/Arabic vs. English. What is well evidenced is that **verb-final targets increase cognitive load** (Seeber & Kerzel, pupillometry) and that interpreters **compensate structurally rather than simply by waiting longer** (Collard's extraposition/middle-field-shortening finding) — i.e., the EVS-in-seconds effect of word order may be smaller than the load/error-rate effect, because trained interpreters actively restructure output rather than passively lag further behind.

### Summary table — simultaneous-translation latency metrics

| Metric | Introduced by | Formula (informal) | What it fixes / adds |
|---|---|---|---|
| **AL** (Average Lagging) | Ma et al. 2019, ACL ("STACL") | $AL_g(x,y)=\frac{1}{\tau_g(\lvert x\rvert)}\sum_{t=1}^{\tau_g(\lvert x\rvert)}\big(g(t)-\frac{t-1}{r}\big)$, $r=\lvert y\rvert/\lvert x\rvert$ | First metric giving an intuitive "words behind" number; = k for a wait-k policy when \|x\|=\|y\| |
| **DAL** (Differentiable AL) | Cherry & Foster 2019 (arXiv:1906.00048) | Replaces AL's `argmin`-based cutoff with a recursive $g'_d(t)=\max(g(t),\,g'_d(t-1)+d)$, $d=1/r$ | Differentiable (usable as a training loss) and internally consistent — AL's assumption of "free writes" after the cutoff step is inconsistent and exploitable |
| **LAAL** (Length-Adaptive AL) | Papi, Gaido, Negri, Turchi 2022 (ACL AutoSimTrans workshop) | Same as AL but the oracle denominator uses $\max(\lvert Y\rvert,\lvert Y^*\rvert)$ instead of just reference length | Fixes AL's bias toward **over-generating** SimulST systems — a real system (CAAT) scored AL=198ms when true average lag was 846ms, purely because it over-generated past the utterance end |
| **ATD** (Average Token Delay) | Kano, Sudoh, Nakamura — IWSLT 2023 short paper; extended JNLP 2024 (DOI 10.5715/jnlp.31.1049, arXiv:2311.14353) | $ATD(x,y)=\frac{1}{\lvert y\rvert}\sum_t \big(T(y_t)-T(x_{a(t)})\big)$, where $T(\cdot)$ is a token's **end time** and $a(t)$ tracks the corresponding input token, discounted by any backlog $d(t)$ from a long previous output chunk | Accounts for **output-chunk duration** — a long emitted chunk delays the *next* chunk's start, which neither AL nor DAL can represent. **Empirically the best-correlated metric with human EVS** among the four, in the paper's own simulation study |
| **Computation-aware** variants | Ma, Pino & Koehn 2020 (SimulMT→SimulST); adopted for AL/LAAL/ATD | Substitutes real wall-clock elapsed time (incl. model inference) for the idealized $g(t)$ | Captures actual system latency, not just the idealized read/write schedule — IWSLT tables report both, e.g. FBK en-de: AL 1.888s idealized vs. **2.939s** computation-aware |

**Current IWSLT standard**: AL remains the metric used to bin systems into low/medium/high latency regimes, but LAAL and ATD are now reported as **official secondary metrics** alongside it (confirmed in the IWSLT 2024 SimulST task via the SimulSeamless system paper). ([IWSLT 2024 findings](https://aclanthology.org/2024.iwslt-1.1/), [SimulSeamless: FBK at IWSLT 2024](https://aclanthology.org/2024.iwslt-1.11/))

**State-of-the-art AL values, IWSLT 2024 SimulST (speech-to-text), MuST-C v2.0 tst-COMMON**, all systems targeting an **≈2-second AL operating point**:

| Lang. pair | Best BLEU@~2s AL | AL (idealized / computation-aware, seconds) |
|---|---|---|
| en→de | 33.54 (HW-TSC, cascade) | 1.88 / — |
| en→de | 27.37 (SimulSeamless, off-the-shelf foundation model) | 1.815 / 3.012 |
| en→ja | 22.19 (SimulSeamless) | 1.997 / 4.018 |
| en→ja | 15.32 (NAIST) | 1.974 / — |
| en→zh | 26.59 (XIAOMI) | 1.966 / — |
| en→zh | 20.56 (SimulSeamless) | 1.942 / 3.388 |
| cs→en | 18.03 (SimulSeamless) | 1.988 / 3.755 |

Two things stand out: (1) at a fixed ~2s latency budget, BLEU varies enormously by language pair and system (15–33), so "AL≈2s" alone says little about usable quality; (2) computation-aware AL runs 1.1–2.3× higher than idealized AL — the gap **is** inference latency, which any real deployment must add on top of the algorithmic lag. ([SimulSeamless paper, Table 1](https://aclanthology.org/2024.iwslt-1.11.pdf))

---

## What this means for benchmarking against human interpreters

1. **The headline numbers are deceptively close.** Human conference-interpreter EVS clusters around 2–4 seconds (mean ≈3s for en→ko per Lee 2004); current SOTA streaming speech-translation systems at IWSLT 2024 operate at a comparable ≈2s AL. Read naively, "the machine already matches human lag." That comparison is not apples-to-apples for two reasons below.

2. **AL is the wrong metric to make that comparison with.** AL structurally rewards over-generation and ignores the duration of what's actually emitted — exactly the failure modes that make a system feel laggy to a listener even when its AL number looks good (the CAAT example: true lag 846ms, reported AL 198ms). **ATD is the metric explicitly validated against human EVS** and should be preferred whenever the benchmark's goal is "how does this compare to a human interpreter's perceived lag," not just "how fast does the model start writing."

3. **Use computation-aware, not idealized, latency for any real pipeline.** The idealized AL/LAAL/ATD numbers assume free/instantaneous computation; IWSLT's own bracketed figures show computation-aware latency running 1.1–2.3× higher. A benchmark against human interpreters (who have zero "extra" inference tail) should report computation-aware numbers, or the comparison flatters the machine.

4. **Language-pair effects don't show up mainly as extra seconds of lag — they show up as cognitive load and structural compensation.** The interpreting literature (Seeber & Kerzel's pupillometry; Collard's middle-field-shortening/extraposition findings for German) suggests trained humans facing verb-final targets don't simply wait longer — they restructure output to avoid it, at a load cost that shows up in error rate over time (Moser-Mercer) rather than in EVS-in-seconds. A benchmark that only tracks AL/ATD in seconds will therefore miss the axis on which verb-final language pairs are hardest for *humans*; if the goal is a like-for-like difficulty comparison, quality metrics (WER/BLEU/error growth over speech duration) matter as much as the lag metric for these pairs.

5. **EVS methodology varies across the cited studies** (word-onset vs. word-offset alignment, inclusion/exclusion of function words, corpus-derived vs. lab-elicited). Before quoting a specific "human EVS = X seconds" figure against a system's ATD, match the alignment convention — the ATD paper's own worked example shows how a half-second of ambiguity in "which target word corresponds to which source word" swings the number.

6. **For a pure-ASR (no translation) leg of the pipeline**, the relevant comparison is not EVS at all but ASR partial/final latency (150–500ms word-level for the best streaming providers above) — this stage is not the bottleneck; the interpretation/generation stage dominates total system lag, so benchmark effort is better spent instrumenting that stage's ATD/computation-aware-LAAL than further optimizing ASR partials.

7. **Coverage gap to flag explicitly**: almost none of the streaming ASR APIs surveyed publish Arabic/Chinese/Russian latency or diarization figures separately from English — if the benchmark needs per-language latency parity (relevant given verb-final/non-Latin-script languages are exactly where human EVS is theorized to be hardest), that will likely require first-party measurement rather than vendor-published numbers.

---

## Sources

**Gap 1**: [AssemblyAI Universal-Streaming docs](https://www.assemblyai.com/docs/speech-to-text/universal-streaming) · [AssemblyAI pricing](https://www.assemblyai.com/pricing) · [AssemblyAI Universal-Streaming launch blog](https://www.assemblyai.com/blog/introducing-universal-streaming) · [AssemblyAI Universal-3 Pro Streaming blog](https://www.assemblyai.com/blog/universal-3-pro-streaming) · [Deepgram pricing](https://deepgram.com/pricing) · [Deepgram models/languages overview](https://developers.deepgram.com/docs/models-languages-overview) · [Speechmatics real-time API reference](https://docs.speechmatics.com/rt-api-ref) · [Azure Speech SDK overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-sdk) · [Azure Speech language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=stt) · [Azure OpenAI Realtime how-to](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio) · [OpenAI realtime-transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription) · [Gemini Live API docs](https://ai.google.dev/gemini-api/docs/live) · [Alibaba Cloud DashScope Paraformer real-time docs](https://www.alibabacloud.com/help/en/model-studio/paraformer-real-time-speech-recognition-python-sdk) · [Cohere Transcribe docs](https://docs.cohere.com/docs/transcribe) · [Groq speech-to-text docs](https://console.groq.com/docs/speech-to-text) · [Mistral audio capabilities docs](https://docs.mistral.ai/capabilities/audio/) · [ElevenLabs speech-to-text page](https://elevenlabs.io/speech-to-text) · [Google Cloud Speech-to-Text streaming-recognize docs](https://docs.cloud.google.com/speech-to-text/docs/streaming-recognize) · [AWS Transcribe streaming docs](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html) · [Gladia live API init](https://docs.gladia.io/api-reference/v2/live/init) · [NVIDIA Riva ASR overview](https://docs.nvidia.com/deeplearning/riva/user-guide/docs/asr/asr-overview.html) · [whisper_streaming repo](https://github.com/ufal/whisper_streaming) · [Moonshine repo](https://github.com/moonshine-ai/moonshine) · [Kyutai delayed-streams-modeling repo](https://github.com/kyutai-labs/delayed-streams-modeling)

**Gap 2**: [Lee 2004, Meta](https://doi.org/10.7202/008039ar) · [Janikowski & Chmiel 2025, Interpreting](https://doi.org/10.1075/intp.00116.jan) · [Defrancq 2015, Interpreting](https://doi.org/10.1075/intp.17.1.02def) · [Collard & Defrancq 2018, Perspectives](https://doi.org/10.1080/0907676x.2018.1553199) · [Collard 2019, Meta](https://www.erudit.org/fr/revues/meta/2018-v63-n3-meta04634/1060169ar/) · [Plevoets & Defrancq 2018, Interpreting](https://doi.org/10.1075/intp.00001.ple) · [Seeber & Kerzel 2011, Int. J. Bilingualism](https://doi.org/10.1177/1367006911402982) · [Christoffels & de Groot 2004, Bilingualism: Lang. & Cognition](https://doi.org/10.1017/S1366728904001609) · [Ma et al. 2019, STACL (ACL)](https://aclanthology.org/P19-1289/) · [Cherry & Foster 2019, DAL (arXiv:1906.00048)](https://arxiv.org/abs/1906.00048) · [Papi et al. 2022, LAAL (ACL AutoSimTrans)](https://aclanthology.org/2022.autosimtrans-1.2/) · [Kano, Sudoh & Nakamura 2024, ATD (JNLP)](https://doi.org/10.5715/jnlp.31.1049) · [IWSLT 2024 findings](https://aclanthology.org/2024.iwslt-1.1/) · [SimulSeamless: FBK at IWSLT 2024](https://aclanthology.org/2024.iwslt-1.11/)
