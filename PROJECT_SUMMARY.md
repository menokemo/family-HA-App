# Project Summary — Family HA (MKDD)

*[English below Arabic / الإنجليزية أسفل العربية]*

آخر تحديث: 2026-07-16 · Last updated: 2026-07-16

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
| اتصال HA + تسجيل دخول أولي | ✅ | شاشة دخول تظهر تلقائي قبل أي إعدادات محفوظة |
| كشف لغة الجهاز تلقائيًا | ✅ | عربي/إنجليزي/هولندي، افتراضي إنجليزي لأي حاجة تانية |
| نظام الثيمات (فاتح/غامق/تلقائي) | ⚠️ | شغال في الشاشات الرئيسية، بعض الملفات الفرعية (الخريطة، الكاميرا، العائلة) لسه بتاخد الثيم الغامق ثابت |
| Alarmo: تسليح/تعطيل ببادجات + سحب للتأكيد | ✅ | |
| Alarmo: بصمة/رقم للتأكيد | ✅ | داخل التطبيق وفي شاشة التنبيه الخارجية |
| Alarmo: تنبيه فوق شاشة القفل (أي وقت) | ✅ | Foreground Service + Full-Screen Intent + Display-over-apps؛ نغمة مخصصة على قناة الإنذار (بتتخطى الصامت)؛ سبب التريجر؛ مترجمة native |
| Alarmo: اختيار المستشعرات | ✅ | يدوي (Alarmo مفيهوش API موثّق لجلب قائمته الكاملة) |
| الكاميرات: WebRTC + Snapshot fallback | ✅ | |
| الكاميرات: تكبير/صوت/PTZ | ✅ | PTZ يجرب ONVIF ثم Reolink buttons كبديل |
| الخريطة: OpenStreetMap + صف صور العائلة | ✅ | تصميم مستوحى من Life360 |
| الخريطة: أماكن قريبة (Overpass API) | ✅ | مجاني، بدون مفتاح |
| الخريطة: مسافة بـ GPS حي | ✅ | `@react-native-community/geolocation`، بديل عن موقع HA المخزَّن (ممكن يكون قديم) |
| تاب العائلة: تقويم (أجندة+شهر) | ✅ | عبر `calendar.*`، بما فيها إضافة حدث |
| تاب العائلة: قوائم تسوق/مهام | ✅ | عبر `todo.*`، قوائم متعددة، virtualized |
| إعدادات لامركزية لكل تاب | ✅ | زرار `⋮` جمب مؤشر LIVE |
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
| HA connection + first-run login | ✅ | Login screen shows automatically before any saved settings |
| Automatic device-language detection | ✅ | Arabic/English/Dutch, defaults to English for anything else |
| Theme system (Light/Dark/Auto) | ⚠️ | Works on the main screens; some sub-files (map, camera, family) are still hard-coded dark |
| Alarmo: arm/disarm via badges + swipe-to-confirm | ✅ | |
| Alarmo: biometric/PIN confirmation | ✅ | Both in-app and on the native lock-screen alert |
| Alarmo: lock-screen alert (any time) | ✅ | Foreground Service + Full-Screen Intent + Display-over-other-apps; custom siren on the alarm audio channel (bypasses silent mode); shows trigger reason; natively localized |
| Alarmo: sensor selection | ✅ | Manual (Alarmo has no documented API for its full sensor list) |
| Cameras: WebRTC + snapshot fallback | ✅ | |
| Cameras: fullscreen/audio indicator/PTZ | ✅ | PTZ tries ONVIF, then falls back to Reolink-style buttons |
| Map: OpenStreetMap + family avatar row | ✅ | Life360-inspired layout |
| Map: nearby places (Overpass API) | ✅ | Free, no API key |
| Map: live-GPS distance | ✅ | `@react-native-community/geolocation`, replacing the potentially-stale HA-reported location |
| Family tab: calendar (agenda + month) | ✅ | Via `calendar.*`, including adding events |
| Family tab: shopping/task lists | ✅ | Via `todo.*`, multiple lists, virtualized rendering |
| Decentralized per-tab settings | ✅ | `⋮` button next to the LIVE indicator |
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
