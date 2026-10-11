// Stage the private files the content-library function serves: the Content Library and the draft
// lead-magnet pages (without their PDFs, which are published only with a reviewed page).
//   node scripts/stage-gated.mjs   (run after care-planning-pro/content-library/framework/build.sh)
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(site, 'netlify', 'gated');
const library = resolve(site, '..', '..', 'care-planning-pro', 'content-library', 'private', 'content-library');
if (!existsSync(library)) { console.error(`No library at ${library}; run build.sh first.`); process.exit(1); }
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
cpSync(library, resolve(out, 'content-library'), { recursive: true });
for (const line of ['care', 'medicaid']) {
  const src = resolve(site, 'dist', line, 'guides');
  if (existsSync(src)) cpSync(src, resolve(out, line, 'guides'), { recursive: true, filter: (p) => !p.endsWith('.pdf') });
}
console.log(`staged ${out}`);
