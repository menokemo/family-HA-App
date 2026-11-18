# Project Summary — Family HA (MKDD)

*[English below Arabic / الإنجليزية أسفل العربية]*

آخر تحديث: 2026-11-15 · Last updated: 2026-11-15

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
| نظام الثيمات (فاتح/غامق/تلقائي) | ⚠️ | شغال في الشاشات الرئيسية وتاب العائلة والخريطة (اتصلحت — الخريطة بقت تحترم الثيم)؛ الكاميرا لسه بتاخد ألوان ثابتة (native) |
| دعم التابلت / الوضع العرضي | ⚠️ | المرحلة أ: شريط جانبي (nav rail) عند عرض ≥700 + ضبط عرض الإعدادات (2.16.72). المرحلة ب (لسه): عمودين master-detail للإنذار والخريطة |
| Alarmo: تسليح/تعطيل ببادجات + سحب للتأكيد | ✅ | |
| Alarmo: بصمة/رقم للتأكيد | ✅ | داخل التطبيق وفي شاشة التنبيه الخارجية |
| Alarmo: تنبيه فوق شاشة القفل (أي وقت) | ✅ | Foreground Service + Full-Screen Intent + Display-over-apps؛ نغمة مخصصة على قناة الإنذار (بتتخطى الصامت)؛ سبب التريجر؛ مترجمة native؛ سلايدر تعطيل بصمة/رقم |
| Alarmo: اختيار المستشعرات | ✅ | يدوي (Alarmo مفيهوش API موثّق لجلب قائمته الكاملة) |
| الكاميرات: WebRTC + Snapshot fallback | ✅ | إعادة محاولة تلقائية بدون صوت لو الطلب الأول فشل |
| الكاميرات: تكبير/صوت/PTZ/تدوير | ✅ | تدوير شاشة حقيقي، زوم بإصبع واحد (زوم بإصبعين قيد حقيقي في أندرويد مع WebRTC)، صوت مُصلَّح (react-native-incall-manager) |
| الكاميرات: شبكة حيّة + كتم + إعادة اتصال (2.23.0) | ✅ | صور الشبكة بتتحدّث فعلاً كل X ثانية (مؤقّت واحد، بيقف بالخلفية/فتح كاميرا)، زرار كتم صوت حقيقي، وإعادة اتصال تلقائي 3 مرات قبل الوقوع على اللقطة |
| الكاميرات: حفظ لقطة للمعرض (2.24.0) | ✅ | زرار حفظ → `Pictures/SecureFamily` عبر `MediaStoreHelper.kt` النيتف (من غير مكتبة، MediaStore لأندرويد 10+ وMediaScanner للأقدم). لقطة طازة من HA عند الضغط فبتشتغل في الوضعين |
| تاب الداشبورد (جديد) | ⚠️ | WebView لداشبورد Lovelace حقيقية، Kiosk Mode، حماية تنقّل؛ **معلّق**: صفحة تحميل HA بتفضل عالقة (بروتوكول External Bus، محتاج دليل console حقيقي - راجع BUGS_AND_FIXES) |
| الخريطة: ستايل Life360 | ✅ | Bottom sheet قابل للسحب بلستة الأعضاء (صورة + حلقة ملونة + عنوان + بطارية + آخر ظهور)، علامات دائرية، أزرار تحكم |
| الخريطة: طبقة المخاطر/الكوارث | ✅ | بتقرا `geo_location.*` من HA (GDACS/USGS/GeoJSON) وترسمها ⚠️ + بانر "قريب من العيلة" |
| الخريطة: قيادة/سرعة + اتجاه | ✅ | محسوبة من فرق المواقع؛ على الكارت + سهم اتجاه على العلامة |
| الخريطة: Timeline متطور | ✅ | مدة (يوم/٣ أيام/أسبوع) + تشغيل يحرّك نقطة على المسار |
| الخريطة: أوضاع مسار + متابعة + تنبيه بطارية | ✅ | قيادة/مشي/دراجة، بانر بطارية <15%. **(2.26.3)** اختيار شخص = الكاميرا تفضل متابعاه (uncontrolled `initialViewState`، مترجعش للبيت)، وخط المسار الأزرق مايظهرش إلا عند الضغط على «From me»/«of home». **(2.26.2)** «of home» و«From me» بقوا مسافات **طريق** فعلية، وماعادش يقول «بيتحرك» وإنت جوّه منطقة |
| 🔔 جرس الباب بالكاميرا (مكالمة واردة) | ✅ | مرحلة ١+٢ (2.25.0 → 2.26.6): كاميرا لايف فورًا + كلام ثنائي (مايك عبر go2rtc backchannel) + شاشة رد موديرن (كتم مايك/صوت/إنهاء) + نغمات جرس يختارها الأدمن (native) + إنهاء المكالمة يرجّع التطبيق للخلفية لو الجرس صحّاه (native). تفاصيل في القسم المخصّص تحت |
| الخريطة: أماكن من التطبيق (Places CRUD) | ⏳ | الموجة 2 — إضافة/تعديل/حذف zones في HA من التطبيق (لسه) |
| الخريطة: ستايل بيحترم الثيم | ✅ | فاتح (positron) نهاري / غامق (dark) ليلي — OpenFreeMap مجاني |
| الخريطة: المناطق كدوائر (Places) | ✅ | `zone.*` من HA بتترسم كدوائر ملونة بأسمائها |
| الخريطة: عناوين حقيقية | ✅ | BigDataCloud مجاني (عربي)، مكان مين بره منطقة |
| الخريطة: نقطة موقعي الحية | ✅ | نقطة زرقاء لموقع الموبايل |
| الخريطة: موقع لايف عند الطلب (زي Find Hub) | ✅ | فتح كارت فرد يطلب موبايله يبعت كل ~10ث (حدث `familyha_live_request`)؛ يرجع عادي بعد دقيقتين؛ شارة LIVE؛ يحترم "شارك موقعك" (2.16.71، نيتف) |
| الخريطة: MapLibre GL ثلاثية الأبعاد | ✅ | استبدلت Leaflet بالكامل - مباني بارتفاعات، إمالة/دوران بإصبعين، OpenFreeMap مجاني |
| الخريطة: نقل للنيتف (MapLibre RN v11) | ✅ مطابقة للويب | المرحلة أ (2.16.82): `PeopleMapNative.tsx` بترسم بالـ GPU (أنعم/أسرع من WebView)، مفتاح تبديل "خريطة نيتف (تجريبي)" (افتراضي ويب)، تحميل كسول آمن مع fallback للويب، النقطة الزرقاء على Fused. **المرحلة ب (كاملة):** المناطق كدوائر + المخاطر + القمر الصناعي (2.16.85)، توحيد علامة "أنا" (2.16.86)، لستة الأعضاء + كارت الفرد + العناوين الحقيقية (2.16.89)، المسار + الملاحة OSRM + مسافة/ETA + قيادة/مشي/دراجة + فتح الخرائط (2.16.90)، التايملاين (مسار الحركة يوم/٣ أيام/أسبوع + تشغيل) + المتابعة + السرعة/الاتجاه + بانر بطارية ضعيفة (2.16.91). **كارت سفلي بتبويبات (2.16.92):** People (اللستة الغنية) / Devices (device_tracker مش مربوط بشخص + علامات على الخريطة) / Zones (المناطق) / Alerts (المخاطر) — الضغط على أي عنصر يركّز الكاميرا عليه. **التنظيم:** `mapShared.ts` (هيلبرز) + `MapSheet.tsx` (قشرة + تبويبات) + `PeopleList.tsx` + `SimpleList.tsx`. **المباني المجسّمة + أرقام المباني (2.16.97):** زرار 3D بيحوّل الستايل لـ OpenFreeMap Liberty (مباني مجسّمة fill-extrusion + أرقام مباني جاهزين) ويميل الكاميرا 55°. **باقي (اختياري):** نقل الويب بالكامل للنيتف (الويب لسه فيه نسخته من الهيلبرز). **ملاحظة خصوصية مستقبلية:** استضافة ذاتية للبلاطات/المسار/الـ geocode (دلوقتي خدمات خارجية عامة) |
| الخريطة: مسار حي على الطريق | ✅ | OSRM مجاني، مسافة/وقت وصول بيتحدّثوا تلقائي |
| الخريطة: مسار الحركة (Timeline) | ✅ | دوسة طويلة على صورة الشخص، آخر 24 ساعة |
| الخريطة: تنبيهات وصول/مغادرة | ✅ | تشتغل حتى لو التطبيق مقفول (نفس بنية خدمة الإنذار الخلفية) |
| الخريطة: أماكن قريبة (Overpass API) | ✅ | مجاني، بدون مفتاح |
| الخريطة: مسافة بـ GPS حي | ✅ | `@react-native-community/geolocation` |
| تاب العائلة: تقويم (شريط أيام + منتقي تاريخ) | ✅ | كروت ملوّنة بفئات (أيقونة/لون)، أحداث متكررة أسبوعي/شهري/سنوي عبر WebSocket (لسه محتاجة تجربة على HA حي)، إضافة حدث |
| تاب العائلة: تذكيرات | ✅ | نافذة إضافة/تعديل: عنوان + ملاحظات + تاريخ ووقت + فئة، واسم من أضافه؛ نفس `todo.*` من HA |
| إعدادات لامركزية لكل تاب | ✅ | زرار `⋮` جمب مؤشر LIVE (Alarmo، الكاميرات، الداشبورد، الخريطة) |
| ألوان تفاعلية + عمق بصري | ✅ | رد فعل ضغط موحّد (PressableScale) في كل التطبيق، ظل للبادجات والكروت |
| Widget على شاشة الموبايل | ⚠️ | اتبنى بـ`react-native-android-widget`: حالة الإنذار + Home/Away/Disarm + مين في البيت + عدد التذكيرات؛ لسه ما اتجرّبش على جهاز |
| حارس توافق HA (اختبارات عقد + فحص دوري لإصدارات HA) | ⚠️ | اتضافت اختبارات عقد (`npm test`) وفحص أنواع حقيقي؛ فحص دوري تلقائي لإصدارات HA مقترح، بانتظار القرار |
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
- **حساسات Alarmo بتتجلب تلقائيًا** عن طريق أمر WebSocket `alarmo/sensors`
  (بيرجّع dict مفتاحه entity_id = الحساسات المضافة في Alarmo فعلًا). ده
  صحّح افتراض قديم إن مفيش أمر موثوق — فيه، واستعملناه بدل الاختيار اليدوي.
  الاختيار اليدوي اتساب كـ fallback بس لو الأمر مرجّعش حاجة (نسخة قديمة).
