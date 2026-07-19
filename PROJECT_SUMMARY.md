# Project Summary — Family HA (MKDD)

*[English below Arabic / الإنجليزية أسفل العربية]*

آخر تحديث: 2026-07-19 · Last updated: 2026-07-19

---

## العربية

### الفكرة والفلسفة
تطبيق Android (React Native CLI، **مش** Expo) بيدّي عائلة MKDD واجهة
تحكم مخصصة فوق Home Assistant بتاعتهم — إنذار Alarmo، كاميرات، مواقع،
تقويم/قوائم — من غير أي backend إضافي أو خدمة مدفوعة. كل قرار تقني في
المشروع بيتبع نفس القاعدة: **لو HA بيوفرها، استخدمها بدل ما تبنيها.**

### حالة كل ميزة (كاملة ✅ / جزئية ⚠️ / مؤجلة ❌)

| الميزة | الحالة | ملاحظات |
|---|---|---|
| اتصال HA + تسجيل دخول | ✅ | **OAuth2 رسمي** (زي تطبيق HA نفسه) هو الطريقة الأساسية دلوقتي؛ التوكن اليدوي لسه موجود كخيار متقدم للتوافق الخلفي |
| كشف لغة الجهاز تلقائيًا | ✅ | عربي/إنجليزي/هولندي، افتراضي إنجليزي لأي حاجة تانية |
| نظام الثيمات (فاتح/غامق/تلقائي) | ⚠️ | شغال في الشاشات الرئيسية وتاب العائلة (اتصلح)؛ الخريطة والكاميرا لسه بتاخد ألوان ثابتة (WebView/native، مش نفس القيد) |
| Alarmo: تسليح/تعطيل ببادجات + سحب للتأكيد | ✅ | |
| Alarmo: بصمة/رقم للتأكيد | ✅ | داخل التطبيق وفي شاشة التنبيه الخارجية |
| Alarmo: تنبيه فوق شاشة القفل (أي وقت) | ✅ | Foreground Service + Full-Screen Intent + Display-over-apps؛ نغمة مخصصة على قناة الإنذار (بتتخطى الصامت)؛ سبب التريجر؛ مترجمة native؛ سلايدر تعطيل بصمة/رقم |
| Alarmo: اختيار المستشعرات | ✅ | يدوي (Alarmo مفيهوش API موثّق لجلب قائمته الكاملة) |
| الكاميرات: WebRTC + Snapshot fallback | ✅ | إعادة محاولة تلقائية بدون صوت لو الطلب الأول فشل |
| الكاميرات: تكبير/صوت/PTZ/تدوير | ✅ | تدوير شاشة حقيقي، زوم بإصبع واحد (زوم بإصبعين قيد حقيقي في أندرويد مع WebRTC)، صوت مُصلَّح (react-native-incall-manager) |
| تاب الداشبورد (جديد) | ⚠️ | WebView لداشبورد Lovelace حقيقية، Kiosk Mode، حماية تنقّل؛ **معلّق**: صفحة تحميل HA بتفضل عالقة (بروتوكول External Bus، محتاج دليل console حقيقي - راجع BUGS_AND_FIXES) |
| الخريطة: MapLibre GL ثلاثية الأبعاد | ✅ | استبدلت Leaflet بالكامل - مباني بارتفاعات، إمالة/دوران بإصبعين، OpenFreeMap مجاني |
| الخريطة: مسار حي على الطريق | ✅ | OSRM مجاني، مسافة/وقت وصول بيتحدّثوا تلقائي |
| الخريطة: مسار الحركة (Timeline) | ✅ | دوسة طويلة على صورة الشخص، آخر 24 ساعة |
| الخريطة: تنبيهات وصول/مغادرة | ✅ | تشتغل حتى لو التطبيق مقفول (نفس بنية خدمة الإنذار الخلفية) |
| الخريطة: أماكن قريبة (Overpass API) | ✅ | مجاني، بدون مفتاح |
| الخريطة: مسافة بـ GPS حي | ✅ | `@react-native-community/geolocation` |
| تاب العائلة: تقويم (أجندة+شهر) | ✅ | تصميم كروت ملوّنة زي FamilyWall، تمييز "النهاردة"، كشف أعياد ميلاد |
| تاب العائلة: تذكيرات | ✅ | إعادة تسمية/تصميم من "قوائم تسوق" لـ "تذكيرات" (كروت ملوّنة) - نفس `todo.*` من HA |
| إعدادات لامركزية لكل تاب | ✅ | زرار `⋮` جمب مؤشر LIVE (Alarmo، الكاميرات، الداشبورد، الخريطة) |
| ألوان تفاعلية + عمق بصري | ✅ | رد فعل ضغط موحّد (PressableScale) في كل التطبيق، ظل للبادجات والكروت |
| Widget على شاشة الموبايل | ❌ | يحتاج مكتبة native جديدة (`react-native-android-widget`) أو Kotlin يدوي كامل — جلسة عمل منفصلة |
| Week View حقيقي للتقويم (شبكة ساعات) | ❌ | الأجندة والشهر موجودين، الأسبوع لسه لأ |
| تعطيل بـ NFC | ❌ | البصمة موجودة، NFC محتاج مكتبة native جديدة + تصميم تسجيل كارت |
| اسم مشروع iOS ("HelloWorld") | ❌ | تعديل محفوظ عمدًا — محتاج macOS/Xcode فعلي للتأكد، غير قابل للاختبار في بيئتنا الحالية |

