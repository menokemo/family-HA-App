package com.mkdd.familyha

import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AlarmMonitorModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "AlarmMonitor"

  private fun prefs() = reactContext.getSharedPreferences(AlarmMonitorService.PREFS, Context.MODE_PRIVATE)

  @ReactMethod
  fun start(baseUrl: String, token: String, entityId: String, alarmCode: String, promise: Promise) {
    try {
      prefs().edit()
        .putString("baseUrl", baseUrl)
        .putString("token", token)
        .putString("entityId", entityId)
        .putString("alarmCode", alarmCode)
        .putBoolean("enabled", true)
        .apply()
      val intent = Intent(reactContext, AlarmMonitorService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("start_failed", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      prefs().edit().putBoolean("enabled", false).apply()
      reactContext.stopService(Intent(reactContext, AlarmMonitorService::class.java))
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("stop_failed", e.message, e)
    }
  }

  @ReactMethod
  fun isRunning(promise: Promise) {
    promise.resolve(prefs().getBoolean("enabled", false))
  }
}
