import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView, type ShouldStartLoadRequest } from 'react-native-webview';
import { ensureFreshToken, normalizeUrl } from '../../api/homeAssistant';
import { colors } from '../../theme';
import type { ConnectionSettings } from '../../types/homeAssistant';

type Props = { settings: ConnectionSettings; dashboardPath: string };

export function DashboardView({ settings, dashboardPath }: Props) {
  const [ready, setReady] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [bridgeJS, setBridgeJS] = useState<string>();
  const webviewRef = useRef<WebView>(null);
  const log = (text: string) => setDebugLog(prev => [...prev.slice(-50), `${new Date().toLocaleTimeString()} — ${text}`]);

  useEffect(() => { setReady(false); }, [dashboardPath, settings.baseUrl]);
  const baseUrl = normalizeUrl(settings.baseUrl);
  // بروتوكول External Authentication/External Bus جرّبناه بالكامل
  // ومطابق للتوثيق الرسمي 100%، بس فضل عالق - غالبًا حاجة في إصدار
  // HA بتاع المستخدم مش متوافقة معاه. رجعنا للطريقة الأبسط: نخلي
  // الصفحة تفتح **بالظبط زي متصفح عادي** (من غير external_auth=1،
  // يعني HA متتعاملش معاها كـ"تطبيق خارجي" خالص) - بس بتوكن صحيح
  // محقون في localStorage قبل ما الصفحة تحمّل، بالظبط زي جلسة متصفح
  // عادية شغالة (اتأكدنا إن المصادقة العادية دي شغالة 100% في متصفح
  // حقيقي، فمفروض تشتغل هنا بنفس الطريقة).
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
          // نحقن CSS خام كأول حاجة ممكنة - ده بيتطبّق أسرع بكتير من أي
          // حل جافاسكريبت (زي Kiosk Mode نفسها)، فمفيش أي "ومضة"
          // للوجو/القوائم قبل ما تتخفي. عناصر HA دي (ha-sidebar،
          // header الأساسي) بتاخد الوقت ده تتخفي بجافاسكريبت عادةً.
          try {
            var style = document.createElement('style');
            style.textContent = 'ha-sidebar,partial-panel-resolver > ha-sidebar,app-drawer,.header,ha-top-app-bar-fixed,.toolbar,ha-menu-button{display:none !important;visibility:hidden !important;} ha-app-layout,hui-view,.content{margin:0 !important;padding:0 !important;}';
            (document.head || document.documentElement).appendChild(style);
            window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '✅ CSS فوري اتحقن' }));
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '❌ فشل حقن CSS: ' + e }));
          }
          try {
            localStorage.setItem('hassTokens', ${JSON.stringify(JSON.stringify(tokens))});
            window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '✅ hassTokens اتحقنت، طول القيمة: ' + localStorage.getItem('hassTokens').length }));
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '❌ فشل حقن hassTokens: ' + e }));
          }
          window.addEventListener('DOMContentLoaded', function(){
            window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: 'DOMContentLoaded' }));
          });
          var start = Date.now();
          var check = function () {
            var loginForm = document.querySelector('ha-authorize') || document.querySelector('[slot=\\"header\\"]');
            var sidebar = document.querySelector('ha-sidebar') || document.querySelector('app-drawer');
            var hidden = !sidebar || getComputedStyle(sidebar).display === 'none' || sidebar.hasAttribute('hidden');
            if (loginForm) window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '⚠️ صفحة تسجيل دخول ظاهرة!' }));
            if (hidden || Date.now() - start > 4000) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'kiosk-ready' }));
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        })();
        true;
      `);
    });
    return () => { cancelled = true; };
  }, [settings.baseUrl, settings.token, settings.accessToken, settings.tokenExpiresAt]);

  const onMessage = (raw: string) => {
    let message: { kind: string; text?: string };
    try { message = JSON.parse(raw); } catch { return; }
    if (message.kind === 'log') { log(message.text ?? ''); return; }
    if (message.kind === 'kiosk-ready') { log('kiosk-ready'); setReady(true); return; }
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
      <Pressable style={s.debugToggle} onPress={() => setShowDebug(v => !v)}>
        <Text style={s.debugToggleText}>🐛</Text>
      </Pressable>
      {showDebug ? (
        <ScrollView style={s.debugPanel} contentContainerStyle={{ padding: 10 }}>
          {debugLog.length === 0 ? <Text style={s.debugLine}>...</Text> : null}
          {debugLog.map((line, i) => <Text key={i} style={s.debugLine} selectable>{line}</Text>)}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  debugToggle: { position: 'absolute', zIndex: 4, top: 50, right: 14, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center' },
  debugToggleText: { fontSize: 15 },
  debugPanel: { position: 'absolute', zIndex: 5, top: 90, left: 8, right: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,.9)', borderRadius: 10 },
  debugLine: { color: '#8FE388', fontSize: 10, fontFamily: 'monospace', marginBottom: 3 },
});
