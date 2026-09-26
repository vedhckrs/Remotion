# Audio: voiceover, music, SFX, visualization

Table of contents
1. Script -> voiceover workflow
2. Provider guide (ElevenLabs, OpenAI, others)
3. Voice direction
4. Syncing scenes to voice
5. Music and ducking
6. Sound effects
7. Audio visualization
8. Loudness and delivery
9. Silence detection and cleanup

## 1. Script -> voiceover workflow

0. On a laptop with no keys handy, draft first: `--provider macos` produces a full timed voiceover in seconds so layout and pacing can be built; the final ElevenLabs pass swaps the audio and adds word alignment without touching the scenes.
1. Write `public/script/<video-id>.json` (schema in `scripts/lib/script-schema.mjs`, example in `assets/templates/public/script/example.json`): `{ videoId, voice: {provider, voiceId, model, settings}, scenes: [{id, headline, voiceover, visual, minSeconds}] }`.
2. `node scripts/generate-voiceover.mjs --script public/script/<video-id>.json` (defaults to ElevenLabs). Output in `public/voiceover/<video-id>/`:
   - `scene-01.mp3`, `scene-02.mp3`, ...
   - `manifest.json` `{ videoId, fps: null, scenes: [{id, file, durationSeconds, text}] }`
   - `captions.json` (`Caption[]` for the whole video, timestamps already offset by scene start, including the air gap you pass with `--gap 0.6`) when the provider returns word timing.
3. Re-run with `--only scene-03` after a script tweak; the manifest updates in place.
4. `calculateMetadata` reads the manifest and sizes the composition; scenes receive their frame counts as props.

If voiceover was recorded by a human: drop the files in `public/voiceover/<video-id>/` named after the scene ids and run `node scripts/audio-durations.mjs public/voiceover/<video-id>` to build the manifest, then transcribe for captions (`captions.md`).

## 2. Provider guide

| Provider | Best for | Model ids | Word timing | Notes |
|---|---|---|---|---|
| ElevenLabs | Premium narration, multilingual, emotional range | `eleven_v3` (most expressive, supports audio tags like `[whispers]`), `eleven_multilingual_v2` (stable default), `eleven_flash_v2_5` / `eleven_turbo_v2_5` (fast, cheap) | Yes: `/with-timestamps` endpoint returns character alignment which the script converts to words | `ELEVENLABS_API_KEY`; `output_format=mp3_44100_128` or `mp3_44100_192` |
| OpenAI | Fast, cheap, good "instructable" delivery | `gpt-4o-mini-tts` (accepts `instructions` for tone, accent, pace), `tts-1-hd` | No (transcribe afterwards with Whisper) | `OPENAI_API_KEY`; voices `alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse, marin, cedar` |
| Google Cloud TTS / Gemini TTS | Many languages, SSML control | `gemini-2.5-pro-tts`, Neural2, Journey | SSML marks only | Add a provider in `generate-voiceover.mjs` following the OpenAI branch |
| Azure Neural | Enterprise, SSML, many Indian languages | `en-IN-*`, `hi-IN-*` Neural voices | Word boundary events via SDK | Same |
| macOS `say` (built in) | Free, instant timing drafts on a Mac | any installed system voice (`say -v '?'`); Enhanced/Premium voices downloadable in System Settings | No (transcribe or regenerate with ElevenLabs) | `--provider macos`; lock pacing and scene lengths before spending credits |
| Local neural (Kokoro via mlx-audio, Piper, XTTS) | Offline, free, runs well on Apple Silicon | varies | No | Output WAV named by scene id, then `audio-durations.mjs` |

Any provider works as long as it produces one audio file per scene.

## 2b. Voice presets and picking the voice

`generate-voiceover.mjs --voice-preset <name>` resolves a voice from your ElevenLabs library by labels, falling back to a premade id (verify with `--list-voices`):

| Preset | Character | Fallback | Settings |
|---|---|---|---|
| `young-male-pro` (default) | male, young or middle-aged, narration / social / confident | Liam | stability 0.42, similarity 0.78, style 0.35, speed 1.08 |
| `young-male-hype` | male, young, energetic / upbeat | Will | stability 0.35, style 0.5, speed 1.12 |
| `male-deep-narrator` | deep, documentary, calm | Brian | stability 0.55, style 0.2, speed 0.98 |
| `female-warm` | warm, soft narration | Sarah | stability 0.5, style 0.25, speed 1.0 |
| `female-energetic` | upbeat, expressive | Jessica | stability 0.4, style 0.4, speed 1.08 |

