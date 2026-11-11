# Deployment — Family HA (MKDD)

*[English below Arabic / الإنجليزية أسفل العربية]*

---

## العربية

### نظرة عامة

في مسارين للنشر، والفرق بينهم **نوع التعديل**:

| نوع التعديل | أمثلة | طريقة النشر | محتاج build؟ |
|---|---|---|---|
| **JS فقط** | ترجمة، منطق React، شاشات الواجهة، ألوان الواجهة | عبر metro (سكربت السيرفر) | ❌ لا |
| **نيتف** | Kotlin، `AndroidManifest.xml`، `res/`، صلاحيات، شاشة الإنذار النيتف، الاهتزاز | build APK على ويندوز | ✅ أيوه |

> **قاعدة مهمة:** شاشة الإنذار موجودة في مكانين —
> `App.tsx` (React Native، بتظهر لما التطبيق **قدّامك**) و
> `AlarmActivity.kt` (نيتف، بتظهر لما التطبيق **مقفول/في الخلفية**).
> أي تحسين بصري للإنذار لازم يتعمل في **الاتنين**. (مفصّل في BUGS_AND_FIXES.)

---

### المسار الأول: نشر JS عبر metro

الفكرة: الكود بيتعمل في بيئة سحابية، بيتحوّل لـ **git bundle**، بيترفع على
**Google Drive**، وسكربت على السيرفر بينزّله ويطبّقه ويعمل restart لـ metro.
السبب إننا بنستخدم Drive كوسيط: عشان مانلمسش كونكتور GitHub الأساسي
المستخدم في مشروع تاني أهم.

**الخطوات (من ناحية المساعد / البيئة السحابية):**

1. تعديل الكود + تحديث ملفات النسخة (`package.json`, `app.json`,
   `package-lock.json`, `android/app/build.gradle`).
2. تحديث التوثيق (CHANGELOG / BUGS_AND_FIXES / PROJECT_SUMMARY حسب نوع
   التعديل).
3. commit **من غير أي بصمة ذكاء صناعي** (المؤلف: `Family HA Assistant`).
4. عمل bundle تراكمي من نقطة أساس ثابتة:
   ```bash
   git bundle create family-ha-<VER>.bundle 4d66fbb..main
   git bundle verify family-ha-<VER>.bundle
   ```
   > الأساس `4d66fbb` لازم يفضل ثابت — لأنه commit موجود في تاريخ السيرفر،
   > فالـ bundle التراكمي بيتطبّق صح.
5. رفع الـ bundle على Google Drive وأخذ الـ **FILE_ID**.

**الخطوة (من ناحيتك / على السيرفر):**

```bash
bash /root/deploy-familyha.sh <DRIVE_FILE_ID>
```

مثال:
```bash
bash /root/deploy-familyha.sh 1mENFB6yUalrU-_nS5wx4HVFoOg4cGkOR
```

السكربت بيعمل بالترتيب: تنزيل الـ bundle من Drive → `git bundle verify` →
`git fetch` + `git checkout main` + `git reset --hard FETCH_HEAD` (بيتجاهل
أي تعديل محلي) → `npm install` → `git push origin main` (فـ GitHub بيتحدّث
أوتوماتيك) → `pm2 restart metro` → بيطبع آخر commit.

> نسخة السكربت الأصلية بتعيش في `/root/deploy-familyha.sh` على السيرفر،
> ونسخة مرجعية محفوظة في الريبو: `scripts/deploy-familyha.sh`.
> لو ضاعت من السيرفر، انسخها من الريبو تاني.

**أخطاء شائعة:**
- `command not found` وإنت كاتب الـ FILE_ID لوحده → ده **argument** للسكربت،
  مش أمر. اكتب `bash /root/deploy-familyha.sh <FILE_ID>`.
- لو السكربت مش موجود، دوّر عليه:
  ```bash
  find / -iname "deploy*.sh" 2>/dev/null
  ```

---

### المسار الثاني: build APK على ويندوز (للتعديلات النيتف)

