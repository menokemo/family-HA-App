package com.mkdd.familyha

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity
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
 * بيستقبل تحديثات تمييز النشاط من Google Play Services ويبعتها لـHome Assistant
 * كحسّاس mobile_app (ثابت/ماشي/بيجري/بيقود…).
 */
class ActivityReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityRecognitionResult.hasResult(intent)) return
    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    val label = when (result.mostProbableActivity.type) {
      DetectedActivity.STILL -> "Still"
      DetectedActivity.WALKING, DetectedActivity.ON_FOOT -> "Walking"
      DetectedActivity.RUNNING -> "Running"
      DetectedActivity.ON_BICYCLE -> "Cycling"
      DetectedActivity.IN_VEHICLE -> "Driving"
      DetectedActivity.TILTING -> "Tilting"
      else -> "Unknown"
    }
    val prefs = context.getSharedPreferences("mobile_app", Context.MODE_PRIVATE)
    val baseUrl = prefs.getString("baseUrl", "") ?: ""
    val webhookId = prefs.getString("webhookId", "") ?: ""
    if (baseUrl.isEmpty() || webhookId.isEmpty()) return

    val body = JSONObject()
      .put("type", "update_sensor_states")
      .put(
        "data",
        JSONArray().put(
          JSONObject()
            .put("unique_id", "detected_activity")
            .put("state", label)
            .put("icon", "mdi:run"),
        ),
      )
    val request = Request.Builder()
      .url("$baseUrl/api/webhook/$webhookId")
      .post(body.toString().toRequestBody("application/json".toMediaType()))
      .build()
    OkHttpClient().newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {}
      override fun onResponse(call: Call, response: Response) {
        response.close()
      }
    })
  }
}
