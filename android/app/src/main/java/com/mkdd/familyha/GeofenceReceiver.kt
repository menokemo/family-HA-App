package com.mkdd.familyha

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
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
    val transition = event.geofenceTransition

    val prefs = context.getSharedPreferences("mobile_app", Context.MODE_PRIVATE)
    val baseUrl = prefs.getString("baseUrl", "") ?: ""
    val webhookId = prefs.getString("webhookId", "") ?: ""
    if (baseUrl.isEmpty() || webhookId.isEmpty()) return

    val zones = GeoZones.parse(prefs.getString("zones", "") ?: "")
    val loc = event.triggeringLocation

    // الاسم: أصغر منطقة بتحتوي موقع الحدث (للتعامل مع التداخل والخروج لمنطقة تانية
    // صح)، وإلا not_home.
    val name: String = when {
      loc != null -> GeoZones.smallestContaining(zones, loc.latitude, loc.longitude)?.name ?: NOT_HOME
      transition == Geofence.GEOFENCE_TRANSITION_EXIT -> NOT_HOME
      else -> event.triggeringGeofences?.firstOrNull()?.requestId ?: return
    }

    prefs.edit().putString("current_zone", if (name == NOT_HOME) "" else name).apply()

    // نبعت إحداثيات مع الاسم عشان مانفقدش موقع الشخص على الخريطة. من غير موقع،
    // نكتفي بتحديث current_zone وسيبنا للخدمة تبعت بموقع صح.
    if (loc != null) post(baseUrl, webhookId, name, loc.latitude, loc.longitude, if (loc.hasAccuracy()) loc.accuracy.toInt() else null)
  }

  private fun post(baseUrl: String, webhookId: String, locationName: String, lat: Double, lng: Double, acc: Int?) {
    val data = JSONObject()
      .put("location_name", locationName)
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
    private const val NOT_HOME = "not_home"
  }
}
