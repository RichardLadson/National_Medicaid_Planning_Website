import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const errors = [];
const checked = new Set();
async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const path = resolve(dir, name);
    (await stat(path)).isDirectory() ? out.push(...await walk(path)) : out.push(path);
  }
  return out;
}
const files = await walk(dist);
for (const path of files) {
  const ext = extname(path);
  if (!['.html', '.css', '.js'].includes(ext)) continue;
  const content = await readFile(path, 'utf8');
  if (content.includes('design-photography.png') || /--[xywh]:/.test(content)) {
    errors.push(`${relative(root, path)} still uses the combined mockup image.`);
  }
  if (ext === '.js') {
    try { new Script(content, { filename: path }); }
    catch (error) { errors.push(error.message); }
  }
  if (ext !== '.html') continue;
  const ids = [...content.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) errors.push(`${path}: duplicate HTML IDs.`);
  for (const m of content.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const value = m[1];
    if (value === '#' || /^(?:https?:|mailto:|tel:|data:)/.test(value)) continue;
    if (value.startsWith('#')) {
      if (!ids.includes(value.slice(1))) errors.push(`${path}: missing anchor ${value}`);
      continue;
    }
    let pathname = value.split(/[?#]/)[0];
    if (pathname === '/') pathname = '/index.html';
    const target = resolve(value.startsWith('/') ? dist : dirname(path), pathname.replace(/^\//, ''));
    if (!target.startsWith(dist + '/')) { errors.push(`Asset escapes the public folder: ${value}`); continue; }
    try { if (!(await stat(target)).isFile()) throw new Error('not a file'); checked.add(target); }
    catch { errors.push(`${relative(root, path)}: missing local file ${value}`); }
  }
  for (const m of content.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="[^"]*"/.test(m[0])) errors.push(`Image needs alt text: ${m[0]}`);
    if (!/\bwidth="\d+"/.test(m[0]) || !/\bheight="\d+"/.test(m[0])) errors.push(`Image needs dimensions: ${m[0]}`);
  }
}
for (const entry of ['index.html','404.html','styles.css','app.js','site-config.js']) {
  if (!files.includes(resolve(dist, entry))) errors.push(`Missing entrypoint: ${entry}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const total = (await Promise.all(files.map(p => stat(p)))).reduce((n, s) => n + s.size, 0);
console.log(`Validated ${files.length} public files and ${checked.size} referenced files; ${Math.round(total / 1024)} KB total.`);
