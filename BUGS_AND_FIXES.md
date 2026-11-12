# Bugs & Fixes — Family HA

*[English below Arabic / الإنجليزية أسفل العربية]*

توثيق كل مشكلة حقيقية اتكشفت، سببها الجذري، والحل — عشان محدش يكرر
نفس التشخيص أو يرجع لنفس الغلطة.
Documented root causes and fixes for every real bug found, so nobody
repeats the same diagnosis or the same mistake.

---

## العربية

### ✅ مشاكل حُلَّت

**`getEntityRegistry is not a function` بعد deploy (كاش metro قديم)** — بعد
إضافة دوال جديدة في `homeAssistant.ts` (مثل `getEntityRegistry`) وعمل deploy،
طلع Render Error إن الدالة `undefined` — مع إن الكود سليم و`tsc` عدّى. **السبب
الجذري:** `pm2 restart metro` **مابيمسحش** كاش metro، فقدّم نسخة قديمة مخبّأة من
موديول `homeAssistant` (من غير الدالة الجديدة) بينما App.tsx اتعمله transform
جديد بينده عليها. ده بيحصل غالبًا لما تتغيّر الـimports/exports. **الحل:** مسح كاش
metro قبل الـrestart: `rm -rf /tmp/metro-* /tmp/haste-* && pm2 restart metro`،
واتضاف لسكربت الديبلوي تلقائيًا. **درس:** أي تغيير في exports موديول لازم
الـdeploy يمسح كاش metro، مش بس restart.

**إخفاء قائمة اختيار اللوحة سابقًا كسر حفظ `alarmEntityId`** — بعد ما
خبّينا قائمة اختيار كيان Alarmo (لما يكون فيه واحد بس)، التطبيق بقى يستعمل
`alarms[0]` للعرض لكن `settings.alarmEntityId` فضل فاضي، فمميزات بتعتمد عليه
(تنبيه شاشة القفل) كانت بتقول "اختار كيان Alarmo الأول". الحل: effect بيحفظ
الكيان أوتوماتيك لو مفيش واحد محفوظ أو المحفوظ مش موجود.

**شاشة الإنذار (لما التطبيق مقفول) كانت بتظهر صامتة وثابتة** — أول ما
المراقبة في الخلفية اشتغلت، بقت شاشة الإنذار تظهر لكن من غير اهتزاز ولا
أي حركة، مجرد خلفية حمرا وزر. **السبب الجذري المهم:** الأنيميشن والعدّاد
والنبض اللي اتضافوا في `App.tsx` بتاعين شاشة React Native اللي بتظهر لما
التطبيق **قدّام** بس. لما التطبيق مقفول/في الخلفية، اللي بيظهر هو
`AlarmActivity` **النيتف** (Kotlin) — شاشة تانية خالص مالهاش علاقة بكود
React، وكانت بسيطة من غير اهتزاز ولا أنيميشن. الحل: إضافة صلاحية
`VIBRATE`، واهتزاز متكرر زي المكالمة (على قناة الإنذار عشان يتخطى الصامت)،
ونبض على الدرع + تدرّج في لون الخلفية، جوه `AlarmActivity` نفسها. **درس:**
أي تحسين بصري لشاشة الإنذار لازم يتعمل في **الاتنين** (RN للواجهة +
النيتف للخلفية). تعديل نيتف = محتاج build جديد، مش metro.

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

**فحص TypeScript كان بيعدّي من غير ما يفحص حاجة** — `tsconfig.json`
بيطلب أنواع `jest` وهي مش متثبتة، فـ`tsc` بيطلع بخطأ عام (TS2688) وبيوقف
الفحص الدلالي بالكامل. يعني "typecheck نضيف" معناها إن مفيش فحص حصل
أصلًا، وده خبّى 11 خطأ حقيقي (منهم باج تشغيل فعلي، تحت). الحل: `jest`
و`@types/jest` و`react-test-renderer` كـ devDependencies (إصدارات قالب
React Native الرسمي) + سكريبت `npm test`، فبقى `npm run typecheck` فعلي
وأخضر. **اتحقّقنا** إن الـ lockfile اتضاف فيه 76 حزمة بس من غير تغيير أي
إصدار موجود. اختبار `App.test.tsx` القديم (قالب RN الافتراضي) اتشال: ما كانش
بيشتغل أصلًا (ناقص `react-test-renderer`) ومحتاج mock لـ10+ مكتبة native.