- **شاشة تنبيه الإنذار كود Kotlin أصلي بالكامل**، مش React Native —
  عشان تشتغل حتى لو JS مش شغال أو الخدمة استُدعيت وقت التطبيق مقفول
  تمامًا.
- **الترجمة في شاشة الإنذار الأصلية منفصلة عن i18n بتاع RN**
  (`AlarmStrings.kt`) لنفس السبب — الكود ده لازم يشتغل من غير أي
  اعتماد على JS.
- **النشر عبر git bundle على Google Drive** (مش push مباشر) — عشان
  مانلمسش كونكتور GitHub الأساسي المستخدم في مشروع تاني أهم. تعديلات
  الـ JS بتتوزّع عبر metro بسكربت السيرفر؛ تعديلات النيتف محتاجة build
  APK جديد. **التفاصيل الكاملة وطريقة تشغيل السكربت في `DEPLOYMENT.md`،
  والسكربت نفسه في `scripts/deploy-familyha.sh`.**

### التوجه التجاري (قرارات ومخطط)
- **الاسم والهوية — ✅ تم:** اترابرَند باسم **Secure Family** في كل مكان
  (اسم العرض، الأيقونة لكل الكثافات، كل النصوص). الاسم الداخلي `FamilyHA`
  ومعرّف الحزمة `com.mkdd.familyha` زي ما هما عمدًا. اللوجو في
  `assets/branding/`، ومولّد الأيقونة `scripts/gen_icons.py`.
- **طبقة عازلة للإنذار (abstraction layer) — ✅ تم:** التطبيق بيكلّم واجهة
  `AlarmProvider` (`src/alarm/`) بدل ما يكلّم Alarmo مباشرة، وAlarmo أول
  تطبيق ليها. استبدالها بمحرّك خاص بينا لاحقًا = تغيير سطر واحد في
  `src/alarm/index.ts`. مغطّى باختبارات.
- **بوابة الشروط/إخلاء المسؤولية — ✅ تم:** موافقة إجبارية قبل الاستخدام،
  بتتحفظ محليًا بنسخة الشروط (`src/components/TermsGate.tsx`). النص مسودّة
  معقولة — تحتاج مراجعة قانونية قبل الإطلاق التجاري.
- **الترخيص آمن تجاريًا:** Alarmo وHome Assistant الاتنين Apache 2.0
  (استخدام تجاري مسموح، والكود المنشور مايتقفلش بأثر رجعي). فحص رخص كل
  تبعيات npm نضيف — **لا GPL/AGPL** (مفصّل في `LICENSE_AUDIT.md`).
- **قرار معماري:** مخ نظام الأمان يفضل في السيرفر (HA) اللي شغّال 24/7،
  مش في الموبايل.
- **قبل الإطلاق (to-do):** شروط استخدام + إخلاء مسؤولية؛ ملف إشعارات
  تراخيص الطرف الثالث (NOTICES)؛ تبريرات صلاحيات Google Play.
- **الخصوصية:** مفيش سيرفر عندنا — كل البيانات في الـ HA بتاع العميل،
  والعميل مسؤول عن سيرفره. ده بيقلّل التزامات GDPR جدًا.

### تبسيط الإعدادات للمستخدم غير التقني (خطة)
المبدأ: التطبيق يظبط نفسه ويخبّي التقني. الخطوات:
1. ✅ **تصفية الحساسات:** عرض الأبواب/الشبابيك/الحركة بس (device_class) بأسماء
   ودّية، + اكتشاف اللوحة تلقائيًا لو واحدة، + لغة أوضح. (2.16.18)
2. ⬜ معالج إعداد أول مرة (Wizard): اتصل → PIN → فعّل الحماية + الأذونات.
3. ⬜ قسم "إعدادات متقدمة" مطوي لإخفاء التفاصيل التقنية.
4. ⬜ كارت حالة الإعداد (✅ جاهز / ⚠️ محتاج حاجة).

**فكرة مؤجّلة:** تطوير "شخصية Home Assistant" بحيث لو المستخدم غيّر صورته من
التطبيق، تتغيّر في Home Assistant نفسه (رفع/تعيين صورة كيان person). محتاج بحث
في API المناسب (الصورة بتيجي من إعداد person مش مجرد state).

**معلّق — PTZ لسه مش بيظهر (v2.16.41):** الاكتشاف التلقائي بقى بيستخدم سجل
الكيانات/الأجهزة في HA ويجمع كيانات كل كاميرا حسب الجهاز ويكتشف تحكّم الـPTZ بشكل
عام. على جهاز الاختبار لسه مفيش زر PTZ بيظهر — يعني كاميرات المستخدم غالبًا كيانات
الـPTZ بتاعتها على جهاز مختلف في السجل، أو اسمها خارج نمط `pan/tilt/zoom/ptz`، أو
بتتحكّم عبر ONVIF من غير أي كيانات. الخطوة الجاية: فحص قائمة كيانات كاميرا PTZ
حقيقية عند المستخدم لضبط الاكتشاف. مؤجّل بطلب المستخدم.