السكربت بيرفع على GitHub، فأسهل طريقة تجيب آخر كود على ويندوز:

```bash
cd <مجلد-المشروع-على-ويندوز>
git pull origin main
# ثم ابني الـ APK زي المعتاد
```

لو مجلد ويندوز مش git repo (`fatal: not a git repository`)، البديل إنك
تنزّل نفس الـ bundle من Drive وتطبّقه:
```bash
git fetch <path-to-bundle> main
git reset --hard FETCH_HEAD
```
أو تعمل clone جديد من GitHub.

الـ build الناتج بيبقى فيه **كل حاجة**: تعديلات الـ JS + النيتف.

---

## English

### Overview

There are two deployment paths; which one you use depends on **what changed**:

| Change type | Examples | How it ships | Build needed? |
|---|---|---|---|
| **JS only** | translations, React logic, foreground screens, UI colors | via metro (server script) | ❌ No |
| **Native** | Kotlin, `AndroidManifest.xml`, `res/`, permissions, native alarm screen, vibration | APK build on Windows | ✅ Yes |

> **Key rule:** the alarm screen exists in two places —
> `App.tsx` (React Native, shown when the app is in the **foreground**) and
> `AlarmActivity.kt` (native, shown when the app is **closed/backgrounded**).
> Any visual polish for the alarm must be done in **both**. (See BUGS_AND_FIXES.)

---

### Path 1: Ship JS via metro

The code is built in a cloud environment, turned into a **git bundle**,
uploaded to **Google Drive**, and a script on the server downloads it, applies
it, and restarts metro. We use Drive as the intermediary so we never touch the
primary GitHub connector (used by another, more important project).

**Steps (assistant / cloud side):**

1. Edit code + bump version files (`package.json`, `app.json`,
   `package-lock.json`, `android/app/build.gradle`).
2. Update docs (CHANGELOG / BUGS_AND_FIXES / PROJECT_SUMMARY as appropriate).
3. Commit **with no AI fingerprint** (author: `Family HA Assistant`).
4. Create a cumulative bundle from a fixed base:
   ```bash
   git bundle create family-ha-<VER>.bundle 4d66fbb..main
   git bundle verify family-ha-<VER>.bundle
   ```
   > The base `4d66fbb` must stay fixed — it's a commit present in the
   > server's history, so the cumulative bundle applies cleanly.
5. Upload the bundle to Google Drive and take the **FILE_ID**.

**Step (your side / on the server):**

```bash
bash /root/deploy-familyha.sh <DRIVE_FILE_ID>
```

Example:
```bash
bash /root/deploy-familyha.sh 1mENFB6yUalrU-_nS5wx4HVFoOg4cGkOR
```

The script does, in order: download the bundle from Drive → `git bundle
verify` → `git fetch` + `git checkout main` + `git reset --hard FETCH_HEAD`
(discards any local changes) → `npm install` → `git push origin main` (so
GitHub updates automatically) → `pm2 restart metro` → prints the last commit.

> The live copy lives at `/root/deploy-familyha.sh` on the server, and a
> reference copy is kept in the repo at `scripts/deploy-familyha.sh`.
> If it's lost on the server, copy it back from the repo.

**Common mistakes:**
- `command not found` after typing the FILE_ID alone → it's an **argument**
  to the script, not a command. Use `bash /root/deploy-familyha.sh <FILE_ID>`.
- If the script is missing, find it:
  ```bash
  find / -iname "deploy*.sh" 2>/dev/null
  ```

---

### Path 2: APK build on Windows (for native changes)

The script pushes to GitHub, so the easiest way to get the latest code on
Windows is:

```bash
cd <project-folder-on-windows>
git pull origin main
# then build the APK as usual
```

If the Windows folder isn't a git repo (`fatal: not a git repository`), the
alternative is to download the same bundle from Drive and apply it:
```bash
git fetch <path-to-bundle> main
git reset --hard FETCH_HEAD
```
…or make a fresh clone from GitHub.

The resulting build contains **everything**: both the JS and native changes.