**`updateAlarmMonitorToken` مش مستورد في `App.tsx`** — بيتنادى في listener
تجديد التوكن من غير import → ReferenceError وقت التشغيل ("Property
'updateAlarmMonitorToken' doesn't exist")، وعلى الأرجح هو نفس سبب رسالة
الخطأ اللي ظهرت قبل كده عند تغيير الإعدادات مع OAuth. التعديل القديم
(try/catch جوه `AlarmMonitor.ts`) ما كانش بيعالج السبب الحقيقي. الأثر
الأخطر: ده الطريق الوحيد اللي بيوصّل التوكن المتجدد للخدمة الخلفية
(التنبيه فوق شاشة القفل)، فكانت بتفضل بالتوكن القديم. اتصلح بالاستيراد،
واتكشف بـ`tsc` الفعلي.

**أرقام feature bits لأوضاع التسليح غلط (مرتين)** — الأصل: Vacation=16
وCustom=32 (متبادلين). ومحاولة التصحيح الأولى حطت Vacation=8 وده `TRIGGER`
اللي Alarmo بيضيفه دايمًا، فزرار Vacation كان بيظهر حتى لو الوضع مقفول في
Alarmo. القيم الصح من HA (`AlarmControlPanelEntityFeature`): HOME=1،
AWAY=2، NIGHT=4، TRIGGER=8، CUSTOM_BYPASS=16، VACATION=32، وAlarmo بيحسب
`supported_features` منها (`MODES_TO_SUPPORTED_FEATURES`). اتثبتت في
`HA_ALARM_FEATURE` مع `__tests__/alarmoModes.test.ts` يمنع رجوع الغلط.

**تكرار الأحداث (كل أسبوع/شهر/سنة) كان بيتبعت للخدمة الغلط** —
schema خدمة `calendar.create_event` مفيهاش `rrule` وبترفض أي مفتاح زيادة،
فأي حدث متكرر كان هيتـرفض. التكرار متاح بس في أمر WebSocket
`calendar/event/create` (`dtstart`/`dtend`/`rrule`، والـrrule بصيغة
`FREQ=YEARLY` من غير بادئة `RRULE:`). الأحداث العادية لسه بتروح للخدمة زي
ما هي، والمتكررة بس بتروح لـWebSocket (`src/api/calendarCommands.ts` +
`__tests__/calendarCommands.test.ts`). كمان اتصلح تنسيق الوقت (`9:00` →
`09:00`). **لسه محتاج تجربة على HA حقيقي** (راجع "مفتوحة").

**أخطاء أنواع (بدون أثر وقت التشغيل)** — تعريف المكتبة `WebView<P = undefined>`
بيخلّي الـprops من نوع `never` لو الـref اتكتب `useRef<WebView>` فبقى
`useRef<WebView<object>>`؛ و`ShouldStartLoadRequest` بيتستورد من
`react-native-webview/lib/WebViewTypes`؛ وفي الويدجت: خصائص style مش
موجودة في المكتبة (`marginEnd`، `flexWrap`) اتبدّلت بـ`marginRight` وعدد
ثابت للدوائر، ونوع `ColorProp` للألوان.

**`net::ERR_NAME_NOT_RESOLVED` في شاشة تسجيل الدخول (2.16.2)** — المستخدم
بيكتب عنوان السيرفر، و`normalizeUrl` كانت بتشيل آخر `/` بس من غير ما
تضيف بروتوكول. لو العنوان اتكتب من غير `https://`/`http://`، الـWebView
مكانش بيعرف يحمّله فبيطلع خطأ DNS الخام (شاشة بيضا بـ Error Code -2).
الحل: `normalizeUrl` اتنقلت لملف نقي `src/api/url.ts` (عشان تتختبر من غير
استيراد native) وبقت تضيف البروتوكول تلقائيًا — https للدومينات العامة،
http للعناوين المحلية (IP داخلي / localhost / `.local`) لأن تنصيبات HA
المحلية غالبًا http. وكمان اتضافت شاشة خطأ واضحة بزرار "جرب تاني" وعرض
العنوان اللي حاول يوصله بدل الصفحة الخام، واختبارات لـ`normalizeUrl`.

**كراش metro على السيرفر (2.16.4)** — لما شغّلنا metro على سيرفر لينكس
صغير (headless) عشان الموبايل يحمّل منه، metro كان بيقع بخطأ
`ENOENT: ... watch ... react-native-webrtc/android/build/...`. السبب إن
مراقب ملفات metro (FallbackWatcher، من غير watchman) بيحاول يراقب فولدر
build قديم جوه الحزمة مش موجود. الحل: `blockList` في `metro.config.js`
يتجاهل `node_modules/*/(android|ios)/(build|.cxx)` خالص، فمفيش فولدرات
بناء بتتراقب. (ملحوظة: react-native-webrtc مرحلة لاحقة ومش مستخدم حاليًا.)

**ترجمات أسباب فشل التسليح ناقصة (2.16.6)** — في كارت حدث "Arming failed"
كان السبب بيظهر `[missing "en.not_allowed" translation]`، لأن `EventCard`
بيعمل `i18n.t(data.reason)` لأي سبب، والمفاتيح `not_allowed` و`open_sensors`
و`invalid_code` مكانتش معرّفة. الحل: اتضافت المفاتيح التلاتة بثلاث لغات.

**المراقبة في الخلفية بتموت لما التطبيق يتقفل (2.16.11)** — خدمة الإنذار
النيتف كانت بتتخزّن لها **توكن OAuth قصير العمر** (بينتهي بعد ~نص ساعة) وقت
التفعيل. طول ما التطبيق مفتوح، الـJS بيجدّد التوكن ويبعته للخدمة
(`updateAlarmMonitorToken`). بس لما التطبيق يتقفل، الـJS ميت فمفيش تجديد →
التوكن بينتهي → WebSocket بتاع الخدمة يفشل المصادقة ويفضل يعيد المحاولة بنفس
التوكن المنتهي → الخدمة تبطّل تكتشف الـtriggers. ده بيخلي أهم ميزة أمان (إنذار
والتطبيق مقفول) ما تشتغلش. الحل: لما تفعّل "Lock screen alert" وانت على OAuth،
التطبيق بينشئ **Long-Lived Access Token** (عبر `auth/long_lived_access_token`،
بيدوم سنين) ويخزّنه ويعيد استخدامه، ويبعته للخدمة بدل التوكن القصير. فالخدمة
تفضل مصادَقة دايمًا حتى والتطبيق مقفول. (ملحوظة: على سامسونج كمان لازم إعفاء
التطبيق من توفير البطارية وإخراجه من "Sleeping apps".)

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

**`getEntityRegistry is not a function` after deploy (stale Metro cache)** —
after adding new functions to `homeAssistant.ts` (e.g. `getEntityRegistry`) and
deploying, a Render Error reported the function as `undefined` — even though the
source was correct and `tsc` passed. **Root cause:** `pm2 restart metro` does
**not** clear Metro's cache, so it served a stale cached `homeAssistant` module
(without the new function) while App.tsx was re-transformed to call it. This
mostly happens when imports/exports change. **Fix:** clear Metro's cache before
restarting: `rm -rf /tmp/metro-* /tmp/haste-* && pm2 restart metro`, now baked
into the deploy script. **Lesson:** any change to a module's exports requires the
deploy to clear Metro's cache, not just restart it.

**Hiding the panel picker earlier broke `alarmEntityId` persistence** — after
we hid the Alarmo-entity picker (when there is only one), the app used
`alarms[0]` for display but `settings.alarmEntityId` stayed empty, so features
that depend on it (the lock-screen alert) said "Select an Alarmo entity above
first." Fix: an effect now auto-saves the entity when none is stored or the
stored one no longer exists.

**Background alarm screen appeared silent and static** — once background
monitoring started working, the alarm screen showed up but with no
vibration and no motion — just a red background and a button. **Important
root cause:** the pulse/countdown/animations added to `App.tsx` belong to
the React Native screen, which only appears when the app is in the
**foreground**. When the app is closed/backgrounded, the screen shown is
the **native** `AlarmActivity` (Kotlin) — a completely separate screen
unrelated to the React code — and it was plain, with no vibration or
animation. Fix: added the `VIBRATE` permission, a call-like repeating
vibration (on the alarm channel so it bypasses silent mode), and a pulsing
shield + background gradient, inside `AlarmActivity` itself. **Lesson:**
any visual polish for the alarm screen must be done in **both** places (RN
for foreground, native for background). A native change needs a fresh
build, not metro.

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

**TypeScript "check" was passing without checking anything** —
`tsconfig.json` asks for `jest` types that were never installed, so `tsc`
exits with a global error (TS2688) and skips semantic checking entirely.
A "clean typecheck" therefore meant no check ran at all, which hid 11 real
errors (one a real runtime bug, below). Fix: `jest`, `@types/jest` and
`react-test-renderer` as devDependencies (official React Native template
versions) plus an `npm test` script, so `npm run typecheck` is real and
green. **Verified:** the lockfile gained 76 packages and no existing
version changed. The old `App.test.tsx` (default RN template) was removed:
it never ran (missing `react-test-renderer`) and would need mocks for 10+
native libraries.

**`updateAlarmMonitorToken` not imported in `App.tsx`** — called in the
token-refresh listener without an import → a runtime ReferenceError
("Property 'updateAlarmMonitorToken' doesn't exist"), most likely the same
cause as the error dialog seen earlier when changing settings under OAuth.
The earlier try/catch inside `AlarmMonitor.ts` did not address the real
cause. Worst impact: this is the only path that hands a refreshed token to
the background service (lock-screen alert), which therefore kept the old
one. Fixed by the import; found by the real `tsc` run.

**Wrong feature bits for arm modes (twice)** — originally Vacation=16 and
Custom=32 (swapped). The first fix set Vacation=8, which is `TRIGGER`, a
bit Alarmo always sets, so the Vacation button showed even when that mode
was disabled in Alarmo. Correct HA values (`AlarmControlPanelEntityFeature`):
HOME=1, AWAY=2, NIGHT=4, TRIGGER=8, CUSTOM_BYPASS=16, VACATION=32; Alarmo
builds `supported_features` from them (`MODES_TO_SUPPORTED_FEATURES`).
Pinned in `HA_ALARM_FEATURE` with `__tests__/alarmoModes.test.ts` to stop
a regression.

**Recurring events (weekly/monthly/yearly) went to the wrong API** — the
`calendar.create_event` service schema has no `rrule` and rejects extra
keys, so any recurring event would be refused. Recurrence exists only in
the WebSocket command `calendar/event/create` (`dtstart`/`dtend`/`rrule`,
with `rrule` as `FREQ=YEARLY`, no `RRULE:` prefix). One-off events still use
the service; only recurring ones use WebSocket (`src/api/calendarCommands.ts`
+ `__tests__/calendarCommands.test.ts`). Also fixed time formatting
(`9:00` → `09:00`). **Still needs a test on a real HA** (see "Open").

**Type errors (no runtime effect)** — the library declares
`WebView<P = undefined>`, which makes props `never` when the ref is written
`useRef<WebView>`, so it is now `useRef<WebView<object>>`;
`ShouldStartLoadRequest` is imported from
`react-native-webview/lib/WebViewTypes`; in the widget, style props the
library lacks (`marginEnd`, `flexWrap`) were replaced with `marginRight` and
a fixed number of circles, plus the `ColorProp` type for colors.

**`net::ERR_NAME_NOT_RESOLVED` on the login screen (2.16.2)** — the user
types the server address, and `normalizeUrl` only stripped trailing slashes
without adding a scheme. If the address was entered without `https://`/
`http://`, the WebView couldn't load it and showed the raw DNS error (blank
screen, Error Code -2). Fix: `normalizeUrl` was moved to a pure
`src/api/url.ts` (so it can be tested without native imports) and now adds
the scheme automatically — https for public domains, http for local
addresses (private IP / localhost / `.local`) since local HA installs are
usually http. Also added a clear error screen with a "Try again" button
showing the address it tried, instead of the raw page, plus `normalizeUrl`
tests.

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

