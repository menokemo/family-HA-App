import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';

export function Card({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  return <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 }}>{children}</View>;
}
