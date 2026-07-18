# Bugs & Fixes — Family HA

*[English below Arabic / الإنجليزية أسفل العربية]*

توثيق كل مشكلة حقيقية اتكشفت، سببها الجذري، والحل — عشان محدش يكرر
نفس التشخيص أو يرجع لنفس الغلطة.
Documented root causes and fixes for every real bug found, so nobody
repeats the same diagnosis or the same mistake.

---

## العربية

### ✅ مشاكل حُلَّت

**مجلد `src/` كان ناقص من الرفعة الأولى** — `App.tsx` كان بيستورد من
10 مسارات تحت `src/` غير موجودة خالص، فالمشروع ما كانش بيُبنى. اتصلح
برفع `src/`/`android/`/`ios/`/`assets/` كاملين.

**أسماء ملفات الإعداد غلط** (`_gitignore` بدل `.gitignore` وهكذا) —
مرفوعة بشرطة سفلية بدل نقطة، فـ Git/ESLint/Prettier ما كانوش
بيتعرفوا عليها خالص. اتصلحت بإعادة التسمية.

**شاشة سوداء بعد أول تشغيل** — الـ JS bundle كان بيتحمّل لكن الواجهة
ما كانتش بترتسم. السبب الحقيقي: Metro (على بيئة LXC) مكنش بيلاحظ
تغييرات الملفات صح (مشكلة `watchman`/`inotify` معروفة في بعض بيئات
الـ containers). الحل: `pm2 restart metro` مع `--reset-cache` ومسح
`watchman` كامل — بقت خطوة روتينية بعد أي تعديل جوهري.

**كراش كامل عند فتح البث المباشر للكاميرا** — كان بيقفل التطبيق
فورًا. جُرِّبت فرضيات كتير (صلاحيات، cache قديم) قبل ما نلاقي السبب
الحقيقي: **React Native 0.83 بيشغّل New Architecture إجباريًا بغض
النظر عن `newArchEnabled` في `gradle.properties`**. تركه `false` عمل
تناقض داخلي خلّى بعض المكتبات (زي `react-native-webrtc` وقتها،
و`@react-native-community/geolocation` بعدين) ترفض تولّد كود
Codegen بتاعتها بشكل صحيح. الحل النهائي: `newArchEnabled=true` دايمًا
(يطابق الواقع الفعلي). **درس مهم:** الكراش الأصلي مالوش علاقة حقيقية
بـ New Architecture من الأساس — كانت شغالة إجباريًا طول الوقت.

**تجمد كامل عند فتح قائمة كبيرة (4677 عنصر)** — السبب: كنا برندر كل
عناصر القائمة بـ `.map()` عادي بدل قائمة افتراضية (Virtualized). رسم
آلاف المكوّنات دفعة واحدة بيجمّد الـ JS thread. اتصلح باستخدام
`FlatList` حقيقية بترسم بس اللي ظاهر على الشاشة.

**مستشعرات Alarmo مش بتظهر كاملة** — افترضنا إن سجل الكيانات القياسي
في HA (`config/entity_registry/list`) هيدّينا كل مستشعرات Alarmo عن
طريق مطابقة `config_entry_id`، لكن اتضح إن المستشعرات بتفضل مملوكة
لتكاملها الأصلي (زي Zigbee2MQTT)، مش لـ Alarmo. الحل: اختيار يدوي
للمستشعرات من الإعدادات بدل الاعتماد على استنتاج غير موثوق.

**التنبيه فوق شاشة القفل مش بيشتغل إلا لما الموبايل مقفول** — عكس
المتوقع. السبب: `setFullScreenIntent` وحدها بتشتغل بس لما الشاشة
مقفولة/مطفية. لإظهار التنبيه في أي وقت (حتى والموبايل شغال)، لازم
كمان صلاحية "العرض فوق التطبيقات الأخرى" (`SYSTEM_ALERT_WINDOW`) —
بتدّي أندرويد استثناء (BAL exemption) يسمح بفتح الشاشة من خدمة خلفية
مباشرة.

**نغمة الإنذار كانت بتشغّل نغمة المنبه الافتراضية** بدل نغمة التطبيق
المختارة، ومكنتش بتتخطى وضع الصامت. الحل: تشغيل ملف الصوت الفعلي
المختار (`siren_classic/digital/pulse.wav`) عبر `AudioAttributes` مع
`USAGE_ALARM` صراحة — القناة دي بتتخطى الصامت/عدم الإزعاج تلقائيًا.

**شاشة تنبيه الإنذار كانت عربي ثابت** بغض النظر عن لغة التطبيق
المختارة — لأنها كود Kotlin أصلي، مش React Native، فمكانتش بتستخدم
نظام i18n بتاعنا خالص. اتصلحت بملف نصوص منفصل (`AlarmStrings.kt`)
بثلاث لغات، تتقرا من الإعداد المحفوظ وقت تفعيل المراقبة.

