import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { PressableScale } from '../../components/PressableScale';
import { addDays, dayKey, endOfMonth, locale, startOfDay, startOfMonth } from './dates';

// منتقي تاريخ شهري بـ JS صافي (من غير مكتبة أصلية) — نتيجة شهر بأسهم، تختار أي يوم.
export function MonthPicker({ selected, onPick }: { selected: Date; onPick: (d: Date) => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [month, setMonth] = useState<Date>(startOfMonth(selected));
  const daysInMonth = endOfMonth(month).getDate();
  const firstDow = (startOfMonth(month).getDay() + 6) % 7; // الإثنين = 0
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays(new Date(2024, 0, 1), i).toLocaleDateString(locale(), { weekday: 'narrow' })); // 2024-01-01 = إثنين
  const todayKey = dayKey(startOfDay(new Date()));

  return (
    <View style={s.mp}>
      <View style={s.mpHead}>
        <PressableScale style={s.mpNav} onPress={() => setMonth(startOfMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)))}><Ionicons name="chevron-back" size={18} color={colors.text} /></PressableScale>
        <Text style={s.mpTitle}>{month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</Text>
        <PressableScale style={s.mpNav} onPress={() => setMonth(startOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)))}><Ionicons name="chevron-forward" size={18} color={colors.text} /></PressableScale>
      </View>
      <View style={s.mpGrid}>
        {weekdays.map((w, i) => <View key={'w' + i} style={s.mpCell}><Text style={s.mpDow}>{w}</Text></View>)}
        {cells.map((d, i) => {
          if (!d) return <View key={'e' + i} style={s.mpCell} />;
          const k = dayKey(d);
          const sel = k === dayKey(selected);
          const isToday = k === todayKey;
          return (
            <PressableScale key={k} style={s.mpCell} onPress={() => onPick(d)}>
              <View style={[s.mpDay, sel && { backgroundColor: colors.primary }, !sel && isToday && { borderColor: colors.primary, borderWidth: 1 }]}>
                <Text style={[s.mpDayText, sel && { color: colors.black, fontWeight: '800' }]}>{d.getDate()}</Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    mp: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 8 },
    mpHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 },
    mpNav: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
    mpTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800', textTransform: 'capitalize' },
    mpGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    mpCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    mpDow: { color: colors.muted, fontSize: 11, fontWeight: '700' },
    mpDay: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    mpDayText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  });
}
