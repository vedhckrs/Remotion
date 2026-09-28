# Topic packages: the daily episode workflow

One topic a day, two videos from it: a long 16:9 video (8:00 to 8:30) and a 9:16 Short (55 to 60 s). Everything
about the topic lives in one folder, the **package**, prepared once. Producing it is local and repeatable: no
Claude calls, no downloads. The only paid call is the ElevenLabs voice (about 9,000 characters per topic).
Publishing stays manual.

## The package folder

```
ep001-how-the-internet-works/
  package.json            id, week, date, topic, title, audience, objective, voice, music
  production.json         videos -> scenes (schema wiresplained.production/1)
  research/sources.json   [{id, title, publisher, url, accessed, supports, limits}]
  assets/brands.json      brand marks used (Simple Icons path + hex), assets/manifest.json provenance
  upload/<video>.json     title, description, tags, hashtags, chapters
  thumbs/thumbs.json      thumbnail text and visual per video
  scripts/<video>.md      readable script
  voice/<video>/          voice-NN.mp3 + timing.json          (package-voice.mjs)
  music/<video>.mp3       + credits.json                      (package-music.mjs)
  renders/<video>/        stills/, segments/, audio-*.wav, qc.json
  renders/<id>_<video>_<WxH>.mp4 + render-manifest.json       (package-render.mjs)
```

Stages (the validator computes them): planned -> researched -> scripted -> storyboarded -> voiced ->
assets-ready -> render-ready. A finished render is recorded in `renders/render-manifest.json` with what it was
made from; change a scene, the voice or the music and the validator marks it **out of date**.

### A scene

```json
{
  "id": "L09",
  "headline": "The nearby-copy shortcut.",
  "highlight": "shortcut",
  "narration": "Now comes the shortcut. A content delivery network, or CDN, stores copies closer to viewers...",
  "sources": ["R01", "R04"],
  "sourceNote": "Cloudflare, What is a CDN?",
  "holdAfter": 0.5,
  "visual": {
    "kind": "flow",
    "nodes": [{"id": "origin", "icon": "server", "label": "Origin"}, {"id": "edge", "icon": "server", "label": "Edge copy", "color": "green"}],
    "links": [{"from": "origin", "to": "edge", "dashed": true}],
    "beats": [{"at": "stores copies", "show": ["edge", "origin>edge"], "focus": ["edge"]}]
  }
}
```

Diagram kinds: `flow` (row, column, tree, hub, free with packets), `stat`, `bars`, `equation`, `meter`, `compare`,
`layers`, `grid`, `timeline`, `cycle`, `checklist`, `wave` (spectrum, sine, lanes), `hero`, `device` (phone,
earbuds, router, tower). Beats fire when the narration reaches a phrase (measured from the voice) or at a
fraction of the scene. Icons are Lucide names or `brand:<slug>` from `assets/brands.json`. The validator checks
every rule, icon name, beat phrase and source id before anything is paid for.

## Commands (run from the Remotion project root)

```bash
node <skill>/scripts/validate-package.mjs <folder> [--write]          # stage, errors, warnings, lengths
node <skill>/scripts/package-stills.mjs <folder>                      # one picture per scene: check before paying
node <skill>/scripts/package-voice.mjs <folder> --dry-run             # characters that would be billed
node <skill>/scripts/package-voice.mjs <folder>                       # ElevenLabs, measured word timing
node <skill>/scripts/package-voice.mjs <folder> --provider macos      # free draft voice (estimated timing)
node <skill>/scripts/package-music.mjs <folder>                       # original bed made on this Mac
node <skill>/scripts/package-render.mjs <folder> --draft              # half size, quick check
node <skill>/scripts/package-render.mjs <folder> --4k --hw            # the masters
```

All of them take `--video long|short|all`. The dashboard's **Library** tab runs the same scripts with progress
bars, a voice-cost confirmation and a Resume button.

## What is kept (and never paid for or rendered twice)

| Step | Kept as | Redone when |
|---|---|---|
| Voice | one mp3 per chunk of whole scenes (up to 4,000 characters), keyed by text + voice + model + settings | that chunk's narration, the voice or the model changes |
| Music | `music/<video>.mp3`, keyed by seed + style + length | the video length changes by a second or more, or `--force` |
| Stills | one jpg per scene, keyed by scene content + renderer code | the scene or the renderer changes |
| Picture | one silent H.264 segment per scene, keyed by scene content, measured voice, brands, renderer code, quality (and, on 16:9, its place in the video for the progress line) | any of those change |
| Sound | one WAV master per video, keyed by timing, music and levels | voice, music or scene lengths change |

