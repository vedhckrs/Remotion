# Local dashboard (control room)

`tools/dashboard/server.mjs` + `index.html`, installed by `scaffold.sh` into every project and
started with `npm run dashboard` at http://localhost:4545. One Node process, no extra dependencies,
runs under `nice -n 10` so Chrome and FFmpeg it spawns yield to your foreground work.

## What it does

- Machine bar: CPU load against cores, free memory, thermal state (`pmset -g therm` CPU speed
  limit on macOS), free disk, and the machine budget slider (10 to 100 percent, default 50). The
  budget sets Chrome tab concurrency = cores x budget, capped by memory / 4, halved for 4K. On the
  MacBook Air M5 (10 cores, 16 GB) that is 4 tabs at 1080p and 2 at 4K.
- Encoder and master toggles: hardware encoding (VideoToolbox on macOS) and 4K (scale 2) defaults
  for every queued render.
- Scripts: every `public/script/*.json` with its voiceover, captions and music status; edit the JSON
  in place (validated against the schema on save); create a new script from Markdown text through
  the analyzer; run voiceover (ElevenLabs or macOS draft), Whisper captions and music generation as
  queued tasks with live logs.
- Per script: Icons, Thumbnails, Publish pack and Publish… buttons (publish asks platform, schedule time and dry-run).
- Autopilot panel: queue with per-item status, steps and per-platform publish state; Plan tomorrow / Produce now / Publish due buttons; per-item run.
- Render: pick a composition, preset (shorts, reels, stories, facebook, feed, youtube-1080p,
  preview), optional frame range, queue one or all platforms. Renders run in-process with
  `renderMedia()` so progress (rendered / encoded frames, percent, ETA), stage and cancel are real.
  The bundle is cached and rebuilt only when `src/`, `public/` or the config change.
- Queue: renders and tasks run one at a time (Whisper and a render together would swap on 16 GB).
- Outputs: newest renders with inline video preview, size, Reveal in Finder, download, delete.
- Studio: start and stop `npx remotion studio` and open its URL for frame-accurate editing.
- Log: bundle, render, task and Studio output in one stream (server-sent events).

## Claude Code workflow around it

1. Claude Code writes the script as Markdown (headings per scene, `**highlight**` words, data lines,
   `[neon]` / `[image: path]` tags) and runs `npm run analyze -- script.md --id <videoId>`, or you
   paste the text into "New from text".
2. Voice: ElevenLabs with the `young-male-pro` preset (or the macOS draft voice while iterating).
3. Claude Code builds or adjusts scenes in `src/`; Studio previews; the dashboard's "Quick preview"
   renders a half-size draft in a minute or two.
4. Final: "All platforms" with 4K on, hardware encoder on for long-form, off for short finals.
5. Outputs land in `out/` as `<Composition>_<preset>_<WxH>_4k.mp4`; Reveal in Finder to upload.

## API (for automation from Claude Code or scripts)

```
GET  /api/state                          machine, settings, compositions, scripts, jobs, outputs, queue (autopilot), log
GET  /api/events                         SSE: state, machine, jobs, outputs, studio, log
POST /api/settings                       {budget, hw, fourK, gl}
POST /api/compositions/refresh
GET  /api/scripts/:id                    script JSON
PUT  /api/scripts/:id                    save (validated)
PUT  /api/scripts/:id.md                 raw Markdown for the analyzer (returns its path)
POST /api/render                         {compositionId, preset, frames?, hw?, fourK?, budget?, inputProps?}
POST /api/tasks                          {task: analyze|voiceover|captions|music|luts|machine-check|icons|thumbnails|pack|publish|autopilot-plan|autopilot-run|autopilot-publish-due, options}
                                         publish options: {videoId, platform, when?, dryRun?, file?}; autopilot-run: {id?, limit?, dryRun?}
POST /api/jobs/:id/cancel
GET  /out/<file>                         stream an output (range requests supported; out/<videoId>/... paths allowed)
DELETE /api/outputs/<file>
POST /api/reveal                         {file}  -> open -R on macOS
POST /api/studio                         {action: start|stop}
```

Example from a shell: `curl -X POST localhost:4545/api/render -H 'Content-Type: application/json' -d '{"compositionId":"Shorts","preset":"shorts","fourK":true}'`.

## Configuration

- `--port 4545`, `--skill <dir>` (the scaffold writes the absolute skill path into the npm script).
- Settings persist in `tools/dashboard/settings.json`.
- `REMOTION_IGNORE_CERTS=1` passes `--ignore-certificate-errors` to Chrome behind corporate proxies.
- The server binds to 127.0.0.1 only; do not expose it. It executes project scripts by design.

## Limits

- One project per server; start it from the project root.
- Renders use the presets baked into the server (mirroring `render-preset.sh`); the config file's
  values are not read by the Node API, so keep the two in sync when you change encoding defaults.
- The Node API cannot apply `nice` per job; start the server niced (the npm script does) and use the
  budget slider to shape load.
