package com.mkdd.familyha

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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

    // الجيوفنس بيوقّظنا عند عبور حدود المنطقة عشان نبعت **موقع طازة فورًا** (زي
    // التطبيق الرسمي) — بس بنبعت الإحداثيات الخام بس، ونسيب HA يحسب الحضور. مابنحسبش
    // اسم المنطقة محليًا ولا نبعت location_name (الحساب المحلي كان أصرم من HA فكان
    // بيفرض not_home غلط وانت في البيت).
    val loc = event.triggeringLocation ?: return

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
}
