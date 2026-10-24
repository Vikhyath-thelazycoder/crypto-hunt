import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // SECURITY.md T15: names, broadcasts and clues are user text; never inject raw HTML.
    rules: {
      "react/no-danger": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "AssignmentExpression > MemberExpression[property.name=/^(innerHTML|outerHTML)$/]",
          message: "Do not assign innerHTML/outerHTML (SECURITY.md T15). Render text through React.",
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: "Do not use insertAdjacentHTML (SECURITY.md T15).",
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-dev/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "docs/**",
      "supabase/functions/**",
    ],
  },
];

export default eslintConfig;
