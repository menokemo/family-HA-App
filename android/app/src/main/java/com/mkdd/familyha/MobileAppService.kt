package com.mkdd.familyha

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Geocoder
import android.location.Location
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.StatFs
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
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
  private var lastLocation: Location? = null

  private fun hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private val fusedClient: FusedLocationProviderClient by lazy {
    LocationServices.getFusedLocationProviderClient(this)
  }
  private val locationCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      result.lastLocation?.let { handleLocation(it) }
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
    // webhook جديد (إعادة تسجيل) = لازم نعيد تسجيل السينسورز للتسجيل الجديد،
    // وإلا الجهاز الجديد بياخد الـ device_tracker بس من غير سينسورز.
    val incomingWebhook = intent?.getStringExtra("webhookId")
    if (!incomingWebhook.isNullOrEmpty() && incomingWebhook != webhookId) {
      webhookId = incomingWebhook
      sensorsRegistered = false
    }
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

  // يفلتر قراءات الموقع عشان يمنع تذبذب المناطق (home/away flapping):
  // - بيرفض الـ fixes ضعيفة الدقة (fix وحش ممكن يرمي الموقع برّه المنطقة).
  // - مابيبعتش موقع جديد إلا لو الحركة أكبر من ضوضاء GPS فعلاً (مش اهتزاز وإحنا
  //   واقفين في مكاننا).
  private fun handleLocation(loc: Location) {
    if (loc.hasAccuracy() && loc.accuracy > MAX_ACCURACY_M) return
    val last = lastLocation
    if (last != null) {
      val moved = last.distanceTo(loc)
      val noise = maxOf(loc.accuracy, if (last.hasAccuracy()) last.accuracy else 0f)
      if (moved < maxOf(noise, MIN_REPORT_MOVE_M)) return
    }
    sendLocation(loc)
  }

  private fun sendLocation(location: Location) {
    lastLocation = location
    val data = JSONObject()
      .put("gps", JSONArray().put(location.latitude).put(location.longitude))
      .put("gps_accuracy", location.accuracy.toInt())
      .put("battery", batteryLevel())
    post(JSONObject().put("type", "update_location").put("data", data))
  }

  private fun registerSensors() {
    if (sensorsRegistered) return
    sensorsRegistered = true
    // مجموعة سينسورز مفيدة (زي التطبيق الأصلي بس بالمفيد منها) — بطارية وشحن
    // واتصال وتخزين. بتتحدّث دوريًا في updateSensors.
    registerSensor("battery_level", "Battery Level", batteryLevel().toString(), "battery", "%", "mdi:battery", stateClass = "measurement")
    registerSensor("battery_state", "Battery State", batteryState(), null, null, "mdi:battery-charging")
    registerSensor("is_charging", "Charging", if (batteryCharging()) "on" else "off", "battery_charging", null, "mdi:power-plug", type = "binary_sensor")
    registerSensor("charger_type", "Charger Type", chargerType(), null, null, "mdi:power-plug")
    registerSensor("battery_health", "Battery Health", batteryHealth(), null, null, "mdi:heart-pulse")
    registerSensor("battery_temperature", "Battery Temperature", batteryTemp().toString(), "temperature", "°C", "mdi:thermometer", stateClass = "measurement")
    registerSensor("network_type", "Network Type", networkType(), null, null, "mdi:network")
    registerSensor("wifi_connection", "Wi-Fi Connection", wifiSsid(), null, null, "mdi:wifi")
    registerSensor("wifi_signal_strength", "Wi-Fi Signal", wifiSignal().toString(), "signal_strength", "dBm", "mdi:wifi", stateClass = "measurement")
    registerSensor("storage_free", "Storage Free", storageFreeGb().toString(), null, "GB", "mdi:harddisk", stateClass = "measurement")
    registerSensor("last_update", "Last Update", nowIso(), "timestamp", null, "mdi:clock-outline")
    registerSensor("app_version", "App Version", appVersionName(), null, null, "mdi:information-outline")
    registerSensor("detected_activity", "Activity", "Unknown", null, null, "mdi:run")
    registerSensor("geocoded_location", "Geocoded Location", "Unknown", null, null, "mdi:map-marker")
    registerSensor("wifi_bssid", "Wi-Fi BSSID", bssid(), null, null, "mdi:router-wireless")
    registerSensor("ringer_mode", "Ringer Mode", ringerMode(), null, null, "mdi:volume-high")
    registerSensor("do_not_disturb", "Do Not Disturb", if (dndOn()) "on" else "off", null, null, "mdi:moon-waning-crescent", type = "binary_sensor")
    registerSensor("screen_on", "Screen On", if (screenOn()) "on" else "off", null, null, "mdi:cellphone", type = "binary_sensor")
  }

  private fun registerSensor(
    uniqueId: String,
    name: String,
    state: String,
    deviceClass: String?,
    unit: String?,
    icon: String,
    type: String = "sensor",
    stateClass: String? = null,
  ) {
    val data = JSONObject()
      .put("unique_id", uniqueId)
      .put("name", name)
      .put("type", type)
      .put("state", state)
      .put("icon", icon)
    if (deviceClass != null) data.put("device_class", deviceClass)
    if (unit != null) data.put("unit_of_measurement", unit)
    if (stateClass != null) data.put("state_class", stateClass)
    post(JSONObject().put("type", "register_sensor").put("data", data))
  }

  private fun sensorState(uniqueId: String, state: Any, icon: String): JSONObject =
    JSONObject().put("unique_id", uniqueId).put("state", state).put("icon", icon)

  private fun updateSensors() {
    val states = JSONArray()
      .put(sensorState("battery_level", batteryLevel(), "mdi:battery"))
      .put(sensorState("battery_state", batteryState(), "mdi:battery-charging"))
      .put(sensorState("is_charging", if (batteryCharging()) "on" else "off", "mdi:power-plug"))
      .put(sensorState("charger_type", chargerType(), "mdi:power-plug"))
      .put(sensorState("battery_health", batteryHealth(), "mdi:heart-pulse"))
      .put(sensorState("battery_temperature", batteryTemp(), "mdi:thermometer"))
      .put(sensorState("network_type", networkType(), "mdi:network"))
      .put(sensorState("wifi_connection", wifiSsid(), "mdi:wifi"))
      .put(sensorState("wifi_signal_strength", wifiSignal(), "mdi:wifi"))
      .put(sensorState("storage_free", storageFreeGb(), "mdi:harddisk"))
      .put(sensorState("last_update", nowIso(), "mdi:clock-outline"))
      .put(sensorState("wifi_bssid", bssid(), "mdi:router-wireless"))
      .put(sensorState("ringer_mode", ringerMode(), "mdi:volume-high"))
      .put(sensorState("do_not_disturb", if (dndOn()) "on" else "off", "mdi:moon-waning-crescent"))
      .put(sensorState("screen_on", if (screenOn()) "on" else "off", "mdi:cellphone"))
    post(JSONObject().put("type", "update_sensor_states").put("data", states))
    // الموقع الجغرافي (reverse geocoding) بيحتاج شبكة — بنعمله في ثريد منفصل
    // عشان مانعملش network على الـ main thread، وبنبعته لوحده لما يجهز.
    val loc = lastLocation
    if (loc != null) {
      Thread {
        val addr = geocodedLocation(loc)
        val one = JSONArray().put(sensorState("geocoded_location", addr, "mdi:map-marker"))
        post(JSONObject().put("type", "update_sensor_states").put("data", one))
      }.start()
    }
  }

  private fun batteryIntent(): Intent? =
    registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))

  private fun batteryLevel(): Int {
    val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    return if (level in 0..100) level else 0
  }

  private fun batteryCharging(): Boolean {
    val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
    return bm.isCharging
  }

  private fun batteryState(): String {
    return when (batteryIntent()?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1) {
      BatteryManager.BATTERY_STATUS_CHARGING -> "Charging"
      BatteryManager.BATTERY_STATUS_DISCHARGING -> "Discharging"
      BatteryManager.BATTERY_STATUS_FULL -> "Full"
      BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "Not charging"
      else -> "Unknown"
    }
  }

  private fun chargerType(): String {
    return when (batteryIntent()?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) {
      BatteryManager.BATTERY_PLUGGED_AC -> "AC"
      BatteryManager.BATTERY_PLUGGED_USB -> "USB"
      BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"
      else -> "None"
    }
  }

  private fun batteryHealth(): String {
    return when (batteryIntent()?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1) ?: -1) {
      BatteryManager.BATTERY_HEALTH_GOOD -> "Good"
      BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheat"
      BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"
      BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over voltage"
      BatteryManager.BATTERY_HEALTH_COLD -> "Cold"
      else -> "Unknown"
    }
  }

  private fun batteryTemp(): Int {
    val t = batteryIntent()?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
    return t / 10
  }

  private fun networkType(): String {
    return try {
      val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val caps = cm.getNetworkCapabilities(cm.activeNetwork)
      when {
        caps == null -> "None"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Cellular"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
        else -> "Other"
      }
    } catch (e: Exception) {
      "Unknown"
    }
  }

  private fun wifiSignal(): Int {
    return try {
      val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      wm.connectionInfo.rssi
    } catch (e: Exception) {
      0
    }
  }

  private fun storageFreeGb(): Long {
    return try {
      StatFs(Environment.getDataDirectory().path).availableBytes / (1000L * 1000L * 1000L)
    } catch (e: Exception) {
      0L
    }
  }

  private fun nowIso(): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).format(Date())

  private fun appVersionName(): String {
    return try {
      packageManager.getPackageInfo(packageName, 0).versionName ?: ""
    } catch (e: Exception) {
      ""
    }
  }

  // reverse geocoding — لازم يتنادى من ثريد خلفي (بيعمل شبكة).
  private fun geocodedLocation(loc: Location): String {
    return try {
      val geo = Geocoder(this, Locale.getDefault())
      @Suppress("DEPRECATION")
      val list = geo.getFromLocation(loc.latitude, loc.longitude, 1)
      val a = list?.firstOrNull() ?: return "Unknown"
      val parts = listOfNotNull(
        a.thoroughfare,
        a.subLocality ?: a.locality,
        a.adminArea,
      )
      if (parts.isNotEmpty()) parts.joinToString(", ") else (a.getAddressLine(0) ?: "Unknown")
    } catch (e: Exception) {
      "Unknown"
    }
  }

  private fun bssid(): String {
    return try {
      val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val b = wm.connectionInfo.bssid ?: ""
      if (b.isEmpty() || b == "02:00:00:00:00:00") "Not connected" else b
    } catch (e: Exception) {
      "unknown"
    }
  }

  private fun ringerMode(): String {
    return try {
      val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      when (am.ringerMode) {
        AudioManager.RINGER_MODE_NORMAL -> "Normal"
        AudioManager.RINGER_MODE_VIBRATE -> "Vibrate"
        AudioManager.RINGER_MODE_SILENT -> "Silent"
        else -> "Unknown"
      }
    } catch (e: Exception) {
      "Unknown"
    }
  }

  private fun dndOn(): Boolean {
    return try {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL &&
        nm.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN
    } catch (e: Exception) {
      false
    }
  }

  private fun screenOn(): Boolean {
    return try {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isInteractive
    } catch (e: Exception) {
      false
    }
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
    private const val MAX_ACCURACY_M = 65f
    private const val MIN_REPORT_MOVE_M = 30f
    private const val SENSOR_INTERVAL_MS = 900000L
    private const val ACTIVITY_INTERVAL_MS = 120000L
  }
}
