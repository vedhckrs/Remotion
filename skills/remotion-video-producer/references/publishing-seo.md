# Publishing: thumbnails, per-platform copy, scheduling, upload APIs

The render is half the job. This reference covers what the pipeline writes for each platform, the ranking rules it follows, how uploads are scheduled, and how to get the API credentials once.

## 1. Pipeline

```bash
npm run thumbs  -- --video <id> [--text "3 to 5 words"] [--variants "A|B"] [--image public/hero.jpg]
npm run pack    -- --video <id> --handle @you [--site https://...]
npm run publish -- --video <id> --platform youtube-shorts --when 2026-09-28T09:00:00+05:30 --dry-run
```

- `make-thumbnails.mjs` renders the `Thumbnail` (1280x720), `Cover` (1080x1920) and `SquareCover` (1080x1080) stills, JPEG under 2 MB, into `out/<id>/`, styled by the video's preset (`styles.ts` `thumbnail` block: font, case, accent block).
- `make-publish-pack.mjs` writes `out/<id>/publish/{youtube,youtube-shorts,instagram,facebook}.json`, `titles.md` and `pack.json` from the script's `seo` block.
- `publish.mjs` uploads one platform, scheduled or immediate, dry-run first. `autopilot.mjs` calls all three for every item.

## 2. The `seo` block (Claude writes it in Phase 2)

```json
"seo": {
  "titles": ["Keyword-first title under 70 chars", "Curiosity variant", "Number variant"],
  "description": "First sentence contains the main keyword and the payoff. Two or three more sentences.",
  "keywords": ["main keyword", "secondary", "..."],
  "hashtags": ["#Shorts", "#niche", "#topic"],
  "category": "Education",
  "cta": "Follow for part two.",
  "thumbnailText": "NOBODY WATCHES SECOND ONE",
  "language": "en"
}
```

Rules the pack enforces or flags (`npm run check -- public/script/<id>.json`):

