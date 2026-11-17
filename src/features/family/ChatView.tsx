import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';
import { chatSend } from '../../api/homeAssistant';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import { PressableScale } from '../../components/PressableScale';
import { MemberAvatar } from './MemberAvatar';
import { readProfiles } from './profiles';
import { readSocial, resolvePoster, type SocialPost } from './social';

type Props = { states: HaEntity[]; settings: ConnectionSettings };

function clock(ts: number) { return new Date(ts * 1000).toLocaleTimeString(i18n.locale || 'en', { hour: '2-digit', minute: '2-digit' }); }

export function ChatView({ states, settings }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const persons = useMemo(() => states.filter(e => e.entity_id.startsWith('person.')), [states]);
  const profiles = useMemo(() => readProfiles(states), [states]);
  const myId = settings.selectedPersonId;
  const messages = useMemo(() => readSocial<SocialPost>(states, 'chat'), [states]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try { await chatSend(settings, t); setText(''); } finally { setSending(false); }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroll} contentContainerStyle={s.list} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 ? (
          <View style={s.empty}><Ionicons name="chatbubble-ellipses-outline" size={38} color={colors.muted} /><Text style={s.emptyText}>{i18n.t('chatEmpty')}</Text></View>
        ) : messages.map((m, i) => {
          const mine = !!myId && m.person === myId;
          const who = resolvePoster(m, persons, profiles);
          const prev = messages[i - 1];
          const showHead = !prev || prev.person !== m.person;
          return (
            <View key={m.id} style={[s.msgRow, mine ? s.msgRowMine : s.msgRowOther]}>
              {!mine && showHead ? <MemberAvatar person={who.person} name={who.name} settings={settings} size={26} color={who.color} /> : <View style={{ width: mine ? 0 : 26 }} />}
              <View style={[s.bubble, mine ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border }]}>
                {!mine && showHead ? <Text style={[s.bubbleName, { color: who.color }]}>{who.name.split(' ')[0]}</Text> : null}
                <Text style={[s.bubbleText, mine && { color: '#fff' }]}>{m.text}</Text>
                <Text style={[s.bubbleTime, mine && { color: 'rgba(255,255,255,.7)' }]}>{clock(m.ts)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={s.composer}>
        <TextInput style={s.input} placeholder={i18n.t('chatPlaceholder')} placeholderTextColor={colors.muted} value={text} onChangeText={setText} multiline />
        <PressableScale onPress={send} disabled={!text.trim() || sending} style={[s.sendBtn, { opacity: text.trim() && !sending ? 1 : 0.4 }]}>
          <Ionicons name="send" size={16} color="#fff" />
        </PressableScale>
      </View>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    list: { padding: 12, gap: 4 },
    msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, maxWidth: '85%' },
    msgRowOther: { alignSelf: 'flex-start' },
    msgRowMine: { alignSelf: 'flex-end' },
    bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
    bubbleName: { fontSize: 11.5, fontWeight: '700', marginBottom: 2 },
    bubbleText: { color: colors.text, fontSize: 14.5, lineHeight: 19 },
    bubbleTime: { fontSize: 9.5, color: colors.muted, alignSelf: 'flex-end', marginTop: 2 },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 10, borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.background },
    input: { flex: 1, color: colors.text, fontSize: 14.5, maxHeight: 100, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
    sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 60 },
    emptyText: { color: colors.muted, fontSize: 14 },
  });
}