A cancelled or failed render keeps every finished scene: run it again (or press **Resume**) and it continues
with the next one. `--force` redoes everything.

## Voice

- One request per chunk of whole scenes with `previous_text` / `next_text`, so delivery flows across the joins;
  a Short is one request, a long video three.
- `package.json` -> `voice`: `{provider, preset, model, voiceId?, settings?, pronunciations: [{word, say}]}`.
  Pronunciations change only what is spoken; captions keep the written word.
- Word timings come from ElevenLabs' character alignment. Each scene plays its slice of the chunk; captions and
  beats follow the measured words.
- The key lives in the project's `.env` (`ELEVENLABS_API_KEY`), never in a package.
- **Voice the Short first.** Its ~800 characters measure this voice's real pace; the validator then predicts
  the long video's length before its ~8,000 characters are paid for, and if the prediction is outside the
  target it says which `speed` to use (or how many words to cut). Speed can be set for one video only:
  `"voice": {"videos": {"long": {"settings": {"speed": 1.05}}}}` (ElevenLabs accepts 0.7 to 1.2; stay within
  about 0.95 to 1.1 for a natural read). Only that video's chunks are affected.

## Music (free, local, nothing to claim)

`package-music.mjs` synthesises an original instrumental bed on the Mac from a seed (the package id and video):
soft lowpassed pads, sub bass, a quiet high pluck with echo, light drums with sidechain, an intro, sections, a
breakdown and a resolving ending timed to the video. Styles: `pulse` (long default, 100-108 BPM), `drive`
(Short default, 112-120), `glow` (88-96), `calm` (no drums). Same seed, same music; `--seed` for another take.
Because nothing is sampled from a library, there is no Content ID match to dispute.

Your own track instead: `--import track.mp3 --licence "YouTube Audio Library" [--title --artist --url --attribution]`.
The licence is stored in `music/credits.json`. Free sources checked in 2026:
- YouTube Audio Library (YouTube Studio -> Audio library): free for YouTube; some tracks need attribution in the
  description.
- Pixabay Music: free under the Pixabay Content License, but some contributors register tracks with Content ID,
  so claims can appear and must be disputed with the licence certificate.
- FreePD (CC0) has closed; CC0 tracks remain on sites such as Chosic (filter "no attribution").

Beds are set to -14 LUFS; the renderer plays them at `level` (0.16 long, 0.2 Short) and ducks them to 40% under
speech with 12-frame ramps.

## Render, sound and QC

- Picture: `renderMedia` per scene (`frameRange`, muted), H.264 yuv420p bt709; 4K = scale 2 of the 1920x1080 /
  1080x1920 compositions. Hardware encoding (VideoToolbox) uses 60M (16:9) / 50M (9:16) at 4K.
- Sound: one audio-only render (no screenshots) to WAV, measured with a BS.1770 meter (K-weighting, gated),
  set to **-14 LUFS**, true peak under **-1 dBTP** (soft limiter only if needed), then AAC 48 kHz (320k long,
  256k Short).
- Join: the segments are concatenated without re-encoding and muxed with the sound (`+faststart`).
- QC (`renders/<video>/qc.json`): size, 60 fps, exact length, H.264/yuv420p, AAC 48 kHz stereo, loudness,
  true peak, speech present in every voiced scene, no silence over 2 s, no blank pictures and pictures that
  change within each scene (raw frames sampled at 30% and 85% of every scene). Errors fail the render; the
  last two are warnings.

Remotion's bundled FFmpeg has no `loudnorm`, `scale` or `select` filters, which is why loudness and frame checks
are done in JS (`scripts/lib/audio.mjs`, raw frames through `image2pipe`).

## Daily routine

1. Import the day's package zip in the Library tab (or copy the folder into the library folder).
2. Tick **Storyboard stills**, Generate, look through the strip. Fix anything in `production.json`.
3. Voice the **Short** first (untick Long): the confirmation shows the exact characters. The Long row then
   shows its predicted length; if it is outside 8:00-8:30, follow the warning (speed or trim), then voice the
   Long. Then **Music** and **Render** (Draft first if anything changed a lot, then Final).
4. Play the master, read the QC list, copy the upload details, publish by hand.
