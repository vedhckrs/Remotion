import {requireEnv} from './env.mjs';

/**
 * Voice presets: label filters applied to the account's voice list, plus a premade fallback id.
 * Premade ids are ElevenLabs' public defaults (verify with --list-voices; they can change).
 */
export const VOICE_PRESETS = {
  'young-male-pro': {fallback: 'TX3LPaxmHKxFdv7VOQHJ', fallbackName: 'Liam', match: (v) => v.gender === 'male' && /young|middle/.test(v.age) && /(narrat|social|conversational|informative|professional|energetic|confident)/.test(v.text), settings: {stability: 0.42, similarity_boost: 0.78, style: 0.35, use_speaker_boost: true, speed: 1.08}},
  'young-male-hype': {fallback: 'bIHbv24MWmeRgasZH58o', fallbackName: 'Will', match: (v) => v.gender === 'male' && /young/.test(v.age) && /(energetic|excited|hype|upbeat|friendly|social)/.test(v.text), settings: {stability: 0.35, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true, speed: 1.12}},
  'male-deep-narrator': {fallback: 'nPczCjzI2devNBz1zQrb', fallbackName: 'Brian', match: (v) => v.gender === 'male' && /(deep|narrat|documentary|calm|authoritative)/.test(v.text), settings: {stability: 0.55, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true, speed: 0.98}},
  'female-warm': {fallback: 'EXAVITQu4vr4xnSDxMaL', fallbackName: 'Sarah', match: (v) => v.gender === 'female' && /(warm|soft|narrat|calm|friendly)/.test(v.text), settings: {stability: 0.5, similarity_boost: 0.75, style: 0.25, use_speaker_boost: true, speed: 1.0}},
  'female-energetic': {fallback: 'cgSgspJ2msm6clMCkdW9', fallbackName: 'Jessica', match: (v) => v.gender === 'female' && /(energetic|upbeat|social|expressive|young)/.test(v.text), settings: {stability: 0.4, similarity_boost: 0.78, style: 0.4, use_speaker_boost: true, speed: 1.08}},
};

export const fetchVoices = async () => {
  const apiKey = requireEnv('ELEVENLABS_API_KEY');
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {headers: {'xi-api-key': apiKey}});
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return (json.voices || []).map((v) => {
    const labels = v.labels || {};
    return {
      id: v.voice_id,
      name: v.name,
      category: v.category,
      gender: String(labels.gender || '').toLowerCase(),
      age: String(labels.age || '').toLowerCase(),
      accent: String(labels.accent || '').toLowerCase(),
      useCase: String(labels.use_case || labels['use case'] || '').toLowerCase(),
      text: `${labels.description || ''} ${labels.use_case || ''} ${labels.descriptive || ''} ${v.description || ''} ${v.name}`.toLowerCase(),
    };
  });
};

