// Solmar City — an original open-world crime game, built for make.fun's "Make GTA 6" bounty.
// Mara Voss runs jobs for the fixer Rico across the city of Solmar: on foot and by car, through
// traffic and pedestrians, stealing cars, outrunning the police as the wanted level climbs, and
// playing five story missions with combat, pickups and a save system. The game is plain static
// files a desktop browser loads offline, with a HUD and minimap, start and pause screens, and
// synthesized sound; nothing in it comes from any commercial game.
// This file is the entrypoint: it copies game/ and screenshots/ from beside it to /output and
// writes /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// Run it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The entry cannot be handed in without its page, its shot list and at least one screenshot,
// so check those are here before copying anything, and stop naming the first one that is not
// instead of handing the grader a broken entry.
const missingInputs: string[] = [];
if (!existsSync(join(here, 'game', 'index.html'))) missingInputs.push('game/index.html');
if (!existsSync(join(here, 'shots.json'))) missingInputs.push('shots.json');
const shotFiles = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((name) => !name.startsWith('.'))
  : [];
if (shotFiles.length === 0) missingInputs.push('screenshots/ (no screenshot files)');
if (missingInputs.length > 0) {
  throw new Error(`Solmar City entry is missing: ${missingInputs.join(', ')}`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
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
