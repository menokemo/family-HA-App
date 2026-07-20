import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { WebView, type ShouldStartLoadRequest } from 'react-native-webview';
import { ensureFreshToken, normalizeUrl } from '../../api/homeAssistant';
import { colors } from '../../theme';
import type { ConnectionSettings } from '../../types/homeAssistant';

type Props = { settings: ConnectionSettings; dashboardPath: string };

export function DashboardView({ settings, dashboardPath }: Props) {
  const [ready, setReady] = useState(false);
  const [bridgeJS, setBridgeJS] = useState<string>();
  const webviewRef = useRef<WebView>(null);

  useEffect(() => { setReady(false); }, [dashboardPath, settings.baseUrl]);
  const baseUrl = normalizeUrl(settings.baseUrl);
  // الصفحة بتفتح بالظبط زي متصفح عادي (من غير external_auth=1) - بس
  // بتوكن صحيح محقون في localStorage قبل ما الصفحة تحمّل، بالظبط زي
  // جلسة متصفح عادية شغالة.
  const url = `${baseUrl}/${dashboardPath.replace(/^\/+/, '')}?kiosk`;

  useEffect(() => {
    let cancelled = false;
    void ensureFreshToken(settings).then(token => {
      if (cancelled) return;
      const tokens = {
        hassUrl: baseUrl,
        clientId: null,
        refresh_token: settings.authMethod === 'oauth' ? settings.refreshToken ?? '' : '',
        access_token: token,
        // المستخدم اليدوي مفيهوش refresh_token حقيقي - صلاحية بعيدة
        // جدًا (10 سنين) عشان الواجهة متحاولش تجدده بيه فتفشل
        expires: settings.authMethod === 'oauth' && settings.tokenExpiresAt ? settings.tokenExpiresAt : Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
        token_type: 'Bearer',
      };
      setBridgeJS(`
        (function () {
          // حل "Flash of Unstyled Content": بنخفي الصفحة كلها فورًا من
          // أول لحظة (قبل أي رسم خالص)، ومنظهرهاش إلا لما نتأكد فعليًا
          // إن القوائم اختفت - أبدًا أي ومضة للوجو أو القوائم.
          var hideAttempts = 0;
          var tryHide = function () {
            hideAttempts++;
            if (document.documentElement) {
              try {
                var hideStyle = document.createElement('style');
                hideStyle.id = 'fha-hide-until-ready';
                hideStyle.textContent = 'html{visibility:hidden !important;}';
                (document.head || document.documentElement).appendChild(hideStyle);
                return;
              } catch (e) {}
            }
            if (hideAttempts < 100) setTimeout(tryHide, 5);
          };
          tryHide();
          try {
            localStorage.setItem('hassTokens', ${JSON.stringify(JSON.stringify(tokens))});
          } catch (e) {}

          // HA بتخزّن "آخر داشبورد افتراضية" في localStorage بتاعتها
          // وممكن تعيد التوجيه ليها بغض النظر عن الرابط اللي فتحناه -
          // بنتأكد إن المسار لسه هو اللي طلبناه، ولو HA غيّرته، بنرجّعه
          // بالقوة (محاولتين بس، عداد متذكّر عبر إعادة التحميل نفسها
          // عشان منلفش في حلقة لا نهائية لو HA مصرّة على مسار تاني).
          var wantedPath = ${JSON.stringify(dashboardPath.replace(/^\/+/, ''))};
          var pathFixAttempts = 0;
          var enforcePath = function () {
            pathFixAttempts++;
            var currentPath = location.pathname.replace(/^\\/+/, '');
            if (currentPath !== wantedPath && currentPath.split('/')[0] !== wantedPath.split('/')[0]) {
              var globalAttempts = Number(sessionStorage.getItem('fha_path_fix_attempts') || '0');
              if (globalAttempts >= 2) {
                sessionStorage.removeItem('fha_path_fix_attempts');
                return;
              }
              sessionStorage.setItem('fha_path_fix_attempts', String(globalAttempts + 1));
              location.replace(location.origin + '/' + wantedPath + '?kiosk');
              return;
            }
            sessionStorage.removeItem('fha_path_fix_attempts');
            if (pathFixAttempts < 3) setTimeout(enforcePath, 700);
          };
          setTimeout(enforcePath, 500);

          var start = Date.now();
          var check = function () {
            var sidebar = document.querySelector('ha-sidebar');
            var cs = sidebar ? getComputedStyle(sidebar) : null;
            var hidden = !sidebar
              || cs.display === 'none'
              || cs.visibility === 'hidden'
              || cs.width === '0px'
              || sidebar.hasAttribute('hidden')
              || sidebar.style.display === 'none';
            if (hidden || Date.now() - start > 6000) {
              try {
                var s = document.getElementById('fha-hide-until-ready');
                if (s) s.remove();
                document.documentElement.style.visibility = 'visible';
              } catch (e) {}
              window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'kiosk-ready' }));
            } else {
              setTimeout(check, 100);
            }
          };
          check();
          setTimeout(function () {
            try {
              var s2 = document.getElementById('fha-hide-until-ready');
              if (s2) s2.remove();
              document.documentElement.style.visibility = 'visible';
            } catch (e) {}
          }, 5000);
        })();
        true;
      `);
    }).catch(() => {
      // "أفضل جهد" - لو تجديد التوكن فشل لأي سبب (حتى مؤقتًا)، منخليش
      // ده يظهر كخطأ غير ممسوك يوقف التطبيق.
    });
    return () => { cancelled = true; };
  }, [settings.baseUrl, settings.token, settings.accessToken, settings.tokenExpiresAt]);

  const onMessage = (raw: string) => {
    let message: { kind: string };
    try { message = JSON.parse(raw); } catch { return; }
    if (message.kind === 'kiosk-ready') setReady(true);
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

  if (!bridgeJS) {
    return (
      <View style={s.overlay}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

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
        domStorageEnabled
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
