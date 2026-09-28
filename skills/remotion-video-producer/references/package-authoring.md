# Writing a topic package

How to prepare one topic as a package (research, script, storyboard, upload copy) so it validates first time and
renders without further writing. This is the only step where Claude writes; everything after it is local. Read
`topic-packages.md` for the folder layout and the production steps.

Start from a finished topic in the library (EP001 is the reference: 32 long scenes, 8 Short scenes) and
`assets/packages/demo-kinds/` (one scene per diagram kind, both ratios). Finish with `node <skill>/scripts/validate-package.mjs <folder>` from the Remotion project root (it checks
icon names against the installed Lucide set) and fix every error. Then `package-stills.mjs` and look at every
picture before anyone pays for a voice.

## Length budget (words, not seconds)

| Video | Target | Scenes | Narration | Per scene |
|---|---|---|---|---|
| Long 16:9 | 8:00-8:30 (`targetSeconds: [480, 510]`) | 28-32 | **1,120-1,180 words** | 30-45 words, 12-20 s |
| Short 9:16 | 0:55-1:00 (`[55, 60]`) | 7-9 | **115-128 words** | 10-20 words, 5-8 s |

Why these numbers: narration voices read at roughly 145-160 words a minute, and every scene adds about 0.75 s
(0.25 s lead-in, 0.5 s hold). 1,150 words at 150 wpm = 460 s + 24 s of holds = 8:04. The validator's estimate
uses 160 wpm, so aim for its estimate near the bottom of the range (about 8:00 long, 0:55 Short); once the Short
is voiced it predicts the long from the real pace and names the fix if needed.

## Research (`research/sources.json`)

```json
{"id": "R04", "publisher": "Netflix", "title": "Open Connect overview", "url": "https://openconnect.netflix.com/...",
 "accessed": "2026-09-27", "supports": "What the source backs up, in one line", "limits": "What it does not show"}
```

