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
  primary: '#5C8DFF',
  safe: '#2EE6A6',
  warning: '#FFB020',
  danger: '#FF4D6D',
  black: '#000000',
};

export const lightPalette: Palette = {
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceElevated: '#EDF2F8',
  border: '#DCE4ED',
  text: '#0E1620',
  muted: '#5E6D80',
  primary: '#3D5FEF',
  safe: '#0FAF7A',
  warning: '#D97F00',
  danger: '#E63958',
  black: '#000000',
};
