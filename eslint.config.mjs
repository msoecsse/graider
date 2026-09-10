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
      "ui/dist-release/**",
      "ui/release/**",
      "release/**",
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
      // `_`-prefixed bindings are the codebase's marker for a deliberately unused
      // parameter required by an interface; `ignoreRestSiblings` covers the
      // destructure-to-omit pattern (`const { a: _a, ...rest } = input`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
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
    // `*.cjs` matches only top-level files in flat config, which left the nested build
    // scripts under ui/scripts linted without Node globals.
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        console: "readonly",
        exports: "writable",
        module: "writable",
        process: "readonly",
        require: "readonly",
        URL: "readonly"
      }
    },
    rules: {}
  }
);
