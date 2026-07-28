# Recommendation

> **VERDICT — DO NOT SWITCH ON QUALITY GROUNDS; FIX THE PAYER INSTEAD.**
> azure-llm-speech wins WER by 0.64–0.98 points (matched input: +0.64 macro,
> CI [+0.27,+1.09]) and loses on cost
> (1.46× dearer, $0.306 vs $0.21/audio-hour), speed (67× vs 101× realtime),
> proven reliability (n=44 vs n=8,662), acronym recall (66% vs 69%), entity
> biasing (none that works vs four working fields) and model governance (unnamed
> and unpinnable). **86% of the two vendors' errors are the same error**, so the
> choice touches ~11% of what is wrong. Meanwhile the out-of-pocket arrangement
> caused **15 production failures in July** — more than either vendor — at
> **$1,500–3,000/yr and doubling**. Three of the four §14/§15 arguments for
> switching did not survive re-testing (cost inverted, the diarization defect did
> not reproduce, the CIs were computed off a degenerate RNG) — though the WER
> advantage itself **did** hold up. The instrument that produced them was defective.

Three options were on the table: keep paying AssemblyAI personally, procure it
properly, or move English to `azure-llm-speech` because Azure is already
contracted. Here is what the evidence supports, with the trade-offs.

## The quality question is settled, and it is close to a tie

| | AssemblyAI U-3.5 Pro | azure-llm-speech |
| --- | --- | --- |
| WER, byte-identical input (n=17) | 27.55% micro / 28.42% macro | **26.74% / 27.77%** (azure better by 0.81 micro, 0.64 macro, CI [+0.27,+1.09]) |
| **errors shared with the other arm** | &nbsp; | **86.3% of ALL errors are identical between the two** |
| entity slots correct | 4/11 | 3/11 |
| acronym recall | **69%** | 66% |
| failure mode at entity slots | plausible wrong entity ×3 | visible non-word ×1 |
| diarization (60–120 min) | 14 spk / 42 turns | 15 spk / 34 turns |
| speed (provider-side) | **101× realtime** | 67× realtime |
| production reliability | **0.046%** (n=8,662) | 6.8% (n=44, all day-one) |
| cost / audio-hour | **$0.21** | $0.306 |
| entity biasing | `keyterms_prompt`, `word_boost`, `custom_spelling` | **none that work** |
| model identity | named, versioned | **unnamed, unpinnable** |
| content filter | none | **profanity mask destroys UN body names by default** |

Azure wins the headline metric by half a WER point. AssemblyAI wins cost, speed,
proven reliability, acronym recall, entity biasing and model governance. **On the
evidence, there is no quality case for switching**, and the three arguments that
made the case in §14/§15 have each weakened or reversed.

## The real problem is not the vendor

**The funding arrangement is the least reliable component in the pipeline.** It
caused 15 production transcription failures in July — more than either vendor
did — and the personal burden is **$1,500–3,000/yr and roughly doubling**.

That is the thing to fix. The vendor choice is close to a coin-flip by
comparison, and picking the "wrong" one costs less than $1,400/yr.

## Options, with trade-offs

### A. Procure AssemblyAI (or find any institutional payment route) — *recommended*

- **For:** the incumbent wins on almost every axis that is not the headline WER
  number. Zero migration risk. Keeps the entity-biasing option open, which is the
  only structural fix for the shared entity weakness. Cheapest per hour.
- **Against:** procurement effort, which is the thing being avoided.
- **On the lock-in worry:** AssemblyAI is **pay-as-you-go with no minimum and no
  commitment** — there is nothing to be locked into. You can stop on any day. The
  lock-in risk here is a property of *procurement processes*, not of this vendor,
  and it is worth checking whether a corporate card or small-purchase mechanism
  clears $1.5–3k/yr without a full procurement.

### B. Move English to `azure-llm-speech`

- **For:** zero procurement, bill lands on an existing subscription, **it is the
  more accurate engine** (0.64–0.98 WER points, consistently — it wins 15 of 17
  sessions and 17 of 17 against production-as-configured), and it is GA so inside
  the 99.9% SLA.
- **Against:** costs the UN ~1.46× more per hour; the model is **unnamed and
  unpinnable** and Microsoft has already swapped it once, which is a real problem
  for an official record; there is **no working entity biasing**; reliability is
  unproven at n=44; and the default profanity filter is currently destroying UN
  body names.
- **Only acceptable with:** `profanityFilterMode` set, `maxSpeakers` raised to 35,
  the drift regression actually scheduled, and acceptance that behaviour can
  change without notice.

### C. Keep paying personally

- **Against:** it has already failed, measurably, 15 times. Not viable at a
  doubling run-rate.

## What to do regardless of the vendor choice

These are worth more than the vendor decision and are cheap:

1. **Build the entity glossary + symbol validator.** One reading agent's estimate:
   it removes **8 of 15** reader-harming errors in its session, *on both arms*.
   Every UN document symbol has a checkable form; every officeholder is on a
   published roster. A validator you can build beats a hallucination you cannot
   detect — and this is the only measure that helps with the **86% of errors both
   vendors share**, which no vendor swap can touch.
2. **Feed AssemblyAI mono audio.** Measured at −0.27 WER points, free, and it
   closes a third of Azure's remaining lead.
3. **Schedule the drift regression** (`regression-azure-llm.ts`). It exists, costs
   10 s, and had never been run before today.
4. **Fix the scorer in `eval/metrics`.** The `[^:\n]` normalizer fix and the
   chunked-WER replacement should land on `main`, or every future eval inherits a
   16-point error and CIs from a degenerate RNG.

## What would change this recommendation

Stated in advance so it can be tested rather than argued:

- **Entity biasing shipping on Azure's default enhanced model.** It would let the
  UN80/UNAT class be fixed at source and would make Azure clearly preferable given
  it is already contracted. Watch `enhancedMode.prompt` and `phraseList` — today
  one is rejected `400` and the other is silently ignored.
- **A pinnable Azure model with diarization and word timestamps.**
  `mai-transcribe-1.5` is nameable but has neither, and is preview.
- **Azure accumulating a reliability record.** n=44 is not evidence. At n≈300 with
  no failures its interval would be comparable to the incumbent's.
- **Volume growth past ~15,000 h/yr**, where the $0.096/h difference starts to
  exceed $1,500/yr and cost stops being a rounding error.
