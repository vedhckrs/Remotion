/**
 * Shared by package-render.mjs and package-stills.mjs: copy a package into the project, fingerprint the
 * renderer code, and load Remotion's bundler and renderer from the project's node_modules.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RENDERER_VERSION, sha256} from './package-schema.mjs';

/** Package id as used in public/packages/<id>. */
export const packageId = (pkg, dir) => String(pkg.id ?? path.basename(dir)).toLowerCase().replace(/[^a-z0-9-]+/g, '-');

/** Copy the package into public/packages/<id> (changed files only; renders stay out). Returns the target. */
export const syncPackage = (src, project, id) => {
  const pub = path.join(project, 'public', 'packages', id);
  if (path.resolve(pub) === path.resolve(src)) return pub;
  const sync = (from, to) => {
    fs.mkdirSync(to, {recursive: true});
    for (const e of fs.readdirSync(from, {withFileTypes: true})) {
      if (e.name === 'renders' || e.name.startsWith('.')) continue;
      const a = path.join(from, e.name);
      const b = path.join(to, e.name);
      if (e.isDirectory()) sync(a, b);
      else {
        const sa = fs.statSync(a);
        const sb = fs.existsSync(b) ? fs.statSync(b) : null;
        if (!sb || sb.size !== sa.size || sb.mtimeMs < sa.mtimeMs) fs.copyFileSync(a, b);
      }
    }
  };
  sync(src, pub);
  return pub;
};

const hashTree = (dir) => {
  if (!fs.existsSync(dir)) return '';
  const parts = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else parts.push(`${path.relative(dir, p)}:${sha256(fs.readFileSync(p))}`);
    }
  };
  walk(dir);
  return sha256(parts.join('\n'));
};

/** Everything under src/episode and public/fonts, plus the Remotion version, decides how a scene looks. */
export const rendererHash = (project) => {
  const pkgJson = path.join(project, 'node_modules', 'remotion', 'package.json');
  const version = fs.existsSync(pkgJson) ? JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version : '';
  return sha256([RENDERER_VERSION, hashTree(path.join(project, 'src', 'episode')), hashTree(path.join(project, 'public', 'fonts')), version].join('|'));
};

/** Bundle entry for package renders: only the episode compositions (offline). Older projects: the full root. */
export const episodeEntry = (project) => {
  const own = path.join(project, 'src', 'episode', 'entry.ts');
  return fs.existsSync(own) ? own : path.join(project, 'src', 'index.ts');
};

export const loadRemotion = async (project) => {
  const {bundle} = await import(path.join(project, 'node_modules', '@remotion', 'bundler', 'dist', 'index.js'));
  const r = await import(path.join(project, 'node_modules', '@remotion', 'renderer', 'dist', 'index.js'));
  return {bundle, ...(r.default ?? r)};
};

/** Chrome options: --gl / REMOTION_GL, and REMOTION_IGNORE_CERTS=1 only behind an intercepting proxy. */
export const chromiumFor = (gl) => ({...(gl ? {gl} : {}), ...(process.env.REMOTION_IGNORE_CERTS === '1' ? {ignoreCertificateErrors: true} : {})});

/** Chrome tabs for a budget (percent of cores, capped by memory / 4), halved at 4K. */
export const tabsFor = (budget, fourK) => {
  if (process.env.REMOTION_CONCURRENCY) return Number(process.env.REMOTION_CONCURRENCY);
  const b = Math.min(100, Math.max(10, Number(budget) || 50));
  let c = Math.max(1, Math.min(Math.floor((os.cpus().length * b) / 100), Math.floor(os.totalmem() / 2 ** 30 / 4)));
  if (fourK) c = Math.max(1, Math.floor(c / 2));
  return c;
};

/**
 * Print a failure as one readable line ("ERROR <message>") that the dashboard shows as the reason, instead of
 * Node's raw dump of a browser error object.
 */
export const readableErrors = () => {
  const out = (e) => {
    const msg = String(e?.message ?? e).split('\n').find((l) => l.trim()) ?? 'unknown error';
    const where = e?.stackFrame?.[0] ? ` (${e.stackFrame[0].functionName || 'anonymous'} in ${String(e.stackFrame[0].fileName || '').split('/').pop()})` : '';
    console.error(e?.stack ?? e); // full detail for the log
    console.error(`ERROR ${msg}${where}`);
    if (/Failed to fetch|ERR_|net::/i.test(msg)) console.error('ERROR hint: a file could not be loaded. Check that the package files exist and run "Check again" in the Library.');
    process.exit(1);
  };
  process.on('unhandledRejection', out);
  process.on('uncaughtException', out);
};

export const lowerPriority = () => {
  try {
    os.setPriority(10); // keep the Mac responsive; Chrome inherits it
  } catch {
    // not permitted: carry on at normal priority
  }
};
