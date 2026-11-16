import { FAMILY_CONFIG_FIELDS, pickFamilyConfig, readFamilyConfig } from '../src/family/familyConfig';
import type { ConnectionSettings, HaEntity } from '../src/types/homeAssistant';

const settings = {
  baseUrl: 'https://ha.local',
  token: 'secret-token',
  mapEngine: 'native',
  zoneWatchPersonIds: ['person.mena'],
  doorbellEntity: 'event.front_doorbell',
  doorbellCamera: 'camera.front_door',
  doorbellRingThisPhone: true,
  hazardRadiusKm: 5,
  disasterRadiusKm: 120,
  // إعدادات خاصة بالجهاز — مالهاش أي لزمة تتنشر.
  bleUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  homeBtDevices: ['AA:BB:CC:DD:EE:FF'],
  highAccuracyBtDevices: ['11:22:33:44:55:66'],
  shareLocation: true,
  beaconMonitor: true,
  bleEmitter: true,
  highAccuracyMode: true,
} as unknown as ConnectionSettings;

describe('pickFamilyConfig', () => {
  it('بينشر محرّك الخريطة', () => {
    expect(pickFamilyConfig(settings).mapEngine).toBe('native');
  });

  it('بينشر كيان الجرس وكاميرته (مركزيين للعيلة)', () => {
    const out = pickFamilyConfig(settings);
    expect(out.doorbellEntity).toBe('event.front_doorbell');
    expect(out.doorbellCamera).toBe('camera.front_door');
  });

  it('عمره ما ينشر "رنّ عندي" (قرار شخصي لكل جهاز)', () => {
    const out = pickFamilyConfig(settings) as Record<string, unknown>;
    expect(out.doorbellRingThisPhone).toBeUndefined();
  });

  it('بينشر نطاقات المخاطر (سياسة مشتركة)', () => {
    expect(pickFamilyConfig(settings).hazardRadiusKm).toBe(5);
    expect(pickFamilyConfig(settings).disasterRadiusKm).toBe(120);
  });

  it('عمره ما ينشر حاجة خاصة بالجهاز', () => {
    const out = pickFamilyConfig(settings) as Record<string, unknown>;
    // الـUUID لو اتنشر كل الموبايلات هتبث نفس المعرّف، وعناوين الـMAC مالهاش
    // معنى على موبايل تاني. ودول قرارات بطارية بتفضل بإيد صاحب الجهاز.
    for (const key of ['bleUuid', 'homeBtDevices', 'highAccuracyBtDevices', 'shareLocation', 'beaconMonitor', 'bleEmitter', 'highAccuracyMode']) {
      expect(out[key]).toBeUndefined();
    }
  });

  it('عمره ما ينشر بيانات الاتصال', () => {
    const out = pickFamilyConfig(settings) as Record<string, unknown>;
    expect(out.token).toBeUndefined();
    expect(out.baseUrl).toBeUndefined();
  });

  it('بيسيب الحقول اللي مش متظبّطة بره الناتج', () => {
    expect(pickFamilyConfig({} as ConnectionSettings)).toEqual({});
  });

  it('مفيش تكرار في قايمة الحقول', () => {
    expect(new Set(FAMILY_CONFIG_FIELDS).size).toBe(FAMILY_CONFIG_FIELDS.length);
  });
});

describe('readFamilyConfig', () => {
  const entity = (id: string, state: string, config: unknown): HaEntity =>
    ({ entity_id: id, state, attributes: { config }, last_changed: '' }) as unknown as HaEntity;

  it('بيلاقي الكيان بالاسم المتوقّع', () => {
    const out = readFamilyConfig([entity('sensor.secure_family_config', '3', { mapEngine: 'native' })]);
    expect(out).toEqual({ version: 3, config: { mapEngine: 'native' } });
  });

  it('بيلاقيه حتى لو HA غيّر اسم الكيان', () => {
    const out = readFamilyConfig([entity('sensor.secure_family_config_2', '5', { mapEngine: 'web' })]);
    expect(out?.version).toBe(5);
  });

  it('بيرجّع null لو مفيش كيان', () => {
    expect(readFamilyConfig([])).toBeNull();
  });

  it('بيتجاهل كيان من غير attribute اسمه config', () => {
    expect(readFamilyConfig([{ entity_id: 'sensor.secure_family_config', state: '1', attributes: {} } as unknown as HaEntity])).toBeNull();
  });
});
