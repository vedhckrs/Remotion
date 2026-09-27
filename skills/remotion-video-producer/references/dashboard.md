# Local dashboard (control room)

`tools/dashboard/server.mjs` + `index.html`, installed by `scaffold.sh` into every project and
started with `npm run dashboard` at http://localhost:4545. One Node process, no extra dependencies,
runs under `nice -n 10` so Chrome and FFmpeg it spawns yield to your foreground work.

## Tabs

**Episodes** (the content-plan studio). Load a season plan (JSON, format below) with **Choose plan file…**
(a native Finder dialog on macOS, an in-page folder browser elsewhere). Weeks show as tabs grouped by
month, each with a progress meter; a week lists its episodes with per-video status (script, voice,
video ratios, upload details, saved). Pick an episode, then:

- tick the videos to make (for example Long, Short A, Short B) and the **aspect ratios** for each:
  16:9, 9:16, 4:5, 1:1 (several per video is fine; defaults come from the plan);
- choose **Save videos to** (default `<episode folder>/exports`); every video gets its own subfolder;
- pick the voice (ElevenLabs, OpenAI, or the free macOS draft), music (a track from the plan's music
  library, a newly generated bed, or none) and what happens when a script is missing (Claude Code
  headless writes it, or stop);
- **Generate**. One queued job runs the whole episode and shows each step live:
  script → icons → voice → captions → music → thumbnails → one render per ratio → upload details →
  save to folder. **Queue whole week** adds every episode of the week with its defaults.

Script source, in order: `script-<variant>.md` in the episode folder (analyzed when newer than the JSON),
an existing `public/script/<episodeId>-<variant>.json`, then Claude Code (`claude -p` with
`automation/writer-prompt.md` plus the episode's title, hook and sign-off). The plan's style, title,
category, hashtags, CTA and logo are written into the script so thumbnails and copy match the brand.
Every step is skipped when its output exists; tick **Redo voice & renders** to rebuild.

Saved folder layout:
```
<save folder>/
  UPLOAD-DETAILS.md                 every platform's title, description, tags, hashtags for the episode
  long/      ep001-long_youtube.mp4, thumbnail.jpg, cover.jpg, square.jpg, publish/ (pack + .srt), ep001-long.script.json
  short-a/   ep001-short-a_shorts.mp4, ep001-short-a_square.mp4, ...
  short-b/   ...
```

**Upload details.** Pick week and episode. Per video: players for each rendered ratio, the thumbnails
and covers, and a card per platform with Copy buttons: YouTube (title, A/B title options,
description with chapters, tags with the 500-character count, category), Facebook page video for long
videos; YouTube Shorts, Instagram Reels caption (2,200 limit shown) and Facebook Reels for Shorts.
**Schedule…** pre-fills the plan's slot (`date` + `time` + `utcOffset`) and runs `publish.mjs`
(dry run first). **Download UPLOAD-DETAILS.md** saves the same text as a file.

**Control room.** Everything below (scripts, render panel, queue, autopilot, outputs, Studio, log).

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

The queue runs jobs one at a time, oldest first.

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
