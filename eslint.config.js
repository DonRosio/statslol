// @ts-check
import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/']),
  eslint.configs.recommended,
  // Rules that use type information (e.g. forbid unhandled promises or unsafe `any`).
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Each file is checked with the tsconfig.json of the package it belongs to.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Rules of React (e.g. hooks called in the same order at each render, effect
    // dependencies listed): the stable preset of the React team's plugin.
    // Only the app's code: Playwright's fixtures call a `use()` that is not React's hook.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // Plain JS files (like this one) are not part of any TypeScript project.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
