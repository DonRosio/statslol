// Fails when the production build of the web app contains something only the server may
// know. Run by `pnpm build` right after `vite build`: every build is checked, in CI and later
// in the Docker image, whatever ESLint missed.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const FORBIDDEN: readonly { pattern: RegExp; meaning: string }[] = [
  {
    pattern: /RGAPI/,
    meaning: 'a Riot API key, or the code of the API that checks one',
  },
  {
    pattern: /api\.riotgames\.com/,
    meaning:
      "the address of Riot's API: the Riot client (packages/riot-client) is in the bundle",
  },
  {
    pattern: /X-Riot-Token/i,
    meaning:
      'the header that carries the Riot API key: the Riot client is in the bundle',
  },
];

const files = (await readdir(DIST, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));

// Without this, a missing or empty dist/ would pass the check.
if (!files.some((file) => file.endsWith('.js'))) {
  console.error(`No JavaScript file in ${DIST}: run vite build first.`);
  process.exit(1);
}

let problems = 0;
for (const file of files) {
  // latin1 reads any bytes as text: images and fonts are searched too.
  const content = await readFile(file, 'latin1');
  for (const { pattern, meaning } of FORBIDDEN) {
    if (pattern.test(content)) {
      console.error(`dist/${relative(DIST, file)} contains ${meaning}.`);
      problems += 1;
    }
  }
}

if (problems > 0) {
  console.error(
    'The build must not be served: it holds what only the server may know.',
  );
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${String(files.length)} files of dist/: nothing that belongs to the server.`,
  );
}
