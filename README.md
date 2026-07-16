# Family HA — MKDD

*[العربية أسفل الصفحة / Arabic below](#العربية)*

## English

A React Native (CLI, not Expo) Android app that gives your family a fast,
native front-end for **Home Assistant**, focused on the **Alarmo** alarm
integration, live camera streaming, family location, and a shared
calendar/shopping list — all without any paid cloud service, Google API
key, or third-party backend. Everything talks directly to your own Home
Assistant instance.

### Why this project exists

Home Assistant's own companion app and dashboards are great, but they're
general-purpose. This app is a **purpose-built control panel** for one
family's home security and daily life, with a UI tuned for the exact
things that family actually uses every day.

### Features

**🛡️ Alarmo (home tab)**
- Live status card + tap-to-arm/disarm mode badges (Home/Away/Night/
  Vacation/Custom), each confirmed with a swipe gesture.
- Optional biometric / device-PIN confirmation before any arm/disarm
  action actually executes.
- Quick summary cards for recent events, active warnings and connected
  sensors (each opens a detail sheet).
- **Lock-screen alert**: a native Android background service keeps a
  direct WebSocket connection to Home Assistant (independent of the
  app being open). If the alarm triggers, a full-screen alert appears
  **immediately, on top of everything — even the lock screen or a
  fully silent phone** — showing which sensor caused it, playing your
  chosen siren tone on the dedicated Android alarm channel (bypasses
  silent/DND mode), with a slide-to-disarm gesture that also asks for
  biometric/PIN confirmation.

**📷 Cameras**
- Live WebRTC streaming (via Home Assistant's `go2rtc`), with automatic
  fallback to periodic snapshots if the stream isn't available.
- Fullscreen/immersive viewing mode, live audio indicator, and PTZ
  (pan/tilt/zoom) controls (supports ONVIF and Reolink-style cameras).

**🗺️ Map**
- 100% free — OpenStreetMap via Leaflet, no Google Maps, no API key.
- Family members shown as an avatar row (à la Life360); tap one to see
  battery, distance, GPS accuracy and get real turn-by-turn directions
  in your phone's own maps app.
- "Nearby places" layer (restaurants, cafés, pharmacies…) from
  OpenStreetMap's free Overpass API.
- Distance calculations use the phone's **live GPS**, not a possibly
  stale Home-Assistant-reported location.

**👨‍👩‍👧 Family**
- Shared calendar (agenda or month view) built on Home Assistant
  `calendar.*` entities — add events directly from the app.
- Shopping/task lists built on Home Assistant `todo.*` entities,
  supports several separate lists, virtualised for large lists.

**⚙️ Settings**
- General settings (server URL, token, language, theme) live in one
  place; each tab also has its **own** settings behind a `⋮` button
  next to the connection status, so you're never hunting through one
  giant settings screen.
- Language: Arabic / English / Dutch, auto-detected from the device on
  first launch.
- Theme: Light / Dark / follows-system "Auto".

### Tech stack

React Native CLI 0.83 · TypeScript · Home Assistant REST + WebSocket
API · Alarmo services/events · `react-native-webrtc` · `react-native-
webview` + Leaflet/OpenStreetMap · `@react-native-community/
geolocation` · `react-native-keychain` (secure storage + biometrics) ·
native Kotlin (foreground service + full-screen alert Activity for the
lock-screen alarm) · OkHttp (native networking, no extra JS bridge
needed for the background alarm service).

### Project philosophy

- **Thin client, no extra backend.** Every feature is a UI on top of
  data/services Home Assistant already exposes — no server of our own.
- **Free and open by default.** OpenStreetMap over Google Maps,
  Overpass API over paid places APIs, no cloud build service.
- **Offline-first where it matters.** Last known Alarmo state, events
  and snapshots are cached and shown instantly, even if HA is briefly
  unreachable.

### Project documentation

| File | What's in it |
|---|---|
| `PROJECT_SUMMARY.md` | Current state of the app, feature-by-feature, plus what's intentionally *not* built yet and why. |
| `CHANGELOG.md` | Version-by-version history of what changed. |
| `BUGS_AND_FIXES.md` | Every bug found so far, its real root cause, and how it was fixed — kept so the same mistake isn't repeated. |

### Requirements

- A running Home Assistant instance with a Long-Lived Access Token.
- The [Alarmo](https://github.com/nielsfaber/alarmo) custom integration
  for the alarm features.
- Optional: `calendar.*` / `todo.*` entities (e.g. the built-in Local
  Calendar / Local To-do List integrations) for the Family tab.

---

## العربية

تطبيق أندرويد مبني بـ **React Native CLI** (مش Expo)، بيدّي عائلتك
واجهة سريعة وأصلية للتحكم في **Home Assistant**، بتركيز على نظام
الإنذار **Alarmo**، بث الكاميرات المباشر، مواقع أفراد العائلة،
وتقويم/قوائم تسوق مشتركة — كل ده من غير أي خدمة سحابية مدفوعة، أو
مفتاح Google API، أو أي backend خارجي. التطبيق بيتكلم مباشرة مع
سيرفر Home Assistant بتاعك بس.

### ليه المشروع ده موجود

تطبيق ولوحات Home Assistant الرسمية كويسة، بس عامة الغرض. التطبيق ده
**لوحة تحكم مخصصة** لأمان بيت وحياة عائلة واحدة بالتحديد، بواجهة
متظبطة على بالظبط الحاجات اللي العائلة دي بتستخدمها يوميًا.

### المميزات

**🛡️ Alarmo (التاب الرئيسي)**
- كارت حالة حية + بادجات تسليح/تعطيل بالدوس (منزلي/خارجي/ليلي/إجازة/
  مخصص)، كل واحد بيتأكد بحركة سحب.
- تأكيد اختياري بالبصمة أو رقم قفل الجهاز قبل تنفيذ أي تسليح/تعطيل
  فعليًا.
- كروت ملخص سريعة لآخر الأحداث والتحذيرات النشطة والمستشعرات المتصلة
  (كل واحد بيفتح تفاصيل كاملة).
- **تنبيه فوق شاشة القفل**: خدمة خلفية أصلية (native) في أندرويد
  بتحافظ على اتصال WebSocket مباشر بـ Home Assistant (بشكل مستقل عن
  فتح التطبيق). لو الإنذار اشتغل، بيظهر تنبيه بشاشة كاملة **فورًا،
  فوق أي حاجة — حتى شاشة القفل أو موبايل في وضع صامت تمامًا** —
  بيوضح سبب التريجر (أي مستشعر اللي فتح)، وبيشغّل نغمة الإنذار اللي
  اخترتها على قناة الإنذار المخصصة في أندرويد (بتتخطى وضع الصامت/عدم
  الإزعاج)، مع سحب للتعطيل بيطلب كمان تأكيد بصمة/رقم.

**📷 الكاميرات**
- بث مباشر WebRTC (عن طريق `go2rtc` بتاع Home Assistant)، مع رجوع
  تلقائي لصور دورية لو البث مش متاح.
- وضع مشاهدة بشاشة كاملة، مؤشر صوت حي، وتحكم PTZ (تحريك/تكبير) —
  بيدعم كاميرات ONVIF وReolink.

**🗺️ الخريطة**
- مجانية 100% — OpenStreetMap عن طريق Leaflet، من غير Google Maps ولا
  أي مفتاح API.
- أفراد العائلة كصف صور دائرية (زي Life360)؛ دوس على أي حد تشوف
  البطارية والمسافة ودقة الموقع، وتاخد توجيه حقيقي في تطبيق الخرائط
  بتاعك.
- طبقة "أماكن قريبة" (مطاعم، كافيهات، صيدليات...) من Overpass API
  المجاني بتاع OpenStreetMap.
- حساب المسافة بيستخدم **GPS الموبايل الحي**، مش موقع Home Assistant
  اللي ممكن يكون قديم.

**👨‍👩‍👧 العائلة**
- تقويم مشترك (أجندة أو شهر) مبني على كيانات `calendar.*` بتاعة Home
  Assistant — تضيف أحداث مباشرة من التطبيق.
- قوائم تسوق/مهام مبنية على كيانات `todo.*`، بتدعم أكتر من قائمة
  منفصلة، ومُحسّنة (virtualized) للقوائم الكبيرة.

**⚙️ الإعدادات**
- الإعدادات العامة (رابط السيرفر، التوكن، اللغة، المظهر) في مكان
  واحد؛ وكل تاب كمان عنده إعداداته **الخاصة** خلف زرار `⋮` جمب مؤشر
  الاتصال، عشان متدوّرش في شاشة إعدادات عملاقة واحدة.
- اللغة: عربي / إنجليزي / هولندي، بتتكشف تلقائي من الجهاز أول تشغيل.
- المظهر: فاتح / غامق / "تلقائي" بيتبع نظام الموبايل.

### التقنيات المستخدمة

React Native CLI 0.83 · TypeScript · Home Assistant REST + WebSocket
API · خدمات/أحداث Alarmo · `react-native-webrtc` · `react-native-
webview` + Leaflet/OpenStreetMap · `@react-native-community/
geolocation` · `react-native-keychain` (تخزين آمن + بصمة) · Kotlin
أصلي (خدمة خلفية + شاشة تنبيه كاملة لتنبيه شاشة القفل) · OkHttp
(اتصال شبكة أصلي، من غير الحاجة لـ JS bridge لخدمة الإنذار الخلفية).

### فلسفة المشروع

- **عميل خفيف، من غير backend إضافي.** كل ميزة هي واجهة فوق بيانات/
  خدمات Home Assistant بيوفرها أصلًا — مفيش سيرفر بتاعنا خالص.
- **مجاني ومفتوح بشكل افتراضي.** OpenStreetMap بدل Google Maps،
  Overpass API بدل خدمات أماكن مدفوعة، مفيش خدمة بناء سحابية.
- **Offline-first في الحاجات المهمة.** آخر حالة معروفة لـ Alarmo،
  والأحداث، والصور، متخزنة وبتظهر فورًا حتى لو HA مش متاح مؤقتًا.

### توثيق المشروع

| الملف | محتواه |
|---|---|
| `PROJECT_SUMMARY.md` | حالة التطبيق الحالية، ميزة بميزة، وكمان إيه اللي *مش* متعمل عمدًا ولسه وليه. |
| `CHANGELOG.md` | تاريخ التغييرات إصدار بإصدار. |
| `BUGS_AND_FIXES.md` | كل باگ اتكشف لحد دلوقتي، سببه الحقيقي، وإزاي اتصلح — محفوظ عشان مانكررش نفس الغلطة. |

### المتطلبات

- سيرفر Home Assistant شغال ومعاه Long-Lived Access Token.
- تكامل [Alarmo](https://github.com/nielsfaber/alarmo) المخصص لمميزات
  الإنذار.
- اختياري: كيانات `calendar.*` / `todo.*` (زي تكاملات Local Calendar /
  Local To-do List المدمجة) لتاب العائلة.
