// Solara Bay 3D — the entry program for the gta6-01 bounty (Node 22+ stdlib only).
// v2: six-star wanted, three weapons, a live in-game clock, eight story jobs.
// It hands the game in: copies this repo's game/ and screenshots/ into the
// output directory and writes /output/dossier.json with the vendored make.fun
// library, so the scorer can gate it and the judge can read it.
// The dossier is built from the output directory, so it describes exactly what is handed in.
//
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play locally: node serve.ts, then open http://localhost:8080

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The directory this file lives in is the repository root.
const here = fileURLToPath(new URL('.', import.meta.url));
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Pre-flight: the scorer refuses an entry with no playable game or no
// screenshots, so fail loudly here instead of handing in an empty folder.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing — nothing to hand in');
}
const shotFiles = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  : [];
if (shotFiles.length === 0) {
  throw new Error('screenshots/ is empty — the judge needs at least one screenshot');
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes. game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Solara Bay 3D handed in: game/ + ${shotFiles.length} screenshot(s) + dossier.json in ${out}`);
