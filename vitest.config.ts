import { defineConfig } from "vitest/config";

// Dummy DATABASE_URL: several lib modules import lib/db, which throws at module
// load unless it's set and eagerly constructs a pg Pool. Pure functions under
// test never query, so nothing connects — tests stay offline.
const env = { DATABASE_URL: "postgresql://test:test@localhost:5432/test" };

// Two projects: deterministic Node unit tests for lib/, and jsdom + React
// Testing Library tests for components/.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Next 16 ships no `exports` map, so the extensionless specifier
    // `next/navigation` (used internally by next-intl) fails Node's ESM
    // resolver under Vitest. Map it to the actual file.
    alias: [{ find: /^next\/navigation$/, replacement: "next/navigation.js" }],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "lib",
          environment: "node",
          include: ["lib/**/*.test.ts"],
          env,
        },
      },
      {
        extends: true,
        test: {
          name: "eval",
          environment: "node",
          include: ["eval/**/*.test.ts"],
          env,
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["components/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
          env,
          // next-intl imports `next/navigation` extensionless; Next 16 has no
          // `exports` map, so Node's ESM resolver rejects it. Inlining routes
          // the import through Vite's resolver, which honors the alias above.
          server: { deps: { inline: ["next-intl"] } },
        },
      },
    ],
  },
});