Audition the hook line with two or three presets, then pin the chosen `voiceId` in the script so every regeneration matches. `eleven_v3` with `--tags` prefixes each line with a delivery tag (`[excited]`, `[calm]`, or the scene's `delivery` field).

## 3. Voice direction

- Choose the voice by genre: warm mid-register for explainers, brighter and faster for Shorts hooks, deep and slow for luxury, conversational for UGC-style ads. Audition three voices on the hook line before committing.
- ElevenLabs settings for narration: `stability` 0.4 to 0.55 (lower = more expressive), `similarity_boost` 0.75, `style` 0.2 to 0.4, `use_speaker_boost` true, `speed` 1.0 to 1.08 for Shorts. For `eleven_v3` use audio tags in the text (`[excited]`, `[pause]`, `[whispers]`) instead of settings.
- OpenAI `instructions` example: "Energetic creator voice, upbeat, slightly faster than conversational, crisp consonants, smile in the voice, no vocal fry."
- Write for the ear: short sentences, contractions, numbers spelled the way they should be read ("twenty twenty-six"), commas for breaths, an ellipsis for a beat. Put the hook in the first 8 words.
- Pronunciation: spell brand names phonetically in the `voiceover` field while keeping the correct spelling in `headline`. Both are stored, so captions can use the display text if you pass `--captions-from headline` (otherwise captions come from the spoken text).
- Keep each scene's line under 25 words for Shorts; long-form scenes can run 60 to 90 words.

## 4. Syncing scenes to voice

Scene frames = `Math.ceil((durationSeconds + gap) * fps)`, gap 0.4 to 0.8 s. The `<Audio>` for the scene starts at the scene's frame 0 (sequence-local) with `premountFor` so the first syllable is never clipped. Voice must never be trimmed by a transition: transitions overlap the *tail* of a scene, so either add the transition length to the gap or place the voice `from={0}` and give the scene `gap + transitionFrames / fps`.

For long-form with a single continuous voice track instead of per-scene files: place one `<Audio>` at the composition root, and derive scene boundaries from the transcript (`captions.json`) by finding the timestamp of the first word of each scene's text; the `scripts/lib/alignment.mjs` helper `findSceneStarts()` does this.

## 5. Music and ducking

- Source: `scripts/generate-music.mjs --id <videoId> --mood energetic-tech|hype|corporate|cinematic|lofi|ambient|luxury` composes an instrumental of the exact video length with the ElevenLabs Music API (`POST /v1/music`, `force_instrumental`, prompts tuned to leave the vocal range clear), or use a free library track: Pixabay Music and Mixkit (no attribution), Free Music Archive and Chosic (filter CC0 / CC BY), YouTube Audio Library (YouTube uploads). Licensed subscriptions (Artlist, Epidemic, Uppbeat) also work. Keep BPM in mind: 90 to 110 for explainers, 120 to 140 for hype Shorts. Put the file in `public/music/` and note its license in `public/music/LICENSES.md`.
- The `MusicBed` template takes the voiceover manifest and computes a volume curve: base level `musicLevel` (0.16 to 0.22, about -14 to -16 dB), ducked to `duckedLevel` (0.06 to 0.09) from 0.3 s before each voice segment to 0.4 s after, with 8-frame ramps. Ending fade over the last 45 to 60 frames.
- Align a visual beat to the music: find the first downbeat (listen, or `npx remotion ffmpeg -i music.mp3 -af "silencedetect" -f null -`) and start the hook animation on it with `from`.
- Loop shorter tracks with `loop` and `loopVolumeCurveBehavior="extend"` so the fade curve spans loops.
- When the client will add trending audio in-app (Reels), deliver a second render with `music: false`.

## 6. Sound effects

`@remotion/sfx` exports URL constants (`whoosh`, `whip`, `switch`, `ding`, `mouseClick`, `shutterModern`, `pageTurn`, `recordScratch`, `dramaticBoomer`, `yippee`, ... normalized to -3 dBFS). Use them with `<Audio src={whoosh} from={cutFrame} volume={0.3} />`. More: https://github.com/kapishdima/soundcn/tree/main/assets. Rules: one SFX per transition, one per major text hit, none on captions, keep total SFX count under one per 1.5 s, and never louder than the voice.

## 7. Audio visualization

```tsx
import {useWindowedAudioData, visualizeAudio, visualizeAudioWaveform, createSmoothSvgPath} from '@remotion/media-utils';
const {audioData, dataOffsetInSeconds} = useWindowedAudioData({src, frame, fps, windowInSeconds: 30});
const bands = visualizeAudio({fps, frame, audioData, numberOfSamples: 64, optimizeFor: 'speed', dataOffsetInSeconds});
const bass = bands.slice(0, 8).reduce((a, b) => a + b, 0) / 8; // 0..1, drive scale or glow
```
- `numberOfSamples` is a power of 2; low indices are bass. Apply a log curve for balanced bars. Pass `frame` down to children instead of calling `useCurrentFrame()` in each (avoids discontinuities inside sequences).
- Waveform: `visualizeAudioWaveform` + `createSmoothSvgPath` for a podcast audiogram.

## 8. Loudness and delivery

Targets: dialogue-driven social video around -14 LUFS integrated, true peak -1 dBTP; YouTube normalizes to about -14 LUFS, so louder does not help. Measure the render: `npx remotion ffmpeg -i out/video.mp4 -af loudnorm=print_format=json -f null -`. If the mix is off, adjust the bus levels in the components rather than post-processing, so re-renders stay consistent. Export AAC 320 kbps 48 kHz (presets do this).

## 9. Silence detection and cleanup

Trim leading and trailing silence from recorded voice without re-encoding: measure with `loudnorm` to get `input_thresh`, then `silencedetect=noise=<thresh>dB:d=0.5`, and apply `trimBefore` / `trimAfter` on the `<Audio>`. For TTS output the script already trims edges when `--trim` is passed (uses FFmpeg `silenceremove`). Pitch or speed changes: `playbackRate` changes tempo and pitch; `toneFrequency` shifts pitch only during renders.