### ⚠️ قيود معروفة (مش أخطاء، قرارات واعية)
- **`jest` غير مثبَّتة عمدًا** — مذكورة في `jest.config.js` بس مش في
  `package.json`. جُرِّب تثبيتها (`jest`/`@types/jest`/`react-test-
  renderer`/`@types/react-test-renderer`) والتحقق بتثبيت نضيف كامل
  أكتر من مرة، واتأكد إنها بتسبب تعارض أنواع حقيقي (مش تجميلي) مع
  `@types/react-native-vector-icons` (بتسحب `@types/react-native@
  0.70.19` قديمة) يكسر `npm run typecheck` فعليًا. القرار: تفضل غير
  مثبّتة لحد ما نلاقي نسخة متوافقة.
- **اسم مشروع iOS لسه "HelloWorld"** — إعادة التسمية محتاجة macOS/
  Xcode فعلي للتأكد من عدم كسر الربط الداخلي، وغير قابلة للاختبار في
  بيئة Linux بتاعتنا الحالية.
- **`@types/react-native-vector-icons`** بتسحب `@types/react-native`
  قديمة، بتسبب تحذير أنواع تجميلي في `npm run typecheck` (من غير
  `--skipLibCheck`) — غير مؤثر على البناء الفعلي، ومُتوقع أصلًا عبر
  `skipLibCheck: true` في إعدادات TypeScript الموروثة من React Native.

---

## English

### ✅ Resolved

**`src/` folder missing from the first upload** — `App.tsx` imported
from 10 paths under `src/` that didn't exist, so the project couldn't
build at all. Fixed by uploading the complete `src/`/`android/`/
`ios/`/`assets/` folders.

**Wrong config file names** (`_gitignore` instead of `.gitignore`,
etc.) — uploaded with an underscore instead of a dot, so Git/ESLint/
Prettier never recognized them. Fixed by renaming.

**Black screen after first launch** — the JS bundle loaded but the UI
never rendered. Root cause: Metro (on the LXC dev environment) wasn't
detecting file changes correctly (a known `watchman`/`inotify` issue
in some container environments). Fix: `pm2 restart metro` with
`--reset-cache` plus a full `watchman` cache wipe — now a routine step
after any significant change.

