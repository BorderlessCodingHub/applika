import coreWebVitals from "eslint-config-next/core-web-vitals";
import importPlugin from "eslint-plugin-import";
import nextTypescript from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";
import unicornPlugin from "eslint-plugin-unicorn";
import { importX } from "eslint-plugin-import-x";

const config = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    plugins: {
      import: importPlugin,
      unicorn: unicornPlugin,
      "unused-imports": unusedImports,
      "import-x": importX,
    },
    rules: {
      "import/no-default-export": "error",
      "unused-imports/no-unused-imports": "error",
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
    },
  },
  {},
  {
    files: [
      "eslint.config.mjs",
      "next.config.ts",
      "postcss.config.js",
      "tailwind.config.ts",
      "vitest.config.ts",
    ],
    rules: { "import/no-default-export": "off" },
  },
  {
    files: [
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/app/**/error.tsx",
      "src/app/**/loading.tsx",
      "src/app/**/not-found.tsx",
      "src/app/**/template.tsx",
      "src/app/**/global-error.tsx",
    ],
    rules: { "import/no-default-export": "off" },
  },
  {
    files: ["src/app/**"],
    rules: { "unicorn/filename-case": "off" },
  },
  {
    files: ["src/**/*.ts", "src/**/*.js"],
    rules: {
      "import-x/order": "error",
      "import-x/newline-after-import": "error",
    },
  },
];
export default config;
