package com.mkdd.familyha

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.location.Location
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
 * الحضور لـHA مباشرة عبر `location_name` في رسالة update_location — بدل ما نسيب
 * HA يحسب المنطقة من GPS خام (اللي بيعمل تذبذب home↔away على حافة المنطقة).
 *
 * نفس أسلوب التطبيق الرسمي: نظام التشغيل هو اللي بيكتشف عبور الحدود (فيه تهدئة
 * مدمجة)، واحنا بنبعت اسم المنطقة (أو not_home) كحالة قاطعة.
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

    val zones = parseZones(prefs.getString("zones", "") ?: "")
    val loc = event.triggeringLocation

    // الاسم اللي هنبلّغه: المنطقة اللي إحنا فيها دلوقتي (الأصغر لو متداخلة)، وإلا
    // not_home. نحسبه من موقع الحدث مقابل كل المناطق عشان نتعامل مع التداخل
    // والخروج لمنطقة تانية صح.
    val name: String = when {
      loc != null -> containingZone(zones, loc.latitude, loc.longitude) ?: NOT_HOME
      transition == Geofence.GEOFENCE_TRANSITION_EXIT -> NOT_HOME
      else -> event.triggeringGeofences?.firstOrNull()?.requestId ?: return
    }

    prefs.edit().putString("current_zone", if (name == NOT_HOME) "" else name).apply()
    post(baseUrl, webhookId, name)
  }

  // أصغر منطقة (بنصف قطر) بتحتوي النقطة، أو null لو بره كل المناطق.
  private fun containingZone(zones: List<ZoneDef>, lat: Double, lng: Double): String? {
    var best: ZoneDef? = null
    val out = FloatArray(1)
    for (z in zones) {
      Location.distanceBetween(lat, lng, z.lat, z.lng, out)
      if (out[0] <= z.radius && (best == null || z.radius < best!!.radius)) best = z
    }
    return best?.name
  }

  private fun parseZones(raw: String): List<ZoneDef> {
    if (raw.isEmpty()) return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        val name = o.optString("name")
        if (name.isEmpty()) return@mapNotNull null
        ZoneDef(name, o.optDouble("lat"), o.optDouble("lng"), o.optDouble("radius", 100.0).toFloat())
      }
    } catch (e: Exception) {
      emptyList()
    }
  }

  private fun post(baseUrl: String, webhookId: String, locationName: String) {
    val data = JSONObject().put("location_name", locationName)
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

  private data class ZoneDef(val name: String, val lat: Double, val lng: Double, val radius: Float)

  companion object {
    private const val NOT_HOME = "not_home"
  }
}
