package com.mkdd.familyha

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * بيوصّل رنّة الجرس من الكود النيتف (MainActivity عند فتحها بـintent الجرس)
 * للـJS. حالتين:
 *  • التطبيق شغّال (RN جاهز): بنبعت event `doorbellRing` فورًا باسم الكاميرا.
 *  • التطبيق كان مقفول (بدء بارد، RN لسه بيحمّل): بنخزّن الكاميرا كـ"معلّقة"،
 *    والـJS بيسألها أول ما يشتغل بـ getPendingDoorbell.
 */
object DoorbellBridge {
  @Volatile private var pendingCamera: String? = null
  @Volatile private var context: ReactApplicationContext? = null
  // هل رنّة الجرس هي اللي صحّت التطبيق (كان في الخلفية/القفل)؟ بتتظبط في
  // MainActivity وقت وصول الرنّة، وبتستخدمها شاشة الجرس عند الإنهاء عشان ترجّع
  // التطبيق للخلفية بدل ما يفضل مفتوح على آخر شاشة.
  @Volatile var wokeApp: Boolean = false

  fun attach(ctx: ReactApplicationContext) {
    context = ctx
  }

  fun deliver(camera: String?) {
    if (camera.isNullOrEmpty()) return
    val ctx = context
    if (ctx != null && ctx.hasActiveReactInstance()) {
      try {
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("doorbellRing", camera)
        return
      } catch (e: Exception) {
        // RN مش جاهز فعلاً، نخزّنها كمعلّقة
      }
    }
    pendingCamera = camera
  }

  /** بيرجّع الكاميرا المعلّقة (لو في) ويمسحها — JS بيستهلكها مرة واحدة. */
  fun consume(): String? {
    val camera = pendingCamera
    pendingCamera = null
    return camera
  }
}
