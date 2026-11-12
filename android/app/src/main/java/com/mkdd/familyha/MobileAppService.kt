package com.mkdd.familyha

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
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
import java.util.concurrent.TimeUnit

/**
 * خدمة foreground بتبعت بيانات الموبايل لـHome Assistant عبر webhook تكامل
 * mobile_app (نفس اللي بيعمله التطبيق الرسمي): الموقع في الخلفية + البطارية +
 * واي‑فاي البيت. مستقلة عن مراقبة الإنذار.
 */
class MobileAppService : Service() {
  private val client = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()
  private val json = "application/json".toMediaType()
  private val handler = Handler(Looper.getMainLooper())
  private var ticker: Runnable? = null
  private var sensorsRegistered = false

  private var baseUrl = ""
  private var webhookId = ""
  private var reportLocation = false
  private var useLocation = false

  private fun hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private val locationListener = object : LocationListener {
    override fun onLocationChanged(location: Location) = sendLocation(location)
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}
    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    baseUrl = intent?.getStringExtra("baseUrl")?.ifEmpty { baseUrl } ?: baseUrl
    webhookId = intent?.getStringExtra("webhookId")?.ifEmpty { webhookId } ?: webhookId
    reportLocation = intent?.getBooleanExtra("reportLocation", reportLocation) ?: reportLocation
    useLocation = reportLocation && hasLocationPermission()
    if (baseUrl.isEmpty() || webhookId.isEmpty()) {
      stopSelf()
      return START_NOT_STICKY
    }
    getSharedPreferences("mobile_app", Context.MODE_PRIVATE)
      .edit()
      .putString("baseUrl", baseUrl)
      .putString("webhookId", webhookId)
      .apply()
    startAsForeground()
    registerSensors()
    startLocationUpdates()
    startActivityUpdates()
    startTicker()
    return START_STICKY
  }

  private fun activityPendingIntent(): PendingIntent {
    val intent = Intent(this, ActivityReceiver::class.java)
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags = flags or PendingIntent.FLAG_MUTABLE
    return PendingIntent.getBroadcast(this, 0, intent, flags)
  }

  private fun startActivityUpdates() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    try {
      ActivityRecognition.getClient(this).requestActivityUpdates(ACTIVITY_INTERVAL_MS, activityPendingIntent())
    } catch (e: Exception) {
    }
  }

  private fun startAsForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL, "تحديث الموقع والحالة", NotificationManager.IMPORTANCE_MIN),
      )
    }
    val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle("Secure Family")
      .setContentText("Location & status reporting active")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val type = if (useLocation) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      } else {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      }
      startForeground(NOTIF_ID, notification, type)
    } else {
      startForeground(NOTIF_ID, notification)
    }
  }

  private fun startLocationUpdates() {
    if (!useLocation) return
    try {
      val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
      val provider = when {
        lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
        lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
        else -> return
      }
      lm.requestLocationUpdates(provider, LOCATION_INTERVAL_MS, LOCATION_DISTANCE_M, locationListener, Looper.getMainLooper())
      lm.getLastKnownLocation(provider)?.let { sendLocation(it) }
    } catch (e: SecurityException) {
      // مفيش إذن موقع في الخلفية - نكمّل بالحساسات بس.
    }
  }

  private fun startTicker() {
    ticker?.let { handler.removeCallbacks(it) }
    val runnable = object : Runnable {
      override fun run() {
        updateSensors()
        handler.postDelayed(this, SENSOR_INTERVAL_MS)
      }
    }
    ticker = runnable
    handler.post(runnable)
  }

  private fun post(body: JSONObject) {
    if (baseUrl.isEmpty() || webhookId.isEmpty()) return
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

  private fun sendLocation(location: Location) {
    val data = JSONObject()
      .put("gps", JSONArray().put(location.latitude).put(location.longitude))
      .put("gps_accuracy", location.accuracy.toInt())
      .put("battery", batteryLevel())
    post(JSONObject().put("type", "update_location").put("data", data))
  }

  private fun registerSensors() {
    if (sensorsRegistered) return
    sensorsRegistered = true
    registerSensor("battery_level", "Battery Level", batteryLevel().toString(), "battery", "%", "mdi:battery")
    registerSensor("battery_state", "Battery State", if (batteryCharging()) "Charging" else "Not charging", null, null, "mdi:battery-charging")
    registerSensor("wifi_connection", "Wi-Fi Connection", wifiSsid(), null, null, "mdi:wifi")
    registerSensor("detected_activity", "Activity", "Unknown", null, null, "mdi:run")
  }

  private fun registerSensor(uniqueId: String, name: String, state: String, deviceClass: String?, unit: String?, icon: String) {
    val data = JSONObject()
      .put("unique_id", uniqueId)
      .put("name", name)
      .put("type", "sensor")
      .put("state", state)
      .put("icon", icon)
    if (deviceClass != null) data.put("device_class", deviceClass)
    if (unit != null) data.put("unit_of_measurement", unit)
    post(JSONObject().put("type", "register_sensor").put("data", data))
  }

  private fun updateSensors() {
    val states = JSONArray()
      .put(JSONObject().put("unique_id", "battery_level").put("state", batteryLevel()).put("icon", "mdi:battery"))
      .put(JSONObject().put("unique_id", "battery_state").put("state", if (batteryCharging()) "Charging" else "Not charging").put("icon", "mdi:battery-charging"))
      .put(JSONObject().put("unique_id", "wifi_connection").put("state", wifiSsid()).put("icon", "mdi:wifi"))
    post(JSONObject().put("type", "update_sensor_states").put("data", states))
  }

  private fun batteryLevel(): Int {
    val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    return if (level in 0..100) level else 0
  }

  private fun batteryCharging(): Boolean {
    val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    return bm.isCharging
  }

  private fun wifiSsid(): String {
    return try {
      val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val raw = wm.connectionInfo.ssid?.replace("\"", "") ?: ""
      if (raw.isEmpty() || raw == "<unknown ssid>") "Not connected" else raw
    } catch (e: Exception) {
      "unknown"
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    ticker?.let { handler.removeCallbacks(it) }
    try {
      (getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(locationListener)
    } catch (e: Exception) {
    }
    try {
      ActivityRecognition.getClient(this).removeActivityUpdates(activityPendingIntent())
    } catch (e: Exception) {
    }
  }

  companion object {
    private const val CHANNEL = "mobile_app_report"
    private const val NOTIF_ID = 7731
    private const val LOCATION_INTERVAL_MS = 120000L
    private const val LOCATION_DISTANCE_M = 40f
    private const val SENSOR_INTERVAL_MS = 900000L
    private const val ACTIVITY_INTERVAL_MS = 120000L
  }
}
