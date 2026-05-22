import next from "eslint-config-next";

// Flat config (ESLint 9/10 + Next 16). eslint-config-next now ships native
// flat-config arrays, so we spread them directly — no @eslint/eslintrc bridge
// (which breaks under ESLint 10).
const eslintConfig = [
  ...next,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "eval/dashboard/**",
      "lib/__fixtures__/**",
    ],
  },
];

export default eslintConfig;
