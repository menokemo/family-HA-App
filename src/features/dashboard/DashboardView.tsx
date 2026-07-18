import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { WebView, type ShouldStartLoadRequest } from 'react-native-webview';
import { ensureFreshToken, normalizeUrl } from '../../api/homeAssistant';
import { colors } from '../../theme';
import type { ConnectionSettings } from '../../types/homeAssistant';

type Props = { settings: ConnectionSettings; dashboardPath: string };

type ExternalAuthMessage =
  | { kind: 'getExternalAuth'; callback: string }
  | { kind: 'revokeExternalAuth'; callback: string }
  | { kind: 'kiosk-ready' };

export function DashboardView({ settings, dashboardPath }: Props) {
  const [ready, setReady] = useState(false);
  const webviewRef = useRef<WebView>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => { setReady(false); }, [dashboardPath, settings.baseUrl]);
  const baseUrl = normalizeUrl(settings.baseUrl);
  // external_auth=1 بيفعّل بروتوكول HA الرسمي لتمرير المصادقة من
  // تطبيق خارجي (External Authentication) - بدل ما نحقن localStorage
  // يدوي (طلع غير موثوق، بيسبب رجوع لصفحة الدخول أحيانًا)، دلوقتي
  // بنستخدم نفس الآلية اللي تطبيق HA الرسمي بيستخدمها بالظبط.
  // ?kiosk بيتطلب إضافة Kiosk Mode متثبتة في HA لإخفاء القائمة/الشريط.
  const url = `${baseUrl}/${dashboardPath.replace(/^\/+/, '')}?kiosk&external_auth=1`;

  // بروتوكول External Authentication الرسمي بتاع HA:
  // https://developers.home-assistant.io/docs/frontend/external-authentication
  // واجهة HA بتنادي window.externalAppV2.postMessage(...) لما تحتاج
  // توكن. إحنا بنمسك النداء ده جوه الصفحة، ونبعته لتطبيقنا (عن طريق
  // window.ReactNativeWebView.postMessage)، وبعد ما نجيب توكن صالح
  // فعليًا (مع تجديده لو لازم)، بنرجّع الرد جوه الصفحة تاني عن طريق
  // injectJavaScript بمناداة دالة الـ callback المطلوبة بالاسم بالظبط.
  const bridgeJS = `
    (function () {
      window.externalAppV2 = {
        postMessage: function (raw) {
          try {
            var msg = JSON.parse(raw);
            if (msg.type === 'getExternalAuth') {
              window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'getExternalAuth', callback: msg.payload.callback }));
            } else if (msg.type === 'revokeExternalAuth') {
              window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'revokeExternalAuth', callback: msg.payload.callback }));
            }
          } catch (e) {}
        }
      };
      // مراقبة اختفاء القائمة الجانبية (Kiosk Mode) - بدل ما نستنى
      // وقت ثابت مخمّن، بنبلّغ التطبيق أول ما نلاحظها مختفية فعليًا.
      var start = Date.now();
      var check = function () {
        var sidebar = document.querySelector('ha-sidebar') || document.querySelector('app-drawer');
        var hidden = !sidebar || getComputedStyle(sidebar).display === 'none' || sidebar.hasAttribute('hidden');
        if (hidden || Date.now() - start > 3000) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'kiosk-ready' }));
        } else {
          setTimeout(check, 80);
        }
      };
      check();
    })();
    true;
  `;

  const onMessage = (raw: string) => {
    let message: ExternalAuthMessage;
    try { message = JSON.parse(raw) as ExternalAuthMessage; } catch { return; }
    if (message.kind === 'kiosk-ready') { setReady(true); return; }
    if (message.kind === 'revokeExternalAuth') {
      webviewRef.current?.injectJavaScript(`window.${message.callback}(true); true;`);
      return;
    }
    if (message.kind === 'getExternalAuth') {
      void ensureFreshToken(settingsRef.current)
        .then(token => {
          const expiresIn = settingsRef.current.authMethod === 'oauth' && settingsRef.current.tokenExpiresAt
            ? Math.max(60, Math.round((settingsRef.current.tokenExpiresAt - Date.now()) / 1000))
            : 315360000; // توكن يدوي - صلاحية طويلة جدًا عمليًا
          const payload = JSON.stringify({ access_token: token, expires_in: expiresIn });
          webviewRef.current?.injectJavaScript(`window.${message.callback}(true, ${payload}); true;`);
        })
        .catch(() => {
          webviewRef.current?.injectJavaScript(`window.${message.callback}(false); true;`);
        });
    }
  };

  // Navigation Guard: بيمنع الخروج من مسار الداشبورد المسموح - بس
  // مهم نعرف إن ده بيغطي التنقل بالروابط الحقيقية بس (زي فتح رابط من
  // كارت)، مش تنقل SPA الداخلي بتاع HA نفسه (بيتغيّر بجافاسكريبت من
  // غير تحميل صفحة جديدة، فمش بيتلقط هنا أصلًا).
  const dashboardRoot = dashboardPath.replace(/^\/+/, '').split('/')[0] || 'lovelace';
  const onShouldStartLoadWithRequest = (request: ShouldStartLoadRequest) => {
    try {
      const target = new URL(request.url);
      const base = new URL(baseUrl);
      if (target.origin !== base.origin) {
        void Linking.openURL(request.url).catch(() => undefined);
        return false;
      }
      const path = target.pathname.replace(/^\/+/, '');
      if (path === '' || path === dashboardRoot || path.startsWith(`${dashboardRoot}/`)) return true;
      return false;
    } catch {
      return true;
    }
  };

  return (
    <View style={s.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: url }}
        injectedJavaScriptBeforeContentLoaded={bridgeJS}
        onMessage={event => onMessage(event.nativeEvent.data)}
        startInLoadingState
        onLoadEnd={() => setTimeout(() => setReady(true), 3200)}
        cacheEnabled={false}
        incognito
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
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
