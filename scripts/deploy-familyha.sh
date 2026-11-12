#!/usr/bin/env bash
# =============================================================================
# deploy-familyha.sh — نشر تعديلات JS على سيرفر metro
# =============================================================================
# بياخد git bundle من Google Drive (بـ FILE_ID)، بيطبّقه على ريبو السيرفر،
# بيرفعه لـ GitHub، وبيعمل restart لـ metro. ده بيوزّع تعديلات الـ JS فقط.
#
# ⚠️  تعديلات النيتف (Kotlin/manifest/res) مابتتوزّعش من هنا — محتاجة
#     build APK جديد على ويندوز.
#
# الاستخدام:
#     bash /root/deploy-familyha.sh <DRIVE_FILE_ID>
#
# مثال:
#     bash /root/deploy-familyha.sh 1mENFB6yUalrU-_nS5wx4HVFoOg4cGkOR
#
# ملاحظات:
#   - النسخة الأصلية بتعيش على السيرفر في /root/deploy-familyha.sh
#   - النسخة دي في الريبو هي المرجع — لو ضاعت من السيرفر، انسخها من هنا.
#   - الـ bundle لازم يكون أساسه commit موجود في تاريخ السيرفر (4d66fbb).
# =============================================================================
set -euo pipefail

REPO="/opt/apps/family-HA-App"
BRANCH="main"
WORK="/tmp/familyha-deploy"
FILE_ID="${1:-}"

if [ -z "$FILE_ID" ]; then
  echo "الاستخدام: bash $0 <DRIVE_FILE_ID>" >&2
  exit 1
fi

mkdir -p "$WORK"
BUNDLE="$WORK/incoming.bundle"

echo "==> تنزيل من Drive"
curl -fsSL "https://drive.google.com/uc?export=download&id=${FILE_ID}" -o "$BUNDLE"

echo "==> تحقق"
git -C "$REPO" bundle verify "$BUNDLE"

cd "$REPO"
echo "==> تطبيق (تجاهل أي تعديل محلي)"
git fetch "$BUNDLE" "$BRANCH"
git checkout "$BRANCH"
git reset --hard FETCH_HEAD

echo "==> npm install"
npm install --no-audit --no-fund

echo "==> رفع لـGitHub"
git push origin "$BRANCH"

echo "==> restart metro (مع مسح الكاش)"
# مهم: مسح كاش metro قبل الـrestart. من غيره metro ممكن يقدّم نسخة قديمة
# مخبّأة من موديول اتغيّر (خصوصًا لما تتغيّر الـimports/exports) فيطلع
# خطأ زي "X is not a function (it is undefined)".
rm -rf /tmp/metro-* /tmp/haste-* /tmp/react-* 2>/dev/null || true
pm2 restart metro --update-env

git -C "$REPO" log -1 --format='%h  %s'