**قيد التنفيذ — إعداد مركزي عبر Home Assistant (مرحلة ١ خلصت).** الفرد التقني يظبط التطبيق
كله مرة واحدة (كاميرات، كيان الإنذار، الداشبورد، الخريطة/المناطق…) وباقي الأسرة
يحمّلوا ويسجّلوا دخول بس — بدون إعداد لكل جهاز. تحت النقاش: تخزين الإعداد مركزيًا
في HA (الميل ناحية custom integration خفيف يخزّن JSON في `.storage` ويقدّمه/يستقبله
عبر websocket، والكتابة للأدمن بس)، والأدمن ينشر الإعداد من التطبيق نفسه ("انشر
كإعداد عائلي") بإعادة استخدام واجهة الإعدادات الحالية؛ تطبيقات الأسرة تجيب الإعداد
وتطبّقه عند الدخول مع تخزين مؤقت للأوفلاين. أسئلة مفتوحة: نشر من التطبيق أم لوحة
داخل HA؛ تفضيلات لكل مستخدم (PIN، الثيم، ربط الشخص) أم مقفول بالكامل؛ حساب HA منفصل
لكل فرد؛ تثبيت عبر HACS أم يدوي. **الحالة:** مكوّن `secure_family` اتبنى (تخزين في `.storage`، كيان `sensor.secure_family_config`، خدمات `set_config`/`rollback` للأدمن، كيانات تشخيص، config flow، CI، ترجمات) واتنشر على `github.com/menokemo/secure-family-dmkd` (يتثبّت عبر HACS custom repository). جزء التطبيق مرحلة ١ اتعمل (2.16.42): الأدمن ينشر من التطبيق، والأفراد يطبّقوا تلقائيًا عند الدخول مع تحديث فوري وcache أوفلاين. مرحلة ٢ اتعملت (2.16.43): واجهة إعدادات الأفراد اتقفلت حسب دور الأدمن. (2.22.1): `mapEngine` اتضاف للحقول المنشورة. **قاعدة مهمة للقايمة دي:** أي حقل بيعرّف الجهاز نفسه (`bleUuid`) أو بيشاور على عتاد مقترن بيه (عناوين MAC بتاعت البلوتوث) **ماينفعش ينتشر** — مش مسألة خصوصية، ده هيكسر الوظيفة أصلاً (كل الموبايلات تبث نفس المعرّف = الراصد مش هيفرّق بينهم). والحقول اللي بتشغّل خدمات وتاكل بطارية بتفضل بإيد صاحب الجهاز. الأسباب متكتوبة جنب القايمة في `src/family/familyConfig.ts` وعليها تستات.

**مخطّط — جسر mobile_app (عشان أفراد الأسرة ما يحتاجوش تطبيق HA الرسمي).**
نحاكي API بتاع `mobile_app`: نسجّل كل موبايل (`/api/mobile_app/registrations` →
webhook + device_tracker) ونبعت البيانات للـwebhook. النطاق المتفق عليه (الأربع
مجموعات): الموقع/الحضور (GPS + كشف واي‑فاي البيت)، حالة الجهاز (بطارية + شحن)،
أوامر أمان (HA→الموبايل: رنّ/لقّي + إشعارات)، والنشاط (ثابت/ماشي/بيقود + آخر
ظهور). **مرحلة A اتعملت (2.16.46، JS):** تسجيل + إرسال الموقع والتطبيق مفتوح +
مفتاح خصوصية لكل فرد ("شارك موقعك" في إعدادات الخريطة). **باقي builds نيتف**
(محتاجة APK ويندوز): الموقع في الخلفية عبر خدمة الـforeground، البطارية، SSID
واي‑فاي البيت، تمييز النشاط، FCM push + أوامر رنّ/لقّي — بالإضافة لـ**معالج
الأذونات في أول تشغيل** (إشعارات، overlay، full-screen، background location،
استثناء البطارية)، كلها مجمّعة في build نيتف.

**تسمية الجهاز (2.16.80):** الجهاز بيتسجّل باسم حقيقي من البداية (اسم محفوظ أو
اسم الشخص في HA، مش الافتراضي). تغيير الاسم بعد كده بيتم عبر
`config/device_registry/update` (`name_by_user`) — فوري ومن غير جهاز مكرر. ملاحظة
مهمة: `update_registration` في HA مابيعيدش التسمية بموثوقية، وكل `POST
/registrations` بيعمل جهاز جديد — فإعادة التسجيل للطوارئ بس. بنخزّن
`mobileAppDeviceId` للاستهداف الدقيق. (تفاصيل في `BUGS_AND_FIXES.md`.)

**دقة الموقع (2.16.81):** لازم المصدر يكون **Fused Location (Play Services)** زي
Find Hub — مش GPS الخام ولا `lastLocation` المخبّأ. النقطة الحية في التطبيق
بتُضبط بـ `setRNConfiguration({locationProvider:'playServices'})`، والخدمة النيتف
بتجيب موقع جديد بـ `getCurrentLocation(HIGH_ACCURACY)` وتفلتره قبل الإرسال لـ HA.

**الحضور بـ Geofencing بدل GPS الخام (2.16.93 — NATIVE، محتاج APK):** الحل الجذري
لتذبذب home↔away وإشعارات الدخول/الخروج. بدل ما نبعت GPS خام ونسيب HA يحسب الحضور
(بيتذبذب على حافة المنطقة لأن HA بيعتبرك داخلها لو دائرة الدقة بتتقاطع معها)، بقينا
نعمل زي التطبيق الرسمي وLife360: نسجّل مناطق HA كـ **geofences** في نظام التشغيل
(`GeofenceReceiver.kt` + `GeofencingClient`, ENTER/EXIT/DWELL + تهدئة)، ونبعت
**GPS + `location_name` مع بعض** (الاسم محسوب محليًا بـ hysteresis زي منطق HA) —
الحالة بتتحدد منّنا مش من GPS الخام (= صفر تذبذب)، والإحداثيات دايمًا موجودة (الشخص
يفضل ظاهر). util مشترك `GeoZones.kt`. التطبيق بيمرّر المناطق للخدمة عبر
`setMobileAppZones`. **وخريطتنا** بتعرض أي شخص في منطقة من غير إحداثيات في مركز
منطقته (`mapPeople`) فتبقى متينة لأي tracker. (ملاحظة 2.16.93 الأولى كانت بتوقف GPS
جوه المنطقة فالشخص بيختفي — اتصلّحت في 2.16.94. تفاصيل في `BUGS_AND_FIXES.md`.)

**جهاز نشط واحد لكل مستخدم + موافقة الأدمن (2.16.87 + المكوّن 0.3.3):** معرّف
ثابت للموبايل (`src/storage/deviceId.ts`) + خدمة `request_registration`. أول/نفس
الموبايل = تسجيل مباشر (صفر تكرار). موبايل جديد والحساب نشط = موافقة أدمن بكود
سرّي (عبر خدمة أدمن، مش مبثوث)، وعند الموافقة الجهاز القديم يتمسح ويخرج فورًا
(`familyha_force_logout`). الواجهة في `src/features/devices/`، ومنطق المكوّن في
`devices.py` + `device_store.py`. (تفاصيل في `BUGS_AND_FIXES.md`.)

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
| Theme system (Light/Dark/Auto) | ⚠️ | Works on main screens, the Family tab and the Map (fixed — the map now follows the theme); camera still uses fixed colors (native) |
| Alarmo: arm/disarm via badges + swipe-to-confirm | ✅ | |
| Alarmo: biometric/PIN confirmation | ✅ | Both in-app and on the native lock-screen alert |
| Alarmo: lock-screen alert (any time) | ✅ | Foreground Service + Full-Screen Intent + Display-over-other-apps; custom siren on the alarm audio channel (bypasses silent mode); shows trigger reason; natively localized; biometric/PIN disarm slider |
| Alarmo: sensor selection | ✅ | Manual (Alarmo has no documented API for its full sensor list) |
| Cameras: WebRTC + snapshot fallback | ✅ | Automatic no-audio retry if the first attempt fails |
| Cameras: zoom/audio/PTZ/rotation | ✅ | Real screen rotation, one-finger zoom (two-finger pinch is a genuine Android+WebRTC limitation), fixed audio (react-native-incall-manager) |
| Dashboard tab (new) | ⚠️ | WebView for a real Lovelace dashboard, Kiosk Mode, navigation guard; **open issue**: HA's loading splash gets stuck (External Bus protocol, needs real console evidence — see BUGS_AND_FIXES) |
| Map: Life360-style look | ✅ | Draggable member-list bottom sheet (avatar + colored ring + address + battery + last-seen), circular markers, control buttons |
| Map: hazard/disaster layer | ✅ | Reads HA `geo_location.*` (GDACS/USGS/GeoJSON), plots ⚠️ + "near family" banner |
| Map: driving/speed + heading | ✅ | Computed from consecutive positions; on the card + heading arrow on the marker |
| Map: advanced timeline | ✅ | Range (today/3 days/week) + Play animates a dot along the trail |
| Map: route modes + follow + battery alert | ✅ | Driving/walking/cycling, banner when battery <15%. **(2.26.3)** selecting a person keeps the camera following them (uncontrolled `initialViewState`, no drift back home); the blue route line only shows when you tap "From me"/"of home". **(2.26.2)** "of home" and "From me" are real **road** distances, and it no longer says "moving" while you're inside a zone |
| 🔔 Doorbell-with-camera (incoming call) | ✅ | Phase 1+2 (2.25.0 → 2.26.6): live camera instantly + two-way talk (mic via go2rtc backchannel) + modern answer screen (mute mic/sound/end) + admin-selectable ringtones (native) + ending the call sends the app to background if the doorbell woke it (native). See the dedicated section below |
| Map: Places from app (CRUD) | ⏳ | Wave 2 — add/edit/delete HA zones from the app (pending) |
| Map: theme-aware style | ✅ | Light (positron) by day / dark by night — free OpenFreeMap |
| Map: zones as Places circles | ✅ | HA `zone.*` drawn as labeled colored circles |
| Map: real addresses | ✅ | BigDataCloud free (Arabic), for anyone outside a zone |
| Map: live my-location dot | ✅ | Blue dot for the phone's own position |
| Map: real 3D via MapLibre GL | ✅ | Fully replaced Leaflet — extruded buildings, two-finger tilt/rotate, free OpenFreeMap tiles |
| Map: live road route | ✅ | Free OSRM, distance/ETA update automatically |
| Map: movement timeline | ✅ | Long-press a person's photo, last 24 hours |
| Map: arrival/departure alerts | ✅ | Work even if the app is fully closed (same architecture as the alarm background service) |
| Map: nearby places (Overpass API) | ✅ | Free, no API key |
| Map: live-GPS distance | ✅ | `@react-native-community/geolocation` |
| Family tab: agenda (Cozi-style) | ✅ | Single agenda across the shared calendars — each event = colored bar + title + time + **creator avatar & name** (`·by:` marker) and an optional **"for whom"** subject (`·for:`). Holidays show read-only with a flag badge. FAB add sheet: pick calendar (Annual/Planner) + title + optional subject + date (+ time for Planner). Long-press to delete (not holidays). Shared-calendar model + component v0.9.0 (2.31.0) |
| Family tab: agenda — day strip + month view | ✅ | A top day strip (4 weeks, dot on days with events) **filters the list to the selected day** (today by default); a top button toggles a **month grid** (coloured event dots, prev/next, tap a day to list its events). Strip + load window share the same 4-week range — 2.30.0/2.30.1 |
| Family tab: 3-tab shell | ✅ | Pill tabs Agenda · Tasks · Meals; `⋮` settings picks which calendars/lists show |
| Family tab: reminders | ✅ | Add/edit dialog: title + notes + date and time + category, and who added it (member avatar); still the same HA `todo.*` |
| Decentralized per-tab settings | ✅ | `⋮` button next to the LIVE indicator (Alarmo, Cameras, Dashboard, Map) |
| Interactive colors + visual depth | ✅ | Unified press feedback (PressableScale) across the whole app, shadows on badges and cards |
| Home-screen widget | ⚠️ | Built with `react-native-android-widget`: alarm state + Home/Away/Disarm + who is home + reminder count; not yet tried on a device |
| HA compatibility guard (contract tests + periodic check of HA releases) | ⚠️ | Contract tests (`npm test`) and a real type check were added; an automatic periodic check of HA releases is proposed, awaiting a decision |
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
- **Alarmo sensors are auto-fetched** via the `alarmo/sensors` WebSocket
  command (returns a dict keyed by entity_id = the sensors actually added to
  Alarmo). This corrected an earlier assumption that no reliable command
  existed — it does, and we now use it instead of manual selection. Manual
  selection remains only as a fallback when the command returns nothing (old
  Alarmo).
- **The alarm alert screen is 100% native Kotlin**, not React Native —
  so it still works even if the JS side isn't running, or the service
  is triggered while the app is fully closed.
- **The alert screen's translations live in their own file**
  (`AlarmStrings.kt`), separate from RN's i18n, for the same reason —
  that code must not depend on JS being alive at all.
- **Deployment goes through a git bundle on Google Drive** (not a direct
  push) — so we never touch the primary GitHub connector used by another,
  more important project. JS changes ship via metro with the server script;
  native changes need a fresh APK build. **Full details and how to run the
  script are in `DEPLOYMENT.md`, and the script itself is in
  `scripts/deploy-familyha.sh`.**

### Commercial direction (decisions and plan)
- **Name and identity — ✅ done:** rebranded **Secure Family** everywhere
  (display name, icon at every density, all text). The internal name
  `FamilyHA` and package id `com.mkdd.familyha` are deliberately unchanged.
  Logo in `assets/branding/`, icon generator at `scripts/gen_icons.py`.
- **Alarm abstraction layer — ✅ done:** the app talks to an `AlarmProvider`
  interface (`src/alarm/`) instead of Alarmo directly, with Alarmo as the
  first implementation. Swapping in our own engine later is a one-line change
  in `src/alarm/index.ts`. Covered by tests.
- **Terms / liability gate — ✅ done:** mandatory acceptance before use, stored
  locally by terms version (`src/components/TermsGate.tsx`). The text is a
  reasonable draft — needs legal review before a commercial launch.
- **Licensing is commercially safe:** Alarmo and Home Assistant are both
  Apache 2.0 (commercial use allowed; released code can't be clawed back).
  A full npm license audit is clean — **no GPL/AGPL** (see `LICENSE_AUDIT.md`).
- **Architecture rule:** the security "brain" stays server-side (HA), running
  24/7, not on the phone.
- **Before release (to-do):** Terms of Service + liability disclaimer; a
  third-party license NOTICES file; Google Play permission justifications.
- **Privacy:** we run no server — all data lives in the customer's own HA, and
  the customer owns their server. This greatly reduces GDPR obligations.

### Simplifying settings for non-technical users (plan)
Principle: the app configures itself and hides the technical parts. Steps:
1. ✅ **Sensor filtering:** show only door/window/motion sensors (by
   device_class) with friendly names, + auto-detect the panel when there's one,
   + clearer language. (2.16.18)
2. ⬜ First-run wizard: connect → PIN → enable protection + permissions.
3. ⬜ Collapsed "Advanced" section hiding the technical details.
4. ⬜ Setup status card (✅ ready / ⚠️ needs attention).

**Deferred idea:** develop "Home Assistant person" so that changing the photo in
the app updates it in Home Assistant itself (upload/set the person entity's
picture). Needs research into the right API (the picture comes from the person
config, not a plain state).

**Pending — PTZ still not appearing (v2.16.41):** auto-detection now uses the HA
entity/device registry (`config/entity_registry/list`) to group each camera's
entities by device and detect PTZ controls generically. On the test device no
PTZ button appears yet, so for the user's specific cameras the PTZ controls are
likely either on a different device in the registry, named outside the
`pan/tilt/zoom/ptz` pattern, or driven only through ONVIF with no entities. Next
step: inspect the real entity list of a known-PTZ camera on the user's HA to
tune detection. Deferred by user ("نرجعلها بعدين").

**In progress — central configuration via Home Assistant (phase 1 done).** The
technical family member should configure the whole app once (cameras, alarm
entity, dashboard, map/zones, etc.) and all other family members just install
and sign in — no per-device setup. Under discussion: store the config centrally
in HA (leaning toward a thin custom integration that persists a config JSON in
`.storage` and serves/accepts it over websocket, admin-only writes) and have the
admin publish it from the app ("Publish as family config"), reusing the existing
settings UI; family apps fetch and apply it on login, caching for offline. Open
questions: app-publish vs an HA-side panel; per-user overrides (PIN, theme,
person mapping) vs fully locked; separate HA logins per member; HACS vs manual
install. To be refined before implementation.

### Known limitations (fully documented in `BUGS_AND_FIXES.md`)
- The dev environment (LXC/Metro) is sensitive to running more than
  one `git pull`/`gradle` process at the same time — always confirm a
  single, clean `tmux` session first.
- `@types/react-native-vector-icons` pulls in an old
  `@types/react-native` as a transitive dependency, causing a cosmetic
  type-checking warning under `npm run typecheck` (without the
  implicit `--skipLibCheck`) — it does not affect the actual build.

### Professional polish roadmap — "a real security system"
Agreed direction (2026-11-11): take the app from "works" to something that,
at a glance, reads as a genuine security system. Four tracks, in priority
order:
1. **Critical security moments** — in progress (first batch in 2.16.10:
   triggered-state pulse + "intrusion detected" alert; arming/entry
   countdown). Next: make the whole triggered view more dramatic (fuller
   red, very prominent disarm).
2. **Visual consistency** — unify every screen and sheet (events, sensors,
   cameras, map, settings) into one design language: spacing, type, icons,
   colors.
3. **Information clarity and honesty** — open/closed sensors shown clearly,
   correct per-reason event messages, connection and last-updated indicators.
4. **Micro-interactions** — haptics on arm/disarm, smooth transitions,
   instant button feedback.

### خارطة طريق التلميع الاحترافي — "نظام أمان حقيقي"
اتجاه متفق عليه (2026-11-11): ننقل التطبيق من "بيشتغل" لحاجة من أول نظرة
تحس إنها نظام أمان جاد. أربع مسارات بالأولوية:
1. **لحظات الأمان الحرجة** — جارية (أول دفعة في 2.16.10: نبض حالة triggered
   + تنبيه "تم اكتشاف دخول"؛ عدّاد التسليح/الدخول). التالي: شاشة triggered
   أكثر دراما (أحمر أوضح، إلغاء بارز جدًا).
2. **اتساق بصري** — توحيد كل الشاشات والقوائم (أحداث/مستشعرات/كاميرات/خريطة/
   إعدادات) على لغة تصميم واحدة: مسافات، خطوط، أيقونات، ألوان.
3. **وضوح وصدق المعلومات** — مستشعرات مفتوح/مقفول بوضوح، رسائل أحداث صحيحة لكل
   سبب، مؤشرات اتصال وآخر تحديث.
4. **تفاصيل دقيقة** — اهتزاز عند التسليح/الإلغاء، انتقالات ناعمة، رد فعل فوري
   على الأزرار.

### خارطة طريق الخريطة — مقارنة بـ Life360 والتطبيقات المدفوعة
اتجاه متفق عليه (2026-11-15). بعد ما اتعمل: الخريطة النيتف، كارت سفلي بأربع
تبويبات (أفراد/أجهزة/مناطق/تنبيهات)، مسار وملاحة وETA، تايملاين ومتابعة،
geofencing + إرسال speed/battery الموثوق، أرقام ومباني مجسّمة. الناقص اتقسّم
بالأولوية والجدوى على معمارية Home Assistant:

**المجموعة ١ — قريبة وقيمتها عالية (البدء بيها):**
1. ✅/⏳ **إشعارات وصول/مغادرة لكل فرد باسم المكان** ("مينا وصل الشغل"). **اتعمل
   (2.17.2)** كعناصر في تبويب التنبيهات (كشف تغيّر المنطقة في JS). **الناقص:**
   إشعار نظام Android حقيقي (native/APK).
2. ✅/⏳ **تنبيه بطارية فرد ضعيفة** (≤15%). **اتعمل (2.17.2)** في تبويب التنبيهات.
   الناقص: إشعار نظام حقيقي.
3. ✅/⏳ **تنبيه فرد مش بيبعت موقع** (`last_updated` أقدم من نص ساعة). **اتعمل
   (2.17.2)** في تبويب التنبيهات. الناقص: إشعار نظام حقيقي.
4. ✅ **صورة الفرد كـ marker + بابل الاسم/المكان جنبه**. **اتعمل (2.17.2)** —
   مكوّن `PersonMarker`.
5. ✅ **تحريك الـ marker بسلاسة** بين التحديثات. **اتعمل (2.17.2)**.
6. ⏳ **زرار "اطلب موقع" (Ping)** يجبر موبايل الفرد يبعت موقعه حالًا. **مؤجّل** —
   محتاج شغل native (استقبال أمر/FCM) + سيرفر.
   > خلاصة: النقاط ٤-٥ خلصت JS بالكامل. النقاط ١-٣ ظاهرة دلوقتي في تبويب
   > التنبيهات؛ تحويلها لإشعارات نظام Android الحقيقية + زرار Ping = دفعة native
   > (APK) جاية.
7. ✅ **تبويب التنبيهات: فصل العيلة عن المخاطر + فلترة المخاطر (2.21.1).**
   التبويب بقى بعنوانين — «العيلة» (وصول/مغادرة، بطارية، مش بيبعت موقع)
   و«مخاطر قريبة» — بدل لستة واحدة مخلوطة كان التنبيه المهم بيضيع فيها.
   والمخاطر اتفلترت على **10كم** من البيت أو من أي فرد (HA بيجيب كل
   `geo_location.*` في البلد — كانت 52 حادثة أغلبها بعيدة). الفلترة **من
   المصدر** فالخريطة والبانر واللستة بنفس الرقم، ودالة واحدة مشتركة
   `filterNearbyHazards` في `mapShared.ts` بتخدم النيتف والويب (الويب كان عنده
   نسخة بنطاق 20كم وبتقيس على الأفراد بس — اتشالت).

8. ✅ **الاتجاهات الأربعة (2.22.0).** الخريطة بتلف مع اتجاه الموبايل (زرار
   بوصلة، بـ`trackUserLocation="heading"` من MapLibre — من غير مكتبة ولا نيتف)،
   واتجاه الفرد بالنسبة للبيت في كارته، واسم الاتجاه جنب سهم الحركة على العلامة.
   دالة `compassKey` مشتركة (8 اتجاهات) في `mapShared.ts`. **ناقص:** الخريطة
   الويب ماخدتش التلاتة دول (علامات الويب نسخة منفصلة).

**المجموعة ٢ — متوسطة:**
- ✅ **تفاصيل الرحلة** (وقت/مدة/مسافة/متوسط سرعة + تركيز الخريطة). **اتعمل (2.17.5)** — `segmentTrips`.
- تجميع الأفراد القريبين (clustering).
- إنشاء/تعديل المناطق من على الخريطة بسحب دايرة (بدل HA).
- وضع Live (تحديث سريع وانت فاتح على حد).

**المجموعة ٣ — صعبة أو خارج النطاق:**
- كشف الحوادث + تقييم سلوك القيادة (فرملة/تسارع/سرعة) — معالجة حسّاسات ثقيلة.
- SOS بإرسال طوارئ حقيقي/مساعدة على الطريق/حماية هوية — خدمات Life360 مش ميزات
  موقع. (لكن **SOS يبلّغ العيلة بموقعك** واقعي ونقدر نعمله.)

### مستشعرات الموبايل (mobile_app) — الموجود والناقص
الخدمة النيتف `MobileAppService` بتسجّل المستشعرات دي في HA وبتحدّثها كل 15 دقيقة،
بالإضافة لتحديث **لحظي** عند الأحداث (بلوتوث/قفل الشاشة/مكالمة/منبّه) بتجميع 1.5ث:

**البطارية والجهاز (من 2.16.x):** `battery_level` · `battery_state` · `is_charging` ·
`charger_type` · `battery_health` · `battery_temperature` · `storage_free` ·
`screen_on` (= `is_interactive` عند الرسمي) · `app_version` · `last_update`.

**الشبكة:** `network_type` · `wifi_connection` · `wifi_bssid` · `wifi_signal_strength`.

**الصوت والموقع:** `ringer_mode` · `do_not_disturb` · `detected_activity` ·
`geocoded_location`.

**اتضاف في 2.21.0:** `high_accuracy_mode`.

**اتضافوا في 2.20.0:** `beacon_monitor` · `ble_emitter` (اختياريين بمفتاح — تحت) · `bluetooth_state` · `bluetooth_connection` (عدد المتصلين +
أسماء الأجهزة في الـ attributes بنفس مفاتيح الرسمي) · `device_locked` · `next_alarm`. القراية في
`BluetoothHelper.kt` بنفس أسلوب `BluetoothUtils.kt` الرسمي. أهم استخدام عملي
لمستشعر البلوتوث: **سياق الحضور** — سماعة العربية متصلة = بيسوق، سماعة البيت
متصلة = جوّه، وده بيكمّل الـ GPS من غير أي تكلفة بطارية إضافية.

**✅ البيكونات (2.20.0) — بمفتاحين في إعدادات «الموقع والخريطة»، الاتنين مقفولين افتراضيًا:**
- `beacon_monitor` — رصد بيكونات iBeacon واستنتاج **الغرفة** (حضور جوّه البيت بدقة
  أعلى من GPS). الحالة `Monitoring`/`Stopped`/`Bluetooth is turned off`، والـattributes
  = اسم كل بيكون (`uuid_major_minor`) → مسافته المقدّرة مرتّبين بالأقرب.
- `ble_emitter` — الموبايل يبث كـ iBeacon عشان ESPHome/Room Assistant يرصده. UUID
  خاص لكل موبايل بيتولّد مرة واحدة وبيتعرض في الإعدادات للنسخ. major/minor ثابتين
  (100/40004 زي افتراضي الرسمي) — كل موبايل متميّز بـUUID بتاعه فمش محتاجين نعرّضهم.
- **اتعملوا من غير مكتبة خارجية** (`BleBeacons.kt`): الرسمي بيستخدم AltBeacon،
  وإحنا بـ`BluetoothLeScanner`/`BluetoothLeAdvertiser` وفك تنسيق iBeacon بإيدينا
  بنفس التخطيط، ومعادلة المسافة بنفس معادلة AltBeacon المنشورة.
- **البطارية:** المسح **بدورات** (ثانيتين كل 10 ثواني) مش مستمر زي الرسمي
  (1.1ث/0.5ث). الأذونات (`BLUETOOTH_SCAN`/`BLUETOOTH_ADVERTISE`) بتتطلب **في لحظة
  تشغيل المفتاح** مش في معالج الأذونات، عشان مانزعّجش اللي مش هيستخدم الميزة.
- **لسه ممكن يتضاف لو احتجناه:** فلتر UUID (نرصد بيكونات معيّنة بس)، وتحكّم في
  فترة المسح وقوة البث من الإعدادات، وفلتر Kalman للـRSSI (الرسمي بيستخدمه؛ إحنا
  دلوقتي متوسط متحرك بسيط — كفاية لترتيب الغرف).

**اتشالوا في 2.21.2:** `phone_state` و`sim_1_signal_strength` و`mobile_data` —
كانوا محتاجين `READ_PHONE_STATE` اللي أندرويد بيعرضه كـ«إجراء وإدارة المكالمات».
النص ده غير مقبول لتطبيق أمان عيلي والمقابل ثانوي. (`mobile_data` كان مكرّر مع
`network_type` كمان.) **ماينفعش يترجّعوا** — التفاصيل في `BUGS_AND_FIXES.md`.

**مستشعرات الرسمي اللي قرّرنا مانعملهاش:** مستشعرات الحسّاسات الخام
(accelerometer/gyroscope/pressure/light/proximity) — معدّل تحديثها عالي جدًا وبتغرّق
HA ببيانات مالهاش استخدام في تطبيق عائلي. `sim_2` و`sim_2_signal_strength` —
نضيفهم لو حد في العيلة بيستخدم خطين.

### دقة الموقع والحضور — تلات طبقات (2.21.0)
القاعدة اللي وصلنا لها بعد قراية `person/entity.py` و`device_tracker/entity.py`
و`zone/__init__.py`: **الحضور اليقيني جوّه البيت مابيجيش من تحسين الـGPS، بيجي من
دليل مستقل عن الـGPS.** وده أولوية HA نفسها:

```
latest = latest_connected or latest_legacy_home or latest_gps or latest_not_home
```
`latest_connected` = تراكر `tracking_type: connection` ومعاه `in_zones`. والتعليق في
كود HA بيقول إن راوتر أو بيكون بيبلّغ إنه في منطقة = أوثق إشارة حضور. **تراكر
`mobile_app` دايمًا `position`** فمستحيل ياخد الخانة دي — محجوزة لتكاملات جوّه HA.

| الطبقة | الدقة | الحالة |
|---|---|---|
| ١. GPS/Fused (BALANCED) | 10–30م جوّه، أمتار بره | ✅ الافتراضي (2.19.0) |
| ٢. وضع الدقة العالية (HIGH_ACCURACY بمُشغّل) | أمتار **بره** البيت؛ بيفرق أقل جوّه | ✅ اختياري (2.21.0) |
| ٣. مرساة البلوتوث → `in_zones` | يقيني جوّه البيت | ✅ اختياري (2.21.0) |
| ٤. ESP32 يرصد `ble_emitter` → تراكر `connection` | يقيني + **أولوية HA العليا** | ⏳ محتاج ESP32 |

**دليل الطبقة ٤ (ESP32 + ESPHome):** الخطوات لما نعملها:
1. شغّل مفتاح **«بث الموبايل ده كبيكون»** في إعدادات الموقع والخريطة، وانسخ
   الـUUID اللي بيظهر تحته (لكل موبايل UUID خاص).
2. ESP32 بـESPHome في البيت، وفي الـYAML:
   ```yaml
   esp32_ble_tracker:
   binary_sensor:
     - platform: ble_presence
       ibeacon_uuid: "<UUID الموبايل>"
       name: "Mena phone home"
       timeout: 2min
   ```
3. الكيان اللي بيطلع ده بيتحوّل لتراكر `connection` في HA (أو يتربط بالشخص عبر
   أتوميشن/`device_tracker`)، وساعتها **بيتغلّب على الـGPS تمامًا** في `person`.
4. **ملحوظة بطارية:** بث البيكون أرخص من المسح بكتير (`ADVERTISE_MODE_LOW_POWER`
   و`TX_POWER_ULTRA_LOW`)، فالطبقة دي هي الأوفر والأدق في نفس الوقت — الموبايل
   بيبث بس والـESP32 هو اللي بيسمع.

**ملحوظة مهمة للمستخدم:** لو إعداد النظام **Google Location Accuracy** مقفول في
الموبايل، Fused مابيقدرش يستخدم الواي‑فاي والشبكة أصلًا والدقة بتبوظ لوحدها —
يستحق فحصة قبل أي تعديل في الكود.

### 🔔 جرس الباب بالكاميرا — "مكالمة واردة" (مرحلة ١+٢ اتعملتا · 2.25.0 → 2.26.6)
**الفكرة:** المستخدم يحدّد كيان جرس الباب؛ لما يرن، تطلع شاشة فوري فوق القفل فيها
بث الكاميرا المباشر، تقدر ترد وتشوف وتكلّم الزائر — زي مكالمة فيديو واردة.

**قرار معماري حاكم (طلب المستخدم الصريح):** **ممنوع الارتباط بأي براند أو موديل.**
مفيش كلمة "Reolink" ولا غيرها في الكود. الحيادية بتتحقّق كالتالي:
- **اختيار الجرس:** أي كيان — `binary_sensor` (بيبقى `on`) أو `event entity` (الحالة
  timestamp بتتغيّر كل رنّة). نتعامل مع النوعين بشكل عام.
- **الكلام ثنائي الاتجاه:** العقد المحايد هو **تفاوض WebRTC (SDP) نفسه**، مش نوع
  الجهاز. نضيف مسار ميكروفون للعرض ونطلب صوت ثنائي؛ لو go2rtc رد بالموافقة على
  استقبال الصوت (الكاميرا عندها backchannel) → زرار "اتكلم" يظهر؛ لو رفض → يختفي
  ومكتوب "الكلام مش متاح للكاميرا دي". التطبيق **يكتشف القدرة بدل ما يفترضها**.
  (مبدأ المستخدم: الافتراض سؤال مش حقيقة — اتأكد من المصدر قبل ما تبني عليه.)

**إعادة استخدام بنية موجودة (مهم — 70% جاهز):**
- **كشف الرنّة:** نفس websocket الموجود في `AlarmMonitorService` (اشتراك
  `state_changed`) — نراقب كيان الجرس زي ما بنراقب كيان الإنذار.
- **الظهور فوق القفل:** نفس آلية `AlarmActivity`
  (`setShowWhenLocked`+`FLAG_TURN_SCREEN_ON`+`FLAG_DISMISS_KEYGUARD`) اللي بتصحّي
  الموبايل وتظهر وهو مقفول — بس بواجهة بث الكاميرا بدل واجهة الإنذار.
- **الصوت باتجاه الاستقبال موجود** في `WebRtcCameraPlayer` (`recvonly`) — السماع
  شغّال أصلاً؛ الكلام محتاج مسار ميكروفون `sendrecv` (إذن `RECORD_AUDIO` بنطلبه أصلاً).

**المراحل:**
- **✅ مرحلة ١ (2.25.0):** اختيار الجرس → كشف الرنّة → شاشة مكالمة واردة فوق القفل
  (نغمة + اهتزاز + رد/تجاهل) → مشاهدة + سماع + مهلة 45ث. الكيان والكاميرا بينتشروا،
  و"رنّ عندي" شخصي.
- **✅ مرحلة ٢ — الكلام الثنائي والتلميع (2.26.4 → 2.26.6):**
  - **كاميرا لايف فورًا عند الرنين** (مش لقطة) — من غير انتظار قبول/رفض.
  - **كلام ثنائي:** `WebRtcCameraPlayer` بقى ليه props `talk/micMuted/manageAudio`؛ وضع
    الكلام بيضيف مسار مايك (`getUserMedia` + `addTrack` = `sendrecv`) فيوصل صوتنا للباب
    عبر go2rtc backchannel، مع fallback لاستقبال فقط لو المايك فشل. (المستخدم جرّب — شغّال.)
  - **شاشة رد موديرن:** كتم مايك · كتم صوت وارد · إنهاء مكالمة.
  - **نغمات جرس (native, APK):** ٣ نغمات مولّدة في `res/raw` (ding-dong/chime/bell) +
    موديول `DoorbellRinger` (MediaPlayer + اهتزاز) + اختيار الأدمن مع معاينة، بينتشر
    للعيلة عبر `doorbellRingtone`.
  - **إصلاح الإغلاق (native, APK):** لو الجرس صحّى التطبيق من الخلفية/القفل، إنهاء
    المكالمة بيرجّع التطبيق للخلفية (`moveTaskToBack` عبر `DoorbellBridge.wokeApp` +
    `dismissCall`) بدل ما يفضل مفتوح على آخر شاشة.

**توزيع الإعداد (زي نمط zoneWatch):** الأدمن يحدّد كيان الجرس + كاميرته مركزيًا
(ينتشر للعيلة في `FAMILY_CONFIG_FIELDS`)، وكل فرد يفعّل "رنّ عندي" على موبايله
(شخصي — بطارية وخصوصية).

**مسائل مؤجّلة للنقاش:** لو أكتر من فرد ردّوا مع بعض = صوتين على سمّاعة واحدة
(تشويش) → ممكن تنسيق "فلان بيرد" عبر helper في HA، نأجّله لنسخة بعدين.
الاعتماد على websocket دائم (زي الإنذار) ليه نفس تحفّظات قتل الخدمة في الخلفية.

**جرس المستخدم الحالي:** Reolink (بيدعم backchannel عبر go2rtc، فمرحلة ٢ هتشتغل
معاه تلقائيًا) — **لكن مش مكتوب في الكود، التطبيق بيكتشفه بالتفاوض.**

### 🧩 صفحة إعداد داخل المكوّن (Custom Panel) — ✅ اتبنت (ريبو `secure_family` v0.4 → v0.6.2)
**الفكرة (طلب المستخدم):** المكوّن `secure_family` يعرض **صفحة خاصة بيه جوّه Home Assistant**
(Custom Panel في الشريط الجانبي، زي صفحة HACS) فيها فحص إعداد وchecklist بالناقص —
**مش في التطبيق** (عشان التطبيق يفضل نضيف للعيلة) و**مش بس في Repairs** (المستخدم عايز
صفحة المكوّن نفسه).

**المحتوى:** حالة كل متطلب (منطقة البيت، alarmo، كاميرات، person، mobile_app، ومصادر
`geo_location`: gdacs/usgs/112)، بشارات ملوّنة وأزرار «أضف» تفتح إعداد التكامل الناقص.

**واعي بالدولة:** المكوّن بيعرف `hass.config.country`، فيرشّح المصادر المناسبة
(NL → 112hier + GDACS، US → USGS) و**نطاق كوارث افتراضي حسب الدولة** (ينتشر للعيلة
عبر `disasterRadiusKm`). يقدر كمان يبدأ config flow للمصدر ويملّي الإحداثيات من HA
والأدمن يأكّد (نص-آلي).

**اللي ماينفعش:** تثبيت تكامل تاني بصمت (نموذج أمان HA + المصادر محتاجة إعدادات) —
أقصى حاجة نبدأ الـflow والمستخدم يكمّل.

**القرار:** الشكل = **Custom Panel** (صفحة كاملة بتصميمنا) مش Options flow. اتبنى في
ريبو `secure_family` (Python + web component خام من غير build).

**اللي اتعمل فعليًا في المكوّن (v0.4 → v0.6.2):**
- **v0.4:** فحص المتطلبات (checklist + أزرار إضافة) + توصيات حسب الدولة.
- **v0.5:** محرّر إعدادات العيلة داخل الصفحة (عرض + تعديل كامل، أدمن بس) عبر
  websocket + خدمة `set_config`.
- **v0.6:** إعادة تنظيم احترافية — الصفحة بتتبع **لغة واجهة HA** (عربي/هولندي/إنجليزي
  + RTL، الترجمة كلها في الـJS مش السيرفر)، الإعدادات مقسّمة **أقسام قابلة للطيّ** زي
  أدمن التطبيق، حسّاسات الإنذار **مفلترة** بـdevice_class (مش كل binary_sensor)،
  `geo_location` **عرض منفصل**، وقسم **إضافات اختيارية** عالمية + لكل دولة.
- **v0.6.1 — تقاويم العائلة:** المكوّن بيعمل ٣ تقاويم محلية مملوكة ليه بـentity_id
  ثابتة (`calendar.secure_family_birthdays/_events/_appointments`) — unique_id ثابت =
  **مفيش تكرار** عبر إعادة التشغيل، التكرار (yearly...) في موديول نقي متختبر. هتُربط
  بتبويب العائلة في التطبيق لاحقًا.
- **v0.6.2:** cache-busting لرابط البانل (`?v=الإصدار`) — لأن المتصفح كان بيكاش نسخة JS
  قديمة فتفضل "Loading…".

**الجزء اللي اتعمل في ريبو التطبيق (2.26.0):** تصنيف الكوارث + التلوين حسب الخطورة +
نطاق كوارث منفصل.

**لسه:** أتمتة per-country disaster radius في المكوّن.

---

### 👨‍👩‍👧 إعادة تصميم تبويب العائلة (بستايل Cozi/FamCal) — شغل جارٍ

**الهدف:** تبويب عائلة غني زي Cozi/FamCal — هَب بكروت ملوّنة، تقويم متعدد الأفراد
(عمود لكل فرد بلونه وصورته)، مهام بتمييز «مين ضاف»، وخطة أكل. **القيد:** التطبيق محلي
على HA (مش سحابي)، فكل قسم لازم يكون ليه مصدر بيانات: جاهز (calendar/todo/موقع)، أو
تخزين في المكوّن (أكل/مهام)، أو مؤجّل (ميزانية/مستندات/رسائل — مش مناسبة لأمان محلي).

**القرارات المتفق عليها:** المكوّن يعمل تقويم لكل فرد تلقائي · تمييز «مين ضاف» بصورته
(created_by، أنضف في تخزين المكوّن) · خطة الأكل بتخزين في المكوّن + «أضف للمشتريات» →
todo · البناء mockup الأول ثم مراحل.

**اللي اتعمل:**
- **المكوّن v0.7.0:** تقويم تلقائي لكل `person` (+ الـ3 المشتركة)، كل واحد بـattribute
  `person_entity_id`، وإضافة فرد جديد بتعمل تقويمه تلقائيًا (listener)، من غير تكرار.
- **التطبيق 2.27.0:** الهَب بصف صور الأفراد + التقويم متعدد الأفراد (أعمدة بالأفراد +
  عمود العيلة المشترك) بيقرا التقاويم الشخصية عبر `person_entity_id`، تبديل
  «بالأفراد/قائمة» (العرض القديم الكامل محفوظ)، تحميل متوازي بنافذة واحدة. مكوّن
  `MemberAvatar` + ألوان ثابتة لكل فرد.

- **التطبيق 2.28.0 + المكوّن v0.8.0:** اكتمال التبويب — المهام بتعرض **صورة مين ضاف**
  (الاسم مخزّن في description، بيتربط بكيان person)، و**خطة أكل أسبوعية** (فطار/غدا/عشا
  + زر 🛒 يضيف للمشتريات) مخزّنة في تقويم `secure_family_meals` (المكوّن v0.8.0)، وكارت
  «الأكل» في الهَب. helper `deleteCalendarEvent` (WS) لاستبدال الوجبة.

- **التطبيق 2.29.0 — تحوّل الاستايل: الأجندة بدل الأعمدة (الشكل النهائي):** المستخدم رفض
  **التقويم متعدد الأفراد (الأعمدة)** لأنه «مش حلو ومش عملي ومليان تشتت»، وطلب UI سهل
  وبسيط وواضح بس **بستايل كروت/ألوان/علامات Cozi** («الاستايل مش الفنكشان»). فاتبنى
  `AgendaView`: قايمة أجندة واحدة من كل التقاويم — كارت **«النهاردة»** ملوّن فوق، وتحته
  الأيام الجاية، كل حدث سطر فيه **شريط لون الفرد** + العنوان + الوقت + **صورة الفرد**
  (نفس ألوان الأفراد الثابتة). زر «+» عائم بيفتح شيت إضافة (عنوان + اختيار **لمين** بصور
  الأفراد/«العيلة» + شريط 14 يوم + الوقت) بيكتب في تقويم الفرد المختار أو التقويم المشترك.
  ضغطة مطوّلة على الحدث = مسح. والشِل بقى **3 تبويبات بسيطة (Agenda · Tasks · Meals)**
  بأزرار pill. **اتشال الكود الميّت:** `MemberCalendarView` (الأعمدة المرفوضة) و
  `CalendarView` (العرض القديم) اتمسحوا — محفوظين في git لو احتجنا نرجّع منطق التكرار.

- **التطبيق 2.30.0 — الأجندة اتحسّنت (بطلب المستخدم):** (١) كل حدث بيظهر جمبه **صورة
  واسم اللي أنشأه** (بيتخزّن في الوصف بعلامة `·by:` زي المهام، هيلبر مشترك `creator.ts`)
  — لون الشريط كمان بلون المنشئ. (٢) **شريط أسبوع** (٤ أسابيع) فوق بيلفّ الأجندة لليوم
  المختار. (٣) **زر فيو شهري** بيبدّل لشبكة الشهر بنقاط ملوّنة للأحداث + أسهم + لمس اليوم
  يعرض أحداثه.

**لسه (تحسينات اختيارية):** إثراء كروت الملخّص · created_by أدق (تخزين person_id بدل
الاسم) · تعيين مهمة لفرد (مش بس مين ضاف) · ميزانية/مستندات لو اتقرر نعملها.

### 📅 القرار النهائي لهيكل التقاويم (متفق عليه 2026-11-17) — منفّذ في 2.31.0 + المكوّن v0.9.0

**المبدأ (بعد نقاش):** الغرض إن العيلة **تشارك** المواعيد وترتّب مع بعض، فالتقويم-لكل-فرد
**زيادة** طالما كل حدث بيبان مين أنشأه. فاتشال، والتقاويم بقت **مشتركة بس**.

**٣ تقاويم مشتركة (+ الأكل):**
- **مناسبات سنوية** (`secure_family_annual`): ميلاد/جواز/مناسبات — كل حدث **يوم كامل ويتكرر
  سنويًا تلقائيًا** (المكوّن بيفرض `FREQ=YEARLY`).
- **المفكرة** (`secure_family_planner`): مواعيد وأحداث عابرة بوقت محدّد — **تتمسح تلقائيًا أول
  ما تعدّي** (تنظيف كل ٦ ساعات في المكوّن).
- **أعياد رسمية** (`secure_family_holidays`): أعياد البلد الرسمية، بتتولّد من مكتبة `holidays`
  حسب دولة HA — **عرض فقط** (مفيش إضافة/مسح)، بأيقونة علم ولون مميّز.
- **الأكل** (`secure_family_meals`): زي ما هو.

**على كل حدث:** **المنشئ** (`·by:` في الوصف، تلقائي = المستخدم الحالي) + **اختياري «خاص بمين»**
(`·for:`، صورة الشخص المعني) — من غير تقويم منفصل. لون الشريط = لون «خاص بمين» وإلا المنشئ.

**الإضافة (التطبيق):** تختار التقويم (مناسبات سنوية/مفكرة) + عنوان + «خاص بمين» اختياري +
تاريخ، والوقت يظهر للمفكرة بس (السنوية يوم كامل). كل تقويم بأيقونته/لونه.

**ميجريشن في المكوّن (idempotent):** birthdays+events → annual (مع `FREQ=YEARLY`)،
appointments → planner، و**تقاويم الأفراد `person_*` القديمة بتتشال** تلقائيًا. attribute
`secure_family_kind` على كل تقويم عشان التطبيق يميّزه من غير اعتماد على الاسم.

### 👤 بروفايل لكل فرد + توليد الميلاد تلقائيًا (منفّذ 2026-11-17 — التطبيق 2.31.1 + المكوّن v0.9.1)

**القرار (بعد نقاش):** الحقول = **تاريخ ميلاد + صفة + لون**، و**الأدمن يديرها من لوحة المكوّن**
(أنضف وأضمن بسبب صلاحيات غير الأدمن المحدودة).

- **اللوحة:** قسم «بروفايلات العيلة» (نوع حقل `profiles` جديد) — لكل `person`: تاريخ ميلاد
  (date) + صفة (text) + لون (checkbox + color). بتتخزّن في `config.profiles[person_id]`
  وتتنشر مع كونفيج العيلة عبر `set_config` (أدمن).
- **المكوّن:** `_sync_birthdays` بيولّد من كل تاريخ ميلاد حدث سنوي (يوم كامل، `FREQ=YEARLY`)
  في تقويم `annual`، uid ثابت `sfbday_<pid>` (idempotent، يتحدّث/يتشال لو اتغيّر)، والوصف
  `·for:<name>` فالتطبيق بيعرض صورة صاحب الميلاد. بيعيد التوليد عند الإقلاع وعند `SIGNAL_UPDATE`.
  الأحداث اليدوية (uid مختلف) بتتساب.
- **التطبيق:** صورة الحدث على اليمين = المنشئ وإلا «خاص بمين» (فالميلاد بيبان بصورة صاحبه).

**تطبيق اللون (منفّذ 2.31.2):** `profiles.ts` بيقرا البروفايلات من كونفيج العيلة، و**لون
البروفايل بيتطبّق** على صور الأفراد وشرائط الأحداث في الأجندة، وصورة «مين ضاف» في المهام،
واختيار «خاص بمين» (عبر prop `color` جديد في `MemberAvatar`).

**مؤجّل (صغير):** عرض **الصفة (role)** في الواجهة (متخزّنة بس) · تطبيق لون البروفايل في
**الخريطة** (لسه `personColor` التلقائي) · override للدولة للأعياد في اللوحة · تعديل حدث
موجود من الشيت.

### 🧭 التحوّل لـ«لمّتنا» — منظّم عائلي مُهيكل (هجين) — متفق عليه 2026-11-17، شغل قادم على مراحل

**القرار (بعد مراجعة سبيك 29 شاشة قدّمه المستخدم):** تبويب العيلة يتحوّل لمنظّم عائلي مُهيكل
**بنفس شكل الـPDF ونفس طرق الإدخال** (ثيم بنفسجي، كروت، فورمات مفصّلة، تنقّل داخلي ٥ أقسام:
رئيسية/تقويم/مهام/مشتريات/المزيد). **هجين:** نحتفظ بالحائط والشات كأجزاء (ويدجت في الداشبورد
+ موديول). باقي تبويبات Secure Family (إنذار/كاميرات/خريطة) تفضل بثيمها. الموقع في تبويب الخريطة.

**الموديولات المطلوبة (كلها اختارها المستخدم):** أدوار وصلاحيات (مدير/بالغ/طفل — يُبنى على حقل
`role` في البروفايل، والمكوّن يتحقق منه) · ميزانية ومصاريف · قوائم تسوّق مخصّصة (كمية/وحدة/قسم) ·
ملاحظات مثبّتة + روتينات متكررة. (مستندات = ميتاداتا بس/مؤجّلة لثقل التخزين. مركز إشعارات = مؤجّل.)

**الموجود ويُعاد استخدامه:** التقويم (annual/planner/holidays) · المهام (chores) · الأكل ·
الأفراد (بروفايل) · الحائط/الشات (v2.32.0).

**خريطة المراحل:**
- **م١ (منفّذة — 2.33.0):** الشِل الجديد **شريط أقسام فوق** (رئيسية · تقويم · مهام · مشتريات ·
  المزيد) بألوان تطبيقنا (مش بنفسجي — المستخدم طلب نفس ألواننا) + **الداشبورد** (`FamilyDashboard`:
  تحية + صور الأفراد + ٣ إحصائيات + مهام/مواعيد النهاردة + ويدجت الحائط) + «المزيد» (الأكل/الحائط
  جاهزين، الباقي «قريبًا») + الشات زرار هيدر + مشتريات «قريبًا». **قرار التنقّل:** شريط فوق عشان
  مايتعارضش مع البار السفلي العام للتطبيق.
- **م٢أ (منفّذة — 2.33.1 + المكوّن v0.9.4):** **الأدوار والصلاحيات** — الدور في اللوحة بقى قائمة
  (مدير/بالغ/طفل)، و**الطفل مايحذفش** (مخفي في التطبيق + المكوّن بيرفض `social_delete` للطفل).
  `roles.ts` (`canManage`). مفيش دور = الكل يقدر. القادم: صلاحيات أدق لكل موديول.
- **الأفراد (منفّذ — 2.35.0، بدون مكوّن جديد):** `MembersView` — كارت لكل فرد (صورة/لون، دور،
  في البيت/بره من حالة person، ميلاد، عدد مهام مفتوحة). بيقرا أفراد + بروفايلات + مهام.
- **المشتريات (منفّذ — 2.34.0، + مُنتقي قائمة 2.36.0):** `ShoppingView` على قوائم HA القياسية (`todo`) —
  إضافة بكمية/وحدة/قسم، شطب، مسح (الطفل لأ)، تجميع بالأقسام. الميتاداتا في وصف عنصر الـtodo
  (`shopping.ts`). شغّال من غير المكوّن خالص. من 2.36.0: بيفضّل قوائم Mealie تلقائيًا + مُنتقي قائمة لو فيه أكتر من واحدة.
- **تكامل Mealie القياسي (منفّذ — 2.36.0، بدون مكوّن، كشف تلقائي):** `mealie.ts` بيكتشف كيانات تكامل Mealie
  الرسمي **بالبادئة** (`todo.mealie_*` / `calendar.mealie_*` / `sensor.mealie_*`) — **مفيش أسماء كيانات ثابتة**.
  - **موديول الأكل** (`MealsView`) بقى بوضعين: لو Mealie متركّب → يقرا تقويمات الوجبات الأربعة (breakfast/lunch/dinner/side)
    ويعرض خطة الأسبوع، ويكتب رجوع عبر `mealie.set_mealplan` (ملاحظة) / `mealie.set_random_mealplan` (عشوائي). `config_entry_id`
    بيتحلّل مرّة من `config/entity_registry/get` (API: `getEntityConfigEntryId`). لو Mealie مش متركّب → fallback لتقويم `secure_family_meals` المحلي.
  - **نتائج البحث في التكامل الرسمي (HA 2024.7+):** بيعمل `todo` لكل قائمة تسوّق (كل ٥ دقايق)، تقويم لكل وجبة (كل ساعة)،
    وحسّاسات إحصائيات (وصفات/تصنيفات/وسوم/أدوات/مستخدمين، كل ١٥ دقيقة). الخدمات: `get_mealplan`, `get_recipe`, `import_recipe`,
    `set_mealplan`, `set_random_mealplan` (كلها محتاجة `config_entry_id`).
  - **مكوّنات الوجبة → قائمة التسوّق (منفّذ — 2.37.0):** السلة على وجبة Mealie بتجيب مكوّنات وصفتها وتفتح شيت
    (كلها متعلّمة مسبقًا) → تضيف المختار لقائمة Mealie. السلسلة: `get_mealplan` (خطة اليوم) → وصفة الخانة →
    `get_recipe` → `recipeIngredient[].display` → `todo.add_item`. (API: `mealieGetMealplan`, `mealieGetRecipeIngredients`.)
    ملاحظة بدون وصفة → يضيف اسم الوجبة.
  - **اختيار من وصفات Mealie (منفّذ — 2.39.0):** زرار «اختر من وصفاتك» في محرّر الخانة → شيت بحث (`get_recipes` بـ
    `search_terms`/`result_limit`) → اختيار وصفة بيخطّطها على الخانة (`set_mealplan` بـ `recipe_id`). التخطيط بالكامل من
    التطبيق من غير فتح Mealie. حلّ `config_entry_id` بقى من `config_entries/get` بالدومين (الأضمن) مع fallback لسجل الكيانات.
  - **تحميل هجين (2.38.1):** العرض من تقاويم Mealie + المعرّفات من `get_mealplan`؛ أي مصدر بيرجّع بيانات بيتعرض.
  - **تفاصيل/حذف/استيراد (منفّذ — 2.38.0):** مصدر بيانات وضع Mealie اتحوّل لـ `get_mealplan` (نداء أسبوعي واحد بيرجّع
    `mealplan_id` + `recipe`)، فاتفتحت: **عرض تفاصيل الوصفة** (`get_recipe` → مكوّنات + خطوات)، **حذف وجبة**
    (`delete_mealplan`)، و**استيراد وصفة بلينك** (`import_recipe` + تخطيط فوري بـ `set_mealplan`). API:
    `mealieGetRecipe`, `mealieDeleteMealplan`, `mealieUpdateMealplan`, `mealieImportRecipe`.
  - **حدود/ملاحظات:** مفيش حسّاس «أكل النهاردة» (الخطة من التقاويم). الاستبدال من التطبيق = حذف + إضافة (متاح برضه
    `update_mealplan` لتعديل في المكان لو احتجناه لاحقًا). تعديل محتوى الوصفة نفسها (مكوّنات/خطوات) بيتعمل من Mealie.

### بنية طبقة الـAPI وملفات الخريطة (تحديث جودة — 2026-11-18)
- **طبقة الـAPI** (`src/api/`) اتقسمت من ملف واحد ضخم (`homeAssistant.ts` كان 628 سطر) لوحدات باتجاه اعتماد واحد (مفيش دوّارة استيراد):
  - `client.ts` — النقل الأساسي: `ensureFreshToken` / `request` / `callService`.
  - `wsClient.ts` — عميل WebSocket (`wsCommand`).
  - `mealieApi.ts` — تكامل Mealie.
  - `homeAssistant.ts` بقى **barrel** بيعيد تصدير الكل، فكل `import … from './api/homeAssistant'` فضل شغّال زي ما هو (مفيش تغيير في المستهلكين).
- **ملفات الخريطة** (`src/features/map/`): المنطق المشترك كله في `mapShared.ts`؛ `PeopleMapWeb.tsx` اتشال منه التكرار (كان بيعيد تعريف ~15 helper) واستُخرج قالب الـWebView لـ `mapWebTemplate.ts` (1058 → 772 سطر). `PeopleMapNative.tsx` بيستورد المشترك من `mapShared`.
- **اللينت:** `npm run lint` شغّال دلوقتي (ESLint 8) وأخضر (صفر أخطاء). القاعدة `exhaustive-deps` إرشادية (warn) لأن الـeffects بتعتمد على مفاتيح مشتقة مقصودة.
- **م٢ب:** مطابقة الفورمات للـPDF (إضافة موعد بكل الحقول: نهاية/مكان/تكرار/تذكير/ملاحظات؛ مهمة
  بوصف/أولوية/تصنيف/تكرار). التكرار والمهام الأغنى محتاجين توسعة سكيمة في المكوّن.

**تنبيه مهم:** المستخدم لسه ماثبّتش تحديثات المكوّن (v0.9.1→v0.9.4)، فالحائط/الشات/المهام/
البروفايل/الأدوار/الميلاد والتقاويم الجديدة **مش شغّالة عنده لحد ما يثبّت المكوّن**. المشتريات
والتقويم (fallback) شغّالين من غيره.
- **م٣:** ميزانية ومصاريف. **م٤:** قوائم تسوّق مخصّصة. **م٥:** ملاحظات + روتينات. **م٦:** تلميع + مركز إشعارات/مستندات لو اتقرر.

---

### 🧱 تبويب العائلة = FamilyWall (شبكة عيلة) — **مرحلة ١ منفّذة** (التطبيق 2.32.0 + المكوّن v0.9.3)

**القرار (بعد نقاش):** المستخدم مش مقتنع إن التبويب يبقى «منظّم» مفكّك — عايزه **كلون
FamilyWall**: شبكة عيلة خاصة محورها **«الحائط» (feed)** اللي كل فرد بيكتب فيه ويشارك.
نعيد تصميم التبويب **من الأساس** حوالين الوول، ونسيب الموقع في تبويب الخريطة (جاهز).

**النطاق المتفق عليه — مرحلة ١ (خفيفة على التخزين، شرط أساسي للمستخدم):**
- **الحائط (Home):** feed زمني — بوستات الأفراد (نص، بصورة صاحبها ولونه) + عناصر تلقائية
  (مواعيد النهاردة، مهمة اتعملت، أكل اليوم، عيد ميلاد قرّب، حد وصل البيت).
- **شات نصّي** للعيلة.
- **مهام/شغل بيت موزّعة على الأفراد** (تسنيد لفرد، متكرّرة، ممكن نقاط للأطفال).
- يفضل: التقويم ✓ والأكل ✓ كأقسام. الموقع في تبويب الخريطة.

**التخزين (الحاسم):** النصوص (بوستات/رسائل) = بضع مئات بايت للواحد → تتخزّن في **المكوّن**
بحد أقصى (آخر N) فالحجم ثابت. **من غير صور في مرحلة ١** (الصور مرحلة ٢ اختيارية بضغط + حد
أقصى + تنظيف تلقائي، لو اتقرر).

**التحدّي التقني (مرتبط بالتبعة المفتوحة تحت):** عشان **غير الأدمن** يكتب على الوول والكل
يشوف فورًا → في المكوّن: **سيرفس** غير محصورة للأدمن للكتابة، والوول يتنشر في **كيان**
(state_changed) يقدر غير الأدمن يقراه. ده نفس الحل المقترح للتبعة المفتوحة — فالوول هيدفعنا
ننفّذها صح.

**اللي اتعمل (مرحلة ١):** المكوّن v0.9.3 (`social_store.py` + سيرفسات `wall_post`/`chat_send`/
`chore_add`/`chore_set`/`social_delete` غير محصورة للأدمن + كيانات `sensor.secure_family_wall/
chat/chores` للقراية عبر state_changed). التطبيق 2.32.0: `WallView` (خانة كتابة + كارت النهاردة
+ فيد البوستات) · `ChatView` (جروب شات نصّي لحظي) · `ChoresView` (مهام موزّعة بالتسنيد والشطب) ·
`social.ts` (قراية/هوية). الشِل: حائط · تقويم · مهام · أكل + زر شات في الهيدر.

**مؤجّل:** الصور على الحائط (بضغط + حد أقصى) · إشعارات الشات والتطبيق مقفول · شات خاص ١:١ ·
نقاط/مكافآت الأطفال · قوائم تسوّق · جهات اتصال/مستندات · عناصر فيد تلقائية أكتر (مهمة اتعملت/
وصول البيت). ملاحظة: `ListsView` (تذكيرات todo) اتفصلت من الشِل مؤقتًا — ممكن ترجع كقوائم تسوّق.

### تبعة مفتوحة — الأفراد غير الأدمن مش بيستقبلوا الأحداث المخصّصة (من 2.17.4)
Home Assistant بيسمح لغير الأدمن بالاشتراك في `state_changed` **بس**؛ أي اشتراك
في حدث تاني بيترفض بـ Unauthorized. فالتطبيق للفرد غير الأدمن **مش بيستقبل**
الأحداث المخصّصة: `familyha_live_request` (طلب الموقع اللايف لما حد يفتح كارتك)،
`familyha_force_logout` (تسجيل خروج قسري)، `familyha_device_approval` /
`familyha_device_approved` (موافقة/استبدال الأجهزة)، وأحداث `alarmo_*` الفورية.
دلوقتي بنمسك رفض الاشتراك عشان مايطلعش red box (2.17.4)، بس المميزات دي **فعليًا
مش شغّالة للأفراد**.
**الحل السليم (مؤجّل):** ننقل كل إشارة محتاجة للأفراد لـ**كيان** (entity) الفرد
يقدر يشوفه عبر `state_changed` — مثلًا بدل حدث `familyha_live_request`، كيان
`input_text`/`sensor` المكوّن `secure_family` بيحدّثه والتطبيق بيراقبه. ده بيتطلّب
تعديل في مكوّن `secure_family` (الريبو التاني) + التطبيق. للمناقشة قبل التنفيذ.
