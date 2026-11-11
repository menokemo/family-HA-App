import { useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { i18n } from '../i18n';
import { acceptTerms, getAcceptedTermsVersion, TERMS_VERSION } from '../storage/terms';
import { useTheme } from '../theme/ThemeContext';
import type { Palette } from '../theme/palettes';

type Status = 'loading' | 'needed' | 'accepted';

/**
 * بوابة الشروط وإخلاء المسؤولية. لازم المستخدم يوافق قبل ما يستخدم التطبيق.
 * الموافقة بتتخزّن محليًا (نسخة الشروط)، فمتظهرش تاني إلا لو النص اتغيّر
 * (TERMS_VERSION اتزوّد).
 */
export function TermsGate({ children }: PropsWithChildren) {
  const { colors, resolvedMode } = useTheme();
  const styles = makeStyles(colors);
  const [status, setStatus] = useState<Status>('loading');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let active = true;
    void getAcceptedTermsVersion().then(v => {
      if (active) setStatus(v >= TERMS_VERSION ? 'accepted' : 'needed');
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === 'accepted') return <>{children}</>;

  if (status === 'loading') {
    return <View style={styles.loading} />;
  }

  const onAccept = () => {
    if (!agreed) return;
    void acceptTerms().then(() => setStatus('accepted'));
  };

  const points = [
    i18n.t('termsNotCertified'),
    i18n.t('termsReliability'),
    i18n.t('termsData'),
    i18n.t('termsLiability'),
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle={resolvedMode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.brand}>Secure Family</Text>
        <Text style={styles.title}>{i18n.t('termsTitle')}</Text>
        <Text style={styles.intro}>{i18n.t('termsIntro')}</Text>
        <View style={styles.card}>
          {points.map((p, i) => (
            <View key={i} style={[styles.pointRow, i === points.length - 1 && styles.pointRowLast]}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.pointText}>{p}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.agreeRow} onPress={() => setAgreed(a => !a)} hitSlop={8}>
          <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.agreeText}>{i18n.t('termsAgree')}</Text>
        </Pressable>
        <Pressable
          style={[styles.acceptBtn, !agreed && styles.acceptBtnDisabled]}
          onPress={onAccept}
          disabled={!agreed}>
          <Text style={styles.acceptText}>{i18n.t('termsAccept')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    loading: { flex: 1, backgroundColor: colors.background },
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 24, paddingBottom: 12 },
    brand: { color: colors.primary, fontSize: 16, fontWeight: '800', letterSpacing: 0.5, marginBottom: 18 },
    title: { color: colors.text, fontSize: 26, fontWeight: '800', marginBottom: 12 },
    intro: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 20 },
    card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
    pointRow: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    pointRowLast: { borderBottomWidth: 0 },
    bullet: { color: colors.primary, fontSize: 15, lineHeight: 22, marginRight: 10, fontWeight: '800' },
    pointText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 22 },
    footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
    agreeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkmark: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
    agreeText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
    acceptBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    acceptBtnDisabled: { opacity: 0.4 },
    acceptText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  });
