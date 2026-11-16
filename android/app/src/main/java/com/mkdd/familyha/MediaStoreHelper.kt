package com.mkdd.familyha

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

/**
 * حفظ صورة في معرض الصور العام. targetSdk 36 والتخزين مقيّد (scoped storage)،
 * فمينفعش نكتب في مجلد الصور مباشرة بـ java.io — لازم نعدّي على MediaStore.
 *
 * من أندرويد 10 (API 29): بنعمل سجل في MediaStore تحت Pictures/SecureFamily
 * ونكتب فيه — من غير أي إذن تخزين. قبل كده: بنكتب الملف في مجلد الصور العام
 * (محتاج WRITE_EXTERNAL_STORAGE، معرّف في الـmanifest لـAPI ≤ 28) وبنقول
 * للـMediaScanner يفهرسه عشان يبان في المعرض.
 *
 * عملناه بإيدينا (من غير مكتبة camera-roll) عشان نفضل من غير تبعيّات زيادة —
 * نفس أسلوب باقي الكود النيتف في المشروع.
 */
object MediaStoreHelper {
  private const val ALBUM = "SecureFamily"

  /** بينسخ ملف JPEG موجود (اللقطة اللي اتحمّلت في الكاش) للمعرض. */
  fun saveJpeg(context: Context, sourcePath: String, displayName: String): Boolean {
    val source = File(sourcePath)
    if (!source.exists() || source.length() == 0L) return false
    val bytes = try {
      source.readBytes()
    } catch (e: Exception) {
      return false
    }
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      saveViaMediaStore(context, bytes, displayName)
    } else {
      saveViaLegacyFile(context, bytes, displayName)
    }
  }

  private fun saveViaMediaStore(context: Context, bytes: ByteArray, displayName: String): Boolean {
    return try {
      val resolver = context.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$ALBUM")
        // IS_PENDING بيخفي الصورة عن المعرض لحد ما نخلّص كتابة، عشان محدش يشوف
        // ملف نص مكتوب.
        put(MediaStore.Images.Media.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
      resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
      values.clear()
      values.put(MediaStore.Images.Media.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun saveViaLegacyFile(context: Context, bytes: ByteArray, displayName: String): Boolean {
    return try {
      @Suppress("DEPRECATION")
      val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), ALBUM)
      if (!dir.exists() && !dir.mkdirs()) return false
      val out = File(dir, displayName)
      out.writeBytes(bytes)
      // من غير فهرسة، الصورة مش بتبان في المعرض على الأجهزة القديمة.
      MediaScannerConnection.scanFile(context, arrayOf(out.absolutePath), arrayOf("image/jpeg"), null)
      true
    } catch (e: Exception) {
      false
    }
  }
}
