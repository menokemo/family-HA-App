# License Audit — Secure Family (Family HA / MKDD)

*[English below Arabic / الإنجليزية أسفل العربية]*

> فحص رخص كل تبعيات npm، لأن التطبيق متوجّه ليكون **منتج تجاري**.
> License audit of all npm dependencies, since the app is headed toward
> being a **commercial product**.

---

## العربية

### نتيجة آخر فحص — 2026-11-11

- **إجمالي الحزم المفحوصة:** 835 (بما فيها التبعيات غير المباشرة)
- **🚨 GPL / AGPL (قوي copyleft):** ✅ **لا يوجد ولا واحدة.** يعني مفيش أي
  مكتبة ممكن تجبرك تفتح كود التطبيق — آمن لمنتج تجاري مغلق.
- **⚠️ LGPL / MPL / EPL (ضعيف copyleft):** ✅ لا يوجد.
- **توزيع الرخص:** 725 MIT، 45 ISC، 25 BSD-3، 20 Apache-2.0، 11 BSD-2،
  والباقي رخص متساهلة.
- **حزمتان برخصة نسب فقط (مش مشكلة):**
  - `caniuse-lite` → **CC-BY-4.0** — بيانات وقت البناء فقط (مش بتتشحن داخل
    التطبيق)، وبتطلب نسب بس.
  - `make-plural` → **Unicode-DFS-2016** — رخصة Unicode متساهلة، تجاري مسموح
    بنسب.

**الخلاصة:** شجرة التبعيات نظيفة لمنتج تجاري. مفيش أي مانع copyleft.

### لسه مطلوب قبل الإطلاق (مش مانع، بس واجب)

- الرخص المتساهلة (MIT/BSD/Apache) بتطلب إنك **تضمّن إشعارات النسب** في
  المنتج الموزّع (شاشة "تراخيص الطرف الثالث" أو ملف NOTICES). ده بيتولّد
  أوتوماتيك قبل الإطلاق بأداة زي `license-checker`.
- شروط استخدام + إخلاء مسؤولية (منتج أمان).

### إعادة الفحص

```bash
node scripts/license_audit.js
```
بيمشي على `node_modules` ويطبع أي رخصة مقلقة.

---

## English

### Latest audit — 2026-11-11

- **Total packages scanned:** 835 (including transitive deps)
- **🚨 GPL / AGPL (strong copyleft):** ✅ **None.** No library can force you
  to open-source the app — safe for a closed commercial product.
- **⚠️ LGPL / MPL / EPL (weak copyleft):** ✅ None.
- **License spread:** 725 MIT, 45 ISC, 25 BSD-3, 20 Apache-2.0, 11 BSD-2,
  the rest permissive.
- **Two attribution-only packages (not a problem):**
  - `caniuse-lite` → **CC-BY-4.0** — build-time data only (not shipped in the
    app), attribution only.
  - `make-plural` → **Unicode-DFS-2016** — permissive Unicode license,
    commercial use allowed with notice.

**Bottom line:** the dependency tree is clean for a commercial product. No
copyleft blockers.

### Still required before release (not blockers, but due diligence)

- Permissive licenses (MIT/BSD/Apache) require **including attribution
  notices** in the distributed product (a "third-party licenses" screen or a
  NOTICES file). This is auto-generated before release with a tool like
  `license-checker`.
- Terms of Service + liability disclaimer (it's a security product).

### Re-run

```bash
node scripts/license_audit.js
```
Walks `node_modules` and prints any concerning license.
