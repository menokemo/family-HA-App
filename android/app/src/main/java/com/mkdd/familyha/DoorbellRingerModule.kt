package com.mkdd.familyha

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * تشغيل نغمة جرس الباب من ملفات التطبيق (res/raw) — عشان ماترنّش بنغمة الموبايل
 * الافتراضية، والأدمن يقدر يختار النغمة. بتتنادى من شاشة الجرس (JS):
 *   • startRinging(tone): تشغيل متكرر + اهتزاز زي المكالمة.
 *   • stopRinging(): إيقاف.
 *   • preview(tone): تشغيل مرة واحدة (معاينة في الإعدادات).
 * النغمة بتتشغّل على قناة النغمة (USAGE_NOTIFICATION_RINGTONE).
 */
class DoorbellRingerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null

  override fun getName() = "DoorbellRinger"

  private fun resFor(tone: String?): Int = when (tone) {
    "chime" -> R.raw.doorbell_chime
    "bell" -> R.raw.doorbell_bell
    else -> R.raw.doorbell_ding_dong
  }

  private fun play(tone: String?, loop: Boolean) {
    stopPlayer()
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    try {
      val afd = reactContext.resources.openRawResourceFd(resFor(tone)) ?: return
      player = MediaPlayer().apply {
        setAudioAttributes(attrs)
        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        afd.close()
        isLooping = loop
        setOnCompletionListener { if (!loop) stopPlayer() }
        prepare()
        start()
      }
    } catch (e: Exception) {
      // فشل التشغيل — نتجاهل بهدوء (مفيش صوت أفضل من كراش)
    }
  }

  private fun stopPlayer() {
    try {
      player?.stop()
      player?.release()
    } catch (e: Exception) { /* ignore */ }
    player = null
  }

  @Suppress("DEPRECATION")
  private fun startVibration() {
    try {
      val vib = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (reactContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        reactContext.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      vibrator = vib
      val pattern = longArrayOf(0, 500, 1000) // اهتزاز نبضي متكرر
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vib.vibrate(VibrationEffect.createWaveform(pattern, 1))
      } else {
        vib.vibrate(pattern, 1)
      }
    } catch (e: Exception) { /* ignore */ }
  }

  private fun stopVibration() {
    try { vibrator?.cancel() } catch (e: Exception) { /* ignore */ }
    vibrator = null
  }

  @ReactMethod
  fun startRinging(tone: String?) {
    play(tone, true)
    startVibration()
  }

  @ReactMethod
  fun stopRinging() {
    stopPlayer()
    stopVibration()
  }

  @ReactMethod
  fun preview(tone: String?) {
    play(tone, false)
  }

  /**
   * بتتنادى لما شاشة الجرس تتقفل. لو الجرس هو اللي صحّى التطبيق (كان في الخلفية/
   * القفل) بنرجّع التطبيق للخلفية عشان الشاشة ترجع للقفل/اللي كان ظاهر قبل الرنّة
   * بدل ما التطبيق يفضل مفتوح على آخر شاشة. وبنشيل "إظهار فوق القفل" في كل الحالات.
   */
  @ReactMethod
  fun dismissCall() {
    val act = currentActivity ?: return
    act.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          act.setShowWhenLocked(false)
          act.setTurnScreenOn(false)
        }
        if (DoorbellBridge.wokeApp) act.moveTaskToBack(true)
        DoorbellBridge.wokeApp = false
      } catch (e: Exception) { /* ignore */ }
    }
  }

  override fun invalidate() {
    stopRinging()
    super.invalidate()
  }
}
