import fs from 'node:fs';
import path from 'node:path';

/** Load KEY=VALUE pairs from .env in the project root (cwd) without extra dependencies. */
export const loadEnv = (cwd = process.cwd()) => {
  const file = path.join(cwd, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};

export const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Add it to .env in the project root (never commit it).`);
    process.exit(1);
  }
  return value;
};

/** Minimal argv parser: --key value, --key=value, --flag. Positionals in `_`. */
export const parseArgs = (argv) => {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        out[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[arg.slice(2)] = argv[++i];
      } else {
        out[arg.slice(2)] = true;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
};
