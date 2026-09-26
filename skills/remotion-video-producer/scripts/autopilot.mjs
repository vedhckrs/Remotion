#!/usr/bin/env node
/**
 * Autopilot: the daily content employee. Plans 2 Shorts + 1 long video per day, produces each one
 * end to end (script -> icons -> voice -> captions -> music -> thumbnails -> 4K60 render -> publish
 * pack) and schedules the uploads for the next days, all on the local machine within the budget.
 *
 *   node scripts/autopilot.mjs plan [--date YYYY-MM-DD] [--days 1]      queue tomorrow's 3 videos (topics from automation/topics.md)
 *   node scripts/autopilot.mjs add --kind short|long --topic "..." [--when ISO] [--style id]
 *   node scripts/autopilot.mjs run [--limit 3] [--id <id>] [--writer claude|manual] [--skip-publish] [--dry-run]
 *   node scripts/autopilot.mjs publish-due                              upload items whose time has come (Instagram, retries)
 *   node scripts/autopilot.mjs status
 *
 * State lives in automation/queue.json (config + items), logs in automation/logs/<id>.log.
 * The writer is Claude Code in headless mode (`claude -p`) with automation/writer-prompt.md; with
 * --writer manual the item waits in "needs-script" until public/script/<id>.json exists (Claude Code
 * in an interactive session, or you, writes it). Every step is idempotent: re-running skips what
 * exists, so a failed night resumes where it stopped. scripts/install-autopilot.sh wires launchd.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadEnv, parseArgs} from './lib/env.mjs';
import {validateScript} from './lib/script-schema.mjs';

loadEnv();
const args = parseArgs(process.argv.slice(2));
const command = args._[0] || 'status';
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = process.cwd();
const autoDir = path.join(cwd, 'automation');
const queueFile = path.join(autoDir, 'queue.json');
const topicsFile = path.join(autoDir, 'topics.md');
const logsDir = path.join(autoDir, 'logs');
fs.mkdirSync(logsDir, {recursive: true});

const DEFAULTS = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  slots: {short: ['09:00', '19:00'], long: ['13:00']},
  platforms: {short: ['youtube-shorts', 'instagram', 'facebook'], long: ['youtube', 'facebook-video']},
  perDay: {short: 2, long: 1},
  styleRotation: ['midnight-neon', 'tech-grid', 'hype-bold', 'clean-corporate'],
  voicePreset: 'young-male-pro',
  voiceProvider: 'elevenlabs',
  music: 'energetic-tech',
  captions: 'manifest',
  writer: 'claude',
  handle: '',
  site: '',
  budget: 50,
  leadDays: 1,
  targetSeconds: {short: 45, long: 420},
  items: [],
};

const loadQueue = () => {
  const stored = fs.existsSync(queueFile) ? JSON.parse(fs.readFileSync(queueFile, 'utf8')) : {};
  return {...DEFAULTS, ...stored, slots: {...DEFAULTS.slots, ...(stored.slots || {})}, platforms: {...DEFAULTS.platforms, ...(stored.platforms || {})}, perDay: {...DEFAULTS.perDay, ...(stored.perDay || {})}, items: stored.items || []};
};
const saveQueue = (q) => {
  fs.mkdirSync(autoDir, {recursive: true});
  fs.writeFileSync(queueFile, JSON.stringify(q, null, 2) + '\n');
};
const queue = loadQueue();

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/** Local wall-clock time in the queue's timezone -> ISO string with the right offset. */
const zonedIso = (dateStr, hhmm, timeZone) => {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = new Date(`${dateStr}T${hhmm}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).formatToParts(guess);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  const offsetMs = asUtc - guess.getTime();
  return new Date(Date.UTC(...dateStr.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v)), h, m) - offsetMs).toISOString();
};

const log = (id, line) => {
  const stamp = new Date().toISOString();
  fs.appendFileSync(path.join(logsDir, `${id}.log`), `[${stamp}] ${line}\n`);
  console.log(`  ${line}`);
};

const runStep = (item, name, cmd, cmdArgs, options = {}) => {
  const started = Date.now();
  log(item.id, `${name}: ${[cmd, ...cmdArgs].join(' ')}`);
  const res = spawnSync(cmd, cmdArgs, {cwd, encoding: 'utf8', timeout: options.timeoutMs || 60 * 60_000, env: {...process.env, REMOTION_BUDGET: String(queue.budget), ...(options.env || {})}, maxBuffer: 64 * 1024 * 1024});
  fs.appendFileSync(path.join(logsDir, `${item.id}.log`), `${res.stdout || ''}${res.stderr || ''}`);
  const ok = res.status === 0 || (options.okCodes || []).includes(res.status);
  item.steps[name] = {status: ok ? (res.status === 0 ? 'done' : 'skipped') : 'failed', code: res.status, seconds: Math.round((Date.now() - started) / 1000), at: new Date().toISOString()};
  if (!ok) log(item.id, `${name} FAILED (exit ${res.status}): ${(res.stderr || res.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);
  return ok ? res : null;
};

const topicsFromFile = () => {
  if (!fs.existsSync(topicsFile)) return [];
  return fs
    .readFileSync(topicsFile, 'utf8')
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const m = l.match(/^\[(short|long)\]\s*(.+)$/i);
      return {kind: m ? m[1].toLowerCase() : 'short', topic: m ? m[2].trim() : l};
    });
};
const takeTopic = (kind) => {
  const used = new Set(queue.items.map((i) => i.topic));
  const next = topicsFromFile().find((t) => t.kind === kind && !used.has(t.topic)) || topicsFromFile().find((t) => !used.has(t.topic));
  return next ? next.topic : null;
};

