// جسم عام لتبويبات كارت الخريطة البسيطة (الأجهزة / المناطق / التنبيهات):
// لستة صفوف (أيقونة + عنوان + وصف + قيمة على الجنب) والضغط يركّز على الخريطة.
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { PressableScale } from '../../components/PressableScale';

export type SimpleItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  icon: string;
  tint?: string;
};

type Props = {
  items: SimpleItem[];
  emptyText: string;
  selectedId?: string;
  onPick: (id: string) => void;
  onScroll?: (y: number) => void;
};

export function SimpleList({ items, emptyText, selectedId, onPick, onScroll }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.listContent} scrollEventThrottle={16} onScroll={e => onScroll?.(e.nativeEvent.contentOffset.y)}>
      {items.length === 0 ? <Text style={s.empty}>{emptyText}</Text> : null}
      {items.map(it => {
        const tint = it.tint ?? colors.primary;
        return (
          <PressableScale key={it.id} style={[s.row, selectedId === it.id && s.rowSelected]} onPress={() => onPick(it.id)}>
            <View style={[s.iconWrap, { backgroundColor: tint + '22', borderColor: tint }]}>
              <Ionicons name={it.icon} size={19} color={tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>
                {it.title}
              </Text>
              {it.subtitle ? (
                <Text style={s.subtitle} numberOfLines={1}>
                  {it.subtitle}
                </Text>
              ) : null}
            </View>
            {it.meta ? <Text style={s.meta}>{it.meta}</Text> : null}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    listContent: { paddingHorizontal: 10, paddingBottom: 18 },
    empty: { color: c.muted, textAlign: 'center', paddingVertical: 24 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 16, marginTop: 6 },
    rowSelected: { backgroundColor: c.surfaceElevated },
    iconWrap: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    title: { color: c.text, fontWeight: '700', fontSize: 15 },
    subtitle: { color: c.muted, fontSize: 12.5, marginTop: 2 },
    meta: { color: c.muted, fontSize: 12, fontWeight: '600', minWidth: 34, textAlign: 'right' },
  });
