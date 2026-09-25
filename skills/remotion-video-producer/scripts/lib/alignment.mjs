/**
 * Converters that produce Remotion `Caption[]`:
 *   { text, startMs, endMs, timestampMs, confidence }
 * `text` carries a leading space for every word after the first, as @remotion/captions expects.
 */

const isSpace = (ch) => /\s/.test(ch);
const isPunctuation = (ch) => /^[\p{P}\p{S}]$/u.test(ch);

/**
 * ElevenLabs `/text-to-speech/{voice}/with-timestamps` alignment (character level) -> word captions.
 * @param alignment {characters: string[], character_start_times_seconds: number[], character_end_times_seconds: number[]}
 */
export const elevenLabsAlignmentToCaptions = (alignment, {offsetMs = 0} = {}) => {
  const chars = alignment.characters || [];
  const starts = alignment.character_start_times_seconds || [];
  const ends = alignment.character_end_times_seconds || [];
  const captions = [];
  let word = '';
  let wordStart = null;
  let wordEnd = null;

  const flush = () => {
    if (!word) return;
    captions.push({
      text: (captions.length === 0 ? '' : ' ') + word,
      startMs: Math.round(wordStart * 1000 + offsetMs),
      endMs: Math.round(wordEnd * 1000 + offsetMs),
      timestampMs: Math.round(wordStart * 1000 + offsetMs),
      confidence: null,
    });
    word = '';
    wordStart = null;
    wordEnd = null;
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (isSpace(ch)) {
      flush();
      continue;
    }
    if (isPunctuation(ch) && word === '' && captions.length > 0) {
      // Attach leading punctuation (rare) to the previous word.
      captions[captions.length - 1].text += ch;
      captions[captions.length - 1].endMs = Math.round(ends[i] * 1000 + offsetMs);
      continue;
    }
    if (wordStart === null) wordStart = starts[i];
    wordEnd = ends[i];
    word += ch;
  }
  flush();
  return captions;
};

/** OpenAI Whisper `verbose_json` with `timestamp_granularities: ['word']` -> captions (fallback when @remotion/openai-whisper is absent). */
export const openAiWordsToCaptions = (transcription, {offsetMs = 0} = {}) => {
  const words = transcription.words || [];
  return words.map((w, i) => ({
    text: (i === 0 ? '' : ' ') + String(w.word).trim(),
    startMs: Math.round(w.start * 1000 + offsetMs),
    endMs: Math.round(w.end * 1000 + offsetMs),
    timestampMs: Math.round(w.start * 1000 + offsetMs),
    confidence: null,
  }));
};

/** ElevenLabs Scribe speech-to-text with `timestamps_granularity=word` -> captions (fallback when @remotion/elevenlabs is absent). */
export const elevenLabsTranscriptToCaptionsFallback = (transcript, {offsetMs = 0} = {}) => {
  const words = (transcript.words || []).filter((w) => w.type === 'word');
  return words.map((w, i) => ({
    text: (i === 0 ? '' : ' ') + String(w.text).trim(),
    startMs: Math.round(w.start * 1000 + offsetMs),
    endMs: Math.round(w.end * 1000 + offsetMs),
    timestampMs: Math.round(w.start * 1000 + offsetMs),
    confidence: typeof w.logprob === 'number' ? Math.exp(w.logprob) : null,
  }));
};

/** Shift all timestamps by `offsetMs` (positive = later). */
export const shiftCaptions = (captions, offsetMs) =>
  captions.map((c) => ({
    ...c,
    startMs: Math.max(0, c.startMs + offsetMs),
    endMs: Math.max(0, c.endMs + offsetMs),
    timestampMs: c.timestampMs === null ? null : Math.max(0, c.timestampMs + offsetMs),
  }));

/** Apply a `{from: to}` replacement map to caption text (case-insensitive whole words). */
export const applyReplacements = (captions, replacements) => {
  const entries = Object.keys(replacements || {});
  if (entries.length === 0) return captions;
  return captions.map((c) => {
    let text = c.text;
    for (const from of entries) {
      text = text.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), replacements[from]);
    }
    return {...c, text};
  });
};

/** Ensure every caption after the first starts with one space, and the first has none. */
export const normalizeSpacing = (captions) =>
  captions.map((c, i) => ({...c, text: (i === 0 ? '' : ' ') + c.text.trim()}));

/**
 * Find where each scene's text begins inside a continuous transcript.
 * Returns start times in ms per scene (null when not found). Matches on the first 3 words.
 */
export const findSceneStarts = (captions, scenes) => {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  const words = captions.map((c) => norm(c.text));
  let cursor = 0;
  return scenes.map((scene) => {
    const target = norm(scene.voiceover).split(/\s+/).slice(0, 3);
    for (let i = cursor; i <= words.length - target.length; i++) {
      let match = true;
      for (let j = 0; j < target.length; j++) {
        if (words[i + j] !== target[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        cursor = i + 1;
        return captions[i].startMs;
      }
    }
    return null;
  });
};