// ---- plan ----------------------------------------------------------------------------------------------
const plan = () => {
  const start = args.date ? new Date(`${args.date}T00:00:00Z`) : new Date(Date.now() + queue.leadDays * 86400_000);
  const days = Number(args.days || 1);
  let created = 0;
  for (let d = 0; d < days; d++) {
    const day = new Date(start.getTime() + d * 86400_000);
    const dateStr = day.toISOString().slice(0, 10);
    for (const kind of ['short', 'long']) {
      const slots = queue.slots[kind] || [];
      for (let n = 0; n < (queue.perDay[kind] || 0); n++) {
        const hhmm = slots[n % Math.max(1, slots.length)] || '12:00';
        const publishAt = zonedIso(dateStr, hhmm, queue.timezone);
        if (queue.items.some((i) => i.publishAt === publishAt && i.kind === kind)) continue;
        const topic = args.topic && created === 0 ? String(args.topic) : takeTopic(kind);
        const index = queue.items.filter((i) => i.kind === kind).length;
        const style = args.style || queue.styleRotation[index % queue.styleRotation.length];
        const id = `${dateStr.replace(/-/g, '')}-${kind}-${topic ? slug(topic) : n + 1}`;
        queue.items.push({id, kind, topic, style, status: topic ? 'planned' : 'needs-topic', createdAt: new Date().toISOString(), publishAt, platforms: Object.fromEntries((queue.platforms[kind] || []).map((p) => [p, {status: 'pending'}])), steps: {}});
        created++;
        console.log(`  + ${id}  ${kind}  ${hhmm} ${queue.timezone}  ${topic ? `"${topic}"` : '(needs topic: add lines to automation/topics.md, then run plan again)'}  style ${style}`);
      }
    }
  }
  saveQueue(queue);
  console.log(created ? `${created} item(s) planned.` : 'Nothing new to plan (slots already filled).');
};

const add = () => {
  const kind = args.kind === 'long' ? 'long' : 'short';
  const topic = String(args.topic || '');
  if (!topic) {
    console.error('add needs --topic');
    process.exit(1);
  }
  const publishAt = args.when ? new Date(String(args.when)).toISOString() : zonedIso(new Date(Date.now() + 86400_000).toISOString().slice(0, 10), (queue.slots[kind] || ['12:00'])[0], queue.timezone);
  const id = args.id || `${publishAt.slice(0, 10).replace(/-/g, '')}-${kind}-${slug(topic)}`;
  queue.items.push({id, kind, topic, style: args.style || queue.styleRotation[0], status: 'planned', createdAt: new Date().toISOString(), publishAt, platforms: Object.fromEntries((queue.platforms[kind] || []).map((p) => [p, {status: 'pending'}])), steps: {}});
  saveQueue(queue);
  console.log(`+ ${id} at ${publishAt}`);
};

