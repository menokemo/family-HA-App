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
  alarmCode: string;
  alarmEntityId?: string;
  language?: 'ar' | 'en' | 'nl';
  themeMode?: 'light' | 'dark' | 'auto';
  sirenEnabled?: boolean;
  sirenTone?: SirenTone;
  snapshotRefreshSeconds?: number;
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
}
export interface AlarmoEvent {
  eventType: 'alarmo_failed_to_arm' | 'alarmo_command_success' | 'alarmo_ready_to_arm_modes_updated';
  data: Record<string, unknown>;
  timeFired?: string;
}
