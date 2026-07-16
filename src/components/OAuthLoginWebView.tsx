import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../theme';
import { i18n } from '../i18n';
import { buildAuthorizeUrl, extractAuthCode, exchangeCodeForTokens } from '../api/oauth';

type Props = {
  visible: boolean;
  baseUrl: string;
  onClose: () => void;
  onSuccess: (tokens: { accessToken: string; refreshToken: string; expiresAt: number }) => void;
  onError: (message: string) => void;
};

export function OAuthLoginWebView({ visible, baseUrl, onClose, onSuccess, onError }: Props) {
  const [handled, setHandled] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  // بنعترض أي محاولة تنقّل لرابط الرجوع (redirect_uri) قبل ما الـ
  // WebView يحاول يفتحه فعليًا - الرابط ده مش موقع حقيقي، هو مجرد
  // "اسم متفق عليه" بيننا وبين نفسنا، فمفيش داعي (ولا مفروض) نسيبه
  // يتحمّل. لما نلاقي الكود، بنستخدمه فورًا ونقفل الشاشة.
  const onNavigationChange = (nav: WebViewNavigation) => {
    if (handled) return;
    const code = extractAuthCode(nav.url);
    if (!code) return;
    setHandled(true);
    setLoading(true);
    void exchangeCodeForTokens(baseUrl, code)
      .then(tokens => {
        if (!tokens.refresh_token) throw new Error(i18n.t('oauthNoRefreshToken'));
        onSuccess({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 });
      })
      .catch(e => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.header}>
        <Pressable onPress={onClose} style={s.closeBtn} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
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
          onNavigationStateChange={onNavigationChange}
          onShouldStartLoadWithRequest={request => {
            const code = extractAuthCode(request.url);
            if (code) { onNavigationChange({ url: request.url } as WebViewNavigation); return false; }
            return true;
          }}
          startInLoadingState
        />
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 50, backgroundColor: colors.background },
  closeBtn: { width: 24 },
  title: { color: colors.text, fontWeight: '800', fontSize: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  muted: { color: colors.muted },
});