**تكرار الأحداث: لسه ما اتجرّبش على HA حقيقي** — الحل مبني على قراءة مصدر
HA (schema أمر `calendar/event/create`) ومغطّى باختبار شكل الأمر، لكن ما
اتجرّبش على HA حي. بعض تكاملات التقويم ممكن ما تدعمش `rrule` (رسالة الخطأ
بتظهر في نافذة الإضافة).

**الويدجت: لسه ما اتجرّبت على جهاز** — الكود بيعدّي فحص الأنواع، لكن ما
اتبناش ولا اتجرّب على الموبايل بعد.

**الخدمة الخلفية مش بتجدد توكن OAuth بنفسها** — مؤكَّد من قراءة
`AlarmMonitorService.kt`: بتستخدم التوكن اللي بتاخده من JS بس ومفيهاش أي
منطق تجديد. التوكن عمره ~30 دقيقة، فلو التطبيق مفتحش فترة ممكن الخدمة
تفقد المصادقة، والتنبيه فوق شاشة القفل (وتنبيهات وصول/مغادرة العيلة) يقف
من غير ما حد يلاحظ. السلوك الفعلي على الجهاز لسه ما اتجرّبش. **الحل
المقترح:** تخزين `refresh_token` و`client_id` في الخدمة وتجديد التوكن لما
HA ترد `auth_invalid`. **بانتظار القرار.**

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

**Recurring events: not yet tried on a real HA** — the fix is built from HA's
source (the `calendar/event/create` command schema) and covered by a
command-shape test, but it has not run against a live HA. Some calendar
integrations may not support `rrule` (the error shows in the add dialog).

**Widget: not yet tried on a device** — the code passes the type check, but
it has not been built or run on a phone yet.

**The background service does not refresh the OAuth token itself** —
confirmed by reading `AlarmMonitorService.kt`: it only uses the token JS
hands it and has no refresh logic. The token lives ~30 minutes, so if the
app is not opened for a while the service can lose authentication, and the
lock-screen alert (and family arrival/departure alerts) can stop without
anyone noticing. Actual behavior on a device is untested. **Proposed fix:**
store the `refresh_token` and `client_id` in the service and renew the token
when HA answers `auth_invalid`. **Awaiting a decision.**
