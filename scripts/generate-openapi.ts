import { writeFileSync } from "fs";
import { join } from "path";
import { buildSpec } from "../lib/openapi/spec";

// Regenerates public/openapi.json from the Zod schemas. Wired into `prebuild`
// so the spec stays in sync on every `pnpm build`; run directly via
// `pnpm generate-openapi`.

const spec = buildSpec();
const out = join(process.cwd(), "public", "openapi.json");
writeFileSync(out, JSON.stringify(spec, null, 2) + "\n");
console.log(`Wrote ${out}`);