// ---- produce -------------------------------------------------------------------------------------------
const writerPrompt = (item) => {
  const file = fs.existsSync(path.join(autoDir, 'writer-prompt.md')) ? path.join(autoDir, 'writer-prompt.md') : path.join(SKILL_DIR, 'assets', 'automation', 'writer-prompt.md');
  const template = fs.readFileSync(file, 'utf8');
  const vars = {videoId: item.id, topic: item.topic, kind: item.kind, style: item.style, targetSeconds: String(queue.targetSeconds[item.kind] || 45), voicePreset: queue.voicePreset, handle: queue.handle || '@yourhandle', skillDir: SKILL_DIR, platforms: Object.keys(item.platforms).join(', ')};
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
};

const writeScript = (item) => {
  const scriptFile = path.join('public', 'script', `${item.id}.json`);
  if (fs.existsSync(scriptFile)) {
    item.steps.script = {status: 'done', at: new Date().toISOString()};
    return true;
  }
  const writer = args.writer || queue.writer;
  if (writer !== 'claude') {
    item.status = 'needs-script';
    log(item.id, `waiting for ${scriptFile} (writer=${writer}). Claude Code: follow SKILL.md Phase 1-2 for topic "${item.topic}".`);
    return false;
  }
  const claude = spawnSync('which', ['claude'], {encoding: 'utf8'}).stdout.trim();
  if (!claude) {
    item.status = 'needs-script';
    log(item.id, 'claude CLI not found on PATH; set "writer": "manual" or install Claude Code.');
    return false;
  }
  const prompt = writerPrompt(item);
  const res = runStep(item, 'script', claude, ['-p', prompt, '--output-format', 'text', '--max-turns', '80', '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(node *),Bash(npx remotion compositions*),Bash(ls *),Bash(cat *)'], {timeoutMs: 25 * 60_000, env: {CLAUDECODE: '', CLAUDE_CODE_ENTRYPOINT: ''}});
  if (!res || !fs.existsSync(scriptFile)) {
    if (res) log(item.id, `writer finished but ${scriptFile} is missing`);
    item.steps.script = {status: 'failed', at: new Date().toISOString()};
    return false;
  }
  const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
  try {
    validateScript(script);
  } catch (error) {
    log(item.id, `script invalid: ${error.message.split('\n').slice(0, 4).join(' ')}`);
    item.steps.script = {status: 'failed', error: error.message, at: new Date().toISOString()};
    return false;
  }
  if (script.videoId !== item.id) log(item.id, `warning: script.videoId is ${script.videoId}, expected ${item.id}`);
  return true;
};