- Primary sources first (standards bodies, the operator's own documentation, peer-reviewed or official stats),
  then reputable explainers. Every source must be opened and read; `accessed` is that date.
- Every number on screen (stat, bars, equation) and every surprising claim cites at least one source id in the
  scene's `sources`. The validator warns on numeric scenes without one and on sources nobody cites.
- `sourceNote` (optional) is the short credit shown bottom-right in the scene, e.g. `"ITU, The digital lifelines"`.
- Say what is an illustration: "Our glowing dots represent packets" beats a viewer thinking it is literal.

## Narration

- Spoken English, short sentences, one idea per sentence, active voice. Read it aloud.
- No Markdown, emoji, brackets or slashes; write "and" or "or". Units the way they are said ("ten thousand
  kilometres" or "10,000 km" both read well; avoid "10k").
- Acronyms the voice might mangle go in `package.json` -> `voice.pronunciations` (`{"word": "CDN", "say": "C D N"}`);
  captions keep the written form.
- The long video: hook in the first scene (a surprising contrast), then a clear journey, a recap scene and an ending
  that names the next episode ("Next: how Wi-Fi works... That's how it's wired."). The Short: one idea, a payoff by
  0:45, end with the channel line.
- Hedge honestly where the truth is "it depends" (may, often, can), but do not hedge every sentence.

## Headline and highlight

- `headline`: 2 to 6 words, the scene's point, sentence case with a full stop. Max about 36 characters per line
  on 16:9 and 22 on 9:16; use `\n` to break a Short headline where it reads best.
- `highlight`: one word that appears in the headline (it turns Spark Yellow). No Markdown `*` anywhere.

## Visuals (`visual.kind`)

| Kind | Use for | Key fields |
|---|---|---|
| `hero` | the opening, a single object | `icon`, `orbit: [icons]`, `big` (a number), `sub`, `color` |
| `flow` | journeys, request paths, systems | `nodes: [{id, icon, label, sub?, color?, signal?}]` (max 6), `links: [{from, to, dir?: "both", dashed?, color?, label?}]`, `layout: row \| column \| tree \| hub \| free`, `badge: {text, color}`, `pos` for free layout: `{land: {id: [x, y]}, port: {...}}` (0..1) |
| `stat` | one number | `value` (number), `unit`, `label`, `sub` |
| `bars` | comparing amounts | `items: [{label, value}]`, `unit` |
| `equation` | a calculation | `terms: [{value, label}, {op: "÷"}, ...]` (at least 3), `note` |
| `meter` | levels, buffers, capacity | `style: "tank"`, `level` 0..1, `label`, `in`/`out: {label, icon}` |
| `compare` | two or three options | `items: [{id, label, icon, value, points: []}]` (2-3), `vs: true` |
| `layers` | construction, stacks | `items: [{label, sub}]` (max 6), `style: rings \| stack` |
| `grid` | many similar things (packets) | `count` or `items`, `caption`; beats `set: {missing: ["4"], done: ["4"]}` |
| `timeline` | ordered steps | `steps: [{label, icon}]` (2-7) |
| `cycle` | loops | `steps: [{label, icon}]` (3-6) |
| `checklist` | myths, diagnostics | `items: [{label, sub?, ok?: false}]` (max 5) |
| `wave` | radio, light, frequencies | `mode: spectrum \| sine \| lanes`, `band`, `channels`, `hop`, `busy`, `lanes`, `label` |
| `device` | a physical thing with parts | `device: phone \| earbuds \| router \| tower \| <lucide icon>`, `callouts: [{label, at}]` |

Copy the exact shapes from `assets/packages/demo-kinds/production.json`. Colours: `accent` (Spark Yellow),
`cyan`, `violet`, `pink`, `green`, `red`, `amber`, `muted`. Use colour for meaning (green = good path, red =
failure, violet = the far or optional route), not decoration.

Icons: Lucide names in kebab-case (`smartphone`, `router`, `server`, `radio-tower`, `waves`, `globe`,
`building-2`, `cable`, `shield-check`); the validator rejects names that do not exist. Brand marks: `brand:<slug>`
with the Simple Icons path and hex in `assets/brands.json` and provenance in `assets/manifest.json`; use them
only when the brand is the subject, and put the trademark line in a `sourceNote`.

### Beats: sync the picture to the words

```json
"beats": [
  {"at": "cache hit", "show": ["edge", "edge>phone"], "focus": ["edge"]},
  {"at": 0.8, "set": {"level": 0.3}}
]
```

- `at` is a phrase copied exactly from the narration (it fires when the voice says it) or a 0..1 fraction of
  the scene. The validator rejects phrases that are not in the narration.
- `show` / `hide` / `focus` name element ids: flow node ids and link ids (`"from>to"`), `badge`, grid items,
  equation terms (`t0`, `t1`, ...) and `note`. Elements named in any `show` start hidden.
- `set` changes a parameter (`level`, `missing`, `done`, `dim: [ids]`).
- Two to four beats per scene is plenty; every scene needs something to change while it is on screen.

## Upload copy

`upload/long.json`:
```json
{"title": "≤ 70 characters, the promise", "alternatives": ["two more titles"],
 "description": "2-3 short paragraphs; what the viewer learns; what is illustrative",
 "tags": ["10-15 tags"], "hashtags": ["#Internet", "#HowItWorks", "#Tech"],
 "chapters": [["L01", "Wireless phone, wired journey"], ["L03", "Before playback"], ...],
 "pinnedComment": "a question that invites replies"}
```
Chapters name the scene where each starts; the first must be the first scene. The dashboard turns them into
`0:00 Title` lines from the measured voice and offers the sources list for the description.
`upload/short.json`: `title` (≤ 60 characters, ends with #Shorts or not, your call), `description`, `tags`,
`hashtags`.

`thumbs/thumbs.json`: per video `{text (≤ 5 words), highlight, icon, brands?}`.

## Checklist before handing over

1. `validate-package.mjs`: no errors; estimated lengths near the bottom of each range; warnings read and
   either fixed or accepted.
2. `package-stills.mjs`: every still read at phone size. Nothing overlaps, every label fits, the picture
   explains the sentence without the narration.
3. Numbers match their sources; illustrations are labelled as such.
4. Zip the folder (without `voice/`, `music/`, `renders/`) and import it in the dashboard's Library.
