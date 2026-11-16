package com.mkdd.familyha

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "FamilyHA"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // بنتابع لو التطبيق في المقدمة وقت ما توصل رنّة الجرس — عشان نعرف لو الجرس هو
  // اللي صحّى التطبيق (كان في الخلفية/القفل) ولا كان مفتوح أصلاً.
  private var isForeground = false

  override fun onResume() {
    super.onResume()
    isForeground = true
  }

  override fun onPause() {
    isForeground = false
    super.onPause()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleDoorbellIntent(intent)
  }

  // الـActivity من نوع singleTask، فلو كانت مفتوحة ووصلت رنّة, بييجي onNewIntent
  // بدل onCreate. لازم نحدّث الـintent الحالي ونعالجه.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleDoorbellIntent(intent)
  }

  // لو الـintent جاي من رنّة الجرس: نظهر فوق القفل ونصحّي الشاشة، ونبلّغ الـJS
  // باسم الكاميرا عشان يفتح شاشة المكالمة الواردة. لو RN لسه مش جاهز (بدء بارد)،
  // DoorbellBridge بيخزّنها والـJS بيسألها أول ما يشتغل.
  private fun handleDoorbellIntent(intent: Intent?) {
    val camera = intent?.getStringExtra("doorbell_camera") ?: return
    if (camera.isEmpty()) return
    // الجرس صحّى التطبيق لو مكانش في المقدمة وقت وصول الرنّة. بنخزّنها عشان
    // لما المكالمة تتقفل نرجّع التطبيق للخلفية (نرجع للقفل/اللي كان ظاهر).
    DoorbellBridge.wokeApp = !isForeground
    showOverLockScreen()
    DoorbellBridge.deliver(camera)
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
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
      )
    }
  }
}
