# Bugs & Fixes — Family HA

هذا الملف يوثّق كل مشكلة تُكتشف في المشروع، وحالتها، وحلها إن وُجد.
كل commit يمس Bug لازم يحدّث سطره هنا.

---

## 🔴 مفتوحة (Open)

### BUG-001 — jest غير مُثبّت كـ dependency
**الحالة:** مفتوحة
**الوصف:** `jest.config.js` و `__tests__/App.test.tsx` موجودين، لكن
`package.json` لا يحتوي على `jest` ولا `@types/jest` ولا
`react-test-renderer` ضمن `devDependencies`. تشغيل `npm test` يفشل فورًا
لأن الحزم غير موجودة، و `tsc --noEmit` يفشل أيضًا بسبب
`"types": ["jest"]` في `tsconfig.json` بدون تعريف النوع المطلوب.
**الحل المقترح:** إضافة إلى `devDependencies`:
```
"jest": "^30.x",
"@types/jest": "^30.x",
"react-test-renderer": "19.2.0",
"@types/react-test-renderer": "^19.x"
```
**تم التأكد بتاريخ:** 2026-07-13 (عبر `npm install` + `npx tsc --noEmit` فعليًا)

---

### BUG-002 — ملفات الإعداد بأسماء خاطئة (underscore بدل نقطة)
**الحالة:** مفتوحة
**الوصف:** الملفات التالية مرفوعة بشرطة سفلية بدل النقطة، فالأدوات
المرتبطة بها (Git, ESLint, Prettier, Watchman, Xcode env) لا تتعرف
عليها تلقائيًا:
- `_gitignore` → يجب أن يكون `.gitignore`
- `_eslintrc.js` → يجب أن يكون `.eslintrc.js`
- `_prettierrc.js` → يجب أن يكون `.prettierrc.js`
- `_watchmanconfig` → يجب أن يكون `.watchmanconfig`
- `ios/_xcode.env` → يجب أن يكون `ios/.xcode.env`
**السبب المحتمل:** رفع الملفات عبر واجهة GitHub الويب أو أداة لا تدعم
رفع dotfiles مباشرة.
**الحل المقترح:** إعادة تسمية الملفات (`git mv`) داخل الريبو.

---

### BUG-003 — مشروع iOS لا يزال باسم القالب الافتراضي "HelloWorld"
**الحالة:** مفتوحة
**الوصف:** `ios/Podfile` و `ios/HelloWorld.xcodeproj` يستخدمان اسم
القالب الافتراضي من `react-native init` بدل اسم المشروع الحقيقي
(FamilyHA). هذا لن يمنع البناء لكنه سيسبب لبسًا ومشاكل محتملة في
Bundle Identifier لاحقًا.
**الحل المقترح:** إعادة تسمية الـ target والمشروع إلى `FamilyHA` (عبر
`npx react-native-rename` أو يدويًا في Xcode).

---

### BUG-004 — عدم تطابق رقم الإصدار بين app.json و package.json
**الحالة:** مفتوحة
**الوصف:** `package.json` يذكر `"version": "2.1.2"` بينما `app.json`
لا يزال يذكر `"version": "2.1.1"`.
**الحل المقترح:** توحيد الرقم في الملفين عند كل إصدار جديد (أو ربطهما
عبر سكربت واحد لتفادي النسيان).

---

## ✅ تم حلها (Fixed)

### BUG-000 — مجلد src/ والمجلدات الأصلية (android/ios) غير مرفوعة
**الحالة:** ✅ تم الحل
**الوصف:** في أول رفعة للمشروع، كان `App.tsx` يستورد من 10 مسارات تحت
`./src/...` (api, features, storage, theme, i18n...) لكن مجلد `src/`
لم يكن موجودًا في الريبو إطلاقًا، وكذلك `android/` و `ios/` كانا
غائبين. النتيجة: المشروع لا يُبنى ولا حتى يمر بـ typecheck.
**الحل المطبَّق:** تم رفع مجلد `src/` كاملًا (14 ملف) بالإضافة إلى
`android/` و `ios/` و `assets/` في commit "2ed upload".
**تم التحقق:** `npm install` + `npx tsc --noEmit` نجحا بدون أي خطأ على
كود المشروع الفعلي (App.tsx + src/**) بتاريخ 2026-07-13.

---

## طريقة الإضافة لهذا الملف
عند اكتشاف مشكلة جديدة: أضفها تحت "مفتوحة" برقم BUG-XXX تسلسلي.
عند حلها: انقلها تحت "تم حلها" واذكر رقم الـ commit أو التاريخ.
