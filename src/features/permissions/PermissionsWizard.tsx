import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { PressableScale } from '../../components/PressableScale';
import { i18n } from '../../i18n';
import { colors } from '../../theme';
import { PERMISSION_KEYS, checkPermission, requestPermission, type PermKey } from '../../native/permissions';

const ICONS: Record<PermKey, { icon: string; color: string }> = {
  notifications: { icon: 'notifications-outline', color: colors.primary },
  location: { icon: 'location-outline', color: colors.warning },
  backgroundLocation: { icon: 'navigate-outline', color: colors.safe },
  battery: { icon: 'battery-charging-outline', color: '#17A2B8' },
  overlay: { icon: 'layers-outline', color: '#8E5FE8' },
  fullScreen: { icon: 'phone-portrait-outline', color: colors.danger },
};

export function PermissionsWizard({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [status, setStatus] = useState<Partial<Record<PermKey, boolean>>>({});

  const refresh = useCallback(async () => {
    const next: Partial<Record<PermKey, boolean>> = {};
    for (const key of PERMISSION_KEYS) next[key] = await checkPermission(key);
    setStatus(next);
  }, []);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  // الأذونات اللي بتتمنح من شاشة إعدادات النظام بترجع بعد ما المستخدم
  // يرجع للتطبيق - فبنعيد الفحص كل ما التطبيق يبقى نشط قدّام.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const grant = async (key: PermKey) => {
    await requestPermission(key);
    setTimeout(() => void refresh(), 600);
  };

  const allGranted = PERMISSION_KEYS.every(k => status[k]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDone} statusBarTranslucent>
      <View style={s.screen}>
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Ionicons name="shield-checkmark" size={40} color="#fff" />
          </View>
          <Text style={s.title}>{i18n.t('permTitle')}</Text>
          <Text style={s.subtitle}>{i18n.t('permSubtitle')}</Text>
        </View>
        <ScrollView contentContainerStyle={s.list}>
          {PERMISSION_KEYS.map(key => {
            const ok = status[key];
            const { icon, color } = ICONS[key];
            return (
              <View key={key} style={s.row}>
                <View style={[s.iconWrap, { backgroundColor: color + '22' }]}>
                  <Ionicons name={icon} size={22} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{i18n.t('perm_' + key)}</Text>
                  <Text style={s.rowDesc}>{i18n.t('perm_' + key + '_desc')}</Text>
                </View>
                {ok ? (
                  <Ionicons name="checkmark-circle" size={30} color={colors.safe} />
                ) : (
                  <PressableScale onPress={() => void grant(key)} style={[s.grantBtn, { backgroundColor: color }]}>
                    <Text style={s.grantText}>{i18n.t('permGrant')}</Text>
                  </PressableScale>
                )}
              </View>
            );
          })}
        </ScrollView>
        <PressableScale onPress={onDone} style={[s.doneBtn, !allGranted && { backgroundColor: colors.muted }]}>
          <Text style={s.doneText}>{allGranted ? i18n.t('permDone') : i18n.t('permSkip')}</Text>
        </PressableScale>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingBottom: 20 },
  hero: {
    paddingTop: 54,
    paddingBottom: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    backgroundColor: colors.primary,
    experimental_backgroundImage: `linear-gradient(160deg, ${colors.primary}, ${colors.safe})`,
    marginBottom: 18,
  },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 10,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  list: { gap: 12, paddingBottom: 20, paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowDesc: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  grantBtn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  grantText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  doneBtn: { backgroundColor: colors.primary, borderRadius: 14, padding: 15, alignItems: 'center', marginHorizontal: 20 },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
