# Platform specifications and safe zones (checked September 2026)

Platforms move their UI often. Treat the safe-zone numbers as conservative envelopes, verify against the app when a client is picky, and keep the `SafeArea` overlay on while designing.

## Formats at a glance

| Format | Canvas | Ratio | fps | Length | Notes |
|---|---|---|---|---|---|
| YouTube long-form | 1920x1080 (or 3840x2160) | 16:9 | 24/25/30/60 | up to 12 h / 256 GB | Fast-start MP4, H.264 High, BT.709, AAC-LC 48 kHz |
| YouTube Shorts | 1080x1920 | 9:16 (1:1 accepted) | 30 or 60 | up to 3 min | Title + channel chrome at bottom, right rail of buttons |
| Instagram Reels | 1080x1920 | 9:16 | 30 (23 to 60 ok) | up to 3 min (some accounts 90 s) | Cover image 1080x1920 shown as 4:5 in grid |
| Instagram Feed video | 1080x1350 | 4:5 | 30 | up to 60 min | Shown as 4:5 crop in grid; 1:1 also fine |
| Instagram Stories | 1080x1920 | 9:16 | 30 | 60 s per card | Top 250 px and bottom 340 px covered by UI |
| Facebook Reels | 1080x1920 | 9:16 | 30 | up to 90 s | Same Meta safe zone as IG Reels since 2026 |
| Facebook Feed | 1080x1350 or 1080x1080 | 4:5 or 1:1 | 30 | up to 240 min | 4:5 wins the most feed real estate |
| Facebook Stories | 1080x1920 | 9:16 | 30 | 60 s | |

Upload H.264 in an MP4 container with AAC audio everywhere. Platforms re-encode, so give them a high-quality source (see `rendering.md`).

Masters in this skill are 60 fps at twice the authoring canvas (`--4k`): 3840x2160 for YouTube, 2160x3840 for Shorts / Reels / Stories / Facebook Reels, 2160x2700 for 4:5 feed. All three platforms accept 60 fps and 4K vertical; YouTube keeps the higher bitrate ladder, Instagram and Facebook downscale but start from a cleaner source. Frame rate is set on the composition (`PLATFORMS[*].fps = 60`), size by the render scale.

Logo slot: `getLogoSlot()` puts the mark top-left inside the safe rect (about 12 px below its top edge), 9 percent of width on vertical and 7 percent on horizontal, capped to half the safe width. Alternatives `top-right`, `top-center`, `bottom-left`. Never bottom-right on YouTube (end screen, progress) and never inside the right rail or bottom 20 percent on vertical.

## Safe zones (1080x1920 vertical)

Design the "message box" as the intersection of all three vertical platforms so one render posts everywhere:

| Edge | YouTube Shorts | Instagram Reels / Stories | Facebook Reels | Use this |
|---|---|---|---|---|
| Top | 180 px (search, camera) | 250 px (profile, close) | 250 px | **270 px** |
| Bottom | 350 px (title, channel, subscribe, audio) | 340 to 420 px (caption, audio, CTA) | 420 px | **420 px** |
| Left | 60 px | 65 px | 65 px | **72 px** |
| Right | 120 px (like / comment / share / remix rail) | 120 px | 120 px | **150 px** |

That leaves a 858 x 1230 px content area centered at (540, 885). Captions live in the lower part of that box, roughly y = 1250 to 1480, never below 1500. Keep brand marks near the top-left of the box, not the corners.

Horizontal 1920x1080 (YouTube): keep titles inside a 5 percent margin (96 px sides, 54 px top/bottom). Lower thirds sit at y = 820 to 960. Avoid the bottom-right 300 x 120 px where the end-screen and progress UI live. 4K uses the same proportions.

Square / 4:5 feed (1080x1080 / 1080x1350): 60 px margin all around; comments and captions appear below the video, so the whole frame is visible.

`src/lib/platforms.ts` in the templates encodes these values and returns a `safe` rectangle per platform id.

## Duration and pacing targets

| Deliverable | Ideal | Hard limits |
|---|---|---|
| Shorts / Reels hook | first 1.5 s | Viewers swipe by 3 s |
| Shorts / Reels total | 20 to 45 s | 3 min (YT, IG), 90 s (FB) |
| Stories | 10 to 15 s per card | 60 s |
| YouTube explainer | 4 to 8 min | Chapters every 45 to 90 s |
| YouTube ad (skippable) | 15 to 30 s | Message before 5 s |

Loop-friendly Shorts: make the last frame visually resolve into the first (same background, same position of the hero) so the auto-loop feels intentional.

## Text sizing (px at 1080 width)

- Hook / headline: 84 to 120 px, weight 800 to 900, 1 to 3 words per line.
- Body / supporting: 44 to 56 px.
- Captions: 56 to 72 px vertical, 40 to 48 px horizontal, weight 700 to 900.
- Lower-third name: 48 px, role: 32 px (horizontal).
- Minimum anything: 32 px vertical, 28 px horizontal. Scale with `width / 1080`.

## Per-platform delivery notes

YouTube long-form: upload the 4K master even for 1080p content if you can afford the render (YouTube assigns higher-bitrate VP9/AV1 ladders to 4K uploads). Add chapters in the description that match the chapter cards. Thumbnail 1280x720 under 2 MB, faces and 3 to 4 words.

YouTube Shorts: a video under 3 minutes at 9:16 is a Short automatically. Add `#Shorts` in title or description. Burned-in captions outperform auto captions.

Instagram Reels: upload 1080x1920; the feed preview shows the middle 4:5, so keep the hook headline in the vertical center. Provide a cover frame. Trending audio is added in-app, so leave headroom: music at -18 dB or a mix without music if the client will add trending audio.

Instagram Feed: 4:5 gets the most screen; render 1080x1350 from the same scenes with `platform: 'feed'`.

Facebook Reels / Feed: Facebook plays feed video muted by default, so captions and on-screen text carry the message. Reels share the Meta safe zone; Feed 4:5 needs a strong first frame because it is the thumbnail.

Multi-format from one project: one `Composition` per format, same scene components, layout driven by `useVideoConfig()` and the platform token (`vertical`, `horizontal`, `square`). Do not maintain separate scene code per platform.
