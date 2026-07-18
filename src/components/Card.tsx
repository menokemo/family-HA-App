import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';

export function Card({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 16, gap: 12, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 6 }}>{children}</View>;
}
