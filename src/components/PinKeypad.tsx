import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../theme';
import { i18n } from '../i18n';

type Props = {
  visible: boolean;
  title: string;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  minLength?: number;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

export function PinKeypad({ visible, title, onSubmit, onCancel, minLength = 4 }: Props) {
  const [code, setCode] = useState('');

  const press = (key: string) => {
    if (key === '') return;
    if (key === 'back') {
      setCode(c => c.slice(0, -1));
      return;
    }
    setCode(c => (c.length >= 8 ? c : c + key));
  };

  const close = () => {
    setCode('');
    onCancel();
  };

  const submit = () => {
    const value = code;
    setCode('');
    onSubmit(value);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>{title}</Text>
          <View style={s.dots}>
            {Array.from({ length: Math.max(minLength, code.length || minLength) }).map((_, i) => (
              <View key={i} style={[s.dot, i < code.length && s.dotFilled]} />
            ))}
          </View>
          <View style={s.grid}>
            {KEYS.map((key, i) => (
              <Pressable
                key={i}
                style={[s.key, key === '' && s.keyGhost]}
                disabled={key === ''}
                onPress={() => press(key)}
              >
                {key === 'back' ? (
                  <Ionicons name="backspace-outline" size={22} color={colors.text} />
                ) : (
                  <Text style={s.keyText}>{key}</Text>
                )}
              </Pressable>
            ))}
          </View>
          <View style={s.actions}>
            <Pressable style={s.cancelButton} onPress={close}>
              <Text style={s.cancelText}>{i18n.t('cancel')}</Text>
            </Pressable>
            <Pressable style={[s.submitButton, code.length < minLength && s.submitDisabled]} disabled={code.length < minLength} onPress={submit}>
              <Text style={s.submitText}>{i18n.t('confirm')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,8,14,.82)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: 26, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 18 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  key: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  keyGhost: { backgroundColor: 'transparent' },
  keyText: { color: colors.text, fontSize: 24, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { color: colors.muted, fontWeight: '800' },
  submitButton: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center' },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: colors.black, fontWeight: '900' },
});
