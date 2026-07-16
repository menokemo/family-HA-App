import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { normalizeUrl } from '../../api/homeAssistant';
import { colors } from '../../theme';
import type { ConnectionSettings } from '../../types/homeAssistant';

type Props = { settings: ConnectionSettings; dashboardPath: string };

export function DashboardView({ settings, dashboardPath }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); }, [dashboardPath, settings.baseUrl]);
  const baseUrl = normalizeUrl(settings.baseUrl);
  // ?kiosk بيتطلب إضافة Kiosk Mode متثبتة في HA (المستخدم ثبّتها
  // بنفسه مرة واحدة) - بتخفي القائمة الجانبية وشريط العنوان بتاعت HA
  // نفسه، فيبقى المعروض هو محتوى الداشبورد بس.
  const url = `${baseUrl}/${dashboardPath.replace(/^\/+/, '')}?kiosk`;

  // بنحقن hassTokens جوه localStorage قبل ما أي كود بتاع صفحة HA
  // يشتغل، فواجهة HA بتتعامل مع الجلسة وكأن المستخدم مسجّل دخول
  // أصلًا من المتصفح - من غير ما نوريه شاشة تسجيل دخول تانية. HA
  // نفسها بعد كده بتتولى تجديد التوكن باستخدام نفس refresh_token
  // لما يحتاج (نفس آلية تسجيل الدخول العادي بالظبط).
  const injectedJS = useMemo(() => {
    const isOAuth = settings.authMethod === 'oauth' && !!settings.refreshToken;
    // التوكن اليدوي (Long-Lived Access Token) صلاحيته غير منتهية عمليًا
    // - نديله مدة صلاحية طويلة جدًا عشان واجهة HA متحاولش تجدده بـ
    // refresh_token فاضي وتكسر الجلسة بعد وقت قصير.
    const expiresIn = isOAuth
      ? Math.max(60, Math.round(((settings.tokenExpiresAt ?? Date.now() + 25 * 60 * 1000) - Date.now()) / 1000))
      : 315360000; // 10 سنين تقريبًا
    const tokens = {
      access_token: settings.accessToken ?? settings.token,
      token_type: 'Bearer',
      refresh_token: settings.refreshToken ?? '',
      hassUrl: baseUrl,
      clientId: 'https://familyha.app/callback',
      expires_in: expiresIn,
      expires: Date.now() + expiresIn * 1000,
    };
    return `try { window.localStorage.setItem('hassTokens', ${JSON.stringify(JSON.stringify(tokens))}); } catch (e) {} true;`;
  }, [settings.authMethod, settings.accessToken, settings.token, settings.refreshToken, settings.tokenExpiresAt, baseUrl]);

  return (
    <View style={s.container}>
      <WebView
        source={{ uri: url }}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        startInLoadingState
        onLoadEnd={() => {
          // نديله فترة صغيرة كمان بعد ما الصفحة تخلص تحميل عشان
          // Kiosk Mode (module بيشتغل بعد الترسيم، مش قبله) ياخد وقته
          // يخفي القائمة/الشريط قبل ما نكشف المحتوى للمستخدم.
          setTimeout(() => setReady(true), 900);
        }}
        style={{ backgroundColor: colors.background }}
      />
      {!ready ? (
        <View style={s.overlay}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
