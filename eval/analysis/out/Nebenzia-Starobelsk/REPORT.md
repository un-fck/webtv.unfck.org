# Quality Analysis — Nebenzia-Starobelsk (Russian-accented English)

Press conference by Vassily Nebenzia (Russian PR) on the strike on a college in Starobelsk, ~40 min, 2026-05-26. Reference-free analysis using the 6-provider ensemble as pseudo-ground-truth. Primary track: en. Providers: assemblyai (Universal-2), mistral (voxtral-mini), gemini (gemini-3-flash), azure-openai (gpt-4o-transcribe), alibaba (qwen3-asr-flash), elevenlabs (Scribe v2).

Recording note: the EN track is the live English interpretation/floor where Nebenzia speaks accented English directly, but also contains short untranslated Russian-language clips (survivor video footage). Those Cyrillic passages are correct content, not hallucinations.

## Per-provider error profile

- **assemblyai** — Cleanest structure (100% Latin, 0 off-script, no repetition, 98.3% coverage) but worst at accented-English word accuracy. Mis-hears Nebenzia's vowels/consonants: "appalling"→"polling", "minors in cold blood"→"miners in crime", "waves"→"ways", "scene"→"this in itself", plus nonsense insert "the eu, who was there". Confident, fluent, and wrong on hard words.
- **mistral** — Over-generates: 435 utts, 1081 chars/min, 115% coverage (overlapping/duplicated segments). Shares the flagship "appalling"→"polling" error. Invents entities ("Praliska Humanitarian Mission", "Schaffach", "Vasily Likseyev"). Correctly preserved Russian survivor clips in Cyrillic.
- **gemini** — LLM-based, most fluent/contextually correct on hard words (appalling, minors in cold blood, waves, scene). Downsides: lowest coverage (69.8%), stops at 37.5 min, and paraphrases ("This is yet another…", "Tokyo Broadcasting journalists from Japan participated" — invented from garbled "Tokyo barred its journalists").
- **azure-openai** — Good word recovery (appalling, minors in cold blood) but acoustically unstable in noisy/disfluent stretches, producing fluent-but-invented garble: "Vasilina Ibenzia", "crashes the request of the UN Security Council", "approaching the Senate" (for "the scene"), "We should remain serious", "so much of the mind visualize, yet there is no magic". Keeps Russian clips (4% Cyrillic). Verbose.
- **alibaba** — Extreme lumping: only 10 utterances for 40 min (unusable segmentation) but text is among the most accurate (appalling, minors in cold blood, waves, scene). Weakest on names ("Vassily Lyubimov", "Tokyo Bartels", "Rescue" for "Russia").
- **elevenlabs** — Strong all-round: got every flagship word right, marks disfluencies/repairs faithfully ("firsthands-- firsthand", "hos-hospitalized"), 97.9% coverage, clean structure. Best balance of accuracy and completeness. Minor: Kiev/Kyiv split 12/12.

## Accented-English error table

| Timestamp | Consensus | assemblyai | mistral | gemini | azure-openai | alibaba | elevenlabs | Error type |
|---|---|---|---|---|---|---|---|---|
| ~5:30 | appalling | polling | polling | appalling | appalling | appalling | appalling | ACOUSTIC (stress test) |
| ~2:00 | minors in cold blood | miners in crime | (ok) | (ok) | (ok) | (ok) | (ok) | ACOUSTIC double sub |
| ~1:30 | three successive waves | ways | waves | waves | waves | waves | ways | ACOUSTIC |
| ~3:30 | approaching the scene | this in itself | scene | scene | the Senate | scene | scene | ACOUSTIC (aa drop; az homophone) |
| ~3:30 | Tokyo barred | barters | Bart | Broadcasting…participated | (dropped) | Bartels | barred | ACOUSTIC + HALLUCINATION |
| ~0:30 | (at) Russia's request | "the eu, who was there" insert | "the U.S. Who was that?" | clean | "BBC? were you… crashes the request" | clean | (ok) | HALLUCINATION |
| ~0:00 | Alexeyevich (patronymic) | "Vasily" | "Vasily Likseyev" | Alekseyevich | Alekseevich | "Vassily Lyubimov" | Alekseyevich | name invention |
| ~5:00 | Russia | Russia | Russia | Russia | Russia | "Rescue" (1×) | Russia | ACOUSTIC |
| ~5:30 | Olya Kovaleva | Kovaleva | Kovaliva | (drop) | "Olga Kovaliewa" | Kovalyova | Kovaleva | spelling drift |
| ~12:30 | (disfluent noise) | — | — | "What's up? What's up?" | "We should remain serious"/"the mind visualize" | — | — | HALLUCINATION |
| ~13:00 | Strait of Hormuz | (ok) | (ok) | (ok) | "of Hormuz" (Strait dropped) | (ok) | (ok) | deletion |
| name | Shafaq | Shafakh | Schaffach | Shafak | Shafagh | Schaffach | Shafaq | ACOUSTIC |

