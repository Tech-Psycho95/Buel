import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Next 16 ships native flat configs. Minimal ruleset: core-web-vitals + TS.
export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "design-caps/**",
      "playwright-report/**",
      "test-results/**",
      ".data/**",
      "drizzle/**",
      "public/showcases/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Next 16 enables the experimental React-Compiler lints at error
      // severity. They are advisory pattern checks (render purity,
      // effect-setState on fetch-on-mount). Sentisel intentionally uses the
      // fetch-on-mount pattern in client views; misclassifying intentional
      // patterns as errors would hide real findings, so these are surfaced
      // as warnings and reviewed by hand instead.
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/capitalized-calls": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/void-use-memo": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/memo-dependencies": "warn",
      "react-hooks/invariant": "warn",
      "react-hooks/error-boundaries": "warn",
    },
  },
];
