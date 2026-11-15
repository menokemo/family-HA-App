package com.mkdd.familyha

import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.bluetooth.BluetoothAdapter
import android.content.BroadcastReceiver
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
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
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
  // نفس حالة التطبيق الرسمي: وقت آخر إرسال + نص آخر إحداثي اتبعت (لمنع التكرار).
  private var lastLocationSendMs = 0L
  private var lastUpdateLocationStr: String? = null
  private var accurateInFlight = false
  // حالة المكالمة بتوصلنا من الـ broadcast (أدق من القراية الدورية لأنها لحظية).
  private var phoneState = "idle"
  private var stateReceiver: BroadcastReceiver? = null
  private var stateDebounce: Runnable? = null

  private fun hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private val fusedClient: FusedLocationProviderClient by lazy {
    LocationServices.getFusedLocationProviderClient(this)
  }
  private val geofencingClient: GeofencingClient by lazy {
    LocationServices.getGeofencingClient(this)
  }
  private fun geofencePendingIntent(): PendingIntent {
    val intent = Intent(this, GeofenceReceiver::class.java)
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags = flags or PendingIntent.FLAG_MUTABLE
    return PendingIntent.getBroadcast(this, 1, intent, flags)
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
    // طلب قراية دقيقة (من الجيوفنس لما قراية الحدث تبقى ضعيفة الدقة).
    if (intent?.action == ACTION_REQUEST_ACCURATE) {
      ensureStarted()
      startAsForeground()
      requestSingleAccurateLocation()
      return START_STICKY
    }
    // مزامنة مناطق HA: نخزّنها ونسجّلها كـ geofences عشان نبلّغ الحضور بدقة.
    if (intent?.action == ACTION_SET_ZONES) {
      ensureStarted()
      startAsForeground()
      val zonesJson = intent.getStringExtra(EXTRA_ZONES) ?: "[]"
      setupGeofences(zonesJson)
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
      // نفس إعدادات التطبيق الرسمي بالظبط (createLocationRequest):
      // أولوية متوازنة + كل 60 ثانية + أسرع 30 ثانية + انتظار أقصى ~200 ثانية،
      // و**من غير أي شرط مسافة** (setMinUpdateDistanceMeters) — الشرط ده كان بيمنع
      // التصحيحات الصغيرة فيفضل الموقع القديم متجمّد في HA.
      // الوضع اللايف (fastMode) بس هو اللي بيسرّع، لما فرد بيتفرّج على موقعي.
      val request = if (fastMode) {
        LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, FAST_INTERVAL_MS)
          .setMinUpdateIntervalMillis(FAST_FASTEST_MS)
          .build()
      } else {
        LocationRequest.Builder(LOCATION_INTERVAL_MS)
          .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
          .setMinUpdateIntervalMillis(NORMAL_FASTEST_MS)
          .setMaxUpdateDelayMillis(LOCATION_MAX_WAIT_MS)
          .build()
      }
      fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
      requestFreshLocation()
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
        requestFreshLocation()
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
    registerStateReceiver()
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

  // بيطلب موقع "حالي" جديد ودقيق من Fused Provider (getCurrentLocation) بدل
  // lastLocation المخزّن - لأن lastLocation بيرجّع آخر موقع مخبّأ وممكن يكون
  // قديم أو بعيد بأميال حتى لو Google Maps/Find Hub شايفين الموقع الصح. بنمرّره
  // على handleLocation عشان يتفلتر بالدقة زي أي تحديث عادي. ده بيُستخدم أول ما
  // التتبّع يبدأ أو الوضع يتبدّل، فمايبعتش موقع بعيد غلط لـ HA.
  private fun requestFreshLocation() {
    try {
      fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
        .addOnSuccessListener { loc -> loc?.let { handleLocation(it) } }
    } catch (e: SecurityException) {
      // مفيش إذن موقع - نتجاهل.
    }
  }

  // يفلتر قراءات الموقع عشان يمنع تذبذب المناطق (home/away flapping):
  // - بيرفض الـ fixes ضعيفة الدقة (fix وحش ممكن يرمي الموقع برّه المنطقة).
  // - مابيبعتش موقع جديد إلا لو الحركة أكبر من ضوضاء GPS فعلاً (مش اهتزاز وإحنا
  //   واقفين في مكاننا).
  // بيسجّل مناطق HA كـ geofences. بنشيل القديم الأول عشان مايتكررش، وبنخزّن
  // تعريف المناطق في prefs عشان GeofenceReceiver يحسب الحضور عند العبور.
  private fun setupGeofences(zonesJson: String) {
    getSharedPreferences("mobile_app", Context.MODE_PRIVATE).edit().putString("zones", zonesJson).apply()
    if (!hasLocationPermission()) return
    val geofences = buildGeofences(zonesJson)
    try {
      geofencingClient.removeGeofences(geofencePendingIntent())
      if (geofences.isEmpty()) return
      // INITIAL_TRIGGER_ENTER/DWELL: لو إحنا جوه منطقة وقت التسجيل، يتبلّغ فورًا
      // فالحالة تبدأ صح من غير ما نستنى عبور.
      val request = GeofencingRequest.Builder()
        .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER or GeofencingRequest.INITIAL_TRIGGER_DWELL)
        .addGeofences(geofences)
        .build()
      geofencingClient.addGeofences(request, geofencePendingIntent())
    } catch (e: SecurityException) {
      // مفيش إذن موقع في الخلفية - من غير geofences.
    }
  }

  // Play Services بيسمح بحد أقصى 100 geofence؛ ناخد أول 100 لو أكتر.
  private fun buildGeofences(zonesJson: String): List<Geofence> =
    GeoZones.parse(zonesJson).take(100).filter { it.radius > 0f && !it.lat.isNaN() && !it.lng.isNaN() }.map { z ->
      Geofence.Builder()
        .setRequestId(z.name)
        .setCircularRegion(z.lat, z.lng, z.radius)
        .setExpirationDuration(Geofence.NEVER_EXPIRE)
        .setLoiteringDelay(GEOFENCE_LOITER_MS)
        .setTransitionTypes(
          Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT or Geofence.GEOFENCE_TRANSITION_DWELL,
        )
        .build()
    }

  // شروط قبول القراية — منقولة حرفيًا من منطق التطبيق الرسمي
  // (handleLocationUpdate + sendLocationUpdate في LocationSensorManager.kt):
  //  1) الدقة أسوأ من الحد (200م) → ارفض.
  //  2) وقت القراية من المستقبل → ارفض.
  //  3) وقتها أقدم من آخر إرسال → ارفض (ترتيب غلط).
  //  4) أقدم من 5 دقايق → ارفض (fix مخبّأ).
  //  5) نفس الإحداثي بالظبط → ارفض إلا لو عدّت 15 دقيقة (منع تكرار).
  //  6) إحداثي مختلف → ارفض لو لسه أقل من 5 ثواني على آخر إرسال (debounce).
  // مفيش أي شرط "اتحرك 30 متر" — ده كان اختراعنا وهو سبب تجمّد الموقع في البيت.
  private fun handleLocation(loc: Location, force: Boolean = false) {
    if (loc.hasAccuracy() && loc.accuracy > MAX_ACCURACY_M) return
    val now = System.currentTimeMillis()
    if (loc.time > now + FUTURE_SKEW_MS) return
    if (loc.time < lastLocationSendMs) return
    if (now - loc.time > STALE_LOCATION_MS) return

    val key = "${loc.latitude},${loc.longitude}"
    if (key == lastUpdateLocationStr) {
      if (now < lastLocationSendMs + DUPLICATE_WINDOW_MS) return
    } else if (!force && now < lastLocationSendMs + DEBOUNCE_MS) {
      return
    }
    sendLocation(loc, now, key)
  }

  // طلب قراية دقيقة بمحاولات متكررة — نفس requestSingleAccurateLocation الرسمي:
  // GPS عالي الدقة، لحد 5 محاولات كل 5 ثواني. بيقبل أول قراية دقتها ضمن الحد،
  // وفي آخر محاولة بيقبل لحد ضعف الحد. بنستخدمه عند حدود الزون لما القراية ضعيفة.
  private fun requestSingleAccurateLocation() {
    if (accurateInFlight || !useLocation) return
    accurateInFlight = true
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, ACCURATE_INTERVAL_MS)
      .setMinUpdateIntervalMillis(ACCURATE_FASTEST_MS)
      .setMaxUpdates(ACCURATE_RETRIES)
      .build()
    val cb = object : LocationCallback() {
      private var calls = 0
      override fun onLocationResult(result: LocationResult) {
        calls++
        val loc = result.lastLocation ?: return
        val done = when {
          loc.accuracy <= MAX_ACCURACY_M -> { handleLocation(loc, force = true); true }
          calls >= ACCURATE_RETRIES -> { if (loc.accuracy <= MAX_ACCURACY_M * 2) handleLocation(loc, force = true); true }
          else -> false
        }
        if (done) {
          accurateInFlight = false
          try { fusedClient.removeLocationUpdates(this) } catch (e: Exception) { /* ignore */ }
        }
      }
    }
    try {
      fusedClient.requestLocationUpdates(request, cb, Looper.getMainLooper())
    } catch (e: SecurityException) {
      accurateInFlight = false
    }
  }

  private fun sendLocation(location: Location, now: Long, key: String) {
    lastLocation = location
    lastLocationSendMs = now
    lastUpdateLocationStr = key
    val data = JSONObject()
      .put("gps", JSONArray().put(location.latitude).put(location.longitude))
      .put("gps_accuracy", location.accuracy.toInt())
      .put("battery", batteryLevel())
    // السرعة الحقيقية من الـ GPS (m/s) — HA بيعرضها كـ attribute والخريطة بتقراها
    // بدل ما تحسبها محليًا (حساب غلط). HA بيستقبلها كعدد صحيح موجب.
    if (location.hasSpeed() && location.speed >= 0f) data.put("speed", location.speed.toInt())
    if (location.hasBearing()) data.put("course", location.bearing.toInt())
    // ملحوظة مهمة: مابنبعتش `location_name` خالص — بنبعت الإحداثيات الخام بس زي
    // التطبيق الرسمي بالظبط، ونسيب **HA هو اللي يحسب المنطقة/الحضور** (HA بيحسبها
    // بذكاء مع مراعاة دقة الـ GPS، فبيعتبرك "home" لو دايرة دقتك بتلمس البيت). كنا
    // بنحسبها محليًا ونبعتها بـ location_name — حساب أصرم بيتجاهل الدقة فكان بيفرض
    // not_home غلط وانت في البيت (على عكس التطبيق الرسمي).
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
    // بلوتوث: الحالة + عدد الأجهزة المتصلة (بأسماء الأجهزة في الـ attributes).
    // مفيدة للحضور في البيت/العربية (مثلاً اتصال بسماعة العربية = بيسوق).
    registerSensor("bluetooth_state", "Bluetooth State", if (BluetoothHelper.isOn(this)) "on" else "off", null, null, "mdi:bluetooth", type = "binary_sensor", entityCategory = "diagnostic")
    registerSensor("bluetooth_connection", "Bluetooth Connection", "0", null, "connection(s)", "mdi:bluetooth-connect", stateClass = "measurement")
    registerSensor("phone_state", "Phone State", phoneState, null, null, "mdi:phone")
    registerSensor("device_locked", "Device Locked", if (deviceLocked()) "on" else "off", null, null, "mdi:cellphone-lock", type = "binary_sensor", entityCategory = "diagnostic")
    registerSensor("next_alarm", "Next Alarm", nextAlarmUtc(), "timestamp", null, "mdi:alarm")
    registerSensor("mobile_data", "Mobile Data", if (mobileDataEnabled()) "on" else "off", null, null, "mdi:signal", type = "binary_sensor", entityCategory = "diagnostic")
    registerSensor("sim_1_signal_strength", "SIM 1 Signal Strength", simSignalDbm().toString(), "signal_strength", "dBm", "mdi:signal-cellular-3", stateClass = "measurement")
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
    entityCategory: String? = null,
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
    if (entityCategory != null) data.put("entity_category", entityCategory)
    post(JSONObject().put("type", "register_sensor").put("data", data))
  }

  private fun sensorState(
    uniqueId: String,
    state: Any,
    icon: String,
    attributes: JSONObject? = null,
  ): JSONObject {
    val o = JSONObject().put("unique_id", uniqueId).put("state", state).put("icon", icon)
    if (attributes != null) o.put("attributes", attributes)
    return o
  }

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
      .put(sensorState("bluetooth_state", if (BluetoothHelper.isOn(this)) "on" else "off", if (BluetoothHelper.isOn(this)) "mdi:bluetooth" else "mdi:bluetooth-off"))
      .put(bluetoothConnectionState())
      .put(sensorState("phone_state", phoneState, if (phoneState == "idle") "mdi:phone" else "mdi:phone-in-talk"))
      .put(sensorState("device_locked", if (deviceLocked()) "on" else "off", "mdi:cellphone-lock"))
      .put(nextAlarmState())
      .put(sensorState("mobile_data", if (mobileDataEnabled()) "on" else "off", "mdi:signal"))
      .put(sensorState("sim_1_signal_strength", simSignalDbm(), "mdi:signal-cellular-3"))
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

  // عدد الأجهزة المتصلة + أسماء المقترنة/المتصلة في الـ attributes، بنفس
  // مفاتيح التطبيق الرسمي عشان أي أتوميشن جاهزة تشتغل زي ما هي.
  private fun bluetoothConnectionState(): JSONObject {
    val devices = BluetoothHelper.devices(this)
    val attrs = JSONObject()
      .put("connected_paired_devices", JSONArray(devices.filter { it.paired && it.connected }.map { BluetoothHelper.label(it) }))
      .put("connected_not_paired_devices", JSONArray(devices.filter { !it.paired && it.connected }.map { BluetoothHelper.label(it) }))
      .put("paired_devices", JSONArray(devices.filter { it.paired }.map { BluetoothHelper.label(it) }))
    val connected = devices.count { it.connected }
    return sensorState("bluetooth_connection", connected, "mdi:bluetooth-connect", attrs)
  }

  private fun deviceLocked(): Boolean {
    return try {
      val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      km.isDeviceLocked
    } catch (e: Exception) {
      false
    }
  }

  private fun nextAlarmInfo(): AlarmManager.AlarmClockInfo? {
    return try {
      (getSystemService(Context.ALARM_SERVICE) as AlarmManager).nextAlarmClock
    } catch (e: Exception) {
      null
    }
  }

  private fun nextAlarmUtc(): String {
    val info = nextAlarmInfo() ?: return "unavailable"
    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
    return sdf.format(Date(info.triggerTime))
  }

  private fun nextAlarmState(): JSONObject {
    val info = nextAlarmInfo()
    val attrs = JSONObject()
      .put("Time in Milliseconds", info?.triggerTime ?: 0L)
      .put("Package", info?.showIntent?.creatorPackage ?: "unknown")
    if (info != null) attrs.put("Local Time", Date(info.triggerTime).toString())
    return sensorState("next_alarm", nextAlarmUtc(), "mdi:alarm", attrs)
  }

  private fun telephony(): TelephonyManager? = try {
    getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
  } catch (e: Exception) {
    null
  }

  private fun mobileDataEnabled(): Boolean {
    return try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
      telephony()?.isDataEnabled == true
    } catch (e: Exception) {
      false
    }
  }

  // قوة شبكة الموبايل بالـ dBm. محتاجة READ_PHONE_STATE على أندرويد 12+،
  // فلو الإذن مش ممنوح بنرجّع 0 بدل ما نكسر باقي التحديث.
  private fun simSignalDbm(): Int {
    return try {
      // getSignalStrength من API 28 لكن getCellSignalStrengths من API 29.
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
      telephony()?.signalStrength?.cellSignalStrengths?.firstOrNull()?.dbm ?: 0
    } catch (e: Exception) {
      0
    }
  }

  private fun readPhoneState(): String {
    return try {
      when (telephony()?.callState) {
        TelephonyManager.CALL_STATE_RINGING -> "ringing"
        TelephonyManager.CALL_STATE_OFFHOOK -> "offhook"
        else -> "idle"
      }
    } catch (e: Exception) {
      "idle"
    }
  }

  // أحداث فورية: بلوتوث (فتح/قفل واتصال/فصل جهاز)، قفل الشاشة، المنبّه الجاي،
  // وحالة المكالمة. بننتظر شويّة قبل الإرسال عشان الحدث الواحد مايعملش كذا
  // إرسال (مثلاً سماعة بتتصل على كذا بروفايل في نفس اللحظة).
  private fun registerStateReceiver() {
    if (stateReceiver != null) return
    val filter = IntentFilter().apply {
      addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
      addAction("android.bluetooth.device.action.ACL_CONNECTED")
      addAction("android.bluetooth.device.action.ACL_DISCONNECTED")
      addAction(AlarmManager.ACTION_NEXT_ALARM_CLOCK_CHANGED)
      addAction(TelephonyManager.ACTION_PHONE_STATE_CHANGED)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action == TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
          phoneState = when (intent.getStringExtra(TelephonyManager.EXTRA_STATE)) {
            TelephonyManager.EXTRA_STATE_RINGING -> "ringing"
            TelephonyManager.EXTRA_STATE_OFFHOOK -> "offhook"
            else -> "idle"
          }
        }
        stateDebounce?.let { handler.removeCallbacks(it) }
        val run = Runnable { updateSensors() }
        stateDebounce = run
        handler.postDelayed(run, STATE_DEBOUNCE_MS)
      }
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)
      } else {
        registerReceiver(receiver, filter)
      }
      stateReceiver = receiver
      phoneState = readPhoneState()
    } catch (e: Exception) {
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
    stateDebounce?.let { handler.removeCallbacks(it) }
    stateReceiver?.let {
      try {
        unregisterReceiver(it)
      } catch (e: Exception) {
      }
    }
    stateReceiver = null
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
    const val ACTION_SET_ZONES = "com.mkdd.familyha.action.SET_ZONES"
    const val ACTION_REQUEST_ACCURATE = "com.mkdd.familyha.action.REQUEST_ACCURATE"
    const val EXTRA_LIVE = "live"
    const val EXTRA_TTL_MS = "ttlMs"
    const val EXTRA_ZONES = "zones"
    // تأخير الاستقرار جوه المنطقة قبل حدث DWELL (تهدئة زي التطبيق الرسمي).
    private const val GEOFENCE_LOITER_MS = 30000
    private const val CHANNEL = "mobile_app_report"
    private const val NOTIF_ID = 7731
    // كل القيم دي مطابقة للتطبيق الرسمي (LocationSensorManager.kt).
    private const val LOCATION_INTERVAL_MS = 60000L // DEFAULT_LOCATION_INTERVAL
    private const val NORMAL_FASTEST_MS = 30000L // DEFAULT_LOCATION_FAST_INTERVAL
    private const val LOCATION_MAX_WAIT_MS = 200000L // DEFAULT_LOCATION_MAX_WAIT_TIME
    private const val MAX_ACCURACY_M = 200f // DEFAULT_MINIMUM_ACCURACY
    private const val STALE_LOCATION_MS = 300000L // أقدم من 5 دقايق = fix مخبّأ، يترفض
    private const val FUTURE_SKEW_MS = 5000L // سماح 5ث قبل اعتباره "من المستقبل"
    private const val DUPLICATE_WINDOW_MS = 900000L // نفس الإحداثي يتبعت كل 15 دقيقة
    private const val DEBOUNCE_MS = 5000L // أقل فاصل بين إرسالين لإحداثي مختلف
    private const val ACCURATE_RETRIES = 5 // محاولات القراية الدقيقة
    private const val ACCURATE_INTERVAL_MS = 10000L
    private const val ACCURATE_FASTEST_MS = 5000L
    // الوضع اللايف (ميزة عندنا): لما فرد بيتفرّج على موقعي.
    private const val FAST_INTERVAL_MS = 10000L
    private const val FAST_FASTEST_MS = 5000L
    private const val LIVE_TTL_MS = 120000L
    private const val SENSOR_INTERVAL_MS = 900000L
    private const val ACTIVITY_INTERVAL_MS = 120000L
    // تجميع الأحداث اللحظية (بلوتوث/قفل/مكالمة) في إرسال واحد.
    private const val STATE_DEBOUNCE_MS = 1500L
  }
}