**Full crash on opening a camera's live stream** — closed the app
instantly. Several hypotheses were tried (permissions, stale cache)
before finding the real cause: **React Native 0.83 forces the New
Architecture on regardless of `newArchEnabled` in
`gradle.properties`**. Leaving it `false` created an internal
contradiction that made some libraries (`react-native-webrtc` at the
time, later `@react-native-community/geolocation`) refuse to generate
their Codegen output correctly. Final fix: `newArchEnabled=true`,
always (matching what's actually happening). **Key lesson:** the
original crash was never really about the New Architecture — it had
been forced on the whole time.

**Total freeze opening a large list (4,677 items)** — caused by
rendering every list item with a plain `.map()` instead of a
virtualized list. Rendering thousands of components synchronously
froze the JS thread. Fixed with a real `FlatList`, which only renders
what's actually visible on screen.

**Alarmo sensors not showing completely** — we assumed HA's standard
entity registry (`config/entity_registry/list`) would return all of
Alarmo's sensors via a shared `config_entry_id`, but sensors actually
stay owned by their original integration (e.g. Zigbee2MQTT), not by
Alarmo. Fixed with manual sensor selection in settings instead of
relying on an unreliable inference.

**Lock-screen alert only worked when the phone was locked** — the
opposite of intended. Cause: `setFullScreenIntent` alone only fires
when the screen is locked/off. To show the alert at any time (even
while the phone is actively in use), the app also needs the "display
over other apps" (`SYSTEM_ALERT_WINDOW`) permission — which grants
Android a background-activity-launch exemption allowing the screen to
be opened directly from a background service.

**Alarm siren played the phone's default alarm tone** instead of the
app's chosen tone, and didn't bypass silent mode. Fixed by playing the
actual selected sound file (`siren_classic/digital/pulse.wav`) via
`AudioAttributes` with `USAGE_ALARM` explicitly set — that channel
bypasses silent/DND mode automatically.

**Alarm alert screen was always in Arabic** regardless of the app's
chosen language — because it's native Kotlin code, not React Native,
so it never used our i18n system at all. Fixed with a separate
strings file (`AlarmStrings.kt`) covering all three languages, read
from the saved preference when monitoring is enabled.

### ⚠️ Known limitations (deliberate decisions, not bugs)
- **`jest` is deliberately not installed** — referenced in
  `jest.config.js` but missing from `package.json`. Installing it
  (`jest`/`@types/jest`/`react-test-renderer`/`@types/react-test-
  renderer`) was tried and verified, more than once, with a fully
  clean reinstall — it causes a real (not cosmetic) type conflict with
  `@types/react-native-vector-icons` (which pulls in an old
  `@types/react-native@0.70.19`) that actually breaks
  `npm run typecheck`. Decision: leave it uninstalled until a
  compatible version is available.
- **iOS project is still named "HelloWorld"** — renaming it safely
  needs a real macOS/Xcode environment to verify nothing internal
  breaks, and isn't testable in our current Linux-only environment.
- **`@types/react-native-vector-icons`** pulls in an old
  `@types/react-native` as a transitive dependency, causing a cosmetic
  type-checking warning under `npm run typecheck` (without the
  implicit `--skipLibCheck`) — doesn't affect the real build, and is
  already handled by `skipLibCheck: true` in the TypeScript config
  inherited from React Native.

### ⛔ مفتوحة (لسه بدون حل)
**تاب الداشبورد: يفضل عالق على شاشة تحميل HA ("Loading data") -
بروتوكول External Authentication/External Bus** — طبّقنا البروتوكول
الرسمي بالكامل (developers.home-assistant.io/docs/frontend/external-
authentication + external-bus)، بما فيه جسر `window.externalAppV2`
كامل، والرد على `config/get` بنفس الحقول بالظبط اللي تطبيق HA الرسمي
بيرجّعها (من لوجات حقيقية لتطبيق Android الرسمي على GitHub)، وإرسال
`connection-status:connected` بروحنا مع إعادة محاولة كل 150ms.
**النتيجة:** كل الرسائل بتتبعت وتتقبل بنجاح (مؤكَّد بسجل تشخيص مباشر
🐛)، لكن `getExternalAuth` (طلب التوكن الفعلي) ما بيتنادوش خالص،
والصفحة بتعمل reload كامل تلقائي كل ~60 ثانية في حلقة متكررة.
وصلنا لحد أقصى ممكن نوصله بالتوثيق العام - محتاج دليل مباشر من
console بتاع متصفح حقيقي (Chrome DevTools على كمبيوتر) فاتح نفس رابط
الداشبورد بـ `?external_auth=1` بدل الاستمرار في التخمين. **مؤجَّل.**

**تاب الداشبورد: Browser Mod بيوري "version mismatch" ويعمل reload
تلقائي، بس جوه تطبيقنا بس** — نفس الداشبورد بيشتغل عادي في متصفح
عادي على نفس الموبايل (اتأكد بالفعل من المستخدم)، يبقى المشكلة خاصة
بـ WebView بتاعتنا تحديدًا. **محاولات جُرِّبت ولم تنجح:**
(1) `cacheEnabled={false}` (افترضنا HTTP cache عادي، اتصلح نفس
المشكلة قبل كده مع خريطة OSM). (2) `incognito` (افترضنا Service
Worker منفصل بيخزّن نسخة قديمة من ملفات Browser Mod). **الاتنين
جُرِّبوا وماتغيّرش أي حاجة خالص.** يحتاج تشخيص أعمق بدليل حقيقي (زي
console logs من جوه الـ WebView نفسها) بدل التخمين - مؤجَّل لحد ما
نلاقي وسيلة نشوف بيها الخطأ الفعلي بدل ما نجرب حلول عشوائية.

### ⛔ Open (not resolved yet)
**Dashboard tab: stuck on HA's "Loading data" splash — External
Authentication/External Bus protocol** — implemented the full official
protocol, including a complete `window.externalAppV2` bridge, a
`config/get` response matching the official Android app's exact
fields (confirmed from real GitHub logs), and a self-initiated
`connection-status:connected` message retried every 150ms. **Result:**
every message we send is confirmed accepted (live 🐛 debug log), but
`getExternalAuth` (the actual token request) is never called at all,
and the page fully reloads in a repeating ~60-second loop. We've
reached the limit of general documentation — next step needs real
evidence from a desktop browser's console loading the same URL with
`?external_auth=1`. **Deferred.**

**Dashboard tab: Browser Mod shows "version mismatch" and auto-reloads,
but only inside our app** — the same dashboard works fine in a regular
mobile browser on the same phone (confirmed by the user), so this is
specific to our WebView. **Attempted fixes that didn't work:**
(1) `cacheEnabled={false}` (assumed regular HTTP cache — this fixed a
similar issue with the OSM map before). (2) `incognito` (assumed a
separate Service Worker caching a stale copy of Browser Mod's files).
**Neither changed anything at all.** Needs deeper diagnosis with real
evidence (e.g. console logs from inside the WebView) instead of
guessing — deferred until we have a way to see the actual error
instead of trying more blind fixes.
