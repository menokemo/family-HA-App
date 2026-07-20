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
  useEffect(() => { log(`مسار الداشبورد الحالي: ${dashboardPath} | url: ${url}`); }, [url]);

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
          // الحل المعروف لمشكلة "Flash of Unstyled Content": بدل ما
          // نحاول نخفي عناصر معيّنة (لو غلطنا في اسمها هتظهر لحظة)،
          // بنخفي الصفحة كلها فورًا من أول لحظة (قبل أي رسم خالص)،
          // ومنظهرهاش إلا لما نتأكد فعليًا إن القوائم اختفت. النتيجة:
          // إما الداشبورد النضيف، وإلا شاشة سودا بينية - أبدًا أي
          // ومضة للوجو أو القوائم.
          // documentElement ممكن متكونش موجودة لسه في اللحظة دي بالظبط
          // (توقيت مبكر جدًا قبل ما المتصفح يبدأ يرسم الصفحة الحقيقية)
          // - بنعيد المحاولة كل 5ms لحد ما تبقى موجودة فعليًا، بدل ما
          // نفشل مرة واحدة ونسيبها.
          var hideAttempts = 0;
          var tryHide = function () {
            hideAttempts++;
            if (document.documentElement) {
              try {
                var hideStyle = document.createElement('style');
                hideStyle.id = 'fha-hide-until-ready';
                hideStyle.textContent = 'html{visibility:hidden !important;}';
                (document.head || document.documentElement).appendChild(hideStyle);
                window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '✅ إخفاء فوري اتحقن (محاولة ' + hideAttempts + ')' }));
                return;
              } catch (e) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '❌ فشل إخفاء الصفحة: ' + e }));
              }
            }
            if (hideAttempts < 100) setTimeout(tryHide, 5);
          };
          tryHide();
          try {
            localStorage.setItem('hassTokens', ${JSON.stringify(JSON.stringify(tokens))});
            window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '✅ hassTokens اتحقنت، طول القيمة: ' + localStorage.getItem('hassTokens').length }));
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '❌ فشل حقن hassTokens: ' + e }));
          }
          window.addEventListener('DOMContentLoaded', function(){
            window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: 'DOMContentLoaded' }));
          });
          // HA بتخزّن "آخر داشبورد افتراضية" في localStorage بتاعتها
          // وممكن تعيد التوجيه ليها بغض النظر عن الرابط اللي فتحناه -
          // بنتأكد إن المسار لسه هو اللي طلبناه، ولو HA غيّرته، بنرجّعه
          // بالقوة (مرتين بس، تحسّبًا لأي إعادة توجيه متأخرة).
          var wantedPath = ${JSON.stringify(dashboardPath.replace(/^\/+/, ''))};
          var pathFixAttempts = 0;
          var enforcePath = function () {
            pathFixAttempts++;
            var currentPath = location.pathname.replace(/^\\/+/, '');
            if (currentPath !== wantedPath && currentPath.split('/')[0] !== wantedPath.split('/')[0]) {
              // عداد المحاولات لازم يفضل متذكّر عبر إعادة التحميل نفسها
              // (مش يتصفّر كل مرة) - وإلا لو HA مصرّة ترجّع لمسار تاني،
              // هنلف في حلقة reload لا نهائية للأبد.
              var globalAttempts = Number(sessionStorage.getItem('fha_path_fix_attempts') || '0');
              if (globalAttempts >= 2) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '🛑 استسلمنا بعد ' + globalAttempts + ' محاولات - HA مصرّة على مسار تاني (' + currentPath + ')' }));
                sessionStorage.removeItem('fha_path_fix_attempts');
                return;
              }
              sessionStorage.setItem('fha_path_fix_attempts', String(globalAttempts + 1));
              window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '↩️ HA رجّعت لمسار مختلف (' + currentPath + ') - محاولة ' + (globalAttempts + 1) + ' لـ ' + wantedPath }));
              location.replace(location.origin + '/' + wantedPath + '?kiosk');
              return;
            }
            sessionStorage.removeItem('fha_path_fix_attempts');
            if (pathFixAttempts < 3) setTimeout(enforcePath, 700);
          };
          setTimeout(enforcePath, 500);
          var start = Date.now();
          var check = function () {
            var loginForm = document.querySelector('ha-authorize') || document.querySelector('[slot=\\"header\\"]');
            var sidebar = document.querySelector('ha-sidebar');
            var cs = sidebar ? getComputedStyle(sidebar) : null;
            // Kiosk Mode ممكن تستخدم أي طريقة من دول - بنتأكد من كل
            // الاحتمالات المعروفة بدل الاعتماد على display:none بس
            var hidden = !sidebar
              || cs.display === 'none'
              || cs.visibility === 'hidden'
              || cs.width === '0px'
              || sidebar.hasAttribute('hidden')
              || sidebar.style.display === 'none';
            if (loginForm) window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '⚠️ صفحة تسجيل دخول ظاهرة!' }));
            if (hidden || Date.now() - start > 6000) {
              if (!hidden) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'log', text: '⏱️ خلصت المهلة من غير ما نتأكد من الإخفاء - sidebar: display=' + (cs ? cs.display : 'n/a') + ' visibility=' + (cs ? cs.visibility : 'n/a') + ' width=' + (cs ? cs.width : 'n/a') }));
              }
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
    }).catch(e => {
      // "أفضل جهد" - لو تجديد التوكن فشل لأي سبب (حتى مؤقتًا)، منخليش
      // ده يظهر كخطأ غير ممسوك يوقف التطبيق. البروڤايدر بيرجّع للتوكن
      // الحالي أصلًا كـfallback جوّه ensureFreshToken نفسها، فده حماية
      // إضافية بس لأي حالة نادرة بترفض بالكامل.
      if (!cancelled) log(`⚠️ فشل تجديد التوكن (مؤقتًا على الأغلب): ${e instanceof Error ? e.message : String(e)}`);
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
