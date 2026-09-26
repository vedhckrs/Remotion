import type {GradeName} from './grades';
import type {Pacing} from './motion';
import {FONT_FAMILIES, theme, type Theme} from './theme';

/**
 * Style presets: one word in the script ("style": "midnight-neon") sets colors, fonts, caption
 * look, grade, background system and pacing bias for the whole video and its thumbnail, so a
 * channel's videos stay consistent while each concept still gets its own accent.
 *
 * Add a preset per channel or client; keep the shape identical so components never special-case.
 */
export const BACKGROUND_KINDS = ['gradient', 'mesh', 'grid', 'particles', 'aurora', 'rays', 'waves', 'dots', 'streaks', 'solid'] as const;
export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];

export type CaptionStyleName = 'hormozi' | 'pop' | 'boxed' | 'karaoke' | 'outline' | 'minimal';

export type StylePreset = {
  readonly id: string;
  readonly label: string;
  readonly concept: string;
  readonly theme: Theme;
  readonly captionStyle: CaptionStyleName;
  readonly grade: GradeName;
  readonly background: BackgroundKind;
  readonly pacing: Pacing;
  /** Second background for infographic scenes, so data reads cleanly. */
  readonly dataBackground: BackgroundKind;
  /** Thumbnail treatment. */
  readonly thumbnail: {readonly font: string; readonly textCase: 'upper' | 'none'; readonly accentBlock: boolean};
};

type ThemeOverrides = Omit<Partial<Theme>, 'colors' | 'fonts'> & {colors?: Partial<Theme['colors']>; fonts?: Partial<Theme['fonts']>};

const base = (overrides: ThemeOverrides): Theme => ({
  ...theme,
  ...overrides,
  colors: {...theme.colors, ...(overrides.colors ?? {})},
  fonts: {...theme.fonts, ...(overrides.fonts ?? {})},
});

export const STYLES: Record<string, StylePreset> = {
  'midnight-neon': {
    id: 'midnight-neon',
    label: 'Midnight Neon',
    concept: 'Dark stage, electric violet and magenta glow, condensed uppercase hits. Tech, gaming, bold opinions.',
    theme: base({colors: {bg: '#06050C', surface: '#120B2A', accent: '#8B5CF6', accent2: '#FF2BD6', highlight: '#F5D90A'}, fonts: {display: FONT_FAMILIES.montserrat, impact: FONT_FAMILIES.anton, caption: FONT_FAMILIES.montserrat}, uppercase: true}),
    captionStyle: 'hormozi',
    grade: 'neon-night',
    background: 'aurora',
    dataBackground: 'grid',
    pacing: 'fast',
    thumbnail: {font: FONT_FAMILIES.anton, textCase: 'upper', accentBlock: true},
  },
  'clean-corporate': {
    id: 'clean-corporate',
    label: 'Clean Corporate',
    concept: 'Deep navy, cyan accent, generous whitespace, Poppins. Explainers, SaaS, finance, B2B.',
    theme: base({colors: {bg: '#0A1628', surface: '#13223D', accent: '#22D3EE', accent2: '#60A5FA', highlight: '#FDE047', muted: 'rgba(226,232,240,0.7)'}, fonts: {display: FONT_FAMILIES.poppins, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.poppins, impact: FONT_FAMILIES.poppins}}),
    captionStyle: 'boxed',
    grade: 'none',
    background: 'mesh',
    dataBackground: 'dots',
    pacing: 'medium',
    thumbnail: {font: FONT_FAMILIES.poppins, textCase: 'none', accentBlock: true},
  },
  'hype-bold': {
    id: 'hype-bold',
    label: 'Hype Bold',
    concept: 'Black, hot orange and yellow, Anton slams, streak backgrounds. Sports, drops, challenges, motivation.',
    theme: base({colors: {bg: '#0B0A0A', surface: '#1B1512', accent: '#FF6B1A', accent2: '#FFD60A', highlight: '#FFD60A'}, fonts: {display: FONT_FAMILIES.anton, caption: FONT_FAMILIES.montserrat, impact: FONT_FAMILIES.anton}, uppercase: true}),
    captionStyle: 'outline',
    grade: 'vibrant-pop',
    background: 'streaks',
    dataBackground: 'rays',
    pacing: 'fast',
    thumbnail: {font: FONT_FAMILIES.anton, textCase: 'upper', accentBlock: true},
  },
  'luxury-noir': {
    id: 'luxury-noir',
    label: 'Luxury Noir',
    concept: 'Near-black, champagne gold, Playfair headlines, slow moves. Real estate, jewellery, premium brands.',
    theme: base({colors: {bg: '#0A0A0A', surface: '#161412', text: '#F3EEE6', accent: '#D4AF6A', accent2: '#8C6F3E', highlight: '#EBD9A8', muted: 'rgba(243,238,230,0.6)'}, fonts: {display: FONT_FAMILIES.playfair, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.inter, impact: FONT_FAMILIES.playfair}, grade: 'contrast(1.06) saturate(0.85)'}),
    captionStyle: 'minimal',
    grade: 'cool-noir',
    background: 'rays',
    dataBackground: 'solid',
    pacing: 'calm',
    thumbnail: {font: FONT_FAMILIES.playfair, textCase: 'none', accentBlock: false},
  },
  'warm-editorial': {
    id: 'warm-editorial',
    label: 'Warm Editorial',
    concept: 'Cream and terracotta on warm charcoal, serif headlines, paper feel. Storytelling, education, lifestyle.',
    theme: base({colors: {bg: '#1B1613', surface: '#2A211C', text: '#F7EFE4', accent: '#E07A3F', accent2: '#F2C14E', highlight: '#F2C14E', muted: 'rgba(247,239,228,0.65)'}, fonts: {display: FONT_FAMILIES.playfair, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.montserrat, impact: FONT_FAMILIES.montserrat}}),
    captionStyle: 'karaoke',
    grade: 'warm-film',
    background: 'waves',
    dataBackground: 'dots',
    pacing: 'medium',
    thumbnail: {font: FONT_FAMILIES.playfair, textCase: 'none', accentBlock: true},
  },
  'tech-grid': {
    id: 'tech-grid',
    label: 'Tech Grid',
    concept: 'Graphite with electric green, Space Grotesk, perspective grid and particles. AI, dev tools, product demos.',
    theme: base({colors: {bg: '#0B0F0E', surface: '#141A18', accent: '#22C55E', accent2: '#38BDF8', highlight: '#A3E635'}, fonts: {display: FONT_FAMILIES.spaceGrotesk, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.spaceGrotesk, impact: FONT_FAMILIES.spaceGrotesk}}),
    captionStyle: 'pop',
    grade: 'none',
    background: 'grid',
    dataBackground: 'particles',
    pacing: 'fast',
    thumbnail: {font: FONT_FAMILIES.spaceGrotesk, textCase: 'upper', accentBlock: true},
  },
};

export const STYLE_IDS = Object.keys(STYLES);
export const DEFAULT_STYLE = 'midnight-neon';

export const getStyle = (id?: string | null): StylePreset => STYLES[id ?? ''] ?? STYLES[DEFAULT_STYLE];

/** Apply per-video overrides (accent color from props, etc.) on top of a preset's theme. */
export const themeWith = (preset: StylePreset, overrides: {accent?: string | null}): Theme => {
  if (!overrides.accent) return preset.theme;
  return {...preset.theme, colors: {...preset.theme.colors, accent: overrides.accent}};
};