Confirm: "polling" vs "appalling" isolates exactly assemblyai + mistral as wrong; the other four correct.

## Proper-noun spelling table

| Name | assemblyai | mistral | gemini | azure-openai | alibaba | elevenlabs |
|---|---|---|---|---|---|---|
| Nebenzia | Nybenzia/Nibenzia | Nibenzia | Nebenzya | "Vasilina Ibenzia" | Nebenzia | Nebenzya |
| Starobelsk | Starybersk/Starobersk/Starobilsk/Starebsk | Starobylsk/Starobelsk | Starobilsk/Starobelsk | Starobelsk (9×, most stable)/"Stary Beslan" 1× | Starobilsk/Starobelsk | Starobilsk/Starobelsk/Starobe |
| patronymic | "Vasily" | "Vasily Likseyev" | Alekseyevich | Alekseevich | "Vassily Lyubimov" | Alekseyevich |
| Kyiv/Kiev | Kyiv19/Kiev3 | Kiev16/Kyiv6 | Kyiv 23 | Kiev20/Kyiv2 | Kyiv 23 | 12/12 split |
| Olya Kovaleva | Kovaleva | Kovaliva | (drop) | "Olga Kovaliewa" | Kovalyova | Kovaleva |
| Irina Zhivotikova | Jvotikova | Zivotikova | (drop) | Zivotikova | Zhivotikova | Zhevotikova |
| Bucha | Bucha/Buchi | Buche/Bucci | Bucha | Bucha/Buchi | Bucha | Bucha |
| Konstantin Dubovoy | "Constantine" | Konstantin | (drop) | Konstantin | Konstantin | Konstantin |

azure-openai most consistent on Starobelsk but also worst name inventions; gemini/alibaba consistent on Kyiv; no provider rendered the patronymic correctly.

## Ranked anomaly list

| Severity | Type | Timestamp | Providers | Evidence |
|---|---|---|---|---|
| HIGH | Acoustic semantic | ~5:30 | assemblyai, mistral | "Equally polling" for "appalling" |
| HIGH | Acoustic semantic | ~2:00 | assemblyai | "kill miners in crime" for "minors in cold blood" |
| HIGH | Hallucination noise-fill | ~12:30 | azure-openai, gemini | invented sentences in disfluent audio |
| HIGH | Name corruption | ~0:00 | azure-openai, alibaba | "Vasilina Ibenzia", "Vassily Lyubimov" |
| MED | Over-generation/overlap | whole | mistral | 435 utts, 1081 cpm, 115% coverage |
| MED | Coverage gaps | 37.5+ min | gemini | 69.8% coverage, drops clip names |
| MED | Lumping | whole | alibaba | 10 utts / 40 min |
| MED | Hallucinated reading | ~3:30 | gemini | "Tokyo Broadcasting…participated" |
| LOW | Garbled crosstalk | ~0:30 | assemblyai, azure-openai | "the eu, who was there"; "crashes the request" |
| LOW | Place-name invention | ~3:30 | azure-openai | "Stary Beslan" |
| LOW | Deletion | ~13:00 | azure-openai | "Strait" dropped |
| INFO | Cyrillic = CORRECT | 5:30–7:00 | mistral 3.2%, azure 4%, alibaba 0.2% | untranslated Russian survivor clips; the 100%-Latin providers actually translated/dropped them |

## Headline findings

- Best for Russian-accented English: **elevenlabs** (every hard word right, 98% coverage, marks repairs), narrowly over alibaba (matches word accuracy but unusable segmentation, weak names).
- Worst for accented English: **assemblyai** — cleanest structure but the model that mis-hears accented vowels/consonants; only it + mistral produce "polling", and it uniquely turns "minors in cold blood" into "miners in crime". Dangerous because errors are fluent and meaning-changing.
- "appalling"→"polling" confirmed and discriminating: exactly assemblyai + mistral fail; the other four succeed.
- Two failure modes by architecture: LLM models (gemini, azure) hallucinate coherent text over noise and drop content (gemini 70% coverage); classic ASR (assemblyai, alibaba) mis-hear individual accented words while staying complete.
- Proper nouns are everyone's weak spot; no provider rendered "Alexeyevich" correctly.
- RU-track caveat (signal only): only gemini transcribed the Russian floor in Cyrillic; the others transcribed the English overlay instead — a track/language-routing issue.
