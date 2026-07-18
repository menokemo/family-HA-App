package com.mkdd.familyha

/** نصوص شاشة/إشعار الإنذار بثلاث لغات - مستقلة عن نظام i18n بتاع React
 * Native لأن الكود ده كله native ولازم يشتغل حتى لو JS مش شغال. */
object AlarmStrings {
  private val strings = mapOf(
    "ar" to mapOf(
      "monitor_title" to "Family HA",
      "monitor_text" to "مراقبة الإنذار نشطة في الخلفية",
      "alert_title" to "🚨 تم تشغيل الإنذار",
      "alert_default_text" to "افتح للتعطيل",
      "screen_title" to "تم تشغيل الإنذار",
      "disarming" to "جاري التعطيل...",
      "disarm_failed" to "فشل التعطيل، حاول تاني",
      "swipe_hint" to "اسحب للتعطيل  ‹ ‹ ‹",
      "personLeft" to "{name} خرج من {zone}",
      "personArrived" to "{name} وصل {zone}",
      "familyLocation" to "موقع العائلة",
    ),
    "en" to mapOf(
      "monitor_title" to "Family HA",
      "monitor_text" to "Alarm monitoring active in background",
      "alert_title" to "🚨 Alarm triggered",
      "alert_default_text" to "Open to disarm",
      "screen_title" to "Alarm triggered",
      "disarming" to "Disarming...",
      "disarm_failed" to "Failed to disarm, try again",
      "swipe_hint" to "Swipe to disarm  ‹ ‹ ‹",
      "personLeft" to "{name} left {zone}",
      "personArrived" to "{name} arrived at {zone}",
      "familyLocation" to "Family location",
    ),
    "nl" to mapOf(
      "monitor_title" to "Family HA",
      "monitor_text" to "Alarmbewaking actief op de achtergrond",
      "alert_title" to "🚨 Alarm geactiveerd",
      "alert_default_text" to "Open om uit te schakelen",
      "screen_title" to "Alarm geactiveerd",
      "disarming" to "Uitschakelen...",
      "disarm_failed" to "Uitschakelen mislukt, probeer opnieuw",
      "swipe_hint" to "Veeg om uit te schakelen  ‹ ‹ ‹",
      "personLeft" to "{name} heeft {zone} verlaten",
      "personArrived" to "{name} is aangekomen bij {zone}",
      "familyLocation" to "Gezinslocatie",
    ),
  )

  fun get(language: String?, key: String): String {
    val lang = if (language != null && strings.containsKey(language)) language else "en"
    return strings[lang]?.get(key) ?: strings["en"]?.get(key) ?: key
  }
}
