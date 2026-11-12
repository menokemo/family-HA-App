# Family HA — MKDD  ·  "Secure Family"

*[العربية أسفل الصفحة / Arabic below](#العربية)*

> The app is published under the brand **Secure Family**. Internally the
> React Native project is still named `FamilyHA` and the Android package is
> `com.mkdd.familyha`.

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

**🏠 Central family configuration (admin → everyone)**
- The one technical family member configures the whole app **once** —
  cameras, alarm entity, sensors, dashboard, map zones, calendars, and the
  always-on lock-screen alert — then taps **"Publish as family config"**.
  Everyone else just installs the app and signs in; their settings arrive
  automatically and update instantly when the admin changes them.
- Powered by a small companion Home Assistant integration, **`secure_family`**
  (separate repo: <https://github.com/menokemo/secure-family-dmkd>), installed
  via HACS. It stores the config in HA's own `.storage` (persistent, local)
  and serves it over the local connection — no cloud.
- Admin-only, enforced server-side: only Home Assistant administrators can
  publish. Personal settings (connection, PIN code, biometric, theme,
  language) stay on each device and are never published.
- Non-admin members see a reduced Settings screen (only their personal
  options); everything central is managed for them.

**📡 Mobile-app bridge — presence without the official HA app**
- The app registers each phone with Home Assistant's own `mobile_app`
  integration and reports, over the local network:
  - **Background location** → a `device_tracker` for the map and home/away
    presence, even when the app is closed,
  - **Battery** level & charging state,
  - **Home Wi-Fi** SSID (a strong presence signal),
  - **Activity** (still / walking / running / driving) via Google Play
    Services.
- So family members get full presence/map/battery in Home Assistant
  **without installing the official HA Companion app**. Location is an
  explicit per-person opt-in; the rest reports once the device is registered.

**🔐 First-run permissions wizard**
- A single guided screen after login requests everything the app needs to
  run reliably in the background — notifications, location, background
  location, battery-optimization exemption, display-over-other-apps,
  full-screen alerts and activity recognition — each with its live status
  and a one-tap **Grant**.

### Architecture

```
Family member's phone  (Secure Family app)
   │  REST + WebSocket  (local network, point-to-point)
   ▼
Home Assistant ── Alarmo (alarm) · cameras/go2rtc · calendar/todo
   │              person/device_tracker · mobile_app (device data)
   └── secure_family integration  → stores & serves the family config
```

Everything is point-to-point between the phones and the family's own Home
Assistant server. There is no backend of ours, no cloud account, no paid
API, and — by design — no Firebase/Google push.

### Build & deploy workflow

Two kinds of change, two paths:

- **JavaScript/TypeScript changes ship over Metro — no rebuild.** A git
  bundle is uploaded; the server applies it, pushes to GitHub, clears the
  Metro cache and restarts Metro. The running debug app reloads the new JS.
- **Native changes (Kotlin / Gradle / `AndroidManifest.xml`) require a full
  Android APK build on Windows** (`gradlew assembleDebug`), then
  reinstalling. See `INSTALL-WINDOWS.md` and `DEPLOYMENT.md`.

`scripts/deploy-familyha.sh` (on the server) downloads the bundle, applies
it, runs `npm install`, **clears the Metro cache**, restarts Metro and
pushes to GitHub. CHANGELOG entries that need a native build are marked ⚠️.

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
| `CHANGELOG.md` | Version-by-version history of what changed (⚠️ marks versions that need a native APK build). |
| `BUGS_AND_FIXES.md` | Every bug found so far, its real root cause, and how it was fixed — kept so the same mistake isn't repeated. |
| `DEPLOYMENT.md` | How the deploy pipeline works (git bundle → server → GitHub, Metro cache, sharing). |
| `INSTALL-WINDOWS.md` | Building and installing the Android APK on Windows. |
| `LICENSE_AUDIT.md` | Audit of third-party licenses (confirms the app is free to build on and distribute). |

The central-config integration lives in its **own repo**,
[`secure-family-dmkd`](https://github.com/menokemo/secure-family-dmkd),
with its own README and install instructions (HACS custom repository).

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

**🗺️ الخريطة (بستايل Life360)**
- مجانية 100% — MapLibre GL + بلاطات OpenFreeMap (ثلاثية الأبعاد،
  إمالة/دوران بإصبعين)، من غير Google Maps ولا أي مفتاح API. ستايل
  الخريطة بيحترم الثيم: فاتح (positron) نهاري / غامق (dark) ليلي.
- **Bottom sheet قابل للسحب** فيه كل أفراد العائلة: صورة بحلقة ملونة
  ثابتة + الاسم + **العنوان الحقيقي** (reverse geocoding مجاني) +
  البطارية + آخر ظهور. اختيار أي فرد بيركّز عليه ويفتح تفاصيله.
- **المناطق (Places):** كيانات `zone.*` بتاعة HA بتترسم كدوائر ملونة
  بأسمائها (بيت/شغل/مدرسة).
- **المخاطر/الكوارث:** التطبيق بيقرا كيانات `geo_location.*` (زلازل،
  فيضانات، أعاصير، حرائق…) ويرسمها بعلامة ⚠️ + بانر لو في خطر قريب من
  أي فرد. المصادر بتتضاف من HA: **GDACS** (كوارث عالمية)، **USGS**
  (زلازل)، أو أي **GeoJSON/GeoRSS feed** محلي — كلها بتطلّع كيانات
  `geo_location` اللي التطبيق بيقراها تلقائي.
- **قيادة/سرعة + اتجاه**، **مسار حي** (قيادة/مشي/دراجة عبر OSRM)،
  **مسار حركة** بمدة قابلة للاختيار + تشغيل، **وضع متابعة**، و**تنبيه
  بطارية منخفضة**.
- طبقة "أماكن قريبة" (مطاعم، كافيهات...) من Overpass API المجاني.
- حساب المسافة بيستخدم **GPS الموبايل الحي**، مش موقع HA القديم.

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

**🏠 الإعداد المركزي للعائلة (الأدمن → الكل)**
- الفرد التقني الوحيد بيظبط التطبيق كله **مرة واحدة** — الكاميرات، كيان
  الإنذار، المستشعرات، الداشبورد، مناطق الخريطة، التقويمات، وتنبيه شاشة
  القفل الدائم — وبعدين يدوس **"انشر كإعداد عائلي"**. باقي الأفراد بس
  يحمّلوا التطبيق ويسجّلوا دخول؛ الإعدادات بتوصلهم تلقائيًا وبتتحدّث فورًا
  لما الأدمن يغيّر.
- بيشتغل بمكوّن صغير في Home Assistant اسمه **`secure_family`** (ريبو
  منفصل: <https://github.com/menokemo/secure-family-dmkd>)، بيتثبّت عبر
  HACS. بيخزّن الإعداد في `.storage` بتاع HA (دائم ومحلي) ويقدّمه عبر
  الاتصال المحلي — من غير أي سحابة.
- للأدمن بس، ومفروض من جهة السيرفر (الأدمن بس يقدر ينشر). الإعدادات
  الشخصية (الاتصال، الكود، البصمة، الثيم، اللغة) بتفضل على كل جهاز
  ومابتتنشرش أبدًا.
- الأفراد العاديين بيشوفوا شاشة إعدادات مختصرة (خياراتهم الشخصية بس)؛
  كل اللي مركزي بيتدار لهم.

**📡 جسر mobile_app — حضور من غير تطبيق HA الرسمي**
- التطبيق بيسجّل كل موبايل في تكامل `mobile_app` بتاع Home Assistant
  نفسه، وبيبعت عبر الشبكة المحلية:
  - **الموقع في الخلفية** → `device_tracker` للخريطة وحالة البيت/بره،
    حتى والتطبيق مقفول،
  - **البطارية** (النسبة والشحن)،
  - **واي‑فاي البيت** (SSID — إشارة حضور قوية)،
  - **النشاط** (ثابت/ماشي/بيجري/بيقود) عبر Google Play Services.
- فأفراد العائلة بياخدوا الحضور/الخريطة/البطارية في HA **من غير ما
  يحمّلوا تطبيق HA الرسمي**. الموقع opt-in لكل فرد؛ الباقي بيتبعت أول ما
  الجهاز يتسجّل.

**🔐 معالج الأذونات في أول تشغيل**
- شاشة واحدة بعد الدخول بتطلب كل اللي التطبيق محتاجه يشتغل صح في الخلفية
  — الإشعارات، الموقع، الموقع في الخلفية، استثناء البطارية، العرض فوق
  التطبيقات، تنبيهات ملء الشاشة، والنشاط — كل واحد بحالته وزر **"اسمح"**.

### المعمارية

```
موبايل الفرد  (تطبيق Secure Family)
   │  REST + WebSocket  (شبكة محلية، مباشر)
   ▼
Home Assistant ── Alarmo (الإنذار) · الكاميرات/go2rtc · calendar/todo
   │              person/device_tracker · mobile_app (بيانات الجهاز)
   └── مكوّن secure_family  → يخزّن ويقدّم الإعداد العائلي
```

كله مباشر بين الموبايلات وسيرفر Home Assistant بتاع العائلة. مفيش backend
بتاعنا، ولا حساب سحابي، ولا API مدفوع، و(عن قصد) مفيش Firebase/Google push.

### سير البناء والنشر

نوعين من التغيير، طريقتين:

- **تغييرات JavaScript/TypeScript بتتوزّع عبر Metro — من غير إعادة بناء.**
  بيترفع git bundle؛ السيرفر يطبّقه، يرفعه على GitHub، يمسح كاش Metro،
  ويعمل restart. التطبيق (debug) بيعيد تحميل الـJS الجديد.
- **التغييرات النيتف (Kotlin / Gradle / `AndroidManifest.xml`) محتاجة
  build كامل للـAPK على ويندوز** (`gradlew assembleDebug`) وإعادة تثبيت.
  شوف `INSTALL-WINDOWS.md` و`DEPLOYMENT.md`.

سكربت `scripts/deploy-familyha.sh` (على السيرفر) بينزّل الـbundle،
يطبّقه، يعمل `npm install`، **يمسح كاش Metro**، يعمل restart لـMetro،
ويرفع على GitHub. الإصدارات اللي محتاجة build نيتف متعلّمة بـ⚠️ في
CHANGELOG.

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
| `CHANGELOG.md` | تاريخ التغييرات إصدار بإصدار (⚠️ بتعلّم الإصدارات اللي محتاجة build نيتف). |
| `BUGS_AND_FIXES.md` | كل باگ اتكشف لحد دلوقتي، سببه الحقيقي، وإزاي اتصلح — محفوظ عشان مانكررش نفس الغلطة. |
| `DEPLOYMENT.md` | إزاي خط النشر شغّال (git bundle → السيرفر → GitHub، كاش Metro، المشاركة). |
| `INSTALL-WINDOWS.md` | بناء وتثبيت APK على ويندوز. |
| `LICENSE_AUDIT.md` | تدقيق تراخيص الطرف الثالث (بيأكد إن التطبيق حر للبناء والتوزيع). |

مكوّن الإعداد المركزي في **ريبو منفصل**،
[`secure-family-dmkd`](https://github.com/menokemo/secure-family-dmkd)،
بـREADME وتعليمات تثبيت خاصة بيه (HACS custom repository).

### المتطلبات

- سيرفر Home Assistant شغال ومعاه Long-Lived Access Token.
- تكامل [Alarmo](https://github.com/nielsfaber/alarmo) المخصص لمميزات
  الإنذار.
- اختياري: كيانات `calendar.*` / `todo.*` (زي تكاملات Local Calendar /
  Local To-do List المدمجة) لتاب العائلة.
