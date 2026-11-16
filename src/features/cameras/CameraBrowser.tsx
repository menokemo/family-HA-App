import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Image, Modal, StyleSheet, Text, View } from 'react-native';
import RNFS from 'react-native-fs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { ConnectionSettings, HaEntity } from '../../types/homeAssistant';
import type { RegistryEntry } from '../../api/homeAssistant';
import { authHeaders, cameraSnapshotUrl } from '../../api/homeAssistant';
import { colors } from '../../theme';
import { i18n } from '../../i18n';
import { CameraPlayer } from './CameraPlayer';
import { PressableScale } from '../../components/PressableScale';

type Props = { cameras: HaEntity[]; settings: ConnectionSettings; states: HaEntity[]; registry: RegistryEntry[]; onColumnsChange?: (n: number) => void };

// مربّع كاميرا واحد في الشبكة. بيحمّل لقطة جديدة كل ما `nonce` يتغيّر (المؤقّت
// بيعيش في الأب، مؤقّت واحد للشبكة كلها بدل واحد لكل مربّع). بيكتب على نفس الملف
// وبيضيف `?v=nonce` على الـ uri عشان يكسر كاش الصورة ويعيد الرسم فعلاً.
const CameraTile = memo(function CameraTile({ camera, settings, columns, nonce, onOpen }: { camera: HaEntity; settings: ConnectionSettings; columns: number; nonce: number; onOpen: () => void }) {
  const token = typeof camera.attributes.access_token === 'string' ? camera.attributes.access_token : undefined;
  const file = `${RNFS.CachesDirectoryPath}/camera-${camera.entity_id.replace(/\W/g, '_')}.jpg`;
  // أول رسمة: الرابط البعيد مباشرة (بهيدر المصادقة) عشان حاجة تبان قبل أول تحميل.
  const [uri, setUri] = useState(() => cameraSnapshotUrl(settings, camera.entity_id, nonce, token));

  useEffect(() => {
    let active = true;
    const url = cameraSnapshotUrl(settings, camera.entity_id, nonce, token);
    void RNFS.downloadFile({ fromUrl: url, toFile: file, headers: token ? {} : authHeaders(settings) }).promise
      .then(r => { if (active && r.statusCode >= 200 && r.statusCode < 300) setUri(`file://${file}?v=${nonce}`); })
      .catch(async () => { if (active && (await RNFS.exists(file))) setUri(`file://${file}?v=${nonce}`); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.entity_id, settings.baseUrl, settings.token, nonce]);

  return (
    <PressableScale style={[s.tile, columns > 1 && s.tileHalf]} onPress={onOpen}>
      <Image source={{ uri, headers: uri.startsWith('file:') ? undefined : authHeaders(settings) }} style={s.image} onError={() => void RNFS.exists(file).then(exists => { if (exists) setUri(`file://${file}?v=${nonce}`); })} />
      <View style={s.overlay}>
        <View style={s.liveIcon}><Ionicons name="play" size={columns > 1 ? 13 : 16} color="#fff" /></View>
        <Text style={[s.name, columns > 1 && s.nameSmall]} numberOfLines={1}>{String(camera.attributes.friendly_name ?? camera.entity_id)}</Text>
      </View>
    </PressableScale>
  );
});

export function CameraBrowser({ cameras, settings, states, registry, onColumnsChange }: Props) {
  const [selected, setSelected] = useState<HaEntity | null>(null);
  const columns = settings.cameraColumns === 2 ? 2 : 1;
  const toggleColumns = useCallback(() => onColumnsChange?.(columns === 2 ? 1 : 2), [columns, onColumnsChange]);

  // مؤقّت واحد بيحدّث كل مربّعات الشبكة. بيقف وهو مفتوح كاميرا بملء الشاشة (البلاير
  // بيبث مباشر، مفيش داعي نحمّل لقطات تحته)، وبيقف لما التطبيق يروح الخلفية (مفيش
  // داعي نهدر بيانات وبطارية على صور محدش بيشوفها).
  const refreshSeconds = Math.max(3, Number(settings.snapshotRefreshSeconds) || 10);
  const [nonce, setNonce] = useState(() => Date.now());
  const paused = selected !== null;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active' && !pausedRef.current) setNonce(Date.now());
    }, refreshSeconds * 1000);
    return () => clearInterval(id);
  }, [refreshSeconds, paused]);

  // رجوع التطبيق من الخلفية = حدّث فورًا بدل ما تستنى الدورة الجاية.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'active' && !pausedRef.current) setNonce(Date.now()); });
    return () => sub.remove();
  }, []);

  const renderItem = useCallback(({ item }: { item: HaEntity }) => <CameraTile camera={item} settings={settings} columns={columns} nonce={nonce} onOpen={() => setSelected(item)} />, [settings, columns, nonce]);
  const empty = useMemo(() => <View style={s.empty}><Text style={s.emptyText}>{i18n.t('noSelectedCameras')}</Text></View>, []);

  return (
    <>
      <View style={s.bar}>
        <PressableScale style={s.viewToggle} onPress={toggleColumns}>
          <Ionicons name={columns === 2 ? 'square-outline' : 'grid-outline'} size={17} color={colors.text} />
          <Text style={s.viewToggleText}>{columns === 2 ? i18n.t('viewSingle') : i18n.t('viewGrid')}</Text>
        </PressableScale>
      </View>
      <FlatList key={`cols-${columns}`} data={cameras} keyExtractor={x => x.entity_id} renderItem={renderItem} numColumns={columns} columnWrapperStyle={columns > 1 ? s.row : undefined} contentContainerStyle={s.list} ListEmptyComponent={empty} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} />
      <Modal visible={!!selected} animationType="fade" onRequestClose={() => setSelected(null)} statusBarTranslucent>
        {selected ? <CameraPlayer camera={selected} settings={settings} states={states} registry={registry} title={String(selected.attributes.friendly_name ?? selected.entity_id)} onClose={() => setSelected(null)} /> : null}
      </Modal>
    </>
  );
}

const s = StyleSheet.create({ bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12 }, viewToggle: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 13 }, viewToggleText: { color: colors.text, fontWeight: '700', fontSize: 13 }, list: { padding: 16, gap: 14 }, row: { gap: 14 }, tile: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, tileHalf: { flex: 1 }, image: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.black }, overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,.55)' }, liveIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, name: { color: '#fff', fontWeight: '800', fontSize: 16, flex: 1 }, nameSmall: { fontSize: 13 }, empty: { padding: 24, backgroundColor: colors.surface, borderRadius: 18 }, emptyText: { color: colors.muted } });
