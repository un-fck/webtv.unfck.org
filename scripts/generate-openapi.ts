import { writeFileSync } from "fs";
import { join } from "path";
import { buildSpec } from "../lib/openapi/spec";

// Regenerates public/openapi.json from the Zod schemas. The output is
// checked into git (it's a small, deterministic build artifact that the
// runtime serves from public/), so this script is intended to be run
// manually whenever lib/openapi/schemas.ts or spec.ts changes:
//
//   pnpm generate-openapi   # regenerate + commit the diff
//   pnpm check-openapi      # CI guard: regenerate and fail if dirty
//
// It is deliberately NOT wired into `pnpm build`: the Docker build
// context excludes `scripts/` via .dockerignore (scripts are operator
// tooling, not runtime code), so running tsx from inside the image
// would fail with ERR_MODULE_NOT_FOUND — and there's no point shipping
// a tsx + script payload into prod just to regenerate a file that's
// already checked in.

const spec = buildSpec();
const out = join(process.cwd(), "public", "openapi.json");
writeFileSync(out, JSON.stringify(spec, null, 2) + "\n");
console.log(`Wrote ${out}`);
