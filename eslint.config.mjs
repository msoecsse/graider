import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "ui/dist/**",
      "ui/dist-electron/**",
      "ui/dist-graider-cli/**",
      "ui/release/**",
      "ui/node_modules/**"
    ]
  },

  js.configs.recommended,

  {
    files: ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: [0, 1, 2, 3, 4, 5],
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true
        }
      ]
    }
  },

  {
    files: ["*.js", "*.mjs", "*.cjs", "eslint.config.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {}
  }
);
