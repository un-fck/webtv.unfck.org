import { describe, it, expect } from "vitest";
import { normalizeGroundTruth } from "./ground-truth-normalizer";

/**
 * Regression guard for an order-dependent bug that inflated WER by ~50 points
 * on every UN meeting containing a recorded vote.
 *
 * The vote roll-call regexes end their match with a lookahead for the next
 * speaker label (`^The President`, `^Mr.`, …). If speaker labels are stripped
 * first, that terminator no longer exists, the lazy `[\s\S]*?` runs to the end
 * of the document, and every line after "In favour:" is deleted from the
 * reference — including genuinely-spoken content. The hypothesis still has that
 * speech, so providers are charged phantom insertions.
 *
 * Measured on S/PV.10100 (en): reference 261 words instead of 378, and
 * normalized WER 82.5% instead of 30.6% for the same AssemblyAI transcript.
 */
const PV_WITH_VOTE = `The President: The Council is ready to proceed to the vote.

A vote was taken by show of hands.

In favour:
Bahrain, China, Colombia, Denmark, France, Greece, Latvia, Liberia, Panama,
Russian Federation, United Kingdom of Great Britain and Northern Ireland,
United States of America
Against:
None
Abstaining:
Pakistan, Somalia
The President: The draft resolution received 13 votes in favour, none against
and 2 abstentions. The draft resolution has been adopted as resolution 2815 (2026).
Before adjourning the meeting, I would like to express the sincere appreciation
of the delegation of Somalia to the members of the Council.`;

describe("normalizeGroundTruth — vote roll-call blocks", () => {
  const clean = normalizeGroundTruth(PV_WITH_VOTE, "en");

  it("strips the non-spoken roll call", () => {
    expect(clean).not.toMatch(/In favour:/);
    expect(clean).not.toMatch(/A vote was taken/);
    expect(clean).not.toMatch(/Abstaining:/);
    // Country lists are a show of hands — never read aloud.
    expect(clean).not.toMatch(/Bahrain, China, Colombia/);
  });

  it("KEEPS the spoken content that follows the roll call", () => {
    // This is the regression. These lines are spoken aloud by the President and
    // every provider transcribes them; dropping them from the reference turns
    // correct transcription into insertion errors.
    expect(clean).toMatch(/draft resolution received 13 votes in favour/);
    expect(clean).toMatch(/adopted as resolution 2815/);
    expect(clean).toMatch(/sincere appreciation/);
  });

  it("still strips speaker labels", () => {
    expect(clean).not.toMatch(/The President:/);
  });

  it("retains most of the record's spoken words", () => {
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    // Pre-fix this collapsed to ~15 words (everything after "In favour:" gone).
    expect(words(clean)).toBeGreaterThan(50);
  });
});

/**
 * The §14.0 bug class, second occurrence.
 *
 * The speaker-label patterns used `[^:]*`, and a character class MATCHES
 * NEWLINES. PV text is PDF-hard-wrapped, so a line routinely *begins*
 * mid-sentence with "Mrs. Izumi Nakamitsu," — the pattern then ran from there to
 * the next colon anywhere in the document and deleted everything between.
 *
 * Corpus-wide this removed 15.7% of the reference words, and 28.2% of the worst
 * single session, all of it real speech charged to providers as insertions.
 *
 * The existing tests above did NOT catch it: every speaker label in their
 * fixture is a well-formed single line. This fixture is the one that fails
 * against `[^:]*` and passes against `[^:\n]*`, so the guard now has a negative
 * control rather than being a comment.
 */
describe("speaker labels must not swallow across line breaks", () => {
  const hardWrapped = [
    "The President: I now give the floor to Mr. Ebo.",
    "",
    "Mr. Ebo: I am delivering this briefing on behalf of",
    "Mrs. Izumi Nakamitsu, who is currently away from",
    "the office.",
    "Since the previous consideration of this matter by",
    "the Council, the Office for Disarmament Affairs has",
    "been in regular contact with its counterparts.",
    "",
    // A LATER label that is not "The President" is essential: the President
    // patterns run first, so if this were "The President:" there would be no
    // colon left for the runaway `[^:]*` to reach and the bug would not fire.
    // This fixture is only a guard because it reproduces.
    "Mr. Bendjama (Algeria): I thank the briefer for his presentation.",
  ].join("\n");

  const clean = normalizeGroundTruth(hardWrapped, "en");

  it("keeps speech on a line that BEGINS with a courtesy title mid-sentence", () => {
    // "Mrs. Izumi Nakamitsu, who is currently away from" starts a line but is
    // not a speaker label — it is the middle of Mr. Ebo's sentence.
    expect(clean).toMatch(/who is currently away from/);
    expect(clean).toMatch(/the office/);
  });

  it("keeps everything after it, up to the next real speaker label", () => {
    expect(clean).toMatch(/Since the previous consideration/);
    expect(clean).toMatch(/Office for Disarmament Affairs/);
    expect(clean).toMatch(/regular contact with its counterparts/);
  });

  it("still strips the genuine labels", () => {
    expect(clean).not.toMatch(/The President:/);
    expect(clean).not.toMatch(/Mr\. Ebo:/);
  });

  it("retains nearly all the spoken words", () => {
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    // Against the buggy `[^:]*` this collapsed to ~12 words. The fixture has 60
    // words of which only the two labels (~5 words) should go.
    expect(words(clean)).toBeGreaterThan(45);
  });
});
