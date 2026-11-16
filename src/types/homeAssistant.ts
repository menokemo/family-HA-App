export type HaAttributes = Record<string, unknown>;
export interface HaEntity { entity_id: string; state: string; attributes: HaAttributes; last_changed?: string; last_updated?: string }
export type AlarmModeKey = 'home'|'away'|'night'|'vacation'|'custom'|'disarm';
export type SirenTone = 'classic'|'digital'|'pulse';
export interface ConnectionSettings {
  baseUrl: string;
  token: string;
  authMethod?: 'token' | 'oauth';
  refreshToken?: string;
  accessToken?: string;
  tokenExpiresAt?: number;
  monitorToken?: string;
  alarmCode: string;
  alarmEntityId?: string;
  language?: 'ar' | 'en' | 'nl';
  themeMode?: 'light' | 'dark' | 'auto';
  sirenEnabled?: boolean;
  sirenTone?: SirenTone;
  snapshotRefreshSeconds?: number;
  cameraColumns?: number;
  directStatusChange?: boolean;
  showStatusBadge?: boolean;
  visibleAlarmModes?: Partial<Record<AlarmModeKey, boolean>>;
  selectedCameraIds?: string[];
  selectedSensorIds?: string[];
  biometricDisarmEnabled?: boolean;
  selectedDashboardPath?: string;
  zoneWatchPersonIds?: string[];
  selectedCalendarIds?: string[];
  selectedTodoIds?: string[];
  selectedPersonId?: string;
  familyConfigVersion?: number;
  permissionsSetupDone?: boolean;
  backgroundMonitoringEnabled?: boolean;
  shareLocation?: boolean;
  mobileAppWebhookId?: string;
  mobileAppDeviceId?: string;
  deviceFriendlyName?: string;
  mapEngine?: 'web' | 'native';
  beaconMonitor?: boolean;
  bleEmitter?: boolean;
  bleUuid?: string;
  highAccuracyMode?: boolean;
  highAccuracyNearZones?: boolean;
  highAccuracyBtDevices?: string[];
  homeBtDevices?: string[];
  // جرس الباب: الكيان والكاميرا مركزيين (ينتشروا)، والرنّ على الجهاز ده شخصي.
  doorbellEntity?: string;
  doorbellCamera?: string;
  doorbellRingThisPhone?: boolean;
  // نطاق فلترة مخاطر الخريطة بالكيلومتر (من البيت أو أي فرد). الأدمن يتحكّم، 0 = قافل.
  hazardRadiusKm?: number;
}
export interface AlarmoEvent {
  eventType: 'alarmo_failed_to_arm' | 'alarmo_command_success' | 'alarmo_ready_to_arm_modes_updated';
  data: Record<string, unknown>;
  timeFired?: string;
}