const produce = (item) => {
  const id = item.id;
  const outDir = path.join('out', id);
  fs.mkdirSync(outDir, {recursive: true});
  const scriptFile = path.join('public', 'script', `${id}.json`);
  const s = (rel) => path.join(SKILL_DIR, 'scripts', rel);
  const node = process.execPath;
  const exists = (p) => fs.existsSync(p);
  const skip = (name) => {
    item.steps[name] = {status: 'done', skipped: true, at: new Date().toISOString()};
    log(id, `${name}: already done`);
  };

  if (!writeScript(item)) return false;
  const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
  if (!script.style && item.style) {
    script.style = item.style;
    fs.writeFileSync(scriptFile, JSON.stringify(script, null, 2) + '\n');
  }

  // Icons and logos referenced by the script.
  const wantsIcons = script.scenes.some((sc) => sc.visual?.icons?.length) || script.logo?.icon;
  if (wantsIcons) {
    if (!runStep(item, 'icons', node, [s('fetch-icons.mjs'), '--from-script', scriptFile], {timeoutMs: 5 * 60_000, okCodes: [2]})) return false;
  } else skip('icons');

  // Voice (frame-accurate timing comes back in the manifest).
  const manifest = path.join('public', 'voiceover', id, 'manifest.json');
  if (exists(manifest)) skip('voice');
  else if (!runStep(item, 'voice', node, [s('generate-voiceover.mjs'), '--script', scriptFile, '--provider', queue.voiceProvider, '--voice-preset', script.voice?.preset || queue.voicePreset], {timeoutMs: 15 * 60_000})) return false;

  // Captions: ElevenLabs already returns word timing; Whisper only when asked or timing is missing.
  const hasTiming = exists(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).scenes.every((sc) => sc.captions?.length);
  if (queue.captions === 'whisper' || (!hasTiming && queue.captions !== 'off')) {
    if (!runStep(item, 'captions', node, [s('transcribe-whisper.mjs'), path.join('public', 'voiceover', id), '--model', 'medium.en'], {timeoutMs: 30 * 60_000})) log(id, 'captions failed; continuing without word timing');
  } else skip('captions');

  // Music bed (optional; exit 2 = no key, continue).
  if (queue.music && !script.music?.src) {
    if (runStep(item, 'music', node, [s('generate-music.mjs'), '--id', id, '--mood', script.music?.mood || queue.music], {timeoutMs: 10 * 60_000, okCodes: [2]})) {
      const music = path.join('public', 'music', `${id}.mp3`);
      if (exists(music)) {
        script.music = {src: `music/${id}.mp3`, level: script.music?.level ?? 0.18, credit: 'Generated with ElevenLabs Music', mood: script.music?.mood || queue.music};
        fs.writeFileSync(scriptFile, JSON.stringify(script, null, 2) + '\n');
      }
    }
  } else skip('music');

  // Thumbnails and covers.
  if (exists(path.join(outDir, 'thumbnails.json'))) skip('thumbnails');
  else if (!runStep(item, 'thumbnails', node, [s('make-thumbnails.mjs'), '--video', id], {timeoutMs: 15 * 60_000})) return false;

  // 4K60 master within the machine budget.
  const comp = item.kind === 'long' ? 'YouTube' : 'Shorts';
  const preset = item.kind === 'long' ? 'youtube-1080p' : 'shorts';
  const outFile = path.join(outDir, `${id}_${item.kind === 'long' ? 'youtube' : 'shorts'}.mp4`);
  if (exists(outFile)) skip('render');
  else if (!args['dry-run']) {
    if (!runStep(item, 'render', 'bash', [s('render-preset.sh'), comp, preset, '--4k', '--budget', String(queue.budget), '--out', outFile, `--props=${JSON.stringify({videoId: id})}`], {timeoutMs: 4 * 60 * 60_000})) return false;
  } else log(id, `render: dry-run (would write ${outFile})`);

  // Per-platform copy.
  if (!runStep(item, 'pack', node, [s('make-publish-pack.mjs'), '--video', id, ...(queue.handle ? ['--handle', queue.handle] : []), ...(queue.site ? ['--site', queue.site] : [])], {timeoutMs: 60_000})) return false;
  item.outputs = {video: outFile, thumbnails: path.join(outDir, 'thumbnails.json'), pack: path.join(outDir, 'publish', 'pack.json')};
  return true;
};

