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
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
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
  private var started = false
  private var fastMode = false
  private var liveRevert: Runnable? = null

  private fun hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private val fusedClient: FusedLocationProviderClient by lazy {
    LocationServices.getFusedLocationProviderClient(this)
  }
  private val locationCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      result.lastLocation?.let { sendLocation(it) }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // أمر تبديل الوضع اللايف (عند الطلب من فرد تاني بيتفرّج على موقعي): مابنعملش
    // إعادة تهيئة كاملة — بس بنتأكد إن الخدمة شغّالة وبعدين نبدّل سرعة التحديث.
    if (intent?.action == ACTION_SET_MODE) {
      ensureStarted()
      // لازم نستوفي عقد startForegroundService (نداء startForeground كل دورة)
      // حتى لو الخدمة شغّالة أصلاً — إعادة نشر نفس الإشعار بلا ضرر.
      startAsForeground()
      val fast = intent.getBooleanExtra(EXTRA_LIVE, false)
      val ttl = intent.getLongExtra(EXTRA_TTL_MS, LIVE_TTL_MS)
      applyLocationMode(fast, ttl)
      return START_STICKY
    }
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
    started = true
    return START_STICKY
  }

  // بيتأكد إن الخدمة مهيّأة وشغّالة. بيُستدعى لما يوصل أمر لايف والخدمة لسه
  // ماشتغلتش عادي (مثلاً النظام أعاد إنشاءها) — بيقرأ الإعدادات من التخزين.
  private fun ensureStarted() {
    if (started) return
    val prefs = getSharedPreferences("mobile_app", Context.MODE_PRIVATE)
    if (baseUrl.isEmpty()) baseUrl = prefs.getString("baseUrl", "") ?: ""
    if (webhookId.isEmpty()) webhookId = prefs.getString("webhookId", "") ?: ""
    reportLocation = true
    useLocation = hasLocationPermission()
    startAsForeground()
    registerSensors()
    startLocationUpdates()
    startActivityUpdates()
    startTicker()
    started = true
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
      // Fused Location Provider من Google Play Services = دقيق جوه البيت
      // (بيدمج GPS + واي‑فاي + شبكة)، مش زي GPS_PROVIDER الخام اللي بيبوظ داخل
      // المباني أو بيرجّع آخر موقع قديم. نفس اللي بتستخدمه جوجل مابس والتطبيق
      // الرسمي، فبيدي موقع مظبوط وإحنا في البيت.
      // الوضع اللايف (fastMode): تحديث كل ~10 ثواني لما فرد بيتفرّج على موقعي؛
      // الوضع العادي: كل دقيقتين لتوفير البطارية.
      val interval = if (fastMode) FAST_INTERVAL_MS else LOCATION_INTERVAL_MS
      val fastest = if (fastMode) FAST_FASTEST_MS else NORMAL_FASTEST_MS
      val distance = if (fastMode) 0f else LOCATION_DISTANCE_M
      val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval)
        .setMinUpdateDistanceMeters(distance)
        .setMinUpdateIntervalMillis(fastest)
        .build()
      fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
      fusedClient.lastLocation.addOnSuccessListener { loc -> loc?.let { sendLocation(it) } }
    } catch (e: SecurityException) {
      // مفيش إذن موقع في الخلفية - نكمّل بالحساسات بس.
    }
  }

  // بيعيد تسجيل تحديثات الموقع بالوضع الحالي (بيشيل القديم الأول عشان مايبقاش
  // في أكتر من اشتراك).
  private fun restartLocationUpdates() {
    if (!useLocation) return
    try {
      fusedClient.removeLocationUpdates(locationCallback)
    } catch (e: Exception) {
    }
    startLocationUpdates()
  }

  // بيبدّل بين الوضع اللايف والعادي. كل نبضة لايف بتعيد ضبط مؤقّت الرجوع، فالوضع
  // اللايف بيفضل طول ما الفرد بيتفرّج + ttl بعد آخر نبضة ثم يرجع عادي تلقائيًا.
  private fun applyLocationMode(fast: Boolean, ttlMs: Long) {
    liveRevert?.let { handler.removeCallbacks(it) }
    liveRevert = null
    if (fast) {
      if (!fastMode) {
        fastMode = true
        restartLocationUpdates()
        fusedClient.lastLocation.addOnSuccessListener { loc -> loc?.let { sendLocation(it) } }
      }
      val revert = Runnable {
        fastMode = false
        restartLocationUpdates()
        liveRevert = null
      }
      liveRevert = revert
      handler.postDelayed(revert, ttlMs)
    } else if (fastMode) {
      fastMode = false
      restartLocationUpdates()
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
    liveRevert?.let { handler.removeCallbacks(it) }
    try {
      fusedClient.removeLocationUpdates(locationCallback)
    } catch (e: Exception) {
    }
    try {
      ActivityRecognition.getClient(this).removeActivityUpdates(activityPendingIntent())
    } catch (e: Exception) {
    }
  }

  companion object {
    const val ACTION_SET_MODE = "com.mkdd.familyha.action.SET_LOCATION_MODE"
    const val EXTRA_LIVE = "live"
    const val EXTRA_TTL_MS = "ttlMs"
    private const val CHANNEL = "mobile_app_report"
    private const val NOTIF_ID = 7731
    private const val LOCATION_INTERVAL_MS = 120000L
    private const val NORMAL_FASTEST_MS = 60000L
    private const val FAST_INTERVAL_MS = 10000L
    private const val FAST_FASTEST_MS = 5000L
    private const val LIVE_TTL_MS = 120000L
    private const val LOCATION_DISTANCE_M = 40f
    private const val SENSOR_INTERVAL_MS = 900000L
    private const val ACTIVITY_INTERVAL_MS = 120000L
  }
}
