package com.mkdd.familyha

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.SeekBar
import android.widget.TextView
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
 * الإنذار، زي مكالمة واردة، فيها سبب التريجر وسلايدر للتعطيل.
 */
class AlarmActivity : Activity() {
  private var mediaPlayer: MediaPlayer? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(R.layout.activity_alarm)

    val reasonText = findViewById<TextView>(R.id.reasonText)
    val statusText = findViewById<TextView>(R.id.statusText)
    val slider = findViewById<SeekBar>(R.id.disarmSlider)

    val reason = intent.getStringExtra("reason") ?: ""
    if (reason.isNotEmpty()) {
      reasonText.text = reason
      reasonText.visibility = android.view.View.VISIBLE
    }

    playSiren()

    slider.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
      override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
        if (progress >= 85 && fromUser) {
          seekBar.isEnabled = false
          statusText.text = "جاري التعطيل..."
          disarmAlarm { success ->
            runOnUiThread {
              if (success) {
                stopSiren()
                finish()
              } else {
                statusText.text = "فشل التعطيل، حاول تاني"
                seekBar.isEnabled = true
                seekBar.progress = 0
              }
            }
          }
        }
      }

      override fun onStartTrackingTouch(seekBar: SeekBar) = Unit

      override fun onStopTrackingTouch(seekBar: SeekBar) {
        if (seekBar.progress < 85) seekBar.progress = 0
      }
    })
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
      val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
      mediaPlayer = MediaPlayer.create(this, uri)
      mediaPlayer?.isLooping = true
      mediaPlayer?.start()
    } catch (e: Exception) {
      // مفيش نغمة إنذار افتراضية على الجهاز، نكمل من غير صوت
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
    val prefs = getSharedPreferences(AlarmMonitorService.PREFS, Context.MODE_PRIVATE)
    val baseUrl = prefs.getString("baseUrl", null)
    val token = prefs.getString("token", null)
    val entityId = prefs.getString("entityId", null)
    val code = prefs.getString("alarmCode", "") ?: ""
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
