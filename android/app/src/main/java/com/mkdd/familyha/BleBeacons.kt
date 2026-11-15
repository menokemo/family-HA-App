package com.mkdd.familyha

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import java.util.UUID
import kotlin.math.pow
import kotlin.math.round

/** بيكون iBeacon واحد اترصد. */
data class Beacon(
  val uuid: String,
  val major: Int,
  val minor: Int,
  var rssi: Double,
  var distance: Double,
  var missedCycles: Int = 0,
) {
  val name: String get() = "${uuid}_${major}_$minor"
}

/**
 * رصد وبث بيكونات iBeacon بمكتبات أندرويد نفسها (من غير مكتبة خارجية).
 *
 * الرصد: `BluetoothLeScanner` بفلتر على بيانات الشركة 0x004C، وبنفك تنسيق
 * iBeacon بإيدينا (نفس التخطيط اللي التطبيق الرسمي بيوّرثه لمكتبة AltBeacon:
 * `m:2-3=0215,i:4-19,i:20-21,i:22-23,p:24-24`) — بايت 0x02 وطوله 0x15، بعديهم
 * UUID 16 بايت، فـ major و minor بايتين لكل واحد، وآخر بايت قوة الإشارة على متر.
 *
 * المسح **بدورات** (ثانيتين كل 10 ثواني) مش مستمر: الرصد المستمر بياكل بطارية،
 * وحضور على مستوى الغرفة مامحتاجش استجابة أقل من ثانية.
 *
 * البث: `BluetoothLeAdvertiser` بنفس تنسيق iBeacon عشان ESPHome أو أي راصد
 * تاني يشوف الموبايل.
 */
object BleBeacons {
  private const val APPLE_MANUFACTURER_ID = 0x004C
  private const val IBEACON_TYPE = 0x02
  private const val IBEACON_LENGTH = 0x15
  // قوة الإشارة المرجعية على متر واحد — نفس افتراضي التطبيق الرسمي.
  private const val MEASURED_POWER_AT_1M = -59
  private const val SCAN_WINDOW_MS = 2000L
  private const val SCAN_GAP_MS = 10000L
  // بيكون مابانش في 5 دورات (دقيقة تقريبًا) = بَعُد، يتشال.
  private const val MAX_MISSED_CYCLES = 5
  const val DEFAULT_MAJOR = "100"
  const val DEFAULT_MINOR = "40004"

  private val handler = Handler(Looper.getMainLooper())
  private val beacons = LinkedHashMap<String, Beacon>()

  private var monitorRequested = false
  private var scanning = false
  private var scanCycle: Runnable? = null
  private var scanCallback: ScanCallback? = null
  // بتتنادى لما تتغيّر البيكونات أو حالة البث عشان نبعت المستشعر فورًا بدل
  // ما ننتظر الدورة. مربوطة مرة واحدة من الخدمة، ومستقلة عن الرصد عشان
  // نتيجة البث (callback غير متزامن) توصل كمان لو الرصد مقفول.
  var onStateChanged: (() -> Unit)? = null

  private var transmitRequested = false
  private var transmitting = false
  private var transmitError = false
  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertiseCallback: AdvertiseCallback? = null
  private var transmitKey = ""

  val scanPermission: String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_SCAN else Manifest.permission.ACCESS_FINE_LOCATION
  val advertisePermission: String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_ADVERTISE else Manifest.permission.BLUETOOTH

