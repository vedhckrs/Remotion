# Local dashboard (control room)

`tools/dashboard/server.mjs` + `index.html`, installed by `scaffold.sh` into every project and
started with `npm run dashboard` at http://localhost:4545. One Node process, no extra dependencies,
runs under `nice -n 10` so Chrome and FFmpeg it spawns yield to your foreground work.

## Tabs

**Episodes** (the content-plan studio). The plan file is remembered in settings (**Change plan** switches
it: a native Finder dialog on macOS, an in-page folder browser elsewhere). Pick a week from the strip
(grouped by month, `done/total` per week), then an episode tab (EP001, EP002, ...): only that episode's
detail shows. Per video one row: tick box, name and length, title, the aspect ratios it may use and one
status (No script yet, Script ready, Voiced, Rendered, Saved, Queued, Working N%).

- Ratios follow the video kind: a **long** video is 16:9 only (shown as a tag, nothing to pick); a
  **short** offers 9:16, 4:5 and 1:1 (at least one stays selected). The server applies the same rule, so an
  API call asking for 9:16 on a long video (or 16:9 on a short) skips that ratio.
- **Saves to** defaults to `<episode folder>/exports` (Change / Reset); every video gets its own subfolder.
- Voice (ElevenLabs, OpenAI or the free macOS draft) and music (library track, generated bed or none).
  **More options** holds the script writer (Claude Code headless, or stop when a script is missing), the
  writer model (Sonnet by default, which uses less of a Claude plan; Opus; or Claude Code's default) and
  **Redo** (re-read the episode's script .md, then voice, thumbnails and renders again).
- **Generate N videos**. Each ticked video becomes its own job, queued in plan order (Short A, Long, Short B),
  and the queue runs one job at a time: a video is fully rendered and saved before the next starts.
  Each job shows its step live (expand **Steps** for all of them: script → icons → voice → captions →
  music → thumbnails → one render per ratio → upload details → save to folder) and can be cancelled (✕),
  queued or running. The tab bar shows the running job and how many are waiting on every tab.

Script source, in order: `script-<variant>.md` in the episode folder (analyzed when newer than the JSON, or on
Redo), an existing `public/script/<episodeId>-<variant>.json`, then the writer. The writer asks Claude Code
for the script as Markdown in a single reply (`claude -p`, Sonnet by default, `--max-turns 1`, no tools, user
settings such as hooks and agents skipped), with a live timer on the step; it usually takes under a minute.
The reply is saved as `script-<variant>.md` in the episode folder, where you can read and edit it (tick Redo
after editing), and then analyzed like a hand-written one. The prompt is
`assets/automation/writer-prompt-md.md`; put your own copy at `automation/writer-prompt-md.md` to change it.
The plan's style, title, category, hashtags, CTA and logo are written into the script so thumbnails and copy
match the brand.

Saved folder layout:
```
<save folder>/
  UPLOAD-DETAILS.md                 every platform's title, description, tags, hashtags for the episode
  long/      ep001-long_youtube.mp4, thumbnail.jpg, cover.jpg, square.jpg, publish/ (pack + .srt), ep001-long.script.json
  short-a/   ep001-short-a_shorts.mp4, ep001-short-a_square.mp4, ...
  short-b/   ...
```

**Upload details.** Pick week and episode. One card per video: the player (sized to the ratio, with a
ratio picker when a short has several renders), thumbnails and covers, **Open large** and **Captions .srt**;
next to it platform tabs with Copy buttons: YouTube and Facebook for a long video; YouTube Shorts,
Instagram Reels (caption with the 2,200 limit) and Facebook Reels for a short. YouTube shows title, A/B
title options, description with chapters, tags with the 500-character count and category.
**Schedule…** pre-fills the plan's slot (`date` + `time` + `utcOffset`) and runs `publish.mjs`
(dry run ticked first). **Download .md** saves the episode's UPLOAD-DETAILS.md; **Open saved folder**
reveals the export folder.

**Control room.** Scripts and autopilot on the left, outputs in the middle, render / queue / log on the
right. Outputs are grouped by video folder and filtered with All / Long / Shorts / Feed / Thumbnails;
each card keeps its real shape (16:9, 9:16, 1:1) with a ratio badge; click to play in a player window
(Esc closes). **QC frames** in the player saves contact sheets (a frame every half second with its time,
24 per PNG) to Downloads, for review without sending the video. The page fits the window; each panel scrolls on its own. The Memory gauge shows
memory available to apps (free plus cache, as Activity Monitor counts it), not the near-zero free figure.

## Content plan (JSON)

```json
{
  "title": "My Channel · Season 1",
  "root": "..",                                   // folder the paths below resolve against (relative to this file)
  "style": "my-brand",                            // preset id (built-in or src/lib/brand-styles.ts)
  "handle": "@mychannel",
  "logo": "00-brand/mark.svg",                    // copied to public/brand/, shown top-left
  "endCard": {"headline": "See you tomorrow.", "cta": "Subscribe", "handle": "@mychannel"},
  "signOff": "That's how it works.",              // last voiceover line (writer instructions)
  "cta": "Subscribe for a new video every day.",
  "voicePreset": "young-male-pro",
  "music": "energetic-tech",                      // mood when generating
  "musicLibrary": "04-assets/music",              // reuse these tracks (optional credits.json: {"file.mp3": "Credit line"})
  "category": "Science & Technology", "language": "en",
  "timezone": "Asia/Kolkata", "utcOffset": "+05:30",
  "keywords": ["how it works", "tech explained"], "hashtags": ["#HowItWorks"],
  "writerNotes": "Extra rules for the script writer.",
  "defaults": {"long": {"ratios": ["16:9"], "pacing": "medium"}, "short": {"ratios": ["9:16"], "pacing": "fast"}},
  "targetSeconds": {"long": 420, "short": 45},
  "weeks": [{
    "number": 1, "title": "Invisible Signals", "pillar": "Networks", "background": "grid",
    "playlist": "How Signals Work", "start": "2026-09-28", "month": "Month 1: Your Day, Explained",
    "episodes": [{
      "id": "ep001", "date": "2026-09-28", "topic": "How the internet works",
      "folder": "03-season-1/week-01/ep001-how-the-internet-works",
      "videos": [
        {"variant": "short-a", "kind": "short", "time": "09:00", "title": "Hook as the Shorts title", "hook": "Hook on screen at frame 1"},
        {"variant": "long", "kind": "long", "time": "13:00", "title": "How the Internet Actually Reaches Your Phone"},
        {"variant": "short-b", "kind": "short", "time": "19:00", "title": "Second angle", "hook": "Second angle"}
      ]
    }]
  }]
}
```
(Comments are for this page only; JSON files cannot contain them.) Video ids are `<episode id>-<variant>`.
Set the file with the dashboard button or `POST /api/settings {"planFile": "/abs/path.json"}`; without a
setting the dashboard looks for `automation/plan.json`. `assets/automation/plan.example.json` is a
one-week starting point.

Aspect ratios map to the `platform` prop, which sets the frame size in `calculateSocialVideoMetadata`,
so one composition renders any ratio: 16:9 → `youtube` (`<id>_youtube.mp4`), 9:16 → `shorts`
(`_shorts.mp4`), 4:5 → `feed` (`_feed.mp4`), 1:1 → `square` (`_square.mp4`). The week's `background`
is passed as the background system, the plan's `endCard` as the end card.

## Control room panels

- Machine bar: CPU load against cores, memory available, thermal state (Normal, Warm, Hot · slowing,
  Critical; read from `NSProcessInfo.thermalState` on macOS, which works on Apple Silicon, with
  `pmset -g therm` as fallback; n/a on other systems), free disk, and the machine budget slider (10 to 100 percent, default 50). The
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
GET  /api/plan                           content plan with per-video status (script, voice, renders per ratio, pack, saved folder)
POST /api/episodes/generate              {episodeId, videos:[{variant, ratios:["9:16","1:1"]}], outDir?, voiceProvider?, music?: library|generate|off, writer?: claude|manual, fourK?, hw?, regenerate?}
GET  /api/episodes/:id/details           per video: rendered files, thumbnails, SRT, publish pack (all platforms), scheduled slot, saved folder
GET  /api/episodes/:id/upload-details.md the same as Markdown (download)
POST /api/pick                           {kind: folder|file, prompt, start} -> native Finder dialog on macOS ({path} | {cancelled} | {unsupported})
GET  /api/browse?dir=&files=1            directory listing for the in-page picker (home, project, /Volumes/*)
POST /api/open                           {path} -> open a folder in Finder
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

Every non-GET request must carry `X-Dashboard: 1` (the page adds it). Together with the Host check
this stops other websites open in the same browser from triggering renders or uploads through
localhost. Example from a shell:
`curl -X POST localhost:4545/api/render -H 'Content-Type: application/json' -H 'X-Dashboard: 1' -d '{"compositionId":"Shorts","preset":"shorts","fourK":true}'`.

The queue runs jobs one at a time, oldest first. A render that makes no progress for 5 minutes (for
example after the Mac slept mid-render) is cancelled with "Render stalled", so the queue moves on.
`POST /api/settings` accepts only known keys with valid values (budget 10 to 100, booleans for `hw` and
`fourK`, known `gl`, `voiceProvider`, `music` and `writer` values).

## Full speed

The budget slider (default 50 %) trades render speed for a responsive Mac. For maximum speed:

- **Full speed** (header button): budget 100 %, hardware encoder (VideoToolbox, the Mac's media engine) on.
- **Speed test** (header button): renders the same 2 seconds with 2, 3, 4, 5, 6, 8 and all-core tab counts
  at the current 4K setting, keeps the fastest and uses it whenever the budget is 100 %. Too few tabs
  leave cores idle and too many thrash memory, so the best value is measured, not guessed (Remotion
  recommends `npx remotion benchmark` for the same reason). Re-run it after a macOS or skill update.
- Background dashboard at normal priority: `bash <skill>/scripts/install-dashboard.sh --full-speed`
  (Nice 0, ProcessType Interactive instead of Nice 10).
- The GPU is used for WebGL scenes (ANGLE on Metal) and, with the hardware encoder, for encoding; frame
  capture itself is CPU work in Chrome, which is why the tab count matters most.
- A fanless MacBook Air slows its CPU under long full loads (the Thermal gauge shows it). A 4K master
  has four times the pixels of 1080p and takes roughly three to four times longer; untick 4K for drafts.

## Run it in the background (macOS)

`npm run dashboard:install` (or `bash <skill>/scripts/install-dashboard.sh` from the project root) installs
a LaunchAgent, `com.remotion.dashboard`, that starts the dashboard at login, restarts it if it stops and
runs it at nice 10, so no Terminal window has to stay open. Stop any dashboard running in a Terminal
first (Ctrl+C); the installer refuses while the port is taken. Log: `tools/dashboard/dashboard.log`.
launchd does not read `~/.zshrc`, so the installer asks your login shell which `claude` it runs (following an
alias) and bakes that path in as `CLAUDE_BIN`; the script writer then uses the same Claude Code login as your
Terminal. If a job says "Claude Code is not logged in", run `claude` in Terminal, type `/login`, and generate
again; after installing or moving Claude Code, re-run the installer.
After `scaffold.sh --update`, restart it to load the new code:
`launchctl kickstart -k gui/$(id -u)/com.remotion.dashboard`. Remove it with `--uninstall`. For a Dock
icon, open the page in Chrome and use Cast, save and share > Install page as app. The first save to an
external drive or the first native folder dialog may trigger a macOS permission prompt for node: allow it.

## Configuration

- `--port 4545`, `--skill <dir>` (the scaffold writes the absolute skill path into the npm script).
- Settings persist in `tools/dashboard/settings.json`.
- `REMOTION_IGNORE_CERTS=1` passes `--ignore-certificate-errors` to Chrome behind corporate proxies.
- The server binds to 127.0.0.1 only; do not expose it. It executes project scripts by design.

## Limits

- One project per server; start it from the project root.
- Updating an existing project to a newer skill version: `scripts/scaffold.sh <project> --update`
  (backs up `src/` and `tools/dashboard/` to `.skill-backup/<time>/`, keeps `src/Root.tsx`,
  `src/lib/brand-styles.ts`, `public/`, `automation/`, `.env` and the dashboard settings).
- Renders use the presets baked into the server (mirroring `render-preset.sh`); the config file's
  values are not read by the Node API, so keep the two in sync when you change encoding defaults.
- The Node API cannot apply `nice` per job; start the server niced (the npm script does) and use the
  budget slider to shape load.
