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
  {
    // The React Compiler lint rules are advisory and currently fire on
    // legitimate patterns (SSR mount flags, data-fetch loading resets, DOM
    // media writes like `player.currentTime = …`, post-fetch async setState).
    // Keep them visible as warnings rather than blocking the build; genuine
    // derivable-state smells are addressed during the component decomposition.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;
