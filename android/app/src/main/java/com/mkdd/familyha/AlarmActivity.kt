package com.mkdd.familyha

import android.animation.ArgbEvaluator
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
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
import java.util.concurrent.Executor

/**
 * شاشة كاملة تظهر فوق أي حاجة (شاشة قفل أو استخدام عادي) لحظة تشغيل
 * الإنذار، زي مكالمة واردة، فيها سبب التريجر وسحب مباشر (View قابل
 * للسحب، مش SeekBar) للتعطيل، وطلب بصمة/رقم الجهاز قبل التنفيذ فعليًا.
 */
class AlarmActivity : Activity() {
  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var shieldAnim: ObjectAnimator? = null
  private var bgAnim: ValueAnimator? = null
  private var dX = 0f
  private var maxTranslation = 0f
  private var slideTriggered = false

  private fun lang() = getSharedPreferences(AlarmMonitorService.PREFS, Context.MODE_PRIVATE).getString("language", "en")

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(R.layout.activity_alarm)

    val titleText = findViewById<TextView>(R.id.titleText)
    val reasonText = findViewById<TextView>(R.id.reasonText)
    val statusText = findViewById<TextView>(R.id.statusText)
    val hintText = findViewById<TextView>(R.id.swipeHintText)
    val track = findViewById<FrameLayout>(R.id.sliderTrack)
    val knob = findViewById<View>(R.id.disarmKnob)

    titleText.text = AlarmStrings.get(lang(), "screen_title")
    hintText.text = AlarmStrings.get(lang(), "swipe_hint")

    val reason = intent.getStringExtra("reason") ?: ""
    if (reason.isNotEmpty()) {
      reasonText.text = reason
      reasonText.visibility = View.VISIBLE
    }

    playSiren()
    startVibration()
    startAnimations(findViewById(R.id.rootLayout), findViewById(R.id.shieldText))

    track.post {
      val marginPx = (7 * resources.displayMetrics.density)
      maxTranslation = (track.width - knob.width - marginPx * 2)
    }