- **Titles**: under 70 characters show in full on mobile (hard limit 100). Keyword in the first half. Numbers, "why", "nobody", "stop" and a concrete outcome outperform clever wordplay. Three options for A/B.
- **Description**: the first two sentences are what viewers and the ranking system see before "more". Keyword in sentence one, no links there. Then chapters, CTA, handle, hashtags, credits.
- **Hashtags**: 3 to 5 on YouTube (first three appear above the title), `#Shorts` first on Shorts and never on long-form; 3 to 8 specific ones on Instagram; 1 to 2 on Facebook.
- **Tags** (YouTube): up to 500 characters total, each under 30; keywords plus title words. Tags are weak signals; the title and description matter far more.
- **Chapters**: written only when there are 3 or more, the first is `00:00`, and each is 10 seconds or longer (YouTube's rule), so Shorts never get them.
- **Category** maps to YouTube `categoryId` (Education 27, Science & Technology 28, Howto & Style 26, Entertainment 24, People & Blogs 22).
- **Credits**: brand marks used in the video and the icon-set licenses are appended to every description, plus the music credit if `script.music.credit` is set.

## 3. Thumbnails and covers

- 1280x720, under 2 MB, JPEG; YouTube shows it at 168 px wide in feeds, so **3 to 5 words**, one accent block, one focal object. Faces with a clear emotion lift CTR; without a face, use a real logo or an object with contrast.
- Text is a curiosity gap that completes the title, not the title repeated. Keep it in the left 60 percent at 16:9 (right side is the marks column) and off the bottom-right corner (duration badge).
- Shorts and Reels ignore custom thumbnails on mobile feeds: the **first frame** is the cover. The hook scene must read as a poster (headline visible by frame 6, logo in slot). `Cover` (1080x1920) is used where covers are accepted (Reels via `thumb_offset`, profile grids) and as a social preview.
- A/B: `--variants "TEXT A|TEXT B"` renders `thumbnail-a.jpg`, `thumbnail-b.jpg` with different background frames. YouTube's own thumbnail test (Test & Compare) accepts up to three.

## 4. Scheduling: 3 videos a day

Default slots in `automation/queue.json`: Shorts at 09:00 and 19:00, long-form at 13:00 in your timezone (edit them; the best hour is when your own analytics show viewers online, typically 1 to 2 hours before their peak). Platforms schedule differently:

| Platform | How the pipeline schedules | Limits |
|---|---|---|
| YouTube (video and Shorts) | Upload as `private` with `status.publishAt`; YouTube flips it public at that time | Time must be in the future; ISO 8601 |
| Facebook Reels | `upload_phase=finish` with `video_state=SCHEDULED` and `scheduled_publish_time` | 10 minutes to 29 days ahead |
| Facebook page video | `published=false` + `scheduled_publish_time` | same window |
| Instagram Reels | No API scheduling. `publish.mjs` exits 3 ("due"), `autopilot publish-due` runs every 30 minutes and publishes at the slot | Business or Creator account; 100 API posts per 24 h |

Quota: a YouTube upload costs 1 600 of the default 10 000 daily units, a thumbnail set 50, a caption insert 400. Three uploads a day fit; request a quota increase before scaling past five.

## 5. Credentials (once per channel, all in `.env`)

**YouTube**: Google Cloud Console -> new project -> enable *YouTube Data API v3* -> OAuth consent screen (External, add your Google account as a test user) -> Credentials -> OAuth client ID, type *Desktop app*. Put `YT_CLIENT_ID` and `YT_CLIENT_SECRET` in `.env`, then `npm run auth-youtube -- --write` (opens the consent page, receives the code on localhost:4546, stores `YT_REFRESH_TOKEN`). While the consent screen is in "testing", refresh tokens expire after 7 days: publish the app (no verification needed for your own channel's use, but a "unverified app" warning shows) or re-run auth weekly. Custom thumbnails need a phone-verified channel.

**Instagram**: an Instagram professional account linked to a Facebook Page. Meta for Developers -> app -> add *Instagram Graph API* (business login) -> generate a user token with `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`; exchange for a long-lived token (60 days) in the Graph API Explorer or via `/oauth/access_token?grant_type=fb_exchange_token`. `IG_USER_ID` is the Instagram professional account id (`GET /me/accounts?fields=instagram_business_account`). Set `META_ACCESS_TOKEN`.

**Facebook**: the same app with `pages_manage_posts`, `pages_read_engagement`, `publish_video`. `META_PAGE_ID` and a Page access token as `META_PAGE_TOKEN` (`GET /me/accounts` returns page tokens; a page token derived from a long-lived user token does not expire).

All Meta apps start in Development mode, which is enough for accounts with a role on the app (yours). App Review is only needed to publish for other people's accounts.

## 6. Platform specifics the copy follows

- **YouTube Shorts**: vertical, up to 3 minutes; `#Shorts` in title or description; the first frame is the cover; comments and the pinned comment carry links (descriptions are barely visible in the Shorts player).
- **YouTube long-form**: 1080p and 4K get separate encodes; upload 4K so the VP9 ladder is used. Chapters need the rule above. End screens and cards are added in Studio (no API).
- **Instagram Reels**: caption up to 2 200 characters, the first 125 visible; up to 30 hashtags but 3 to 8 specific ones perform as well; `share_to_feed` on; 9:16, 3 s to 15 min; MP4 H.264 AAC, under 1 GB for the API.
- **Facebook Reels**: 9:16, 3 s to 90 s (longer becomes a video); title 255 characters; description first sentence is the ranking text. Feed video (16:9 or 4:5) goes through `/videos`.
- **Captions files**: YouTube accepts an SRT via `captions.insert`; put one at `public/captions/<id>.srt` (see `references/captions.md`, SRT export) and `publish.mjs` uploads it with the video.

## 7. Results log

Every publish appends to `out/<id>/publish/log.json` (platform, file, scheduled time, returned id and URL, or the error). The dashboard's Autopilot panel shows per-platform status; `npm run autopilot -- status` prints the queue.
