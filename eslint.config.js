import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    // The web/ subproject has its own eslint config and runs on a separate
    // invocation. Don't double-lint it from the root.
    ignores: [
      "dist/**",
      "node_modules/**",
      "ingestion/**",
      "coverage/**",
      "web/**",
    ],
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // MCP servers MUST NOT write to stdout — enforced
    files: ["src/mcp/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
];
