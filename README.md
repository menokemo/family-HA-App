# Family HA v2.1 — MKDD

تطبيق Android مبني بـ **React Native CLI** للتعامل مع Home Assistant وAlarmo وكاميرات WebRTC ومواقع أفراد العائلة. المشروع لا يستخدم Expo أو EAS ولا يحتاج تسجيل دخول لأي خدمة بناء خارجية.

## ما الذي تغيّر في v2.1؟

- إزالة Google Maps بالكامل.
- إزالة `GOOGLE_MAPS_API_KEY` من Android والمشروع.
- استخدام OpenStreetMap داخل خريطة Leaflet من خلال `react-native-webview`.
- لا يوجد حساب Google Cloud ولا بطاقة بنكية ولا مفتاح API.
- إضافة تخزين محلي لحالات Home Assistant وأحداث Alarmo.
- عند انقطاع السيرفر، يعرض التطبيق آخر بيانات ناجحة بدل شاشة فارغة.
- تخزين صور مستخدمي Home Assistant مؤقتًا على الجهاز لعرضها داخل الخريطة.
- زر الملاحة يفتح تطبيق الخرائط الموجود على الهاتف، ويستخدم OpenStreetMap في المتصفح كخيار احتياطي.
- تحديث الإصدار إلى `2.1.0`.

> بيانات الأشخاص، البطارية، الإحداثيات، حالة المنزل، الحساسات والكاميرات تأتي من Home Assistant. OpenStreetMap يوفر طبقات الخريطة المرئية فقط.

## التقنيات المستخدمة

- React Native CLI 0.83
- TypeScript
- Home Assistant REST API
- Home Assistant WebSocket API
- Alarmo services and events
- `react-native-webrtc` للبث المباشر
- `react-native-webview` + Leaflet + OpenStreetMap للخريطة
- `react-native-fs` لتخزين صور الأشخاص مؤقتًا
- AsyncStorage لحفظ آخر الحالات والأحداث
- Android Keystore لحفظ بيانات الاتصال الحساسة

## المتطلبات على Windows

- Node.js 20 أو أحدث
- JDK 17
- Android Studio
- Android SDK وPlatform Tools
- متغير `ANDROID_HOME` مضبوط

افحص البيئة:

```powershell
npx react-native doctor
```

## تثبيت المكتبات

فك المشروع في مسار قصير قدر الإمكان، مثل:

```text
D:\FamilyHA
```

ثم:

```powershell
npm install
```

لا تحتاج إلى إضافة أي مفتاح خرائط.

## إنشاء APK محليًا

```powershell
.\BUILD-APK-WINDOWS.ps1
```

أو يدويًا:

```powershell
cd android
.\gradlew.bat assembleDebug
```

ملف APK الناتج:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

انسخه إلى الهاتف وثبّته يدويًا.

## التطوير بدون إنشاء APK بعد كل تعديل

ابنِ وثبّت Debug APK مرة واحدة. بعد ذلك شغّل Metro:

```powershell
npm start
```

### عبر USB

```powershell
adb devices
adb reverse tcp:8081 tcp:8081
```

ثم افتح تطبيق Family HA. تغييرات TypeScript والواجهة ستظهر باستخدام Fast Refresh.

إعادة إنشاء APK مطلوبة فقط عند:

- إضافة أو إزالة مكتبة Native.
- تعديل AndroidManifest أو Gradle.
- تغيير اسم الحزمة أو الأذونات.

## الاتصال بـ Home Assistant

داخل إعدادات التطبيق أدخل:

- رابط Home Assistant، مثل `http://192.168.1.50:8123`
- Long-Lived Access Token
- كود مستخدم Alarmo، إن كان مطلوبًا

لا تضع Token أو PIN داخل ملفات الكود.

## Alarmo

التطبيق يدعم:

- أوضاع Home / Away / Night / Vacation / Custom Bypass
- إلغاء التسليح
- كود مختلف لكل مستخدم حسب إعداد Alarmo
- عرض الحساسات المفتوحة وموانع التسليح
- أحداث `alarmo_failed_to_arm`
- أحداث نجاح الأوامر وتحديث الجاهزية
- صوت إنذار محلي عندما تصبح الحالة `triggered`

## الكاميرات

في قائمة الكاميرات تظهر Snapshots لتقليل استهلاك الموارد. عند الضغط على كاميرا، يحاول التطبيق تشغيل WebRTC مباشرة من Home Assistant.

المتطلبات:

- الكاميرا مدعومة داخل Home Assistant.
- `camera/capabilities` يعيد دعم `web_rtc`.
- الهاتف يستطيع الوصول إلى عنوان Home Assistant.
- إعدادات الشبكة وgo2rtc/WebRTC في Home Assistant سليمة.

إذا لم يتوفر WebRTC، يعرض التطبيق Snapshot كخيار احتياطي مع سبب الفشل.

## الخريطة وOpenStreetMap

الخريطة لا تحتاج API Key وهي مجانية. التطبيق يستخدم:

- إحداثيات `person.*`
- موقع `zone.home`
- صورة `entity_picture`
- `gps_accuracy`
- مستشعرات البطارية عند توفرها

عند الضغط على شخص تظهر بطاقة تحتوي على:

- الاسم والصورة
- الحالة
- البطارية
- المسافة من المنزل
- المسافة من المستخدم المحدد كـ “أنا”
- دقة الموقع
- زر الملاحة

طبقات OpenStreetMap تحتاج اتصال إنترنت لتحميل أجزاء الخريطة التي لم تُحمّل من قبل. بيانات Home Assistant المخزنة محليًا تظل ظاهرة عند انقطاع السيرفر.

## Offline First

التطبيق يحفظ محليًا:

- آخر حالات Home Assistant الناجحة
- آخر 50 حدثًا من Alarmo
- صور الأشخاص المستخدمة على الخريطة داخل Cache الجهاز
- إعدادات المستخدم واللغة واختيارات الكاميرات

عند انقطاع Home Assistant:

- تظهر آخر حالة معروفة للإنذار والحساسات.
- تظهر آخر مواقع الأشخاص المعروفة.
- تظهر الأحداث السابقة.
- يعود التحديث اللحظي تلقائيًا بعد رجوع الاتصال.

ملاحظات:

- WebRTC نفسه يحتاج اتصالًا مباشرًا ولا يمكن تشغيل بث حي بدون شبكة.
- Cache النظام قد يحذف الصور المؤقتة إذا احتاج مساحة.
- لا يتم حفظ Access Token كنص عادي؛ يُخزن عبر Android Keystore.

## تنظيف وبناء المشروع

```powershell
npm run typecheck
npm run doctor
npm run clean:android
npm run build:apk
```

## بيانات المشروع

- الاسم: Family HA
- المطور: MKDD
- الحزمة: `com.mkdd.familyha`
- الإصدار: `2.1.0`
- البناء: React Native CLI
- خدمات مدفوعة مطلوبة: لا توجد

## v2.1.1 installation correction

- Removed the invalid `@types/react-native-sound` dependency.
- Added a maintained local TypeScript declaration for `react-native-sound`.
- Updated Android version to 2.1.1 (versionCode 3).
- Added `INSTALL-WINDOWS.md` with local APK and Fast Refresh instructions.


## v2.1.2 audio fix

The siren files are packaged as Android resources under `android/app/src/main/res/raw`.
`react-native-sound` now receives stable bundle filenames instead of Metro asset IDs. This prevents the `filename.startsWith is not a function` render crash.

Because this changes native Android resources, rebuild the APK once after updating:

```powershell
cd android
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```
