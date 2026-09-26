# Captions and subtitles

Table of contents
1. The Caption format
2. Getting captions: four sources
3. Pages and word highlighting
4. Styling by platform and genre
5. Sync and cleanup
6. Exporting SRT for platforms

## 1. The Caption format

Everything flows through `Caption[]` from `@remotion/captions`:

```ts
type Caption = { text: string; startMs: number; endMs: number; timestampMs: number | null; confidence: number | null; pageBreakAfter?: boolean };
```

`text` includes the leading space of each word (`" Remotion"`), because pages join tokens by concatenation. Render with `whiteSpace: 'pre'`. Store captions in `public/captions/<video-id>.json` (or the voiceover folder) and fetch them with `useDelayRender`.

## 2. Getting captions

| Source | Command | When |
|---|---|---|
| ElevenLabs TTS alignment | produced by `generate-voiceover.mjs` | Voice was generated with ElevenLabs. Exact timing, no ASR errors. |
| Local Whisper.cpp | `node scripts/transcribe-whisper.mjs public/voiceover/<id> --model medium.en` | Any audio, free, offline. First run downloads Whisper.cpp and the model into the shared `~/.cache/remotion-whisper` (about 1.6 GB, once for all projects). On Apple Silicon it runs on Metal, faster than real time. Audio is converted to 16 kHz WAV automatically. |
| OpenAI Whisper API | `node scripts/transcribe-cloud.mjs --provider openai <audio or folder>` | Fast, punctuation kept by `openAiWhisperApiToCaptions`. |
| ElevenLabs Scribe | `node scripts/transcribe-cloud.mjs --provider elevenlabs <audio or folder>` | Multilingual, speaker labels; uses `elevenLabsTranscriptToCaptions`. |
| Existing SRT | `parseSrt({input})` in the component | Client-supplied subtitles. |

All scripts write one `captions.json` per folder with timestamps offset to the composition timeline when a `manifest.json` is present (each scene's captions shifted by the sum of previous scene durations plus gaps). Pass `--gap 0.6` to match the value used in `calculateMetadata`.

Model choice for Whisper.cpp: `medium.en` for English (default, works with whisper.cpp 1.5.5 and plain `make`); `large-v3-turbo` for the best accuracy or accents (needs whisper.cpp 1.7.x, which the script selects automatically, plus `cmake` from Homebrew); `medium` or `large-v3` for other languages; `small.en` when drafting on battery. Always `tokenLevelTimestamps: true`.

## 3. Pages and word highlighting

```ts
const {pages} = createTikTokStyleCaptions({captions, combineTokensWithinMilliseconds: 900, breakOnSilenceAfterMilliseconds: 400});
```
- `combineTokensWithinMilliseconds`: 600 to 900 for punchy word groups (Shorts), 1200 to 1600 for calmer long-form.
- `breakOnSilenceAfterMilliseconds` (4.0.514+) forces a page break on pauses so a new sentence starts a new page.
- Each page: `{text, startMs, durationMs, tokens: [{text, fromMs, toMs}]}`. Render one `<Sequence from={startMs / 1000 * fps} durationInFrames={...}>` per page; inside, compare `page.startMs + frame / fps * 1000` with each token's `fromMs/toMs` to find the active word.
- Trim caption text with `pageBreakAfter: true` on a caption to force a break (useful after headlines).

The `CaptionLayer` template implements this with three looks and a `platform` prop that places the block inside the safe zone.

## 4. Styling by platform and genre

| Look | Description | Use |
|---|---|---|
| `karaoke` | All words visible in white, active word in accent color, slight scale 1.08 pop | Educational, talking head |
| `pop` | Only the current page, each word pops in with a spring, active word larger with glow | Shorts hooks, hype, UGC |
| `boxed` | Words in a rounded solid box (accent) that follows the active word, white text | Brand/ad content, high legibility over footage |

Typography: 900 weight, uppercase optional, 56 to 72 px on 1080x1920, 40 to 48 px on 1920x1080, `letterSpacing: -0.01em`, stroke via `WebkitTextStroke: '2px rgba(0,0,0,0.6)'` or a shadow stack for legibility over footage. Two lines maximum, 3 to 5 words per page vertical. Position: lower part of the safe box (y 1250 to 1480 at 1080x1920) and never overlapping the headline; when a headline occupies that region, move captions to the upper middle for that scene.

Do not caption the music or SFX. Keep punctuation minimal (drop trailing periods, keep question marks). Numbers as digits.

## 5. Sync and cleanup

- If words feel late, subtract 40 to 80 ms globally (`--offset -60` on the transcribe scripts or shift in the component).
- Merge ASR fragments ("Re", "motion") by post-processing: the scripts run `toCaptions()` postprocessing for Whisper and a light merge for cloud providers. Fix proper nouns with a replacement map (`--replace "remotion=Remotion"`).
- ElevenLabs alignment includes punctuation characters; the converter attaches punctuation to the preceding word and drops standalone spaces.
- Captions must stay within their scene when scenes are separate compositions: build the page list per scene by filtering `captions` to `[sceneStartMs, sceneEndMs)` and subtracting `sceneStartMs`.

## 6. Exporting SRT for platforms

`serializeSrt({lines})` from `@remotion/captions` turns caption groups into SRT for YouTube's caption upload (better SEO than burned-in only). Group by page: `lines = pages.map((p) => [{text: p.text.trim(), startMs: p.startMs, endMs: p.startMs + p.durationMs}])`. Write to `out/<video-id>.srt`.
