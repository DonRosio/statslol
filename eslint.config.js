// @ts-check
import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const SERVER_ONLY =
  'Server-only code: it holds or sends the Riot API key. Browser code gets Riot data from our API (/api/v1/...).';

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
    // Code that runs in the browser, and the package it shares with the API, must never
    // import server-only code: the Riot client sends the Riot API key with each request,
    // and the API reads it from its environment. Bundled, either could leak the key.
    files: ['apps/web/**/*.{ts,tsx}', 'packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@statslol/riot-client',
                '@statslol/riot-client/*',
                '@statslol/api',
                '@statslol/api/*',
                // The same code through a relative path, e.g. ../../../api/src/config.ts.
                '**/riot-client/**',
                '**/api/src/**',
                '**/apps/api/**',
              ],
              message: SERVER_ONLY,
            },
          ],
        },
      ],
      // no-restricted-imports does not check dynamic imports: import('...').
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ImportExpression[source.value=/riot-client|@statslol\\/api|api\\/src|apps\\/api/]',
          message: SERVER_ONLY,
        },
      ],
    },
  },
  {
    // Plain JS files (like this one) are not part of any TypeScript project.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
