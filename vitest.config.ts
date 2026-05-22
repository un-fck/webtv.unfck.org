import { defineConfig } from "vitest/config";

// Dummy DATABASE_URL: several lib modules import lib/db, which throws at module
// load unless it's set and eagerly constructs a pg Pool. Pure functions under
// test never query, so nothing connects — tests stay offline.
const env = { DATABASE_URL: "postgresql://test:test@localhost:5432/test" };

// Two projects: deterministic Node unit tests for lib/, and jsdom + React
// Testing Library tests for components/.
export default defineConfig({
  resolve: { tsconfigPaths: true },
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
          name: "components",
          environment: "jsdom",
          include: ["components/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
          env,
        },
      },
    ],
  },
});
