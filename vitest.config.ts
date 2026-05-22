import { defineConfig } from "vitest/config";

// Layer 1 test suite: deterministic, offline unit tests of the pure
// data-processing in `lib/`. Scoped to `lib/` so it never picks up the
// independent `eval/` harness (own tsconfig) or the Next app.
export default defineConfig({
  // Resolve the `@/*` path alias from tsconfig.json natively (Vitest 4+).
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // `lib/un-api` (and others) transitively import `lib/db`, which throws at
    // module load unless DATABASE_URL is set and eagerly constructs a pg Pool.
    // A dummy value satisfies the load-time guard; the pure functions under
    // test never issue a query, so nothing ever connects — tests stay offline.
    env: { DATABASE_URL: "postgresql://test:test@localhost:5432/test" },
  },
});
