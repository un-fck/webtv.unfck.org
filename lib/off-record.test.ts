import { describe, expect, it } from "vitest";
import { filterOffRecord } from "./off-record";
import type { SpeakerMapping, TranscriptContent } from "./db";

type Statements = NonNullable<TranscriptContent["statements"]>;

const stmt = (text: string): Statements[number] => ({
  paragraphs: [
    {
      sentences: [{ text, start: 0, end: 1000 }],
      start: 0,
      end: 1000,
    },
  ],
  start: 0,
  end: 1000,
});

const speaker = (name: string, offRecord?: boolean) => ({
  name,
  function: null,
  affiliation: null,
  group: null,
  ...(offRecord ? { is_off_record: true } : {}),
});

describe("filterOffRecord", () => {
  it("removes flagged statements and reindexes the mapping", () => {
    const statements = [stmt("mic check"), stmt("formal opening"), stmt("bye")];
    const mapping: SpeakerMapping = {
      "0": speaker("Tech", true),
      "1": speaker("President"),
      "2": speaker("President", true),
    };

    const result = filterOffRecord(statements, mapping);

    expect(result.statements).toHaveLength(1);
    expect(result.statements[0].paragraphs[0].sentences[0].text).toBe(
      "formal opening",
    );
    // Mapping reindexed to the filtered statements
    expect(Object.keys(result.speakerMappings)).toEqual(["0"]);
    expect(result.speakerMappings["0"].name).toBe("President");
  });

  it("strips the internal flag from every returned mapping entry", () => {
    const statements = [stmt("a"), stmt("b")];
    const mapping: SpeakerMapping = {
      "0": speaker("A"),
      "1": speaker("B"),
    };
    const result = filterOffRecord(statements, mapping);
    for (const info of Object.values(result.speakerMappings)) {
      expect(info).not.toHaveProperty("is_off_record");
    }
  });

  it("returns everything unchanged when nothing is flagged", () => {
    const statements = [stmt("a"), stmt("b")];
    const mapping: SpeakerMapping = { "0": speaker("A"), "1": speaker("B") };
    const result = filterOffRecord(statements, mapping);
    expect(result.statements).toHaveLength(2);
    expect(result.speakerMappings["1"].name).toBe("B");
  });

  it("returns empty output when every statement is flagged (junk transcript)", () => {
    const statements = [stmt("noise"), stmt("loops")];
    const mapping: SpeakerMapping = {
      "0": speaker("?", true),
      "1": speaker("?", true),
    };
    const result = filterOffRecord(statements, mapping);
    expect(result.statements).toHaveLength(0);
    expect(result.speakerMappings).toEqual({});
  });

  it("keeps statements that have no mapping entry (defensive)", () => {
    const statements = [stmt("a")];
    const result = filterOffRecord(statements, {});
    expect(result.statements).toHaveLength(1);
    expect(result.speakerMappings).toEqual({});
  });

  it("handles undefined statements", () => {
    const result = filterOffRecord(undefined, {});
    expect(result.statements).toEqual([]);
  });
});
