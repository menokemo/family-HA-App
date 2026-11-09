// شكل أمر WebSocket لإنشاء حدث متكرر في Home Assistant.
//
// دالة نقية (من غير أي استيراد native) عشان نقدر نختبرها بـjest، وتبقى هي
// "العقد" الواضح بين التطبيق وHA. المصدر: homeassistant/components/calendar/
// (handle_calendar_event_create + WEBSOCKET_EVENT_SCHEMA + validate_rrule).
//
// ليه WebSocket وليه مش خدمة calendar.create_event؟ لأن schema الخدمة مفيهاش
// rrule وبترفض أي مفتاح زيادة، أما أمر calendar/event/create فبيقبل rrule.
export type RecurrenceFreq = 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export type RecurringEventInput = {
  summary: string;
  /** YYYY-MM-DDTHH:mm:ss بالتوقيت المحلي لـHA (من غير timezone). */
  start: string;
  end: string;
  freq: RecurrenceFreq;
  description?: string;
  location?: string;
};

export function buildRecurringEventCommand(entityId: string, input: RecurringEventInput) {
  return {
    type: 'calendar/event/create',
    entity_id: entityId,
    event: {
      summary: input.summary,
      dtstart: input.start,
      dtend: input.end,
      // HA بيطلب نص فيه FREQ=... من غير بادئة "RRULE:"
      rrule: `FREQ=${input.freq}`,
      ...(input.description ? { description: input.description } : {}),
      ...(input.location ? { location: input.location } : {}),
    },
  };
}