### قرارات تقنية مهمة (وليه)
- **newArchEnabled=true دايمًا.** React Native 0.83 بيشغّل New
  Architecture إجباريًا بغض النظر عن القيمة المكتوبة في
  `gradle.properties` — تركه `false` بيعمل تناقض بيخلي بعض المكتبات
  (زي `@react-native-community/geolocation`) ترفض تولّد كود Codegen
  بتاعتها. اتأكد إن كراش الكاميرا القديم (كان سبب تعطيلها الأول) مالوش
  علاقة حقيقية بـ New Architecture من الأساس.
- **مستشعرات Alarmo مُختارة يدويًا**، مش مجلوبة تلقائيًا — Alarmo
  بيخزّن قائمته الكاملة في ملف تخزين داخلي (`alarmo.storage`) من غير
  WebSocket command موثّق ومستقر لقراءتها.
- **شاشة تنبيه الإنذار كود Kotlin أصلي بالكامل**، مش React Native —
  عشان تشتغل حتى لو JS مش شغال أو الخدمة استُدعيت وقت التطبيق مقفول
  تمامًا.
- **الترجمة في شاشة الإنذار الأصلية منفصلة عن i18n بتاع RN**
  (`AlarmStrings.kt`) لنفس السبب — الكود ده لازم يشتغل من غير أي
  اعتماد على JS.

### القيود المعروفة (موثّقة بالتفصيل في `BUGS_AND_FIXES.md`)
- بيئة التطوير (LXC/Metro) حساسة لتشغيل أكتر من عملية `git pull`/
  `gradle` في نفس الوقت — دايمًا اتأكد من جلسة `tmux` واحدة نضيفة.
- `@types/react-native-vector-icons` بيسحب نسخة قديمة من
  `@types/react-native` كـ dependency، بيسبب تحذير أنواع تجميلي في
  `npm run typecheck` (من غير `--skipLibCheck` الصريح) — مش مؤثر على
  البناء الفعلي.

---

## English

### Idea and philosophy
An Android app (React Native CLI, **not** Expo) giving the MKDD family
a purpose-built control panel on top of their own Home Assistant —
Alarmo alarm, cameras, locations, calendar/lists — with no extra
backend or paid service. Every technical decision follows one rule:
**if Home Assistant already provides it, use that instead of building
it ourselves.**

### Feature status (Done ✅ / Partial ⚠️ / Deferred ❌)

