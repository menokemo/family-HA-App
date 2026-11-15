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
  private var stateReceiver: BroadcastReceiver? = null
  private var stateDebounce: Runnable? = null
  // إعدادات البيكونات — بتوصل من التطبيق وبتتخزّن عشان تفضل بعد إعادة تشغيل الخدمة.
  private var beaconMonitorEnabled = false
  private var beaconTransmitEnabled = false
  private var beaconUuid = ""
  private var beaconMajor = BleBeacons.DEFAULT_MAJOR
  private var beaconMinor = BleBeacons.DEFAULT_MINOR
  // وضع الدقة العالية + مرساة البيت بالبلوتوث.
  private var highAccuracyEnabled = false
  private var highAccuracyUseZones = false
  private var highAccuracyBtDevices = emptySet<String>()
  private var highAccuracyActive = false
  private var homeBtDevices = emptySet<String>()

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
    // إعدادات البيكونات من التطبيق (رصد/بث + UUID).
    if (intent?.action == ACTION_SET_BEACONS) {
      ensureStarted()
      startAsForeground()
      beaconMonitorEnabled = intent.getBooleanExtra(EXTRA_BEACON_MONITOR, false)
      beaconTransmitEnabled = intent.getBooleanExtra(EXTRA_BEACON_TRANSMIT, false)
      beaconUuid = intent.getStringExtra(EXTRA_BEACON_UUID) ?: ""
      beaconMajor = intent.getStringExtra(EXTRA_BEACON_MAJOR)?.ifEmpty { BleBeacons.DEFAULT_MAJOR } ?: BleBeacons.DEFAULT_MAJOR
      beaconMinor = intent.getStringExtra(EXTRA_BEACON_MINOR)?.ifEmpty { BleBeacons.DEFAULT_MINOR } ?: BleBeacons.DEFAULT_MINOR
      saveBeaconConfig()
      applyBeaconConfig()
      updateSensors()
      return START_STICKY
    }
    // إعدادات الدقة العالية + مرساة البيت بالبلوتوث.
    if (intent?.action == ACTION_SET_ACCURACY) {
      ensureStarted()
      startAsForeground()
      highAccuracyEnabled = intent.getBooleanExtra(EXTRA_HA_ENABLED, false)
      highAccuracyUseZones = intent.getBooleanExtra(EXTRA_HA_ZONES, false)
      highAccuracyBtDevices = splitAddresses(intent.getStringExtra(EXTRA_HA_BT_DEVICES))
      homeBtDevices = splitAddresses(intent.getStringExtra(EXTRA_HOME_BT_DEVICES))
      saveAccuracyConfig()
      evaluateHighAccuracy()
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
    loadBeaconConfig()
    loadAccuracyConfig()
    applyBeaconConfig()
    registerSensors()
    startLocationUpdates()
    startActivityUpdates()
    startTicker()
    evaluateHighAccuracy()
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
    loadBeaconConfig()
    loadAccuracyConfig()
    reportLocation = true
    useLocation = hasLocationPermission()
    startAsForeground()
    applyBeaconConfig()
    registerSensors()
    startLocationUpdates()
    startActivityUpdates()
    startTicker()
    evaluateHighAccuracy()
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
      // حاجتين بس بيسرّعوا: الوضع اللايف (فرد بيتفرّج على موقعي)، ووضع الدقة
      // العالية (جهاز بلوتوث محدد متصل أو قريب من منطقة). الاتنين بيستخدموا
      // **نفس** الطلب — HIGH_ACCURACY بيشغّل الـGPS **مع** الواي‑فاي والشبكة
      // في نفس الوقت (على عكس BALANCED اللي بيعتمد على الشبكة وبيستخدم الـGPS
      // بالعند). قيمنا هي قيم الرسمي في وضع الدقة العالية (5 ثواني / نصها).
      val request = if (fastMode || highAccuracyActive) {
        LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, HIGH_ACCURACY_INTERVAL_MS)
          .setMinUpdateIntervalMillis(HIGH_ACCURACY_FASTEST_MS)
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
    // not_home غلط وانت في البيت (على عكس التطبيق الرسمي). وكمان `location_name`
    // بقت deprecated في HA ومش هتتدعم من 2027.7.
    //
    // الاستثناء الوحيد: **مرساة البيت بالبلوتوث**. لما جهاز ثابت في البيت
    // (المستخدم بنفسه بيحدده) يكون متصل، ده دليل **مستقل** إننا في البيت — مش
    // إعادة حساب لنفس الـGPS (اللي كانت غلطة 2.18.5). ساعتها بنبعت
    // `in_zones` ومعاها **الإحداثيات الحقيقية زي ما هي**: HA بيتخطّى حساب
    // المنطقة من الإحداثيات ويستخدم in_zones (شوف TrackerEntity في
    // device_tracker/entity.py)، فالحضور يبقى يقيني والخريطة تفضل مظبوطة.
    // مابنغيّرش إحداثي واحد — ده الفرق الجوهري عن 2.18.5.
    if (homeBtDevices.isNotEmpty() && connectedBtAddresses().any { homeBtDevices.contains(it) }) {
      data.put("in_zones", JSONArray().put(HOME_ZONE_ENTITY))
    }
    post(JSONObject().put("type", "update_location").put("data", data))
    // كل قراية جديدة ممكن تدخّلنا/تخرّجنا من نطاق المنطقة، فبنعيد تقييم مُشغّل
    // الدقة العالية. آمنة من التكرار اللانهائي: التقييم بيرجع على طول لو الحالة
    // ماتغيّرتش.
    evaluateHighAccuracy()
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
    registerSensor("device_locked", "Device Locked", if (deviceLocked()) "on" else "off", null, null, "mdi:cellphone-lock", type = "binary_sensor", entityCategory = "diagnostic")
    registerSensor("next_alarm", "Next Alarm", nextAlarmUtc(), "timestamp", null, "mdi:alarm")
    // البيكونات (اختيارية، بمفتاح في الإعدادات): رصد بيكونات iBeacon للحضور على
    // مستوى الغرفة، وبث الموبايل نفسه كبيكون عشان ESPHome يرصده.
    registerSensor("beacon_monitor", "Beacon Monitor", BleBeacons.monitorState(this), null, null, "mdi:bluetooth", entityCategory = "diagnostic")
    registerSensor("ble_emitter", "BLE Transmitter", BleBeacons.transmitState(this), null, null, "mdi:bluetooth-audio", entityCategory = "diagnostic")
    registerSensor("high_accuracy_mode", "High Accuracy Mode", if (highAccuracyActive) "on" else "off", null, null, "mdi:crosshairs-gps", type = "binary_sensor", entityCategory = "diagnostic")
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
      .put(sensorState("device_locked", if (deviceLocked()) "on" else "off", "mdi:cellphone-lock"))
      .put(nextAlarmState())
      .put(beaconMonitorState())
      .put(bleEmitterState())
      .put(sensorState("high_accuracy_mode", if (highAccuracyActive) "on" else "off", "mdi:crosshairs-gps"))
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

  // اسم كل بيكون → مسافته المقدّرة، بنفس شكل التطبيق الرسمي عشان أتوميشن
  // "في أي غرفة" تشتغل زي ما هي.
  private fun beaconMonitorState(): JSONObject {
    val state = BleBeacons.monitorState(this)
    val attrs = JSONObject()
    if (state == "Monitoring") {
      for (b in BleBeacons.nearbyBeacons()) attrs.put(b.name, b.distance)
    }
    val icon = if (BleBeacons.isScanning()) "mdi:bluetooth" else "mdi:bluetooth-off"
    return sensorState("beacon_monitor", state, icon, attrs)
  }

  private fun bleEmitterState(): JSONObject {
    val attrs = JSONObject()
      .put("id", if (beaconUuid.isEmpty()) "" else "${beaconUuid}_${beaconMajor}_$beaconMinor")
      .put("Supports transmitter", BluetoothHelper.supportsTransmitter(this))
    val icon = if (BleBeacons.isTransmitting()) "mdi:bluetooth-audio" else "mdi:bluetooth-off"
    return sensorState("ble_emitter", BleBeacons.transmitState(this), icon, attrs)
  }

  // بيطبّق إعدادات البيكونات الجاية من التطبيق. المسح والبث **مقفولين افتراضيًا**
  // لأن الاتنين بياكلوا بطارية، فمابنشغّلهمش غير لما المستخدم يطلب.
  private fun applyBeaconConfig() {
    BleBeacons.onStateChanged = { updateSensors() }
    if (beaconMonitorEnabled) {
      BleBeacons.startMonitoring(this)
    } else {
      BleBeacons.stopMonitoring(this)
    }
    if (beaconTransmitEnabled && beaconUuid.isNotEmpty()) {
      BleBeacons.startTransmitting(this, beaconUuid, beaconMajor, beaconMinor)
    } else {
      BleBeacons.stopTransmitting()
    }
  }

  // ===================== وضع الدقة العالية =====================
  // BALANCED (الوضع العادي) بيعتمد على الواي‑فاي والشبكة أكتر وبيستخدم الـGPS
  // بالعند. HIGH_ACCURACY بيشغّل **الـGPS مع الواي‑فاي والشبكة في نفس الوقت**.
  //
  // مهم عشان محدش يتوقّع غلط: الفرق كبير **بره** المباني (أمتار قليلة بدل
  // عشرات)، لكن **جوّه البيت بيفرق أقل بكتير** — الـGPS مابيخشّ المباني،
  // فالدقة بتفضل 10–30م في الحالتين (قياس فعلي على أجهزتنا: 16م بـHIGH_ACCURACY
  // جوّه البيت، والتطبيق الرسمي بـBALANCED كان 100م). وكمان دايرة الدقة الواسعة
  // **مابتضرّش الحضور** لأن شرط HA هو `المسافة − نصف القطر < الدقة` — يعني دقة
  // أوسع = احتمال أكبر إنك تتحسب في المنطقة. فالحضور اليقيني جوّه البيت حله
  // مرساة البلوتوث (in_zones) مش رفع الأولوية.
  //
  // علشان كده مابنشغّلهوش على طول: بنشغّله بمُشغّل زي الرسمي (location_ham) —
  // جهاز بلوتوث محدد متصل، أو قريب من منطقة. من غير أي مُشغّل محدد = شغّال دايمًا.
  // ملحوظة: ده **مش** رجوع عن 2.19.0 — سقف الدقة 200م وإلغاء شروط المسافة
  // (اللي كانوا السبب الحقيقي للتجمّد) باقيين زي ما هم، والافتراضي لسه BALANCED.
  private fun connectedBtAddresses(): Set<String> =
    BluetoothHelper.devices(this).filter { it.connected }.map { it.address }.toSet()

  private fun nearAnyZone(): Boolean {
    val loc = lastLocation ?: return false
    val zones = GeoZones.parse(beaconPrefs().getString("zones", "") ?: "")
    if (zones.isEmpty()) return false
    return GeoZones.smallestContaining(zones, loc.latitude, loc.longitude, HIGH_ACCURACY_ZONE_RANGE_M) != null
  }

  private fun shouldUseHighAccuracy(): Boolean {
    if (!highAccuracyEnabled) return false
    var constrained = false
    var satisfied = false
    if (highAccuracyBtDevices.isNotEmpty()) {
      constrained = true
      if (connectedBtAddresses().any { highAccuracyBtDevices.contains(it) }) satisfied = true
    }
    if (highAccuracyUseZones) {
      constrained = true
      if (nearAnyZone()) satisfied = true
    }
    // نفس منطق الرسمي: مُشغّل واحد على الأقل محدد → لازم يتحقّق. مفيش مُشغّلات
    // → الوضع شغّال طول الوقت (المستخدم طلبه صريح).
    return if (constrained) satisfied else true
  }

  private fun evaluateHighAccuracy() {
    val want = shouldUseHighAccuracy()
    if (want == highAccuracyActive) return
    highAccuracyActive = want
    restartLocationUpdates()
    // دخلنا الوضع الدقيق = هات قراية جديدة فورًا بدل ما ننتظر الدورة.
    if (want) requestFreshLocation()
    updateSensors()
  }

  private fun beaconPrefs() = getSharedPreferences("mobile_app", Context.MODE_PRIVATE)

  private fun saveBeaconConfig() {
    beaconPrefs().edit()
      .putBoolean("beaconMonitor", beaconMonitorEnabled)
      .putBoolean("beaconTransmit", beaconTransmitEnabled)
      .putString("beaconUuid", beaconUuid)
      .putString("beaconMajor", beaconMajor)
      .putString("beaconMinor", beaconMinor)
      .apply()
  }

  private fun splitAddresses(raw: String?): Set<String> =
    raw?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet() ?: emptySet()

  private fun saveAccuracyConfig() {
    beaconPrefs().edit()
      .putBoolean("haEnabled", highAccuracyEnabled)
      .putBoolean("haZones", highAccuracyUseZones)
      .putString("haBtDevices", highAccuracyBtDevices.joinToString(","))
      .putString("homeBtDevices", homeBtDevices.joinToString(","))
      .apply()
  }

  private fun loadAccuracyConfig() {
    val prefs = beaconPrefs()
    highAccuracyEnabled = prefs.getBoolean("haEnabled", false)
    highAccuracyUseZones = prefs.getBoolean("haZones", false)
    highAccuracyBtDevices = splitAddresses(prefs.getString("haBtDevices", ""))
    homeBtDevices = splitAddresses(prefs.getString("homeBtDevices", ""))
  }

  // بعد إعادة تشغيل الموبايل الخدمة بترجع من غير التطبيق، فبنقرأ الإعدادات
  // من التخزين عشان الرصد/البث يكمّلوا زي ما المستخدم ساببهم.
  private fun loadBeaconConfig() {
    val prefs = beaconPrefs()
    beaconMonitorEnabled = prefs.getBoolean("beaconMonitor", false)
    beaconTransmitEnabled = prefs.getBoolean("beaconTransmit", false)
    beaconUuid = prefs.getString("beaconUuid", "") ?: ""
    beaconMajor = prefs.getString("beaconMajor", BleBeacons.DEFAULT_MAJOR) ?: BleBeacons.DEFAULT_MAJOR
    beaconMinor = prefs.getString("beaconMinor", BleBeacons.DEFAULT_MINOR) ?: BleBeacons.DEFAULT_MINOR
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

  // أحداث فورية: بلوتوث (فتح/قفل واتصال/فصل جهاز)، قفل الشاشة، والمنبّه الجاي.
  // بننتظر شويّة قبل الإرسال عشان الحدث الواحد مايعملش كذا إرسال (مثلاً سماعة
  // بتتصل على كذا بروفايل في نفس اللحظة).
  private fun registerStateReceiver() {
    if (stateReceiver != null) return
    val filter = IntentFilter().apply {
      addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
      addAction("android.bluetooth.device.action.ACL_CONNECTED")
      addAction("android.bluetooth.device.action.ACL_DISCONNECTED")
      addAction(AlarmManager.ACTION_NEXT_ALARM_CLOCK_CHANGED)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        // البلوتوث اتفتح/اتقفل: لازم نعيد تشغيل الرصد والبث (البث بيتوقف لما
        // البلوتوث يتقفل ومابيرجعش لوحده).
        if (intent?.action == BluetoothAdapter.ACTION_STATE_CHANGED) applyBeaconConfig()
        // جهاز بلوتوث اتصل/اتفصل = مُشغّل الدقة العالية ومرساة البيت ممكن
        // يتغيّروا، فبنعيد التقييم فورًا.
        evaluateHighAccuracy()
        stateDebounce?.let { handler.removeCallbacks(it) }
        val run = Runnable { updateSensors() }
        stateDebounce = run
        handler.postDelayed(run, STATE_DEBOUNCE_MS)
      }
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        registerReceiver(receiver, filter)
      }
      stateReceiver = receiver
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
    // بنفصل الـ callback الأول عشان مانبعتش تحديث والخدمة بتموت، وكمان عشان
    // مانسيبش مرجع للخدمة في الـ object الساكن.
    BleBeacons.onStateChanged = null
    BleBeacons.stopMonitoring(this)
    BleBeacons.stopTransmitting()
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
    const val ACTION_SET_BEACONS = "com.mkdd.familyha.action.SET_BEACONS"
    const val ACTION_SET_ACCURACY = "com.mkdd.familyha.action.SET_ACCURACY"
    const val EXTRA_LIVE = "live"
    const val EXTRA_TTL_MS = "ttlMs"
    const val EXTRA_ZONES = "zones"
    const val EXTRA_BEACON_MONITOR = "beaconMonitor"
    const val EXTRA_BEACON_TRANSMIT = "beaconTransmit"
    const val EXTRA_BEACON_UUID = "beaconUuid"
    const val EXTRA_BEACON_MAJOR = "beaconMajor"
    const val EXTRA_BEACON_MINOR = "beaconMinor"
    const val EXTRA_HA_ENABLED = "haEnabled"
    const val EXTRA_HA_ZONES = "haZones"
    const val EXTRA_HA_BT_DEVICES = "haBtDevices"
    const val EXTRA_HOME_BT_DEVICES = "homeBtDevices"
    // كيان منطقة البيت في HA — ثابت في HA نفسه.
    private const val HOME_ZONE_ENTITY = "zone.home"
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
    // وضع الدقة العالية + الوضع اللايف: نفس قيم الرسمي في
    // HighAccuracyLocationService (5 ثواني، وأسرع = نصها).
    private const val HIGH_ACCURACY_INTERVAL_MS = 5000L
    private const val HIGH_ACCURACY_FASTEST_MS = 2500L
    // نطاق التشغيل حوالين المنطقة — نفس DEFAULT_TRIGGER_RANGE_METERS الرسمي.
    private const val HIGH_ACCURACY_ZONE_RANGE_M = 300f
    private const val LIVE_TTL_MS = 120000L
    private const val SENSOR_INTERVAL_MS = 900000L
    private const val ACTIVITY_INTERVAL_MS = 120000L
    // تجميع الأحداث اللحظية (بلوتوث/قفل/مكالمة) في إرسال واحد.
    private const val STATE_DEBOUNCE_MS = 1500L
  }
}
