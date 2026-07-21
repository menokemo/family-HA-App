import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { callAlarmoArm, callAlarmoDisarm } from '../api/homeAssistant';
import { FamilyHaWidgetView } from './FamilyHaWidgetView';
import { loadWidgetData } from './widgetData';

const nameToWidget = {
  // "FamilyHaWidget" ده لازم يطابق اسم صنف الـKotlin (FamilyHaWidget.kt)
  // بالظبط - المكتبة بتربطهم عن طريق الاسم ده.
  FamilyHaWidget: FamilyHaWidgetView,
};

async function renderCurrent(props: WidgetTaskHandlerProps, fresh = false) {
  const { data } = await loadWidgetData(fresh);
  props.renderWidget(<FamilyHaWidgetView data={data} />);
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const Widget = nameToWidget[props.widgetInfo.widgetName as keyof typeof nameToWidget];
  if (!Widget) return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      await renderCurrent(props, true);
      break;
    case 'WIDGET_CLICK': {
      const { settings } = await loadWidgetData(false);
      if (!settings?.alarmEntityId) {
        await renderCurrent(props, true);
        break;
      }
      try {
        if (props.clickAction === 'ARM_HOME') await callAlarmoArm(settings, settings.alarmEntityId, 'home');
        else if (props.clickAction === 'ARM_AWAY') await callAlarmoArm(settings, settings.alarmEntityId, 'away');
        else if (props.clickAction === 'DISARM') await callAlarmoDisarm(settings, settings.alarmEntityId, settings.alarmCode || undefined);
      } catch {
        // فشل التسليح/التعطيل (زي وجود مستشعرات مفتوحة) - المستخدم
        // هيشوف الحالة الحقيقية لما نحدّث الويدجت تحت، ولو محتاج
        // يتصرف (زي تجاوز مستشعر مفتوح) هيفتح التطبيق نفسه.
      }
      await renderCurrent(props, true);
      break;
    }
    case 'WIDGET_DELETED':
    default:
      break;
  }
}
