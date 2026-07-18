import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../theme';
import { i18n } from '../i18n';
import { buildAuthorizeUrl, extractAuthCode, exchangeCodeForTokens } from '../api/oauth';
import { PressableScale } from './PressableScale';

type Props = {
  visible: boolean;
  baseUrl: string;
  onClose: () => void;
  onSuccess: (tokens: { accessToken: string; refreshToken: string; expiresAt: number }) => void;
  onError: (message: string) => void;
};

export function OAuthLoginWebView({ visible, baseUrl, onClose, onSuccess, onError }: Props) {
  // ref مش state عمدًا - لازم يتحدّث فورًا (متزامن) عشان يمنع تبديل
  // نفس كود OAuth مرتين لو onShouldStartLoadWithRequest وonNavigation
  // StateChange اتنينهم لقطوا نفس الرابط قبل ما أي re-render يحصل.
  // أكواد OAuth بتُستخدم مرة واحدة بس - تبديلها مرتين يفشل بـ 401 في
  // المحاولة التانية حتى لو الأولى نجحت فعليًا.
  const handledRef = useRef(false);
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleCode = (code: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    setLoading(true);
    void exchangeCodeForTokens(baseUrl, code)
      .then(tokens => {
        if (!tokens.refresh_token) throw new Error(i18n.t('oauthNoRefreshToken'));
        onSuccess({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 });
      })
      .catch(e => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  // شاشة عادية بدل Modal بتاعة React Native عمدًا - Modal على أندرويد
  // بتفتح في نافذة منفصلة (Dialog) مش بتاخد إعداد adjustResize بتاع
  // الـ Activity الأساسية، فكان بيظهر فراغ أبيض بين الكيبورد وحقول
  // الإدخال. الـ View العادية دي بتاخد نفس سلوك الشاشة الأساسية صح.
  return (
    <View style={s.fullscreen}>
      <View style={s.header}>
        <PressableScale onPress={onClose} style={s.closeBtn} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.text} />
        </PressableScale>
        <Text style={s.title}>{i18n.t('loginWithHomeAssistant')}</Text>
        <View style={{ width: 24 }} />
      </View>
      {loading ? (
        <View style={s.loadingWrap}>
          <Text style={s.muted}>{i18n.t('loading')}</Text>
        </View>
      ) : (
        <WebView
          source={{ uri: buildAuthorizeUrl(baseUrl) }}
          onShouldStartLoadWithRequest={request => {
            const code = extractAuthCode(request.url);
            if (code) { handleCode(code); return false; }
            return true;
          }}
          startInLoadingState
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fullscreen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background, zIndex: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 50, backgroundColor: colors.background },
  closeBtn: { width: 24 },
  title: { color: colors.text, fontWeight: '800', fontSize: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  muted: { color: colors.muted },
});
