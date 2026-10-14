import globals from "globals";

// Correctness gates apply to both current apps and retained legacy code.
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-realtime/**",
      "**/.data-app-offline/**",
      "assets/**",
    ],
  },
  {
    files: ["**/*.{js,cjs,mjs,jsx}"],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "constructor-super": "error",
      "no-async-promise-executor": "error",
      "no-dupe-args": "error",
      "no-dupe-class-members": "error",
      "no-dupe-else-if": "error",
      "no-dupe-keys": "error",
      "no-fallthrough": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "valid-typeof": "error",
    },
  },
];
