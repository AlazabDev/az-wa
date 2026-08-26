import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", ".output", ".vinxi", "src/routeTree.gen.ts"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    // Lovable/Supabase integration scaffolding is generated upstream.
    // Keep semantic linting enabled, but do not force repository Prettier style onto generated files.
    files: ["src/integrations/**/*.{ts,tsx}"],
    rules: {
      "prettier/prettier": "off",
    },
  },
  {
    // Auto-generated preview auth transport intentionally uses deferred timer assignment.
    files: ["src/integrations/supabase/previewAuthStorage.ts"],
    rules: {
      "prefer-const": "off",
    },
  },
  {
    // shadcn/ui modules intentionally export component variants/helpers beside components.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
