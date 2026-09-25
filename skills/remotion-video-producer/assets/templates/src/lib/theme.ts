import {loadFont as loadInter} from '@remotion/google-fonts/Inter';

/**
 * Design tokens for the project. Change these first when a brand arrives; every
 * component reads from here so the cut stays coherent.
 */
const inter = loadInter('normal', {weights: ['400', '500', '700', '900'], subsets: ['latin']});

export const theme = {
  colors: {
    bg: '#0B0B0F',
    surface: '#15151C',
    text: '#F5F5F7',
    muted: 'rgba(245,245,247,0.64)',
    accent: '#7C5CFF',
    accent2: '#22D3EE',
    scrim: 'rgba(0,0,0,0.55)',
  },
  fonts: {
    display: inter.fontFamily,
    body: inter.fontFamily,
    /** Resolves when fonts are ready; await before measuring text. */
    ready: inter.waitUntilDone,
  },
  radius: {sm: 12, md: 24, lg: 40},
  shadow: {
    card: '0 30px 80px rgba(0,0,0,0.45)',
    text: '0 2px 12px rgba(0,0,0,0.5)',
  },
  /** CSS filter applied to all external footage and photos so mixed sources look like one shoot. */
  grade: 'contrast(1.05) saturate(0.92)',
} as const;

export type Theme = typeof theme;
