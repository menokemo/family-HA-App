import type { ConnectionSettings, HaEntity } from '../types/homeAssistant';

/** أوضاع التسليح المدعومة — محايدة عن أي محرّك إنذار معيّن. */
export type AlarmMode = 'away' | 'home' | 'night' | 'vacation' | 'custom';

/** تعريف وضع تسليح: المعرّف، حالة HA المقابلة، مفتاح الترجمة، وبِت الميزة. */
export interface AlarmModeDef {
  readonly mode: AlarmMode;
  readonly state: string;
  readonly label: string;
  readonly feature: number;
}

export interface ArmOptions {
  /** تجاوز المستشعرات المفتوحة والتسليح برغمها. */
  readonly force?: boolean;
}

/**
 * واجهة محايدة عن المزوّد (abstraction layer).
 *
 * التطبيق بيكلّم الواجهة دي بس، مش بيكلّم Alarmo مباشرة. المحرّك الحالي هو
 * `alarmoProvider`. لتبديل المحرّك لاحقًا (مثلًا محرّك خاص بينا)، اكتب
 * `AlarmProvider` تاني بنفس الدوال وغيّر السطر الواحد في `./index.ts` —
 * من غير ما تلمس أي شاشة.
 */
export interface AlarmProvider {
  /** معرّف المحرّك، مثلًا 'alarmo'. */
  readonly id: string;

  /** كل الأوضاع اللي المحرّك بيعرفها (قبل الفلترة حسب الكيان). */
  readonly allModes: readonly AlarmModeDef[];

  /** تسليح الإنذار بوضع معيّن. */
  arm(settings: ConnectionSettings, entityId: string, mode: AlarmMode, options?: ArmOptions): Promise<void>;

  /** إلغاء التسليح (مع كود اختياري يتجاوز الكود المحفوظ). */
  disarm(settings: ConnectionSettings, entityId: string, codeOverride?: string): Promise<void>;

  /** تخطّي العدّاد التنازلي للتسليح. */
  skipDelay(settings: ConnectionSettings, entityId: string): Promise<void>;

  /** الأوضاع المدعومة فعليًا من كيان الإنذار ده. */
  supportedModes(alarm: HaEntity): readonly AlarmModeDef[];

  /** معرّفات المستشعرات المرتبطة بكيان الإنذار. */
  sensorIds(alarm: HaEntity): string[];
}