  private fun granted(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun adapter(context: Context) = try {
    (context.applicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
  } catch (e: Exception) {
    null
  }

  // ===================== الرصد =====================

  fun startMonitoring(context: Context) {
    monitorRequested = true
    if (scanCycle != null) return
    val cycle = object : Runnable {
      override fun run() {
        runScanWindow(context)
        handler.postDelayed(this, SCAN_WINDOW_MS + SCAN_GAP_MS)
      }
    }
    scanCycle = cycle
    handler.post(cycle)
  }

  fun stopMonitoring(context: Context) {
    monitorRequested = false
    scanCycle?.let { handler.removeCallbacks(it) }
    scanCycle = null
    stopScan(context)
    if (beacons.isNotEmpty()) {
      beacons.clear()
      onStateChanged?.invoke()
    }
  }

  /** بنمسح نافذة واحدة بس، وبعدها نقفل لحد الدورة الجاية. */
  @SuppressLint("MissingPermission")
  private fun runScanWindow(context: Context) {
    val scanner = try {
      if (granted(context, scanPermission)) adapter(context)?.takeIf { it.isEnabled }?.bluetoothLeScanner else null
    } catch (e: Exception) {
      null
    }
    // مش قادرين نمسح (البلوتوث اتقفل أو الإذن اتسحب) = القائمة القديمة بقت كذب،
    // فبنفضّيها ونبلّغ. من غير كده البيكونات تفضل في المستشعر للأبد.
    if (scanner == null) {
      if (beacons.isNotEmpty()) {
        beacons.clear()
        onStateChanged?.invoke()
      }
      return
    }
    // الدورة الجديدة: كل بيكون موجود بياخد علامة "مابانش" لحد ما يبان تاني.
    for (b in beacons.values) b.missedCycles++

    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult?) {
        val record = result?.scanRecord ?: return
        val data = record.getManufacturerSpecificData(APPLE_MANUFACTURER_ID) ?: return
        val parsed = parseIBeacon(data, result.rssi) ?: return
        val existing = beacons[parsed.name]
        if (existing == null) {
          beacons[parsed.name] = parsed
        } else {
          // متوسط متحرك بسيط عشان قراية واحدة شاذة ماتهزّش المسافة.
          existing.rssi = round(((existing.rssi * 2 + parsed.rssi) / 3) * 100) / 100
          existing.distance = estimateDistance(existing.rssi)
          existing.missedCycles = 0
        }
      }

      override fun onBatchScanResults(results: MutableList<ScanResult>?) {
        results?.forEach { onScanResult(ScanSettings.CALLBACK_TYPE_ALL_MATCHES, it) }
      }
    }
    val filter = ScanFilter.Builder().setManufacturerData(APPLE_MANUFACTURER_ID, byteArrayOf()).build()
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_POWER).build()
    try {
      scanner.startScan(listOf(filter), settings, callback)
      scanCallback = callback
      scanning = true
    } catch (e: Exception) {
      return
    }
    handler.postDelayed({
      stopScan(context)
      val expired = beacons.values.filter { it.missedCycles > MAX_MISSED_CYCLES }
      expired.forEach { beacons.remove(it.name) }
      onStateChanged?.invoke()
    }, SCAN_WINDOW_MS)
  }

  @SuppressLint("MissingPermission")
  private fun stopScan(context: Context) {
    val callback = scanCallback ?: return
    scanCallback = null
    scanning = false
    try {
      adapter(context)?.bluetoothLeScanner?.stopScan(callback)
    } catch (e: Exception) {
    }
  }

  /**
   * بيفك حمولة iBeacon. بعض الأجهزة بتسلّم البيانات بالنوع والطول وبعضها
   * بيبدأ من الـ UUID على طول، فبنتعامل مع الحالتين.
   */
  private fun parseIBeacon(data: ByteArray, rssi: Int): Beacon? {
    val offset = when {
      data.size >= 23 && (data[0].toInt() and 0xFF) == IBEACON_TYPE && (data[1].toInt() and 0xFF) == IBEACON_LENGTH -> 2
      data.size >= 21 -> 0
      else -> return null
    }
    if (data.size < offset + 20) return null
    val uuid = uuidFrom(data, offset) ?: return null
    val major = ((data[offset + 16].toInt() and 0xFF) shl 8) or (data[offset + 17].toInt() and 0xFF)
    val minor = ((data[offset + 18].toInt() and 0xFF) shl 8) or (data[offset + 19].toInt() and 0xFF)
    val average = rssi.toDouble()
    return Beacon(uuid, major, minor, average, estimateDistance(average))
  }

  private fun uuidFrom(data: ByteArray, offset: Int): String? {
    return try {
      var most = 0L
      var least = 0L
      for (i in 0 until 8) most = (most shl 8) or (data[offset + i].toLong() and 0xFF)
      for (i in 8 until 16) least = (least shl 8) or (data[offset + i].toLong() and 0xFF)
      UUID(most, least).toString()
    } catch (e: Exception) {
      null
    }
  }

  /**
   * تقدير المسافة من قوة الإشارة — نفس معادلة AltBeacon المنشورة اللي التطبيق
   * الرسمي بيستخدمها عن طريق المكتبة. تقدير تقريبي بطبعه (البلوتوث بيتأثر
   * بالجسم والحيطان)، فالمفيد منه هو **الترتيب** مش الرقم المطلق.
   */
  private fun estimateDistance(rssi: Double): Double {
    if (rssi == 0.0) return -1.0
    val ratio = rssi / MEASURED_POWER_AT_1M
    val meters = if (ratio < 1.0) ratio.pow(10.0) else 0.89976 * ratio.pow(7.7095) + 0.111
    return round(meters * 100) / 100
  }

  /** البيكونات مرتّبة بالأقرب — نفس ترتيب التطبيق الرسمي. */
  fun nearbyBeacons(): List<Beacon> = beacons.values.sortedBy { it.distance }

  fun monitorState(context: Context): String = when {
    !monitorRequested -> "Stopped"
    !BluetoothHelper.isOn(context) -> "Bluetooth is turned off"
    !granted(context, scanPermission) -> "Stopped"
    else -> "Monitoring"
  }

  fun isScanning(): Boolean = scanning

  // ===================== البث =====================

  @SuppressLint("MissingPermission")
  fun startTransmitting(context: Context, uuid: String, major: String, minor: String) {
    transmitRequested = true
    transmitError = false
    val key = "${uuid}_${major}_$minor"
    // بنبث بالقيم الجديدة بس: لو المعرّف اتغيّر لازم نوقف الأول وإلا نفضل بنبث
    // القديم. ولو نفس المعرّف وشغّال خلاص، مانعملش حاجة.
    if (transmitting) {
      if (key == transmitKey) return
      stopTransmitting()
      transmitRequested = true
    }
    transmitKey = key
    if (!granted(context, advertisePermission)) {
      transmitError = true
      return
    }
    val payload = iBeaconPayload(uuid, major, minor)
    if (payload == null) {
      transmitError = true
      return
    }
    val adv = try {
      adapter(context)?.takeIf { it.isEnabled }?.bluetoothLeAdvertiser
    } catch (e: Exception) {
      null
    } ?: return
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_POWER)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_ULTRA_LOW)
      .setConnectable(false)
      .setTimeout(0)
      .build()
    val data = AdvertiseData.Builder()
      .setIncludeDeviceName(false)
      .setIncludeTxPowerLevel(false)
      .addManufacturerData(APPLE_MANUFACTURER_ID, payload)
      .build()
    val callback = object : AdvertiseCallback() {
      override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
        transmitting = true
        transmitError = false
        onStateChanged?.invoke()
      }

      override fun onStartFailure(errorCode: Int) {
        if (errorCode == ADVERTISE_FAILED_ALREADY_STARTED) {
          transmitting = true
          transmitError = false
        } else {
          transmitting = false
          transmitError = true
        }
        onStateChanged?.invoke()
      }
    }
    try {
      adv.startAdvertising(settings, data, callback)
      advertiser = adv
      advertiseCallback = callback
    } catch (e: Exception) {
      transmitError = true
    }
  }

  @SuppressLint("MissingPermission")
  fun stopTransmitting() {
    transmitRequested = false
    val callback = advertiseCallback ?: return
    advertiseCallback = null
    try {
      advertiser?.stopAdvertising(callback)
    } catch (e: Exception) {
    }
    advertiser = null
    transmitting = false
    transmitKey = ""
  }

  /** تنسيق iBeacon: النوع + الطول + UUID + major + minor + القوة على متر. */
  private fun iBeaconPayload(uuid: String, major: String, minor: String): ByteArray? {
    return try {
      val id = UUID.fromString(uuid)
      val majorValue = major.toInt()
      val minorValue = minor.toInt()
      if (majorValue !in 0..65535 || minorValue !in 0..65535) return null
      val out = ByteArray(23)
      out[0] = IBEACON_TYPE.toByte()
      out[1] = IBEACON_LENGTH.toByte()
      for (i in 0 until 8) out[2 + i] = ((id.mostSignificantBits shr (8 * (7 - i))) and 0xFF).toByte()
      for (i in 0 until 8) out[10 + i] = ((id.leastSignificantBits shr (8 * (7 - i))) and 0xFF).toByte()
      out[18] = ((majorValue shr 8) and 0xFF).toByte()
      out[19] = (majorValue and 0xFF).toByte()
      out[20] = ((minorValue shr 8) and 0xFF).toByte()
      out[21] = (minorValue and 0xFF).toByte()
      out[22] = MEASURED_POWER_AT_1M.toByte()
      out
    } catch (e: Exception) {
      null
    }
  }

  fun transmitState(context: Context): String = when {
    !transmitRequested -> "Stopped"
    !BluetoothHelper.isOn(context) -> "Bluetooth is turned off"
    transmitError -> "Unable to transmit"
    transmitting -> "Transmitting"
    else -> "Stopped"
  }

  fun isTransmitting(): Boolean = transmitting
}
