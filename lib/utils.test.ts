import { describe, it, expect } from "vitest";
import { jsonLdScript } from "./utils";

const LS = String.fromCodePoint(0x2028); // line separator
const PS = String.fromCodePoint(0x2029); // paragraph separator

describe("jsonLdScript", () => {
  it("neutralizes </script> breakout in string values", () => {
    const out = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
  });

  it("escapes ampersands", () => {
    expect(jsonLdScript({ x: "a&b" })).not.toContain("&");
  });

  it("escapes U+2028 / U+2029 line separators", () => {
    const out = jsonLdScript({ x: `a${LS}b${PS}c` });
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
  });

  it("round-trips back to the original data via JSON.parse", () => {
    const data = {
      name: `</script>&${LS}${PS} "quoted" 联合国`,
      nested: { a: 1, b: ["<x>", "&"] },
    };
    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });
});
