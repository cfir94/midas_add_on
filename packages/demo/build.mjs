import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Bundle the planner and scene generator into a single global, then inline it
 * plus the page script into one HTML file.
 *
 * Everything must end up inline: a published artifact is served under a CSP
 * that blocks every external host, so a page with any <script src> or
 * <link href> to another origin simply will not run.
 */
const bundle = await build({
  entryPoints: [join(here, 'src/entry.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'StagePatch',
  target: 'es2020',
  write: false,
  logLevel: 'warning',
});

const engine = bundle.outputFiles[0].text;
const page = readFileSync(join(here, 'src/page.html'), 'utf8');
const demo = readFileSync(join(here, 'src/demo.js'), 'utf8');

const html = page
  .replace('/*ENGINE*/', () => engine)
  .replace('/*DEMO*/', () => demo);

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/index.html'), html);

// A reference to another origin means the published page breaks, so fail the
// build here rather than discovering it after publishing.
const external = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) ?? [];
const allowed = external.filter((ref) => !ref.includes('fonts.googleapis.com') && !ref.includes('fonts.gstatic.com'));
if (allowed.length > 0) {
  console.error('External references found, which the artifact CSP will block:', allowed);
  process.exit(1);
}

console.log(`dist/index.html — ${(html.length / 1024).toFixed(0)} KB, engine ${(engine.length / 1024).toFixed(0)} KB`);
