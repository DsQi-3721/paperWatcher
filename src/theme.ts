// Palette and type: warm paper, warm-black ink, clean flat colour in a few saturated hues, and solid cobalt
// shadows that all fall the same way (one light, upper left), as in a cel-shaded render.
export const C = {
  paper: '#f2efe7',
  ink: '#231e16',
  muted: '#857d6e',
  rule: '#ddd6c8',
  shadow: '#41538f',
  page: '#fcfbf6',
  wood: { l: '#e8b878', m: '#d9a66a', d: '#9a5d2a' },
  mustard: { l: '#ffd96a', m: '#f4b829', d: '#c98a1c' },
  tomato: { l: '#ff8f6e', m: '#ea6342', d: '#ac3a2c' },
  mint: { l: '#c6eed6', m: '#82c9a4', d: '#3d8c70' },
  cobalt: { l: '#adc6f3', m: '#709ae0', d: '#4065b8' },
  blush: { l: '#ffd3dc', m: '#f4a5ba', d: '#cb7291' },
  // the two hands on the scratch paper
  userInk: '#2a4a9e',
  aiInk: '#38352f',
  accent: '#cf5038',
};

export const HIGHLIGHTS = {
  yellow: 'rgba(244,184,41,0.42)',
  pink: 'rgba(243,150,177,0.40)',
  green: 'rgba(120,200,155,0.40)',
  blue: 'rgba(118,160,226,0.36)',
} as const;
export type HighlightColor = keyof typeof HIGHLIGHTS;

// Font stacks. Every family is named explicitly so canvas measurement (pretext) and CSS paint agree.
export const F = {
  user: '"Caveat", "Long Cang", "LXGW WenKai", cursive',
  ai: '"Kalam", "LXGW WenKai", cursive',
  ui: '"Architects Daughter", "LXGW WenKai", sans-serif',
  title: '"Cormorant Garamond", "LXGW WenKai", serif',
  type: '"Architects Daughter", "LXGW WenKai", sans-serif',
  mono: '"Courier Prime", "LXGW WenKai", monospace',
};

/** Canvas/pretext font shorthand. */
export const font = (family: keyof typeof F, size: number, weight = 400) => `${weight} ${size}px ${F[family]}`;
