# Live/real-time captioning systems, with translation — landscape research

Scope: the *captioning/subtitling product* category (YouTube-style auto-captions +
auto-translate), as distinct from raw streaming-ASR APIs (already surveyed in
`live-asr-and-evs.md` / `live-models-research.md`). "Captioning" here means a product
that adds caption segmentation, reading-rate control, timing/persistence rules,
speaker labels, profanity filtering, and WebVTT/SRT/CEA-608/708 output on top of ASR
(+ optionally MT). Research date: 2026-07-21, web search + WebFetch only, no code
changes. Anything I could not confirm from a primary source is marked **NOT VERIFIED**.

Held keys (per CLAUDE.md): AssemblyAI, Azure AI Speech, Azure OpenAI, Cohere, Alibaba
DashScope, Deepgram, ElevenLabs, Gemini, Google Cloud, Groq, Mistral, OpenAI, Soniox,
Speechmatics. Everything else is NEEDS-KEY / needs a commercial contract.

---

## 1. Summary table

| # | System | Category | Public API? | Protocol | Latency claim | ar / zh / ru | Translation | Caption format out | Pricing | Key status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **YouTube automatic captions + auto-translate** | Platform | No (viewer feature only; YT Data API only manages *uploaded* caption tracks, not live auto-captions) | n/a | n/a | Auto-*generation*: en-only for live streams; 80+ languages for VOD incl. ar/zh(?)/ru — NOT VERIFIED per-language for live. Auto-*translate*: 100+ target langs incl. ar/zh/ru | Yes, Google Translate under the hood, into 100+ langs | Sidecar (viewer-only, not exportable via translate) | Free | NEEDS-KEY (not an API product) |
| 2 | **Google Meet live captions + translated captions** | Platform | No public API for live captions (Meet REST API only pulls *post-meeting* transcripts) | n/a | n/a | Basic captions ~103 langs (free); translated captions ~69 langs incl. ar/zh/ru, requires Workspace+Gemini add-on; audio dubbing GA only en↔{es,fr,de,pt,it} | Yes (translated captions tier; separate paid audio-dubbing tier) | Viewer-only | Bundled in Workspace/Gemini add-on pricing — NOT VERIFIED standalone rate | NEEDS-KEY (no API) |
| 3 | **Microsoft Teams live captions + live translated captions** | Platform | No public real-time API (Teams meeting API is for metadata, not caption stream) | n/a | n/a | ~40-50 spoken source langs incl. ar/zh/ru; translated into ~100 caption langs incl. ar/zh/ru | Yes, per-participant, included in Teams Premium / M365 Copilot | Viewer-only | Teams Premium / Copilot add-on ($/user/mo, bundled) | NEEDS-KEY (no API) |
| 4 | **Zoom live transcription + translated captions (LTT)** | Platform | Yes — **Zoom SDK API** (`getAvailableTranslationLanguages()`, `setTranslationLanguage()`) for in-meeting apps; also a webhook JSON stream | WebSocket/SDK callback | n/a | 35 translated-caption langs incl. Arabic (MSA), Chinese (Simplified/Traditional Mandarin, Cantonese), Russian | Yes, included in the LTT add-on | Viewer-only (no VTT/SRT export documented) | $5/user/month add-on (or bundled in higher Zoom Workplace tiers) | NEEDS-KEY |
| 5 | **Vimeo auto-captions + multi-language captions** | Platform | Yes — Vimeo API can upload/fetch caption tracks; auto-generation itself is not directly callable | REST | n/a | Auto-*generation* limited to en/es/fr/de/pt/ja/ko (source-language ASR); translation covers 99+ languages, presumably incl. ar/zh/ru — NOT VERIFIED | Yes, separate feature ("multi-language auto captions") | VTT/SRT via API | Bundled in paid plans | NEEDS-KEY |
| 6 | **Wistia / Brightcove / JW Player auto-captioning** | Platform | Wistia: yes, Captions API (order/fetch). Brightcove: caption *ingestion* API, no built-in ASR (relies on 3rd-party e.g. CaptionHub). JW Player: does not auto-generate; only ingests/serves existing tracks | REST | n/a | NOT VERIFIED (vendor-dependent, pass-through to whichever STT/caption vendor is plugged in) | Vendor-dependent | VTT/SRT | Bundled/varies | NEEDS-KEY |
| 7 | **Kaltura live captions & live translations (REACH module)** | Platform (**we use Kaltura for UN Web TV**) | Yes — ordered via Video Portal/Events/KMC API against the REACH module, which brokers to partner vendors (Verbit, dotSUB, and others) | REST (Kaltura API) → partner backend | n/a | Depends entirely on which REACH partner vendor is selected per order | Yes, via partner (e.g. Verbit) | VTT/SRT/CEA-608, delivered into the Kaltura player | Per-vendor, ordered à la carte; requires Webcasting (kwebcast) scheduling, not plain live entries | NEEDS-KEY (partner contract) |
| 8 | **Facebook / Instagram auto-captions** | Platform | No public API for auto-caption generation | n/a | n/a | NOT VERIFIED language list | No live translation confirmed | Sidecar (SRT-like editable) | Free | NEEDS-KEY (no API) |
| 9 | **TikTok auto-captions + live translation** | Platform | No public API | n/a | n/a | 50+ languages for TikTok LIVE captions/translation (per 3rd-party sources) — NOT VERIFIED as official TikTok claim | Yes, for TikTok LIVE chat + captions | Sidecar | Free | NEEDS-KEY (no API) |
| 10 | **AI-Media LEXI (Text/Live/Translate/Voice/Direct API)** | Dedicated vendor | Yes — **LEXI Direct API** (REST/JSON/API-key/HTTPS, per partner-developer docs) | REST | Sub-second live captioning; NOT VERIFIED exact ms figure | LEXI Translate: 50+ languages; ar/zh/ru NOT explicitly enumerated in public marketing — NOT VERIFIED | Yes, LEXI Translate is a distinct add-on module | CEA-608/708, SRT, WebVTT (broadcast-grade encoder outputs, e.g. via Ai-Live viewer) | LEXI Voice $30/hr/language; ASR captioning from $0.25/min automated, $1.25/min manual (99% acc.) | NEEDS-KEY |
| 11 | **Verbit / VITAC** | Dedicated vendor | Yes — Verbit developer portal (`verbit.readme.io`), REST APIs for transcript/caption asset integration | REST | NOT VERIFIED | NOT VERIFIED full list; broadcast/education focus, multilingual claimed generically | Yes, transcription+captioning+translation bundled or separate | VTT/SRT/CEA-608 (broadcast-ready) | Custom/enterprise; not published | NEEDS-KEY |
| 12 | **3Play Media** | Dedicated vendor | Yes — API for ordering captions/transcripts/translation, incl. live | REST | Live captions "near-real-time," exact ms NOT VERIFIED | Multilingual translation services offered; explicit ar/zh/ru support NOT VERIFIED from public pages | Yes, separate translation/localization line of business | SRT/VTT and broadcast formats | Live: $114–$360/hr depending on turnaround tier (1.90–6.00/min); VOD: 99%+ accuracy guarantee | NEEDS-KEY |
| 13 | **Rev.ai (Rev's developer API)** | Dedicated vendor (API-first) | Yes — full REST + streaming (WebSocket/RTMPS) API, this is the "buy vs YouTube" building block | WebSocket / RTMPS | Real-time streaming, low latency; concurrency limit 10, 3 hr/session cap | Rev streaming: English + 53+ additional languages at flat $0.30/hr rate incl. Chinese (per search); Arabic/Russian NOT individually confirmed — NOT VERIFIED | No built-in MT; STT only (pair with a translation API yourself) | .srt / .vtt / .json / .txt export endpoints | English streaming $0.005/min; other languages streaming $0.30/hr; Reverb (batch) $0.10–0.20/hr | NEEDS-KEY |
| 14 | **EEG Video (Falcon + Lexi + iCap Translate)** | Dedicated vendor | Yes — HTTP REST API to control Lexi jobs and Falcon encoder instances | REST + RTMP ingest/output | Real-time broadcast-grade, low latency (hardware-encoder replacement) | Lexi Automatic Captioning & Lexi Translate explicitly added Chinese, Japanese, Korean, Arabic, Russian (per vendor announcement) | Yes, iCap Translate is the dedicated MT layer | CEA-608/708, WebVTT (HLS output mode, up to 6 tracks) | NOT VERIFIED (quote-based) | NEEDS-KEY |
| 15 | **Enco enCaption** | Dedicated vendor | NOT VERIFIED — no public REST API found in search; appears to be an on-prem/appliance + cloud hybrid product, not self-serve API | n/a | "extremely low latency" (marketing claim, no ms figure) | NOT VERIFIED | NOT VERIFIED (no translation feature surfaced) | CEA-608/708 (broadcast encoder) | NOT VERIFIED (quote-based) | NEEDS-KEY |
| 16 | **Ai-Live (caption *viewer/display*, AI-Media brand)** | Dedicated vendor (display layer, not ASR) | NOT VERIFIED (display widget, consumes an existing caption feed) | n/a | n/a | n/a — passthrough | No | Displays existing captions, human- or Lexi-sourced | NOT VERIFIED | NEEDS-KEY |
| 17 | **Interprefy (Captions + Instant Mode)** | Interpretation platform w/ captioning mode | Yes — event-platform API/SDK to embed captions & interpretation | NOT VERIFIED (websocket-based per product description) | Default mode ~4 sec after sentence completion; "Instant mode" near real-time | AI translates 45 source languages into 73 caption/audio output languages incl. "all official UN languages" per vendor | Yes, translation is core to the product | NOT VERIFIED whether VTT/SRT export exists (event-viewer focus, not broadcast) | Custom/enterprise | NEEDS-KEY |
| 18 | **Wordly** | Interpretation platform w/ captioning mode | Yes — API/SDK + widget embed for events and platforms | NOT VERIFIED transport (web widget + partner SDKs, e.g. Zoom/Teams/Webex) | Real-time; ms figure NOT VERIFIED | 60+ languages incl. Arabic, Chinese (Simplified & Traditional), Russian, explicitly listed | Yes, core feature (speech-to-speech and speech-to-text) | Captions + downloadable transcripts; VTT/SRT export NOT VERIFIED | $75/hr (package-based, hour-bank model); ~$1,500 for a 10-hr/4-language event vs. ~$12,000 for human interpreters (vendor's own comparison) | NEEDS-KEY |
| 19 | **KUDO (AI Speech Translator + captioning)** | Interpretation platform w/ captioning mode | Yes — integrates into Teams/Zoom/etc. via widget/API | NOT VERIFIED transport | "Continuous" real-time, no ms figure published | Human or AI translation in 200 languages overall; captions+audio in 60-70+ languages — ar/zh/ru presumptively included given breadth, but NOT explicitly enumerated | Yes, translation is the core product; captions are generated from the (human-or-AI) interpreter audio | NOT VERIFIED VTT/SRT export | Custom/quote-based | NEEDS-KEY |
| 20 | **Sonix / Happy Scribe / Descript** | Transcription/editing tools | Sonix: yes, claims live captioning for events (40+ languages); Happy Scribe: primarily batch, no confirmed live product; Descript: batch editing tool ("Overdub"), no live captioning found | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED for live-specific pipeline | NOT VERIFIED (translation is a batch subtitle feature for these three, not confirmed live) | SRT/VTT for batch transcripts | Sonix ~$5-10/hr-ish self-serve tiers (not confirmed for live specifically) | NEEDS-KEY |
| 21 | **StreamText.net** | Captioning distribution/ingestion layer (not ASR itself) | Yes — two REST APIs: Caption Ingestion (POST captions to a URL) and Realtime Caption Pull (JSON pull), plus RTMP 608/708 encoding | HTTP POST / HTTP pull / RTMP | Real-time (pass-through of whatever captioner/ASR feeds it) | Passthrough — depends on the captioner feeding it | No (pure caption *distribution*, not translation) | RTMP CEA-608/708 embed, plus web widget | NOT VERIFIED | NEEDS-KEY |
| 22 | **SyncWords** *(bonus — appeared repeatedly as a common building block across Vimeo/AWS/embeddable-player integrations)* | Dedicated vendor / cloud building block | Yes — RESTful API, "no license fee," pay-per-use | REST, HLS ingest | Real-time HLS captioning | Live AI captions in 50+ languages; GenAI contextual MT into 100+ languages — ar/zh/ru presumptively included given breadth, NOT individually enumerated in the pages fetched | Yes, translation layer is separate from captioning but integrated | HLS-embedded captions, widget, WebVTT | Pay-per-use, volume-based enterprise rates | NEEDS-KEY |
| 23 | **Google Cloud Speech-to-Text v2 + Cloud Translation** *(cloud building block)* | Build-your-own | Yes | gRPC/REST streaming (5-min session cap, must reconnect); batch v2 has native SRT/VTT caption output via BatchRecognize | Streaming ~ real-time; docs note 5-minute stream timeout requiring reconnect logic | STT: broad language list incl. ar/zh/ru (Chirp models); Translation: 195 languages incl. ar/zh/ru, ~100ms NMT latency | Separate services, glued by you | Native SRT/VTT from Speech-to-Text v2 BatchRecognize (batch only, not streaming) | STT streaming $0.016/min (Chirp), volume tiers down to $0.004/min; Translation $20/1M chars (NMT), $80/1M for Advanced/LLM tiers | **KEY HELD** (Google Cloud) |
| 24 | **Azure AI Speech captioning scenario + Azure Translator** *(cloud building block)* | Build-your-own | Yes | Speech SDK/CLI (streaming) or Batch Transcription API (file); output SRT/WebVTT natively documented | Real-time via `Recognizing`/`Recognized` events; `StablePartialResultThreshold` tunable to trade latency for stability | Broad language list (already in production use for fr/es/ar/ru per our own STT_ROUTING); Translator covers ar/zh/ru | Separate Translator service, not bundled into captioning scenario | Native SRT/WebVTT documented output, profanity filter (mask/remove/show), SMPTE-TT mentioned | Real-time STT ~$1/hr standard tier, volume commitment down to $0.66/hr | **KEY HELD** (Azure AI Speech; already production for fr/es/ar/ru) |
| 25 | **AWS Transcribe Streaming + Amazon Translate** *(cloud building block, official reference architecture)* | Build-your-own | Yes — official AWS Solution "Live Streaming with Automated Multi-Language Subtitling" (CloudFormation, open-source on GitHub) | MediaLive → Transcribe Streaming (WebSocket/HTTP2) → Lambda → Translate → MediaPackage | Near-real-time, "slightly time-delayed... similar to a stenographer" (AWS's own description); ms figure NOT VERIFIED | Transcribe streaming: ar-SA and ru-RU confirmed in docs; zh (Mandarin-Mainland) support confirmed for the service overall but explicit *streaming* confirmation NOT VERIFIED in this pass | Yes — architecture supports 1 input + up to 5 translated caption languages via Amazon Translate | Reference architecture emits captions into HLS/DASH manifests (WebVTT-style segments) | Transcribe streaming $0.024/min tier 1 (down to $0.0102/min at scale); Translate $15/1M chars | NEEDS-KEY (no AWS credentials listed in our held set) |
| 26 | **Deepgram** *(cloud building block)* | Build-your-own | Yes — streaming API; open-source `deepgram-captions` packages (Python/JS) generate SRT/WebVTT from Deepgram transcripts. "Live Captions" marketing page returned HTTP 410 (retired) — NOT VERIFIED as a still-current standalone product | WebSocket streaming | Low-latency streaming (Nova models) | Nova models: 45+ languages — ar/zh/ru presence NOT individually re-verified this pass (see prior live-asr survey) | No built-in MT; STT + open-source caption-formatting helpers only | SRT/WebVTT via the open-source helper libraries, not a server-side captioning API per se | Standard Deepgram STT streaming pricing (not separately priced for "captioning") | **KEY HELD** (Deepgram) |
| 27 | **AssemblyAI** *(cloud building block)* | Build-your-own | Yes — `get subtitles` endpoint (`export_subtitles_srt()`/`_vtt()`, `chars_per_caption` param) for completed (batch) transcripts; live streaming API returns `Turn` events that the caller must convert to caption chunks themselves | REST (batch subtitle export) + WebSocket (streaming, Universal-3.5) | Real-time streaming (Universal-3.5 Pro is fast per our own eval notes) | Per our production routing, AssemblyAI is our chosen en provider; broad multilingual support exists but ar/zh/ru via AssemblyAI NOT our production choice (we route those elsewhere) | No built-in MT | Native SRT/VTT export for batch; caller must build live caption chunking from streaming `Turn` events | Standard AssemblyAI STT pricing | **KEY HELD** (AssemblyAI; already production for en) |

---

## 2. Per-vendor / per-system detail

### A) Platform auto-captioning with translation

**YouTube.** Automatic captions are ASR-generated; YouTube's own help pages name no
specific model, just "speech recognition technology" and "machine learning
algorithms" ([support.google.com/youtube/answer/6373554](https://support.google.com/youtube/answer/6373554?hl=en)).
Auto-*generation* for **live streams is English-only** — this is the single most
consequential fact in this whole survey for the "auto-translate for live foreign-
language video" use case: YouTube cannot auto-caption a live non-English stream at
all, and therefore cannot auto-translate one either, because auto-translate is
applied to an *existing* caption track (own or auto-generated), not directly to
audio ([support.google.com/youtube/answer/6373554](https://support.google.com/youtube/answer/6373554?hl=en);
corroborated by [Slator's 2021 coverage of the live-auto-caption rollout](https://slator.com/youtube-offers-live-auto-captions-for-all/),
which frames it as an English-first launch with more languages "soon"). For
uploaded/VOD content, auto-caption generation covers 80+ languages. Auto-translate
of the resulting captions covers 100+ target languages via Google Translate, with
accuracy reported anecdotally at 70-90% depending on source-caption quality
([vozo.ai](https://www.vozo.ai/blogs/translate-youtube-videos)). There is no API for
either auto-caption generation or auto-translate; the YouTube Data API v3 `captions`
resource only lists/uploads/downloads *existing* caption tracks and requires the
video owner's OAuth ([developers.google.com/youtube/v3/docs/captions](https://developers.google.com/youtube/v3/docs/captions)).
For live streams, YouTube instead exposes a **"POST captions to URL"** ingestion
slot — i.e., YouTube expects *you* to run your own ASR/human captioner and push text
in, rather than offering that ASR as an API
([Karasch KB](https://www.karasch.com/kb/how-to-add-captions-to-youtube-live-via-api/)).
Verdict: not a benchmarkable system in any API sense — it's a UI feature, and for
UN-relevant non-English live audio it plainly does not apply.

**Google Meet.** Three distinct tiers, confirmed via Google's own Meet Help pages:
(1) free live captions in ~103 languages; (2) translated text captions (Workspace +
Gemini add-on) explicitly covering Arabic, Chinese (Simplified and Traditional
Mandarin), and Russian among its list
([support.google.com/meet/answer/10964115](https://support.google.com/meet/answer/10964115?hl=en&co=GENIE.Platform%3DDesktop));
(3) speech-to-speech audio dubbing, GA only for English↔{Spanish, French, German,
Portuguese, Italian}, with a broader Gemini 3.5 Live Translate model (70+ languages)
in private preview per third-party reporting (NOT VERIFIED against a Google primary
source). No public API exposes live captions or translated captions in real time;
the official **Meet REST API** only retrieves *post-meeting* artifacts (recordings,
transcripts, transcript entries) via `conferenceRecords.transcripts.entries.get`,
and explicitly does **not** let you join calls, stream audio, or fetch live captions
([developers.google.com/workspace/meet/api/guides/overview](https://developers.google.com/workspace/meet/api/guides/overview)).
Third-party "meeting bot" vendors (Recall.ai, Gladia) work around this by joining as
a bot participant and scraping the DOM caption container or hooking a virtual
audio device — not a sanctioned integration path.

**Microsoft Teams.** Live captions cover ~40-50 spoken source languages; live
*translated* captions (Teams Premium / M365 Copilot only) translate into ~100
caption languages, with Arabic, Russian, and Chinese (Simplified, PRC) explicitly
named in Microsoft's own list
([Microsoft Translator blog](https://www.microsoft.com/en-us/translator/blog/2022/10/13/announcing-live-translation-for-captions-in-microsoft-teams/)).
Each participant chooses their own caption language independently. No public API
for the live caption stream itself was found; Teams' developer surface (Graph API)
is meeting-metadata-oriented, not a captions-in/out stream. NEEDS-KEY, and even with
a Microsoft 365 tenant this is a licensed feature, not an API product.

**Zoom.** The one platform vendor here with a genuine developer-facing API: the
**Zoom Video SDK's Live Transcription and Translation (LTT) helper**
(`ZoomVideoSDKLiveTranscriptionHelper` / `getAvailableTranslationLanguages()` /
`setTranslationLanguage()`) lets an embedding app enumerate and select translation
languages and receive transcript/translation events in real time
([developers.zoom.us/docs/video-sdk/web/transcription-translation](https://developers.zoom.us/docs/video-sdk/web/transcription-translation/)).
Zoom's AI Companion translated-captions feature covers 35 languages including
Arabic (MSA), Chinese (Mandarin Simplified, Mandarin Traditional, and Cantonese as
three separate entries), and Russian, confirmed via
[zoom.com/en/blog/translated-captions](https://www.zoom.com/en/blog/translated-captions/).
Pricing: $5/user/month add-on, or bundled into Zoom Workplace Business Plus /
Premier / Enterprise tiers. No documented VTT/SRT export for the translated-caption
stream — this is a live, viewer-facing overlay, not an archival format.

**Vimeo.** Auto-caption *generation* (ASR) is currently limited to English, Spanish,
French, German, Portuguese, Japanese, and Korean as source languages
([vimeo.com/features/auto-caption](https://vimeo.com/features/auto-caption)),
notably **excluding Arabic, Chinese, and Russian as source languages for ASR**. A
separate "multi-language auto captions" feature adds *translation* of an existing
caption track across 99+ languages
([vimeo.com/features/product-updates-winter-24/multi-language-auto-captions](https://vimeo.com/features/product-updates-winter-24/multi-language-auto-captions)),
which likely covers ar/zh/ru as *targets* even though they aren't ASR source
languages — NOT VERIFIED which specific target list applies. Vimeo does expose an
API for managing caption tracks, but not for triggering ASR/translation directly
(NOT VERIFIED in depth this pass).

**Wistia / Brightcove / JW Player.** Wistia has a genuine **Captions API** to
programmatically order/fetch computer-generated (free, included in all paid plans)
or human transcripts/captions
([support.wistia.com/en/articles/8274062](https://support.wistia.com/en/articles/8274062-transcripts-and-captions)).
Brightcove has no native ASR; live captioning is delivered by third-party plugins
(e.g. CaptionHub) bolted onto the Brightcove player
([CaptionHub KB](https://support.captionhub.com/captionhub-live/anHrwmAnQCHCsf4DjG5uGX/brightcove-player-support-for-live-captions/37Gdd9riHg2nYc3hMn8DEz)).
JW Player explicitly **does not auto-generate captions**; it only ingests
existing caption tracks embedded in uploaded media or supplied manually
([docs.jwplayer.com/platform/docs/vdh-learn-about-captions](https://docs.jwplayer.com/platform/docs/vdh-learn-about-captions)).
None of the three is a self-contained ASR+translation captioning engine — all three
are integration surfaces for someone else's engine.

**Kaltura (directly relevant — we use Kaltura for UN Web TV).** Kaltura's own
captioning/enrichment layer is the **REACH module**: live captions and live
translations can be ordered per scheduled event from the Video Portal, Events
platform, or KMC, but — critically — **only for events created via the Webcasting
(kwebcast) setup**, because REACH needs the event's scheduled start/end times;
plain manually-created live entries aren't eligible
([knowledge.kaltura.com/help/live-captions-live-translations](https://knowledge.kaltura.com/help/live-captions-live-translations)).
REACH is a broker, not an ASR engine itself: it routes the actual captioning work to
partner vendors, with **Verbit** and **dotSUB** named as REACH captioning/
translation partners in Kaltura's own docs
([knowledge.kaltura.com/help/reach](https://knowledge.kaltura.com/help/reach)). So
"Kaltura live captioning" in practice means "Kaltura + whichever REACH partner you
contract" — pricing, language coverage, and API surface all inherit from that
partner (see Verbit entry below). This matters for UN Web TV: if UN Web TV ever
wanted native live captions inside the Kaltura player, it would flow through REACH
→ a partner vendor, not through us needing to build our own ingestion pipeline —
though it would also mean re-scheduling every live entry as a kwebcast event, which
NOT VERIFIED is how UN Web TV's asset pipeline is currently configured (our own
`docs/webtv-kaltura.md` would be the place to check, out of scope for this
web-only research task).

**Facebook / Instagram / TikTok.** Facebook: no public documentation found on
auto-caption language coverage or an API (NOT VERIFIED, weak search coverage).
Instagram: auto-captioning stickers in Stories, user-editable, no live-translation
feature found. TikTok: in-app "hold to translate" for any on-screen caption/comment
text (translation of static text, not live ASR), plus a separate **TikTok LIVE**
real-time caption/translation capability claimed by third parties at 50+ languages
([akkadu.ai](https://akkadu.ai/blog/translate-tiktok-live-stream-ai-live-captions/);
NOT VERIFIED against TikTok's own developer docs — no official TikTok LIVE API for
this was found). None of the three offers a usable API for our purposes.

### B) Dedicated captioning vendors with APIs

**AI-Media LEXI** is the most fleshed-out "captioning toolkit" brand found in this
survey, with named sub-products: **LEXI Text/ASR** (live automatic captioning
engine), **LEXI Translate** (live caption translation, 50+ languages), **LEXI
Voice** ($30/hr/language, presumably a captioned-audio product — NOT VERIFIED exact
mechanism), **LEXI Recorded** (VOD), and, as of IBC 2025, **LEXI Direct API** —
described as "an easy-to-use API for partner developers to use LEXI in third-party
products," REST/JSON/API-key/HTTPS/TLS
([ai-media.tv LEXI Recorded API integration doc](https://www.ai-media.tv/wp-content/uploads/LEXI-Recorded-API-Intergration.pdf);
[Advanced Television coverage of the IBC 2025 announcement](https://www.advanced-television.com/2025/09/09/ai-media-extends-lexi-suite-with-lexi-voice-lexi-direct-api-lexi-ad/)).
Pricing: automated STT from $0.25/min, manual (human) captioning at $1.25/min with
99% accuracy claimed
([sourceforge listing](https://sourceforge.net/software/product/AI-Media-LEXI/)).
Accuracy is reported not as WER but as **NER** (see §3): LEXI 3.0's press release
states average quality rose from 98.2% to 98.7% **NER**
([GlobeNewswire, 2023-05-03](https://www.globenewswire.com/en/news-release/2023/05/03/2660526/0/en/Ai-Media-Unveils-AI-driven-LEXI-3-0-The-Future-of-Live-Automatic-Captioning.html)) —
this is a genuinely useful data point since it confirms a major commercial vendor
self-reports against the broadcast-standard NER metric rather than WER.

**Verbit / VITAC.** Verbit's ASR engine is branded **Captivate**, described as
custom-trained per customer with domain dictionaries and term-boosting, claiming
"broadcast-ready accuracy" and up to 99% *targeted* accuracy in combination with
human editing
([verbit.ai/media/getting-the-names-right](https://verbit.ai/media/getting-the-names-right-verbit-delivers-broadcast-ready-accuracy-in-live-captions/)).
A developer portal exists at `verbit.readme.io` with REST APIs for transcript/
caption-asset integration ([apitracker.io/a/verbit-ai](https://apitracker.io/a/verbit-ai)).
Third-party reviews caution that non-English-language accuracy and turnaround can
lag the English claims (NOT VERIFIED which languages specifically, per
[Sonix's Verbit review](https://sonix.ai/resources/verbit-review/), itself a
competitor and not a neutral source). VITAC (Verbit's broadcast-captioning
subsidiary/brand) was not separately documented in this pass — treat as folded into
Verbit's enterprise broadcast offering, NOT VERIFIED as a materially distinct API.

**3Play Media.** Explicitly publishes *two different accuracy targets*: **96% for
live captions** vs. **99% guaranteed / 99.6% average measured for pre-recorded**
content, attributed on the record to their Senior Product Manager
([3playmedia.com/blog/lets-talk-about-live-captioning](https://www.3playmedia.com/blog/lets-talk-about-live-captioning/)).
This is one of the only vendors in this survey that publicly admits live and VOD
accuracy are *not* the same number — worth citing verbatim if we ever need to
justify a lower accuracy bar for our own live/floor-language pipeline versus our
batch pipeline. Their live-captioning technique is ASR-running-continuously +
professional captioner in parallel, with automatic failover to ASR-only if the
professional feed drops. Live pricing is turnaround-tiered: $1.90/min (10-business-
day) up to $6.00/min (2-hour turnaround)
([k-state.edu 3Play pricing PDF](https://www.k-state.edu/mediasite/help/3play-pricing.pdf)) —
note this is *post-event* live-caption turnaround pricing, not a live/real-time-only
rate; treat these figures as indicative, not a quote. 3Play uses **Speechmatics**
as (at least one of) its underlying ASR engines per Speechmatics' own case study
([speechmatics.com/product/case-studies/3playmedia](https://www.speechmatics.com/product/case-studies/3playmedia)) —
directly relevant since we hold a Speechmatics key already in production.

**Rev.ai.** The most API-native of the dedicated vendors. Full streaming API over
WebSocket or RTMPS, native `.srt`/`.vtt`/`.json`/`.txt` export endpoints, and a
documented `chars_per_caption`-style customization is not present but caption
export is straightforward
([rev.ai/streaming](https://www.rev.ai/streaming); [docs.rev.ai/api/streaming](https://docs.rev.ai/api/streaming)).
Streaming concurrency capped at 10 connections, 3-hour session limit per stream.
English streaming priced at $0.005/min; a broader set of 53+ other languages priced
at $0.30/hr flat (source: search-engine synthesis of Rev's public pricing page,
[rev.ai/pricing](https://www.rev.ai/pricing) — NOT independently re-verified via
direct fetch this pass, treat the exact figures as indicative).

**EEG Video (Falcon / Lexi / iCap Translate).** A broadcast-engineering-first
vendor: **Falcon** is a virtual RTMP caption encoder (replaces hardware encoder
appliances) that can carry either human-captioner or **Lexi** (EEG's own AI
captioning engine) output into a live stream, with HLS output mode supporting up to
six simultaneous WebVTT-tagged language tracks
([streamingmedia.com press coverage](https://www.streamingmedia.com/PressRelease/EEG-Video-Launches-Falcon-Update-with-HTTP-Live-Streaming-(HLS)-Output-Mode-For-Expansive-World-Language-Streaming-Video-Captioning-Support_52281.aspx)).
An HTTP REST API controls Lexi job settings and topic models; Falcon instances have
their own API for job management. Crucially, EEG explicitly added **Chinese,
Japanese, Korean, Arabic, and Russian** to Lexi Automatic Captioning and Lexi
Translate per the same press coverage — this is one of the few vendors with an
*explicit* named confirmation of all three of our flagged languages (ar/zh/ru)
in one place.

**Enco enCaption.** Positioned as a broadcast automated-captioning appliance/cloud
hybrid (radio and TV), using "deep neural network" ASR plus grammatical
post-processing for low latency
([enco.com/products/encaption](https://www.enco.com/products/encaption)). No public
REST API surfaced in search — this looks like an appliance/managed-service product,
not a self-serve developer API. Notably, **Speechmatics** is also the underlying
engine for at least part of ENCO's offering per Speechmatics' own case study
([speechmatics.com/product/case-studies/enco](https://www.speechmatics.com/product/case-studies/enco)) —
a second confirmation (after 3Play) that Speechmatics, which we already hold a key
for, sits underneath more than one commercial captioning brand.

**Ai-Live / "Caption Access".** "Ai-Live" (an AI-Media product, not to be confused
with the unrelated `ai-live.com` human-captioning display service that turned up in
search) is a *caption display/viewer* layer, not an ASR engine — it streams
whatever caption feed (human or Lexi) it's given to web/mobile viewers
([ai-media.tv/our-products/caption-display/ai-live](https://www.ai-media.tv/our-products/caption-display/ai-live/)).
No standalone "Caption Access" product was found under that exact name; treat as
NOT VERIFIED / possibly a naming mismatch in the original brief.

**Interprefy, Wordly, KUDO** are simultaneous-interpretation platforms that have
each added a captioning *mode* on top of their translation core, rather than
starting from captioning:
- **Interprefy Captions**: two display modes — default (~4 sec lag, waits for
  sentence completion) or "Instant mode" (near-real-time with auto-correction);
  translates 45 source languages into 73 output languages, explicitly claiming
  coverage of "all official UN languages"
  ([interprefy.com/resources/blog/the-future-of-live-captioning](https://www.interprefy.com/resources/blog/the-future-of-live-captioning-how-interprefy-ai-powers-accessibility));
  relevant given our UN-meeting focus, but this is an events/interpretation SaaS,
  not a raw model API.
- **Wordly**: 60+ languages with **Arabic, Chinese (Simplified & Traditional), and
  Russian explicitly named**
  ([wordly.ai/translator-languages](https://www.wordly.ai/translator-languages));
  pricing is hour-bank package based, starting around $75/hr, marketed against
  human-interpreter cost (their own comparison: ~$1,500 vs. ~$12,000 for a
  10-hour/4-language event) — a vendor-authored comparison, treat as directional
  marketing, not independent benchmarking.
- **KUDO**: broadest claimed reach (200 languages for human-or-AI speech
  translation overall; 60-70+ for the captioned/audio-translated tier), API/widget
  integration into Teams/Zoom, custom/quote-based pricing.

**Sonix, Happy Scribe, Descript.** Sonix explicitly markets **real-time
transcription & live captions** for events/webinars/classes in 40+ languages with
direct Zoom/Teams/Meet integrations
([sonix.ai/real-time-transcription](https://sonix.ai/real-time-transcription)) —
this is the one of the three that genuinely does live. Happy Scribe is
predominantly a batch transcription/subtitling platform (150+ languages, up to 99%
claimed AI accuracy on clear audio) with no confirmed live-captioning product found
in this pass. Descript is a batch audio/video editing tool ("edit by editing the
transcript," "Overdub" voice cloning) with no live-captioning capability found.
Treat Happy Scribe/Descript as **NOT a live-captioning system** for this survey's
purposes.

**StreamText.net** is a pure captioning *distribution* layer: it accepts caption
text via a POST-to-URL ingestion API from whatever ASR or human stenographer you're
using, and re-distributes it in real time via a pull API (JSON, line-by-line) or
RTMP with embedded CEA-608/708
([support.streamtext.net Real-Time Caption Ingestion doc](https://support.streamtext.net/hc/en-us/articles/360045245951-Real-Time-Caption-Ingestion-API-for-posting-captions-to-a-URL)).
It does no ASR or translation itself — it's a transport/display middle layer, akin
to what YouTube's "POST captions to URL" live-caption ingestion slot expects on the
input side.

**SyncWords** (not explicitly requested but appeared repeatedly as the common
integration layer behind Vimeo's live captions, AWS Elemental live workflows, and
standalone embeddable players) offers a RESTful, pay-per-use API delivering live
HLS-embedded AI captions in 50+ languages plus GenAI-driven contextual MT into
100+ target languages, with no license fee and unlimited concurrent
sessions/streams claimed
([syncwords.com/pricing](https://www.syncwords.com/pricing);
[syncwords.com/products/live-translations-captions-embeddable-player](https://www.syncwords.com/products/live-translations-captions-embeddable-player)).
Worth flagging as a candidate "glue" vendor if we ever wanted a managed live-HLS-
caption pipeline rather than building the Speech+Translate glue ourselves.

### C) Cloud building blocks marketed for captioning

**Google Cloud Speech-to-Text v2 + Cloud Translation** — the literal "build your
own YouTube" stack. Streaming recognition works for live captioning, but **Google's
own docs note streaming sessions time out after 5 minutes**, requiring the caller to
implement reconnect logic without losing words
(source: search-engine synthesis referencing Google's migration docs — NOT directly
re-verified via fetch this pass, but consistent with long-standing Google STT
streaming behavior). Native **SRT/WebVTT caption generation is v2-only and
`BatchRecognize`-only** (i.e., batch, not the live streaming path) per
[docs.cloud.google.com/speech-to-text/docs/caption-support](https://docs.cloud.google.com/speech-to-text/docs/caption-support) —
meaning Google's own "caption support" feature does not apply directly to live
audio; you'd still assemble VTT/SRT yourself from streaming interim/final results.
Cloud Translation covers 195 languages including ar/zh/ru, with the standard NMT
model quoted at ~100ms latency, making it a genuine real-time-viable MT backend
([docs.cloud.google.com/translate/docs/advanced/nmt-model](https://docs.cloud.google.com/translate/docs/advanced/nmt-model)).
Pricing: STT streaming $0.016/min (Chirp) down to $0.004/min at volume; Translation
$20/1M chars (Basic/Advanced NMT), $80/1M for Adaptive/LLM-based tiers. **We hold a
Google Cloud key.**

**Azure AI Speech captioning scenario + Azure Translator.** Microsoft explicitly
documents captioning as a named scenario (not just an ASR feature): the docs cover
caption/speech synchronization (offset+duration in ticks), a profanity filter
(mask/remove/show), native SRT and WebVTT output examples, and — most usefully — a
tunable `SpeechServiceResponse_StablePartialResultThreshold` property that lets you
trade caption "flicker" (words changing as ASR revises its hypothesis) against
added latency, with a worked example showing exactly how raising the threshold from
default to 5 eliminates mid-utterance correction at the cost of waiting longer per
word ([learn.microsoft.com/.../captioning-concepts](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/captioning-concepts)).
This is the most *captioning-engineering-literate* documentation found in this
entire survey — genuinely useful if we ever want to expose live captions from our
own Azure AI Speech-based fr/es/ar/ru pipeline, since it's the same service we
already use in production (per our own `STT_ROUTING`). Real-time STT pricing:
~$1/hr standard tier, down to $0.66/hr at a 2,000 hr/month commitment. **We hold an
Azure AI Speech key and already use it in production for fr/es/ar/ru.**

**AWS Transcribe Streaming + Amazon Translate.** AWS publishes an actual reference
*solution*, not just docs: **"Live Streaming with Automated Multi-Language
Subtitling"**, a CloudFormation-deployable architecture (MediaLive → Transcribe
Streaming → Lambda → Translate → MediaPackage) supporting one input language and up
to five translated caption output languages, open-sourced on GitHub
([awslabs/live-streaming-with-automated-multi-language-subtitling](https://github.com/awslabs/live-streaming-with-automated-multi-language-subtitling);
[architecture doc](https://docs.aws.amazon.com/solutions/latest/live-streaming-with-automated-multi-language-subtitling/architecture.html)).
AWS's own description: "subtitles are slightly time-delayed from the audio, similar
to a stenographer." Transcribe streaming confirms Arabic (ar-SA) and Russian
(ru-RU) in its supported-languages table; Chinese Mandarin-Mainland support is
confirmed for the service overall (added per a 2019 AWS announcement) but I did not
independently re-confirm it's in the *streaming* (vs. batch-only) column this pass
— flag as NOT VERIFIED. Pricing: Transcribe streaming $0.024/min tier 1, down to
$0.0102/min at 1M+ min/month; Translate $15/1M characters. **We do not hold an AWS
key** in the set listed in CLAUDE.md.

**Deepgram / AssemblyAI captioning features.** Both are raw-ASR vendors we already
hold keys for, each with a *thin* captioning veneer rather than a dedicated
captioning product:
- **Deepgram** ships open-source helper libraries (`deepgram-captions` for
  Python, `@deepgram/captions` for JS) that convert Deepgram transcript JSON into
  SRT/WebVTT
  ([deepgram.com/learn/subtitles-made-easy](https://deepgram.com/learn/subtitles-made-easy-deepgram-s-new-open-source-captioning-packages)).
  A marketing page titled "Live Captions" (`deepgram.com/ai-apps/live-captions`)
  returned **HTTP 410 Gone** when fetched directly — the page appears to have been
  retired, so I cannot verify it's still a current, distinct product; treat any
  "Deepgram Live Captions" branding as **NOT VERIFIED / possibly discontinued**.
  What is verified is the underlying streaming API + the open-source caption
  formatters, which is enough to build a captioning pipeline ourselves.
- **AssemblyAI** has a genuine batch-side captioning endpoint
  (`export_subtitles_srt()` / `export_subtitles_vtt()`, with a `chars_per_caption`
  readability control) for *completed* transcripts
  ([assemblyai.com/docs/api-reference/transcripts/get-subtitles](https://www.assemblyai.com/docs/api-reference/transcripts/get-subtitles)),
  but for **live** streaming audio, the API only emits `Turn` events (Universal-
  Streaming's turn-taking JSON) — the caller has to do their own caption
  segmentation/chunking to get live VTT/SRT-equivalent output
  ([assemblyai.com/blog/subtitle-file-format](https://www.assemblyai.com/blog/subtitle-file-format)).
  This mirrors our own current architecture (we already consume AssemblyAI's raw
  transcript and do our own downstream segmentation), so "AssemblyAI captioning" is
  not a separate product we'd adopt wholesale — it confirms our own build-it-
  ourselves approach is the norm, not an outlier.

Also checked briefly: **Soniox** has published an educational wiki page on
caption/subtitle timing rules (reading rate capped near 17 chars/sec for adults,
1-7 sec duration) but this reads as generic guidance, not a Soniox-specific
captioning product feature
([soniox.com/wiki/captions-subtitles-srt-vtt](https://soniox.com/wiki/captions-subtitles-srt-vtt)).
**ElevenLabs, Gemini, OpenAI, Groq, Mistral, Cohere** — no dedicated
captioning-positioned product surfaced for any of these in this pass; they are
general-purpose STT/multimodal/LLM APIs that *could* be used as building blocks
(e.g. Gemini's Live API for multimodal real-time streaming, which Google itself
references as the tech underpinning the in-preview "Gemini 3.5 Live Translate" tier
of Google Meet) but none publishes a captioning-specific feature set (segmentation
controls, reading-rate limits, CEA-608/708 output) the way Azure AI Speech and
Google Cloud Speech-to-Text v2 do. Treat this as **NOT VERIFIED as an exhaustive
negative** — a deeper pass through each vendor's docs could turn up something,
but nothing surfaced via search.

---

## 3. Accuracy claims and accuracy *standards*

### What vendors claim (self-reported, not independently audited)

| Vendor | Live accuracy claim | VOD/pre-recorded accuracy claim | Metric used |
|---|---|---|---|
| AI-Media LEXI | 98%+ (general marketing); 98.7% in the LEXI 3.0 release specifically | — | **NER** (explicitly named in the LEXI 3.0 press release) |
| Verbit | up to 99% "targeted accuracy" via hybrid AI+human | — | Not specified (implicitly WER-like, not stated) |
| 3Play Media | ~96% (explicitly held to a *lower* bar than VOD, on the record) | 99% guaranteed minimum / 99.6% average measured | Not specified by name, but discussed as "accuracy rate" |
| Happy Scribe (batch, for comparison) | n/a | up to 99% AI accuracy on clear audio | Not specified |

Sources: [AI-Media LEXI 3.0 press release](https://www.globenewswire.com/en/news-release/2023/05/03/2660526/0/en/Ai-Media-Unveils-AI-driven-LEXI-3-0-The-Future-of-Live-Automatic-Captioning.html);
[Verbit](https://verbit.ai/media/getting-the-names-right-verbit-delivers-broadcast-ready-accuracy-in-live-captions/);
[3Play Media](https://www.3playmedia.com/blog/lets-talk-about-live-captioning/).

The key finding: **3Play Media is the only vendor in this survey that publishes
two different numbers for live vs. recorded and explains why** (real-time
constraints make live inherently harder to hold to the same bar) — everyone else
either only quotes one number or quotes the best-case (usually VOD/hybrid-with-
human-QA) number in their marketing.

### Regulatory / standards-body accuracy frameworks

**FCC (US, broadcast television).** 47 CFR § 79.1, quality standards released
February 2014, covering four dimensions rather than a single accuracy percentage:
**accuracy** (captions must match spoken dialogue and convey non-verbal information
— speaker ID, music/sound-effect description, tone/emotion, audience reaction),
**synchronicity** (captions must coincide with corresponding audio, displayed at a
readable speed, delay minimized), **completeness** (run start-to-finish), and
**placement** (not obscuring other on-screen info)
([FCC guide](https://www.fcc.gov/consumers/guides/closed-captioning-television);
[Cornell LII text of 47 CFR §79.1](https://www.law.cornell.edu/cfr/text/47/79.1)).
The FCC does **not** mandate a specific numeric accuracy threshold (no "98%" or
"99%" appears in the rule itself) — that number is industry convention, not
regulation.

**WCAG.** WCAG's own success criteria (1.2.2 Captions Prerecorded, 1.2.4 Captions
Live) require captions to exist and be accurate/synchronized but likewise specify
**no numeric accuracy percentage**. The commonly cited "99% accuracy" figure is an
**industry best-practice convention**, not a WCAG requirement — multiple secondary
sources (accessibility vendors, compliance blogs) state this explicitly
([accessibility.com](https://www.accessibility.com/blog/why-99-accuracy-in-captions-matters);
[testparty.ai](https://testparty.ai/blog/video-captioning-requirements)). The "1%
error / ~15 errors per 1,500 words" framing is the informal math behind that
convention, not a formula from any standards document.

**The NER model (Europe, live subtitling — this is the important one).** Developed
by Pablo Romero-Fresco and Juan Martínez, the **NER model** ("Number, Edition,
Recognition" — or similarly named error-weighting scheme) is the standard tool used
across the UK and multiple European countries to assess **live** (respoken)
subtitle accuracy, and it is deliberately *not* WER:

- It classifies errors by **severity** based on how much a mismatch between
  subtitle and source audio damages the viewer's access to meaning, analyzed in
  terms of *idea units* — not a flat edit-distance count the way WER is
  ([Romero-Fresco, "Accuracy Rate in Live Subtitling: The NER Model," Springer](https://link.springer.com/chapter/10.1057/9781137552891_3);
  [ResearchGate copy](https://www.researchgate.net/publication/282851484_Accuracy_Rate_in_Live_Subtitling_The_NER_Model)).
- An accuracy/approval rate of **over 98% NER** is generally treated as the
  acceptable threshold for broadcast live subtitling
  ([Springer summary](https://link.springer.com/article/10.1007/s10209-020-00735-6)).
- Two extensions exist: **NERLE** (NER for Live Events — theatre, conferences,
  live public events, developed because the original NER missed error categories
  specific to non-broadcast live settings, e.g.
  [Springer 2023](https://link.springer.com/article/10.1007/s10209-023-01050-6)),
  and **NTR** (an *interlingual*/translated-live-subtitling variant of the same
  family, for when the live subtitles are also being translated, e.g.
  [lans-tts.uantwerpen.be NTR model](https://lans-tts.uantwerpen.be/index.php/LANS-TTS/article/view/438)).
  **NTR is the directly relevant variant for our use case** (live + translated
  subtitles), since NER/NERLE were designed for same-language (intralingual) live
  respeaking, not cross-language live captioning.
- AI-Media explicitly reports its own product's quality **in NER terms** (98.7%
  NER, per the LEXI 3.0 press release above) — i.e., a major commercial ASR-based
  live-captioning vendor has adopted the academic/regulatory metric as its own
  headline KPI, rather than WER. This is a strong signal that **if we ever want to
  benchmark our own live/floor-language captioning against industry practice, NER
  (or NTR for the translated case) — not raw WER — is the metric the rest of the
  live-subtitling industry would recognize as legitimate**, and it's a genuinely
  different scoring philosophy from the WER/CER metrics our `eval/` harness
  currently uses for batch transcription accuracy.

### Why this matters for our eval harness

Our existing `eval/` system (per `docs/eval.md`) scores WER/CER against PV
documents — a batch, same-language framing. Nothing in this survey suggests we
should replace that for our primary batch-transcription evaluation. But if a future
task specifically targets *live* caption quality (e.g., benchmarking latency-vs-
accuracy tradeoffs the way Azure's `StablePartialResultThreshold` knob does, or
scoring a live floor-language + translation pipeline), **NER/NERLE/NTR — not
WER — is the metric the broadcast/accessibility industry would consider legitimate
for that comparison**, and it's worth keeping distinct from our batch WER pipeline
rather than conflating the two.

---

## 4. Ranked shortlist: what we could actually benchmark today with keys in hand

Ranked by how directly a held key gets us to an actual live-captioning-style
pipeline (streaming ASR + segmentation/timing + optional MT), not just raw STT:

1. **Azure AI Speech (captioning scenario) — highest priority.** We already hold
   the key and already use this service in production for fr/es/ar/ru. Microsoft's
   own captioning-concepts docs give us, for free, the exact levers a captioning
   benchmark needs: native SRT/WebVTT output, the `Recognizing`/`Recognized`
   partial-result event model, the `StablePartialResultThreshold` latency/
   flicker knob, and a documented profanity filter. This is the only vendor in
   the entire survey whose docs are *written for* the captioning-engineering
   problem (not just "here's a transcript"), and it's the one we already run in
   production — so a live-captioning benchmark here is close to free.

2. **Google Cloud Speech-to-Text v2 + Cloud Translation.** Key held. Gives us the
   literal "AWS/GCP build-your-own-YouTube" stack: streaming STT (with the known
   5-minute-reconnect caveat to design around) feeding Cloud Translation's ~100ms-
   latency NMT into ar/zh/ru. Good second data point precisely because it's a
   different architecture (separate STT+MT services you glue yourself, vs. Azure's
   single integrated captioning scenario).

3. **AssemblyAI + Deepgram (raw streaming, DIY captioning layer).** Keys held for
   both, already in production for AssemblyAI (en). Neither has a captioning-
   specific server-side feature for *live* audio — AssemblyAI's caption export is
   batch-only, Deepgram's is an open-source client-side helper — so benchmarking
   these means measuring our own segmentation logic on top of their streaming
   `Turn`/interim-result events, not the vendor's captioning quality per se. Useful
   as a "what does it cost us to build the captioning layer ourselves" comparison
   point against Azure's built-in scenario.

4. **Speechmatics.** Key held, already production for the floor track. Not
   surveyed here as a dedicated "captioning product" (no distinct captioning
   feature set beyond SRT formatting docs found), but worth flagging that **two
   different commercial captioning vendors (3Play Media and ENCO) run Speechmatics
   under the hood** per Speechmatics' own case studies — indirect evidence that
   Speechmatics' raw ASR is already considered "broadcast-caption-grade" by
   companies whose entire business is caption quality. Low-effort to fold into any
   live-captioning benchmark since we already hold the key and use it in
   production.

5. **Gemini (Live API, as a captioning-adjacent building block).** Key held.
   Not a captioning product, but Google's own Meet translated-captions roadmap
   explicitly cites a "Gemini 3.5 Live Translate" model as the tech behind its
   *next* live-translation tier — so this is worth a speculative look if we ever
   want a single-model (not STT-then-MT-pipeline) approach to live translated
   captions. NOT VERIFIED how mature/available this actually is outside Google's
   own product (private preview per third-party reporting only).

Everything else worth benchmarking (AI-Media LEXI, Verbit, 3Play, Wordly, KUDO,
Interprefy, EEG, Rev.ai, SyncWords) is **NEEDS-KEY** — a genuine commercial
evaluation would require an actual contract/trial account with each vendor, since
none of them overlaps with our existing key set and none offers a meaningful free/
self-serve tier for live+translation specifically (as opposed to their batch/VOD
products, several of which do have self-serve trials — NOT explored in this pass
since the ask was about live captioning). If a follow-up task wants a real
side-by-side, **Rev.ai** is the cheapest entry point to test with a card (documented
self-serve pricing, WebSocket API, no enterprise sales process required), followed
by **Wordly** (package-based but with a documented starting price, $75/hr) as the
cheapest interpretation-platform-with-captioning option to trial.

---

## Notes on research method and confidence

- All findings are from `WebSearch` (search-engine synthesis with cited links) and
  `WebFetch` (direct page fetch + extraction) — no code was written or run, no
  files other than this report were modified.
- Claims are cited inline; anything not traceable to a specific fetched/cited URL
  is marked **NOT VERIFIED** rather than presented as fact. Several `WebSearch`
  results are themselves search-engine-synthesized summaries of multiple pages
  rather than a single primary source — where that's the case, I've named the
  underlying source page(s) so the caller can re-verify directly if a claim is
  going to be relied on for a decision.
- Two things surfaced that were not on the original vendor list but are directly
  relevant and worth the caller's attention: **SyncWords** (a recurring "glue"
  vendor behind Vimeo/AWS/embeddable-player live captioning) and the **NTR model**
  (the *translated*-live-subtitling variant of NER — more relevant to our
  translation use case than plain NER/NERLE, which are same-language).
- One notable negative result: **YouTube cannot auto-caption non-English live
  audio at all** (English-only for live auto-captions per Google's own help page),
  which forecloses "just point people at YouTube's captions" as a fallback for any
  non-English UN meeting livestream.