| Feature | Status | Notes |
|---|---|---|
| HA connection + login | ✅ | **Official OAuth2** (same as the HA app) is now the primary path; manual token remains as an advanced fallback for backward compatibility |
| Automatic device-language detection | ✅ | Arabic/English/Dutch, defaults to English for anything else |
| Theme system (Light/Dark/Auto) | ⚠️ | Works on main screens and the Family tab (fixed); map and camera still use fixed colors (WebView/native, a different constraint) |
| Alarmo: arm/disarm via badges + swipe-to-confirm | ✅ | |
| Alarmo: biometric/PIN confirmation | ✅ | Both in-app and on the native lock-screen alert |
| Alarmo: lock-screen alert (any time) | ✅ | Foreground Service + Full-Screen Intent + Display-over-other-apps; custom siren on the alarm audio channel (bypasses silent mode); shows trigger reason; natively localized; biometric/PIN disarm slider |
| Alarmo: sensor selection | ✅ | Manual (Alarmo has no documented API for its full sensor list) |
| Cameras: WebRTC + snapshot fallback | ✅ | Automatic no-audio retry if the first attempt fails |
| Cameras: zoom/audio/PTZ/rotation | ✅ | Real screen rotation, one-finger zoom (two-finger pinch is a genuine Android+WebRTC limitation), fixed audio (react-native-incall-manager) |
| Dashboard tab (new) | ⚠️ | WebView for a real Lovelace dashboard, Kiosk Mode, navigation guard; **open issue**: HA's loading splash gets stuck (External Bus protocol, needs real console evidence — see BUGS_AND_FIXES) |
| Map: real 3D via MapLibre GL | ✅ | Fully replaced Leaflet — extruded buildings, two-finger tilt/rotate, free OpenFreeMap tiles |
| Map: live road route | ✅ | Free OSRM, distance/ETA update automatically |
| Map: movement timeline | ✅ | Long-press a person's photo, last 24 hours |
| Map: arrival/departure alerts | ✅ | Work even if the app is fully closed (same architecture as the alarm background service) |
| Map: nearby places (Overpass API) | ✅ | Free, no API key |
| Map: live-GPS distance | ✅ | `@react-native-community/geolocation` |
| Family tab: calendar (agenda + month) | ✅ | FamilyWall-style colored cards, "Today" callout, birthday detection |
| Family tab: reminders | ✅ | Relabeled/restyled from "shopping lists" to "reminders" (colored cards) — still the same HA `todo.*` under the hood |
| Decentralized per-tab settings | ✅ | `⋮` button next to the LIVE indicator (Alarmo, Cameras, Dashboard, Map) |
| Interactive colors + visual depth | ✅ | Unified press feedback (PressableScale) across the whole app, shadows on badges and cards |
| Home-screen widget | ❌ | Needs a new native library (`react-native-android-widget`) or fully manual Kotlin — a separate work session |
| True week view for the calendar | ❌ | Agenda and month exist; week view doesn't yet |
| NFC disarm | ❌ | Biometric exists; NFC needs a new native library + a tag-enrollment flow |
| iOS project name ("HelloWorld") | ❌ | Deliberately left as-is — needs real macOS/Xcode to rename safely, untestable in our current environment |

### Key technical decisions (and why)
- **`newArchEnabled=true`, always.** React Native 0.83 forces the New
  Architecture on regardless of what's written in `gradle.properties`
  — leaving it `false` created a real contradiction that made some
  libraries (like `@react-native-community/geolocation`) refuse to
  generate their Codegen output. We also confirmed the old camera
  crash was never actually about the New Architecture in the first
  place.
- **Alarmo sensors are picked manually**, not auto-fetched — Alarmo
  stores its full sensor list in its own internal storage
  (`alarmo.storage`), with no stable, documented WebSocket command to
  read it.
- **The alarm alert screen is 100% native Kotlin**, not React Native —
  so it still works even if the JS side isn't running, or the service
  is triggered while the app is fully closed.
- **The alert screen's translations live in their own file**
  (`AlarmStrings.kt`), separate from RN's i18n, for the same reason —
  that code must not depend on JS being alive at all.

### Known limitations (fully documented in `BUGS_AND_FIXES.md`)
- The dev environment (LXC/Metro) is sensitive to running more than
  one `git pull`/`gradle` process at the same time — always confirm a
  single, clean `tmux` session first.
- `@types/react-native-vector-icons` pulls in an old
  `@types/react-native` as a transitive dependency, causing a cosmetic
  type-checking warning under `npm run typecheck` (without the
  implicit `--skipLibCheck`) — it does not affect the actual build.
