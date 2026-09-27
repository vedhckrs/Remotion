# Icons and real brand logos

Videos about tools, platforms and companies need the real marks, in the real colors, animated well, and credited so nobody can claim you passed them off as your own. This reference covers where the SVGs come from, how the templates animate them, and the trademark rules that keep the channel safe.

## 1. Sources (all free, all SVG)

| Set id | What | License | Count | Notes |
|---|---|---|---|---|
| `simple-icons` | Monochrome brand marks with the official brand hex, source URL and (often) a brand-guidelines URL | CC0 1.0 | 3 300+ | npm `simple-icons` (installed by the scaffold) or jsDelivr. The mark stays a trademark of its owner. |
| `logos` | Full-color brand logos (SVG Logos by gilbarbara, via Iconify) | CC0 1.0 | 1 800+ | Use when the multi-color mark matters (Slack, Google, Figma). |
| `lucide` | UI stroke icons | ISC | 1 600+ | Draw-on animation looks great; tint with the theme accent. |
| `tabler` | UI icons, outline and filled | MIT | 5 900+ | Wider coverage than Lucide. |
| `fluent-emoji-flat` | Microsoft's flat colorful emoji | MIT | 1 500+ | Reactions and playful beats; better than font emoji in video. |
| `custom` | Your own SVGs in `public/icons/custom/` | yours | | Client logos supplied for the job. |

Search names: https://simpleicons.org (slug is the file name, e.g. `youtube`, `openai`, `x`, `adobepremierepro`) and https://icon-sets.iconify.design (`logos:react`, `lucide:zap`).

```bash
npm run icons -- --brands youtube,instagram,facebook --logos react,figma --lucide zap,rocket --emoji fire
npm run icons -- --from-script public/script/<videoId>.json     # everything the script references
```

`scripts/fetch-icons.mjs` writes `public/icons/<set>/<name>.svg` and `public/icons/credits.json` (title, license, source, official hex, guidelines URL). Missing names exit 2 and are listed, so the autopilot log shows exactly which slug to fix. Local packages are used when present (`simple-icons`, `@iconify-json/<set>`), otherwise the Iconify API / jsDelivr; the API endpoint is documented at https://iconify.design/docs/api/svg.html.

## 2. In the script

```json
{"id": "scene-04", "headline": "It works on every platform", "highlight": "every",
 "voiceover": "Shorts, Reels and Facebook video all reward the same first second.",
 "visual": {"type": "icons", "icons": [
   {"set": "simple-icons", "name": "youtube", "label": "Shorts"},
   {"set": "simple-icons", "name": "instagram", "label": "Reels"},
   {"set": "lucide", "name": "zap", "label": "Fast", "color": "#FFD93D"}]}}
```

Markdown shorthand for the analyzer: `[icons: youtube, instagram, logos:react, lucide:zap]` at the start of a scene (unprefixed names are Simple Icons slugs). A brand mark as the channel logo: `"logo": {"icon": {"set": "simple-icons", "name": "..."}}` only for your own brand.

`IconScene` lays out 1 icon as a hero, 2 as a comparison with a **VS** badge (automatic when the headline contains "vs"), 3 to 8 as a staggered grid with labels. Brand marks render clean (no glow, no drop shadow) inside a flat tonal tile in their official color (from `credits.json`); UI icons draw themselves on (`animate="draw"`); colorful sets keep their own colors. Backgrounds follow the style preset or `visual.background`.

## 3. Components

- `<Icon set name size color animate="fluid|pop|draw|float|spin|none" delay />` loads the SVG once (cached, `delayRender`), makes it scale to its box, paints mono sets with `currentColor`, and, for `draw`, sets `pathLength=1` on every shape so a stroke-dashoffset reveals it.
- `<BrandLogo name set="simple-icons|logos" size official label animate />` is the tile used by scenes and thumbnails. `official={false}` plus `color` paints a mark white or in the accent (allowed for many brands' "monochrome" variants; check guidelines).
- `<AttributionBar used={["simple-icons:youtube", ...]} />` is the credit line (next section). `SocialVideo` mounts it automatically for the frames where an icon scene is on screen, or for the whole video if the channel logo is a third-party mark.
- `useIconCredits()` returns the credits array for custom layouts.

Icon animation guide: fluid for tiles (condense into place, no overshoot), pop only for playful beats, draw for outline icons in explainers (28 frames), float for idle hero marks (6 px, 2 s), spin only for loaders and gears. Stagger 2 to 4 frames like every other sibling. Never squash a logo: `Icon` keeps aspect with `preserveAspectRatio="xMidYMid meet"`.

## 4. Trademark and copyright rules (why the small credit line exists)

- CC0 covers the SVG files, not the marks. A logo identifies its owner; using it to *refer to* YouTube, Notion or OpenAI in commentary, tutorials and comparisons is nominative use and fine in most jurisdictions. Implying endorsement, partnership or that the brand made the video is not.
- The templates therefore render a small ownership line inside the safe area: "Logos: YouTube, Instagram are trademarks of their respective owners · Icons via Simple Icons (CC0 1.0)". Keep it on. `scripts/make-publish-pack.mjs` also appends the same credit to every description.
- Never alter a mark: no recoloring outside the brand's own palette variants, no stretching, no glows, shadows or effects on the mark itself (a flat tile behind it is fine, distortion is not). Keep clear space (about the height of the mark's smallest element) around it; the tile does this.
- Follow the brand's own page when `credits.json` links guidelines (`guidelines` field). A few brands restrict use of their mark in video thumbnails or forbid it in ads; when in doubt, use the wordmark in plain text instead.
- Do not put third-party logos on merchandise or in paid ads without permission; that is outside nominative use.
- Client logos: get the vector file from the client, drop it in `public/icons/custom/`, and add a `credits.json` entry with their license note so the credit line reads correctly.

## 5. Recreating a logo when no SVG exists

Search Simple Icons and SVG Logos first (add a request there if missing; most brands are covered). If a mark truly is not available, do not trace a raster: ask the owner for the vector, or use the brand name in the brand's typeface style with `KineticTitle` and the official color. Hand-recreated marks are derivative works and the weakest legal position.

## 6. Thumbnails

`Thumbnail.tsx` places up to three brand marks from the script on the thumbnail (right column at 16:9, a row under the headline on covers), clean on flat tiles, plus the same credit line at half opacity. Turn them off with `showLogos: false` when the brand's guidelines forbid thumbnail use.
