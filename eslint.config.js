import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "coverage",
      "playwright-report",
      "test-results",
    ],
  },

  // =========================================================
  // React / Vite frontend
  // =========================================================
  {
    files: ["src/**/*.{ts,tsx}"],

    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],

    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },

    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },

    rules: {
      ...reactHooks.configs.recommended.rules,

      // Existing application is React 18 and contains valid
      // shadcn/event synchronization patterns.
      // Keep these visible without blocking CI.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",

      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],

      // Existing app contains Supabase/JSON payload boundaries.
      // Keep migration pressure without blocking production builds.
      "@typescript-eslint/no-explicit-any": "warn",

      // Common shadcn pattern:
      // interface X extends React.HTMLAttributes<...> {}
      "@typescript-eslint/no-empty-object-type": "warn",

      "@typescript-eslint/no-unused-vars": "off",

      // Existing code; report but do not block CI while being cleaned.
      "no-useless-assignment": "warn",
    },
  },

  // =========================================================
  // Supabase Edge Functions
  // =========================================================
  {
    files: ["supabase/functions/**/*.ts"],

    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],

    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.es2022,

        Deno: "readonly",
        EdgeRuntime: "readonly",

        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        URL: "readonly",
        AbortController: "readonly",

        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",

        setTimeout: "readonly",
        clearTimeout: "readonly",

        console: "readonly",
      },
    },

    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",

      // Keep actual code-quality mistakes blocking.
      "prefer-const": "error",
      "no-useless-escape": "error",
    },
  },

  // =========================================================
  // Node/config files
  // =========================================================
  {
    files: [
      "*.config.{js,ts,mjs,cjs}",
      "vite.config.ts",
      "tailwind.config.ts",
      "postcss.config.js",
    ],

    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],

    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },

    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // =========================================================
  // Tests
  // =========================================================
  {
    files: [
      "src/test/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
    ],

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },

    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
