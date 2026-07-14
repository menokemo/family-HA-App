export type Palette = {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  safe: string;
  warning: string;
  danger: string;
  black: string;
};

export const darkPalette: Palette = {
  background: '#091018',
  surface: '#111B26',
  surfaceElevated: '#182535',
  border: '#26384B',
  text: '#F5F8FC',
  muted: '#9CB0C5',
  primary: '#47A7FF',
  safe: '#37C993',
  warning: '#F5B94C',
  danger: '#FF6174',
  black: '#000000',
};

export const lightPalette: Palette = {
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceElevated: '#EDF2F8',
  border: '#DCE4ED',
  text: '#0E1620',
  muted: '#5E6D80',
  primary: '#1E76D6',
  safe: '#1FA575',
  warning: '#C97F0B',
  danger: '#D8394E',
  black: '#000000',
};