const publishItem = (item, {dueOnly = false} = {}) => {
  let anyDue = false;
  let anyFailed = false;
  for (const [platform, state] of Object.entries(item.platforms)) {
    if (state.status === 'scheduled' || state.status === 'published') continue;
    if (dueOnly && state.status !== 'due' && state.status !== 'failed') continue;
    if (dueOnly && new Date(item.publishAt).getTime() > Date.now()) continue;
    if ((state.attempts || 0) >= 3) continue;
    const when = dueOnly ? [] : ['--when', item.publishAt];
    const res = runStep(item, `publish:${platform}`, process.execPath, [path.join(SKILL_DIR, 'scripts', 'publish.mjs'), '--video', item.id, '--platform', platform, ...when, ...(args['dry-run'] ? ['--dry-run'] : [])], {timeoutMs: 60 * 60_000, okCodes: [3]});
    state.attempts = (state.attempts || 0) + 1;
    if (res && res.status === 3) {
      state.status = 'due';
      anyDue = true;
    } else if (res) {
      state.status = dueOnly || new Date(item.publishAt).getTime() <= Date.now() ? 'published' : 'scheduled';
      const m = (res.stdout || '').match(/https?:\/\/\S+/g);
      if (m) state.url = m[m.length - 1];
      state.at = new Date().toISOString();
    } else {
      state.status = 'failed';
      anyFailed = true;
    }
  }
  const states = Object.values(item.platforms).map((p) => p.status);
  item.status = states.every((st) => st === 'published') ? 'published' : anyFailed ? 'publish-failed' : anyDue || states.includes('due') ? 'due' : states.every((st) => st === 'scheduled' || st === 'published') ? 'scheduled' : item.status;
};

const withLock = (fn) => {
  const lock = path.join(autoDir, '.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (alive) {
      console.log(`Another autopilot run is active (pid ${pid}); exiting.`);
      process.exit(0);
    }
  }
  fs.writeFileSync(lock, String(process.pid));
  try {
    fn();
  } finally {
    fs.rmSync(lock, {force: true});
  }
};

const run = () =>
  withLock(() => {
    const limit = Number(args.limit || 3);
    const todo = queue.items.filter((i) => (args.id ? i.id === args.id : ['planned', 'failed', 'needs-script', 'produced'].includes(i.status))).sort((a, b) => a.publishAt.localeCompare(b.publishAt)).slice(0, limit);
    if (!todo.length) {
      console.log('Nothing to produce. Run `autopilot plan` first or add topics to automation/topics.md.');
      return;
    }
    for (const item of todo) {
      console.log(`\n${item.id}  (${item.kind}, publish ${item.publishAt})`);
      item.status = item.status === 'needs-script' ? 'needs-script' : 'producing';
      saveQueue(queue);
      const ok = produce(item);
      if (!ok) {
        if (item.status !== 'needs-script') item.status = 'failed';
        saveQueue(queue);
        continue;
      }
      item.status = 'produced';
      saveQueue(queue);
      if (!args['skip-publish']) publishItem(item);
      saveQueue(queue);
      log(item.id, `status: ${item.status}`);
    }
    console.log('\nDone. `autopilot status` shows the queue.');
  });

const publishDue = () =>
  withLock(() => {
    const due = queue.items.filter((i) => ['due', 'publish-failed', 'produced'].includes(i.status) && new Date(i.publishAt).getTime() <= Date.now());
    if (!due.length) return console.log('Nothing due.');
    for (const item of due) {
      console.log(`\n${item.id}`);
      publishItem(item, {dueOnly: item.status !== 'produced'});
      saveQueue(queue);
    }
  });

const status = () => {
  const now = Date.now();
  console.log(`Queue: ${queueFile}\n  timezone ${queue.timezone} · slots short ${queue.slots.short.join('/')} long ${queue.slots.long.join('/')} · writer ${queue.writer} · budget ${queue.budget}%\n`);
  const rows = queue.items.slice().sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  if (!rows.length) return console.log('  (empty) -> node scripts/autopilot.mjs plan');
  for (const i of rows) {
    const rel = Math.round((new Date(i.publishAt).getTime() - now) / 3600_000);
    const plats = Object.entries(i.platforms).map(([p, st]) => `${p}:${st.status}`).join(' ');
    console.log(`  ${i.status.padEnd(15)} ${i.id.padEnd(46)} ${i.kind.padEnd(5)} ${i.publishAt.slice(0, 16)} (${rel >= 0 ? `in ${rel}h` : `${-rel}h ago`})  ${plats}`);
  }
};

const commands = {plan, add, run, 'publish-due': publishDue, status};
if (!commands[command]) {
  console.error(`Unknown command ${command}. Use: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}
commands[command]();