    knob.setOnTouchListener { view, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          dX = view.translationX - event.rawX
          true
        }
        MotionEvent.ACTION_MOVE -> {
          if (slideTriggered) return@setOnTouchListener true
          var newX = event.rawX + dX
          newX = newX.coerceIn(0f, maxTranslation)
          view.translationX = newX
          if (maxTranslation > 0 && newX >= maxTranslation * 0.82f) {
            slideTriggered = true
            view.translationX = maxTranslation
            confirmAndDisarm(statusText, view, knob)
          }
          true
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (!slideTriggered) view.animate().translationX(0f).setDuration(160).start()
          true
        }
        else -> false
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
      reasonView?.visibility = View.VISIBLE
    } else {
      reasonView?.visibility = View.GONE
    }
  }

  private fun confirmAndDisarm(statusText: TextView, knobView: View, knob: View) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val executor = Executor { command -> runOnUiThread(command) }
      val prompt = BiometricPrompt.Builder(this)
        .setTitle(AlarmStrings.get(lang(), "screen_title"))
        .setSubtitle(AlarmStrings.get(lang(), "disarming"))
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
        .build()
      try {
        prompt.authenticate(
          CancellationSignal(),
          executor,
          object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
              performDisarm(statusText, knobView)
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
              resetSlider(knobView, statusText)
            }
          },
        )
        return
      } catch (e: Exception) {
        // مفيش بصمة/قفل شاشة مُعرَّف على الجهاز - نكمل بدون مصادقة إضافية
      }
    }
    performDisarm(statusText, knobView)
  }

  private fun resetSlider(knobView: View, statusText: TextView) {
    slideTriggered = false
    statusText.text = ""
    knobView.animate().translationX(0f).setDuration(160).start()
  }

  private fun performDisarm(statusText: TextView, knobView: View) {
    statusText.text = AlarmStrings.get(lang(), "disarming")
    disarmAlarm { success ->
      runOnUiThread {
        if (success) {
          stopAllAlerts()
          finish()
        } else {
          statusText.text = AlarmStrings.get(lang(), "disarm_failed")
          resetSlider(knobView, statusText)
        }
      }
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
    val prefs = getSharedPreferences(AlarmMonitorService.PREFS, Context.MODE_PRIVATE)
    val tone = prefs.getString("sirenTone", "classic") ?: "classic"
    val resId = when (tone) {
      "digital" -> R.raw.siren_digital
      "pulse" -> R.raw.siren_pulse
      else -> R.raw.siren_classic
    }
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM) // قناة الإنذار بتتخطى وضع الصامت/عدم الإزعاج
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    try {
      val afd = resources.openRawResourceFd(resId)
      mediaPlayer = MediaPlayer().apply {
        setAudioAttributes(attrs)
        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        afd.close()
        isLooping = true
        prepare()
        start()
      }
    } catch (e: Exception) {
      // فشل تحميل نغمة التطبيق لأي سبب - نرجع لنغمة المنبه الافتراضية
      // كحل احتياطي، برضو على قناة الإنذار
      try {
        val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
        mediaPlayer = MediaPlayer().apply {
          setAudioAttributes(attrs)
          setDataSource(this@AlarmActivity, uri)
          isLooping = true
          prepare()
          start()
        }
      } catch (e2: Exception) {
        // مفيش أي نغمة متاحة - نكمل من غير صوت
      }
    }
  }

  private fun stopSiren() {
    try {
      mediaPlayer?.stop()
      mediaPlayer?.release()
    } catch (e: Exception) { /* ignore */ }
    mediaPlayer = null
  }

  /** اهتزاز متكرر زي المكالمة الواردة، على قناة الإنذار عشان يتخطى الوضع الصامت. */
  private fun startVibration() {
    try {
      val vib = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      vibrator = vib
      if (!vib.hasVibrator()) return
      // صمت 0 ← اهتزاز 500 ← سكون 350 ← اهتزاز 500 ← سكون 900 ← يكرر
      val pattern = longArrayOf(0, 500, 350, 500, 900)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val effect = VibrationEffect.createWaveform(pattern, 0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          val attrs = VibrationAttributes.Builder()
            .setUsage(VibrationAttributes.USAGE_ALARM)
            .build()
          vib.vibrate(effect, attrs)
        } else {
          val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
          vib.vibrate(effect, attrs)
        }
      } else {
        @Suppress("DEPRECATION")
        vib.vibrate(pattern, 0)
      }
    } catch (e: Exception) {
      // الجهاز مفيهوش اهتزاز أو الصلاحية مرفوضة - نكمل من غير اهتزاز
    }
  }

  private fun stopVibration() {
    try { vibrator?.cancel() } catch (e: Exception) { /* ignore */ }
    vibrator = null
  }

  /** نبض على الدرع وتدرّج بسيط في لون الخلفية عشان الشاشة تبان حية ومُلحّة. */
  private fun startAnimations(root: View?, shield: View?) {
    if (shield != null) {
      shieldAnim = ObjectAnimator.ofPropertyValuesHolder(
        shield,
        PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.14f),
        PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.14f),
      ).apply {
        duration = 620
        repeatCount = ValueAnimator.INFINITE
        repeatMode = ValueAnimator.REVERSE
        interpolator = AccelerateDecelerateInterpolator()
        start()
      }
    }
    if (root != null) {
      bgAnim = ValueAnimator.ofObject(ArgbEvaluator(), 0xFFC62E44.toInt(), 0xFF8E1230.toInt()).apply {
        duration = 900
        repeatCount = ValueAnimator.INFINITE
        repeatMode = ValueAnimator.REVERSE
        interpolator = AccelerateDecelerateInterpolator()
        addUpdateListener { root.setBackgroundColor(it.animatedValue as Int) }
        start()
      }
    }
  }

  private fun stopAnimations() {
    try { shieldAnim?.cancel() } catch (e: Exception) { /* ignore */ }
    try { bgAnim?.cancel() } catch (e: Exception) { /* ignore */ }
    shieldAnim = null
    bgAnim = null
  }

  /** يوقف الصوت والاهتزاز والأنيميشن كلهم مرة واحدة. */
  private fun stopAllAlerts() {
    stopSiren()
    stopVibration()
    stopAnimations()
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
    stopAllAlerts()
    super.onDestroy()
  }
}
