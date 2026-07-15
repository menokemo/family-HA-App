package com.mkdd.familyha

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.SeekBar
import android.widget.TextView
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

/**
 * شاشة كاملة تظهر فوق أي حاجة (شاشة قفل أو استخدام عادي) لحظة تشغيل
 * الإنذار، زي مكالمة واردة، فيها سبب التريجر وسلايدر للتعطيل (بالبصمة
 * لو مفعّلة في الإعدادات).
 */
class AlarmActivity : FragmentActivity() {
  private var mediaPlayer: MediaPlayer? = null

  private fun prefs() = getSharedPreferences(AlarmMonitorService.PREFS, Context.MODE_PRIVATE)
  private fun lang() = prefs().getString("language", "en")

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(R.layout.activity_alarm)

    val titleText = findViewById<TextView>(R.id.titleText)
    val reasonText = findViewById<TextView>(R.id.reasonText)
    val statusText = findViewById<TextView>(R.id.statusText)
    val hintText = findViewById<TextView>(R.id.swipeHintText)
    val slider = findViewById<SeekBar>(R.id.disarmSlider)

    titleText.text = AlarmStrings.get(lang(), "screen_title")
    hintText.text = AlarmStrings.get(lang(), "swipe_hint")

    val reason = intent.getStringExtra("reason") ?: ""
    if (reason.isNotEmpty()) {
      reasonText.text = reason
      reasonText.visibility = android.view.View.VISIBLE
    }

    playSiren()

    slider.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
      var handled = false
      override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
        if (progress >= 85 && fromUser && !handled) {
          handled = true
          seekBar.isEnabled = false
          attemptDisarm(statusText, seekBar) { handled = false }
        }
      }

      override fun onStartTrackingTouch(seekBar: SeekBar) = Unit

      override fun onStopTrackingTouch(seekBar: SeekBar) {
        if (seekBar.progress < 85) seekBar.progress = 0
      }
    })
  }

  private fun attemptDisarm(statusText: TextView, seekBar: SeekBar, onReset: () -> Unit) {
    val biometricEnabled = prefs().getBoolean("biometricEnabled", false)
    val biometricReady = biometricEnabled &&
      BiometricManager.from(this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS
    if (biometricReady) {
      val prompt = BiometricPrompt(
        this,
        ContextCompat.getMainExecutor(this),
        object : BiometricPrompt.AuthenticationCallback() {
          override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            runDisarm(statusText, seekBar, onReset)
          }

          override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            seekBar.isEnabled = true
            seekBar.progress = 0
            onReset()
          }

          override fun onAuthenticationFailed() {
            // سيب المستخدم يعيد المحاولة، الـ prompt بيفضل ظاهر لوحده
          }
        },
      )
      val info = BiometricPrompt.PromptInfo.Builder()
        .setTitle(AlarmStrings.get(lang(), "screen_title"))
        .setSubtitle(AlarmStrings.get(lang(), "disarming"))
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
        .setNegativeButtonText(AlarmStrings.get(lang(), "disarm_failed"))
        .build()
      prompt.authenticate(info)
    } else {
      runDisarm(statusText, seekBar, onReset)
    }
  }

  private fun runDisarm(statusText: TextView, seekBar: SeekBar, onReset: () -> Unit) {
    statusText.text = AlarmStrings.get(lang(), "disarming")
    disarmAlarm { success ->
      runOnUiThread {
        if (success) {
          stopSiren()
          finish()
        } else {
          statusText.text = AlarmStrings.get(lang(), "disarm_failed")
          seekBar.isEnabled = true
          seekBar.progress = 0
          onReset()
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    val reason = intent.getStringExtra("reason") ?: ""
    val reasonView = findViewById<TextView>(R.id.reasonText)
    if (reason.isNotEmpty()) {
      reasonView?.text = reason
      reasonView?.visibility = android.view.View.VISIBLE
    } else {
      reasonView?.visibility = android.view.View.GONE
    }
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      keyguardManager.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
      )
    }
  }

  private fun playSiren() {
    try {
      val tone = prefs().getString("sirenTone", "classic")
      val resId = when (tone) {
        "digital" -> R.raw.siren_digital
        "pulse" -> R.raw.siren_pulse
        else -> R.raw.siren_classic
      }
      mediaPlayer = MediaPlayer.create(this, resId)
      mediaPlayer?.isLooping = true
      mediaPlayer?.start()
    } catch (e: Exception) {
      // فشل تشغيل الصوت لأي سبب - نكمل من غير صوت، مش لازم نوقف الشاشة
    }
  }

  private fun stopSiren() {
    try {
      mediaPlayer?.stop()
      mediaPlayer?.release()
    } catch (e: Exception) { /* ignore */ }
    mediaPlayer = null
  }

  private fun disarmAlarm(callback: (Boolean) -> Unit) {
    val baseUrl = prefs().getString("baseUrl", null)
    val token = prefs().getString("token", null)
    val entityId = prefs().getString("entityId", null)
    val code = prefs().getString("alarmCode", "") ?: ""
    if (baseUrl == null || token == null || entityId == null) {
      callback(false)
      return
    }
    val client = OkHttpClient()
    val payload = JSONObject().put("entity_id", entityId)
    if (code.isNotEmpty()) payload.put("code", code)
    val body = payload.toString().toRequestBody("application/json".toMediaType())
    val request = Request.Builder()
      .url(baseUrl.trim().trimEnd('/') + "/api/services/alarmo/disarm")
      .addHeader("Authorization", "Bearer $token")
      .post(body)
      .build()
    client.newCall(request).enqueue(
      object : Callback {
        override fun onFailure(call: Call, e: IOException) = callback(false)
        override fun onResponse(call: Call, response: Response) = callback(response.isSuccessful)
      },
    )
  }

  override fun onDestroy() {
    stopSiren()
    super.onDestroy()
  }
}
