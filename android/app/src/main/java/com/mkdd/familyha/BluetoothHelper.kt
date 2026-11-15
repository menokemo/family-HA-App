package com.mkdd.familyha

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/** جهاز بلوتوث واحد زي ما النظام شايفه. */
data class BtDevice(
  val address: String,
  val name: String,
  val paired: Boolean,
  val connected: Boolean,
)

/**
 * قراية حالة البلوتوث والأجهزة المقترنة/المتصلة. نفس أسلوب التطبيق الرسمي
 * (BluetoothUtils): الأجهزة المقترنة من الـ adapter + الأجهزة المتصلة على
 * بروفايل GATT من الـ BluetoothManager، والاتحاد بينهم هو اللي بنبلّغه.
 */
object BluetoothHelper {
  /** الإذن المطلوب للقراية. من أندرويد 12 بقى BLUETOOTH_CONNECT وقبل كده BLUETOOTH. */
  val permission: String =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_CONNECT else Manifest.permission.BLUETOOTH

  fun hasPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun adapter(context: Context): BluetoothAdapter? = try {
    (context.applicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
  } catch (e: Exception) {
    null
  }

  fun isOn(context: Context): Boolean = try {
    adapter(context)?.isEnabled == true
  } catch (e: Exception) {
    false
  }

  /** الجهاز قادر يبث كـ beacon؟ (محتاجينها في البث — دفعة البيكونات). */
  fun supportsTransmitter(context: Context): Boolean = try {
    adapter(context)?.isMultipleAdvertisementSupported == true
  } catch (e: Exception) {
    false
  }

  @SuppressLint("MissingPermission")
  fun devices(context: Context): List<BtDevice> {
    if (!hasPermission(context)) return emptyList()
    val manager = try {
      context.applicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    } catch (e: Exception) {
      null
    } ?: return emptyList()
    val adapter = manager.adapter ?: return emptyList()
    if (!adapter.isEnabled) return emptyList()

    val devices = LinkedHashMap<String, BtDevice>()
    try {
      for (dev in adapter.bondedDevices.orEmpty()) {
        devices[dev.address] = BtDevice(
          dev.address,
          dev.name ?: dev.address,
          dev.bondState == android.bluetooth.BluetoothDevice.BOND_BONDED,
          isConnected(dev),
        )
      }
    } catch (e: Exception) {
    }
    try {
      for (dev in manager.getConnectedDevices(BluetoothProfile.GATT).orEmpty()) {
        if (devices.containsKey(dev.address)) continue
        devices[dev.address] = BtDevice(
          dev.address,
          dev.name ?: dev.address,
          dev.bondState == android.bluetooth.BluetoothDevice.BOND_BONDED,
          true,
        )
      }
    } catch (e: Exception) {
    }
    return devices.values.toList()
  }

  /** الاسم مع العنوان لو الاسم مش متاح — نفس عرض التطبيق الرسمي. */
  fun label(device: BtDevice): String =
    if (device.name == device.address) device.address else "${device.name} (${device.address})"

  // `isConnected` مش في الـ API العامة، فبنناديها بالـ reflection زي التطبيق
  // الرسمي بالظبط. الفرق إننا بنرجّع false لو فشلت بدل ما نرمي استثناء، عشان
  // جهاز واحد غريب مايوقّفش قراية باقي الأجهزة.
  private fun isConnected(device: android.bluetooth.BluetoothDevice): Boolean = try {
    device.javaClass.getMethod("isConnected").invoke(device) as? Boolean ?: false
  } catch (e: Exception) {
    false
  }
}
