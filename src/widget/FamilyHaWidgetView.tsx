import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetData } from './widgetData';

const ALARM_COLORS: Record<string, string> = {
  disarmed: '#27C499',
  armed_home: '#5C8DFF',
  armed_away: '#5C8DFF',
  armed_night: '#8E5FE8',
  armed_vacation: '#17A2B8',
  armed_custom_bypass: '#F5A623',
  triggered: '#E5484D',
  pending: '#F5A623',
  arming: '#F5A623',
};

function alarmLabel(state: string) {
  if (state === 'unknown') return '—';
  return state.replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase());
}

export function FamilyHaWidgetView({ data }: { data: WidgetData }) {
  if (!data.connected) {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#0e1420', borderRadius: 20, padding: 16, justifyContent: 'center', alignItems: 'center' }}
      >
        <TextWidget text="Family HA" style={{ fontSize: 15, fontWeight: 'bold', color: '#fff' }} />
        <TextWidget text="Open the app to sign in" style={{ fontSize: 11, color: '#8894a8', marginTop: 4 }} />
      </FlexWidget>
    );
  }

  const color = ALARM_COLORS[data.alarmState] ?? '#8894a8';

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#0e1420',
        borderRadius: 20,
        padding: 14,
        flexDirection: 'column',
      }}
    >
      <FlexWidget clickAction="OPEN_APP" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget text={alarmLabel(data.alarmState)} style={{ fontSize: 21, fontWeight: 'bold', color }} />
        <TextWidget text="Family HA" style={{ fontSize: 10, color: '#5b6b82' }} />
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'row', marginTop: 10 }}>
        <FlexWidget
          clickAction="ARM_HOME"
          style={{ flex: 1, backgroundColor: '#1a2333', borderRadius: 12, height: 40, justifyContent: 'center', alignItems: 'center', marginEnd: 6 }}
        >
          <TextWidget text="Home" style={{ fontSize: 12, fontWeight: 'bold', color: '#5C8DFF' }} />
        </FlexWidget>
        <FlexWidget
          clickAction="ARM_AWAY"
          style={{ flex: 1, backgroundColor: '#1a2333', borderRadius: 12, height: 40, justifyContent: 'center', alignItems: 'center', marginEnd: 6 }}
        >
          <TextWidget text="Away" style={{ fontSize: 12, fontWeight: 'bold', color: '#5C8DFF' }} />
        </FlexWidget>
        <FlexWidget
          clickAction="DISARM"
          style={{ flex: 1, backgroundColor: '#1a2333', borderRadius: 12, height: 40, justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget text="Disarm" style={{ fontSize: 12, fontWeight: 'bold', color: '#E5484D' }} />
        </FlexWidget>
      </FlexWidget>

      {data.people.length ? (
        <FlexWidget style={{ flexDirection: 'row', marginTop: 12, flexWrap: 'wrap' }}>
          {data.people.slice(0, 6).map(p => (
            <FlexWidget
              key={p.name}
              clickAction="OPEN_APP"
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: p.home ? '#183327' : '#241a1a',
                justifyContent: 'center',
                alignItems: 'center',
                marginEnd: 8,
                marginTop: 4,
              }}
            >
              <TextWidget text={p.name.slice(0, 1).toUpperCase()} style={{ fontSize: 13, fontWeight: 'bold', color: p.home ? '#27C499' : '#8894a8' }} />
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : null}

      <FlexWidget clickAction="OPEN_APP" style={{ marginTop: 10 }}>
        <TextWidget text={`${data.reminderCount} reminder${data.reminderCount === 1 ? '' : 's'} today`} style={{ fontSize: 11, color: '#8894a8' }} />
      </FlexWidget>
    </FlexWidget>
  );
}
