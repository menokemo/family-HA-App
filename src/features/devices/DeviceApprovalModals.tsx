// نوافذ موافقة الأجهزة (جهاز نشط واحد لكل مستخدم + موافقة الأدمن).
// - نافذة الاستبدال: على الجهاز الجديد — بيكتب الكود اللي الأدمن داهوله.
// - نافذة موافقة الأدمن: بتظهر للأدمن لما جهاز جديد يطلب الدخول — بتعرض الكود
//   وزرّي موافقة/رفض.
// الواجهة بس هنا؛ منطق النداءات في App.tsx (عشان الملفات تفضل صغيرة منظمة).
// mkdd — Secure Family
import { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { PressableScale } from '../../components/PressableScale';
import { useTheme, type Palette } from '../../theme';
import { i18n } from '../../i18n';

export type Takeover = { requestId: string; oldDeviceName: string };
export type ApprovalReq = { requestId: string; userName: string; newDeviceName: string; code?: string };

type Props = {
  takeover: Takeover | null;
  onSubmitCode: (code: string) => Promise<boolean>;
  onCancelTakeover: () => void;
  approval: ApprovalReq | null;
  onApprove: () => void;
  onDeny: () => void;
};

export function DeviceApprovalModals({ takeover, onSubmitCode, onCancelTakeover, approval, onApprove, onDeny }: Props) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    if (code.trim().length < 4 || busy) return;
    setBusy(true);
    setError(undefined);
    const ok = await onSubmitCode(code.trim());
    setBusy(false);
    if (ok) {
      setCode('');
    } else {
      setError(i18n.t('invalidCode'));
    }
  };

  return (
    <>
      {/* الجهاز الجديد: الحساب نشط على جهاز تاني — اكتب الكود */}
      <Modal visible={!!takeover} transparent animationType="fade" onRequestClose={onCancelTakeover}>
        <View style={s.backdrop}>
          <View style={s.card}>
            <View style={[s.iconWrap, { backgroundColor: colors.warning + '22' }]}>
              <Ionicons name="shield-half-outline" size={26} color={colors.warning} />
            </View>
            <Text style={s.title}>{i18n.t('takeoverTitle')}</Text>
            <Text style={s.body}>{i18n.t('takeoverMessage').replace('{device}', takeover?.oldDeviceName || '—')}</Text>
            <Text style={s.label}>{i18n.t('takeoverCodeLabel')}</Text>
            <TextInput
              style={s.codeInput}
              value={code}
              onChangeText={t => { setCode(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(undefined); }}
              keyboardType="number-pad"
              placeholder="••••••"
              placeholderTextColor={colors.muted}
              maxLength={6}
              editable={!busy}
            />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <PressableScale style={[s.btn, { backgroundColor: colors.primary }]} onPress={() => void submit()}>
              <Text style={s.btnText}>{i18n.t('approveBtn')}</Text>
            </PressableScale>
            <PressableScale style={s.cancelBtn} onPress={onCancelTakeover}>
              <Text style={[s.cancelText, { color: colors.danger }]}>{i18n.t('disconnect')}</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>

      {/* الأدمن: جهاز جديد عايز يدخل — الكود + موافقة/رفض */}
      <Modal visible={!!approval} transparent animationType="fade" onRequestClose={onDeny}>
        <View style={s.backdrop}>
          <View style={s.card}>
            <View style={[s.iconWrap, { backgroundColor: colors.primary + '22' }]}>
              <Ionicons name="phone-portrait-outline" size={26} color={colors.primary} />
            </View>
            <Text style={s.title}>{i18n.t('approvalTitle')}</Text>
            <Text style={s.body}>{i18n.t('approvalMessage').replace('{name}', approval?.newDeviceName || '—').replace('{user}', approval?.userName || '—')}</Text>
            {approval?.code ? (
              <View style={s.codeChip}>
                <Text style={s.codeChipLabel}>{i18n.t('approvalCodeLabel')}</Text>
                <Text style={[s.codeValue, { color: colors.primary }]}>{approval.code}</Text>
              </View>
            ) : null}
            <PressableScale style={[s.btn, { backgroundColor: colors.safe }]} onPress={onApprove}>
              <Text style={s.btnText}>{i18n.t('approveBtn')}</Text>
            </PressableScale>
            <PressableScale style={s.cancelBtn} onPress={onDeny}>
              <Text style={[s.cancelText, { color: colors.danger }]}>{i18n.t('denyBtn')}</Text>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 420, backgroundColor: c.surfaceElevated, borderRadius: 22, padding: 22, borderWidth: 1, borderColor: c.border, alignItems: 'center', gap: 10 },
    iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
    title: { color: c.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
    body: { color: c.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    label: { color: c.text, fontSize: 13, fontWeight: '600', alignSelf: 'stretch', marginTop: 6 },
    codeInput: { alignSelf: 'stretch', backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, color: c.text, fontSize: 24, letterSpacing: 8, textAlign: 'center', paddingVertical: 12, fontWeight: '700' },
    error: { color: c.danger, fontSize: 13, textAlign: 'center' },
    btn: { alignSelf: 'stretch', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    cancelBtn: { paddingVertical: 10, alignItems: 'center' },
    cancelText: { fontWeight: '700', fontSize: 14 },
    codeChip: { alignSelf: 'stretch', backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14, alignItems: 'center', gap: 4 },
    codeChipLabel: { color: c.muted, fontSize: 12 },
    codeValue: { fontSize: 30, fontWeight: '800', letterSpacing: 6 },
  });
