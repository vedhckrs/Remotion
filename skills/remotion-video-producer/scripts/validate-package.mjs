#!/usr/bin/env node
/**
 * Check a topic package before anything renders.
 *
 *   node scripts/validate-package.mjs <episode folder> [--project <remotion project>] [--write] [--json]
 *
 * Prints errors (block rendering), warnings (worth a look) and the package stage:
 * planned, researched, scripted, storyboarded, voiced, assets-ready, render-ready.
 * --write saves the report to <folder>/validation.json. Exit code 1 when there are errors.
 */
import fs from 'node:fs';
import path from 'node:path';
import {validatePackage} from './lib/package-schema.mjs';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--project');
if (!dir) {
  console.error('Usage: node scripts/validate-package.mjs <episode folder> [--project <dir>] [--write] [--json]');
  process.exit(2);
}
const pi = args.indexOf('--project');
const projectDir = pi >= 0 ? args[pi + 1] : process.cwd();
const report = validatePackage(path.resolve(dir), {projectDir});
if (args.includes('--write')) fs.writeFileSync(path.join(dir, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${report.id}: ${report.stage ?? 'invalid'}`);
  for (const [id, v] of Object.entries(report.videos)) {
    console.log(`  ${id}: ${Object.keys(v.scenes).length} scenes, estimated ${Math.round(v.estimatedSeconds)} s${v.measuredSeconds !== null ? `, measured ${Math.round(v.measuredSeconds)} s` : ''}`);
    if (v.render) console.log(`    rendered ${v.render.width}x${v.render.height}, QC ${v.render.qc}${v.render.stale ? ', OUT OF DATE (package changed since)' : ''}: ${v.render.file}`);
  }
  for (const e of report.errors) console.log(`  ERROR    ${e}`);
  for (const w of report.warnings) console.log(`  warning  ${w}`);
  if (!report.errors.length) console.log('  no errors');
}
process.exit(report.errors.length ? 1 : 0);
