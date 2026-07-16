# Changelog — Family HA (MKDD)

*[English below Arabic / الإنجليزية أسفل العربية]*

---

## العربية

### [2.8.0] — 2026-07-16
- تنظيف شامل للكود: حذف كود/أنماط/مفاتيح ترجمة ميتة، تصحيح أسماء
  ملفات الإعداد (`.gitignore` وغيرها).
- إصلاح: نغمة الإنذار المختارة من التطبيق بقت تشتغل فعليًا (بدل نغمة
  المنبه الافتراضية)، على قناة الإنذار المخصصة في أندرويد اللي بتتخطى
  وضع الصامت.

### [2.7.0] — 2026-07-16
- سلايدر تعطيل الإنذار: إعادة بناء بالكامل (View قابل للسحب مباشرة
  بدل SeekBar) — أسرع وأنضف وبدون مشاكل بصرية.
- طلب مصادقة بصمة/رقم قفل الجهاز إجباري قبل تنفيذ التعطيل من شاشة
  التنبيه فوق شاشة القفل.

### [2.6.0] — 2026-07-16
- شاشة تنبيه الإنذار: تصميم كامل جديد (🛡 + سبب التريجر الفعلي + شكل
  محسّن)، ومترجمة بالكامل (عربي/إنجليزي/هولندي) — كانت عربي ثابت رغم
  اختيار لغة تانية في التطبيق.
- التنبيه بقى يظهر **في أي وقت** (مش بس لما الموبايل مقفول) بعد إضافة
  صلاحية "العرض فوق التطبيقات الأخرى".

### [2.5.0] — 2026-07-15
- **موقع GPS حي** للخريطة (`@react-native-community/geolocation`) —
  "المسافة مني" بقت دقيقة زي تطبيقات التنقل الحقيقية.
- إصلاح رابط "توجيه" في الخريطة (كان بيفتح Google Maps تلقائي بدل ما
  يدّي اختيار حقيقي بين التطبيقات).
- إصلاح: رقم الإصدار في الواجهة بقى بيتقرا ديناميكيًا من `app.json`.
- إعدادات لامركزية: كل تاب بقى فيه إعداداته الخاصة (زرار `⋮`).
- **تعطيل/تسليح بالبصمة** (Fingerprint/Face) كبديل للسحب اليدوي.

### [2.2.0] — 2026-07-14/15
- **تنبيه فوق شاشة القفل** (Foreground Service + Full-Screen Intent) —
  أكبر ميزة native في المشروع، بمقارنة مباشرة بتطبيق AlarmoGuard.
- **إعادة تصميم Alarmo بالكامل**: بادجات تفاعلية + سحب للتأكيد + كروت
  ملخص (أحداث/تحذيرات/مستشعرات) بدل التصميم القديم.
- **تاب العائلة الجديد**: تقويم (أجندة+شهر) وقوائم تسوق/مهام، مبنيين
  على كيانات HA (`calendar.*`/`todo.*`) — بمقارنة مباشرة بتطبيق
  FamilyWall.
- **نظام ثيمات** Light/Dark/Auto + أيقونة تطبيق جديدة (بدل أيقونة
  القالب الافتراضي).
- إعادة تصميم الخريطة بالكامل (أسلوب Life360) + طبقة "أماكن قريبة"
  مجانية (Overpass API) + لوحة أرقام PIN.
- تحسينات الكاميرات: تكبير الشاشة، مؤشر الصوت، تحكم PTZ.
- إصلاح جذري: كراش كامل عند فتح البث المباشر للكاميرا (كان سببه
  الحقيقي `newArchEnabled=false` في تناقض مع سلوك React Native 0.83
  الفعلي، مش عدم توافق في WebRTC كما ظننا في البداية).
- شاشة تسجيل دخول أولى + كشف لغة الجهاز تلقائيًا.

### [2ed upload] — 2026-07-13
- رفع مجلد `src/` كاملًا + `android/`/`ios/`/`assets/` — كانت ناقصة
  تمامًا في الرفعة الأولى، ما كان يخلي المشروع يُبنى أصلًا.

### [1st uploading]
- الهيكل الأساسي الأول للمشروع.

---

## English

### [2.8.0] — 2026-07-16
- Full project cleanup: removed dead code/styles/translation keys,
  fixed config file names (`.gitignore` and others).
- Fix: the app's chosen siren tone now actually plays (instead of the
  device's default alarm ringtone), on Android's dedicated alarm
  channel which bypasses silent mode.

### [2.7.0] — 2026-07-16
- Alarm disarm slider: fully rebuilt (a directly-draggable `View`
  instead of `SeekBar`) — faster, cleaner, no visual glitches.
- Biometric/device-PIN confirmation is now required before disarming
  from the lock-screen alert screen.

### [2.6.0] — 2026-07-16
- Alarm alert screen: full redesign (🛡 + the actual trigger reason +
  a cleaner layout), and fully localized (Arabic/English/Dutch) — it
  used to always show Arabic regardless of the app's chosen language.
- The alert now shows **at any time** (not just when the phone is
  locked) after adding the "display over other apps" permission.

### [2.5.0] — 2026-07-15
- **Live GPS location** for the map
  (`@react-native-community/geolocation`) — "distance from me" is now
  as accurate as a real navigation app.
- Fixed the map's "Navigate" link (it used to open Google Maps
  automatically instead of giving a real app-picker).
- Fix: the version number shown in the UI is now read dynamically from
  `app.json`.
- Decentralized settings: every tab now has its own settings behind a
  `⋮` button.
- **Biometric arm/disarm** (fingerprint/face) as an alternative to the
  manual swipe.

### [2.2.0] — 2026-07-14/15
- **Lock-screen alert** (Foreground Service + Full-Screen Intent) —
  the biggest native feature in the project, benchmarked directly
  against the AlarmoGuard reference app.
- **Full Alarmo redesign**: interactive badges + swipe-to-confirm +
  summary cards (events/warnings/sensors) replacing the old layout.
- **New Family tab**: calendar (agenda+month) and shopping/task lists,
  built on HA entities (`calendar.*`/`todo.*`) — benchmarked directly
  against the FamilyWall reference app.
- **Theme system**: Light/Dark/Auto + a new app icon (replacing the
  default template icon).
- Full map redesign (Life360-style) + free "nearby places" layer
  (Overpass API) + a PIN keypad.
- Camera improvements: fullscreen mode, audio indicator, PTZ controls.
- Root-cause fix: a full crash on opening a camera's live stream (the
  real cause was `newArchEnabled=false` conflicting with React Native
  0.83's actual behaviour, not a WebRTC incompatibility as first
  suspected).
- First-run login screen + automatic device-language detection.

### ["2ed upload"] — 2026-07-13
- Uploaded the full `src/` folder plus `android/`/`ios/`/`assets/` —
  these were completely missing from the first upload, so the project
  couldn't even build.

### ["1st uploading"]
- Initial project scaffold.
