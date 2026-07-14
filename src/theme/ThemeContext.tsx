import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { darkPalette, lightPalette, type Palette } from './palettes';

export type ThemeMode = 'light' | 'dark' | 'auto';

type ThemeContextValue = { colors: Palette; resolvedMode: 'light' | 'dark' };

const ThemeContext = createContext<ThemeContextValue>({ colors: darkPalette, resolvedMode: 'dark' });

export function ThemeProvider({ mode, children }: PropsWithChildren<{ mode: ThemeMode }>) {
  const system = useColorScheme();
  const resolvedMode: 'light' | 'dark' = mode === 'auto' ? (system === 'light' ? 'light' : 'dark') : mode;
  const value = useMemo<ThemeContextValue>(() => ({ colors: resolvedMode === 'light' ? lightPalette : darkPalette, resolvedMode }), [resolvedMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
