package com.mkdd.familyha

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.android.gms.location.GeofencingEvent
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

/**
 * بيستقبل دخول/خروج مناطق Home Assistant (geofences من Play Services) ويبلّغ
 * الحضور لـHA عبر `location_name` — بدل ما نسيب HA يحسب المنطقة من GPS خام (اللي
 * بيعمل تذبذب home↔away على الحافة). نفس أسلوب التطبيق الرسمي.
 *
 * مهم: بنرفق **إحداثيات** مع location_name (من موقع الحدث) عشان الـ device_tracker
 * مايفقدش lat/lng — من غير إحداثيات الشخص بيختفي من الخريطة. لو موقع الحدث مش
 * متاح، مابنبعتش (بنحدّث current_zone بس) عشان مانمسحش الإحداثيات القديمة.
 */
class GeofenceReceiver : BroadcastReceiver() {
  private val client = OkHttpClient()
  private val json = "application/json".toMediaType()

  override fun onReceive(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) return

    val prefs = context.getSharedPreferences("mobile_app", Context.MODE_PRIVATE)
    val baseUrl = prefs.getString("baseUrl", "") ?: ""
    val webhookId = prefs.getString("webhookId", "") ?: ""
    if (baseUrl.isEmpty() || webhookId.isEmpty()) return

    // الجيوفنس بيوقّظنا عند عبور حدود المنطقة عشان نبعت موقع طازة فورًا. بنبعت
    // الإحداثيات الخام بس ونسيب HA يحسب الحضور (مفيش location_name).
    // ولو دقة قراية الحدث ضعيفة، بنطلب من الخدمة **قراية دقيقة بمحاولات** بدل ما
    // نبعت قراية رديئة — نفس تصرّف التطبيق الرسمي عند حدود الزون.
    val loc = event.triggeringLocation ?: return
    if (loc.hasAccuracy() && loc.accuracy > MAX_ACCURACY_M) {
      val intent2 = Intent(context, MobileAppService::class.java).apply { action = MobileAppService.ACTION_REQUEST_ACCURATE }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent2) else context.startService(intent2)
      return
    }

    post(baseUrl, webhookId, loc.latitude, loc.longitude, if (loc.hasAccuracy()) loc.accuracy.toInt() else null)
  }

  private fun post(baseUrl: String, webhookId: String, lat: Double, lng: Double, acc: Int?) {
    val data = JSONObject()
      .put("gps", JSONArray().put(lat).put(lng))
    if (acc != null) data.put("gps_accuracy", acc)
    val body = JSONObject().put("type", "update_location").put("data", data)
    val request = Request.Builder()
      .url("$baseUrl/api/webhook/$webhookId")
      .post(body.toString().toRequestBody(json))
      .build()
    client.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {}
      override fun onResponse(call: Call, response: Response) {
        response.close()
      }
    })
  }

  companion object {
    private const val MAX_ACCURACY_M = 200f // نفس حد التطبيق الرسمي
  }
}
