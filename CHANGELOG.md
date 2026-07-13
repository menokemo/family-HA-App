# Changelog — Family HA (MKDD)

كل التغييرات المهمة في المشروع، بترتيب زمني عكسي (الأحدث أولاً).

---

## [Unreleased]
### أُضيف
- `BUGS_AND_FIXES.md` لتوثيق الأخطاء وحلولها.
- `CHANGELOG.md` (هذا الملف).
- `PROJECT_SUMMARY.md` لتلخيص حالة المشروع الحالية.
- **بيئة تطوير كاملة تعمل فعليًا على LXC (Proxmox):** Node 20، JDK 17،
  Android SDK (platform-tools, android-35, build-tools 35.0.0)، أول
  `./gradlew assembleDebug` ناجح (11 دقيقة و43 ثانية)، Metro وسيرفر
  تحميل الـ APK يعملان دائمًا عبر `pm2` (مع تفعيل `pm2 startup`
  للإقلاع التلقائي بعد أي reboot للكونتينر).

### معروف ولم يُحل بعد
- انظر `BUGS_AND_FIXES.md` → BUG-001 حتى BUG-004
  (jest غير مثبَّت، أسماء dotfiles، اسم iOS القالب، تعارض رقم الإصدار).
- BUG-005 (التباس توقف سكربت الإعداد) تم توضيحه وحله يدويًا، والتوصية
  بتحديث السكربت نفسه لسه معلّقة.

---

## [2.1.2] — "2ed upload"
### أُضيف
- مجلد `src/` كاملًا: `api/`, `features/alarmo`, `features/cameras`,
  `features/map`, `storage/`, `theme/`, `i18n/`, `components/`,
  `audio/`, `types/`.
- مجلدات المشروع الأصلية `android/` و `ios/`.
- `assets/` — 3 ملفات صوت للإنذار (classic, digital, pulse).
- `__tests__/App.test.tsx` — اختبار أساسي لعرض التطبيق.

### أُصلح
- مشكلة كسر البناء الكاملة: `App.tsx` كان يستورد من `src/` وهو غير
  موجود في الرفعة السابقة. تم رفعه بالكامل الآن، والتحقق من عدم وجود
  أخطاء TypeScript في الكود الفعلي.

### لم يُحل بعد من هذه الدفعة
- jest غير مثبَّت رغم وجود ملف الاختبار.
- ملفات dotfiles بأسماء خاطئة (underscore).
- اسم مشروع iOS لا يزال "HelloWorld".

---

## [2.1.1] — "1st uploading"
### أُضيف
- الهيكل الأساسي: `App.tsx`, `package.json`, `tsconfig.json`,
  `babel.config.js`, `metro.config.js`, `jest.config.js`, `app.json`.
- `README.md` بالتفاصيل الكاملة للمشروع (v2.1 — إزالة Google Maps
  والانتقال لـ OpenStreetMap/Leaflet).
- `INSTALL-WINDOWS.md`, `BUILD-APK-WINDOWS.ps1`.

### معروف كخطأ حرج (تم حله لاحقًا في 2.1.2)
- مجلد `src/` غير موجود رغم أن `App.tsx` يعتمد عليه بالكامل. المشروع
  في هذه الدفعة لا يمكن بناؤه.
