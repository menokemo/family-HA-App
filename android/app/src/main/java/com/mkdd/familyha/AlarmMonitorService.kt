package com.mkdd.familyha

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * خدمة تعمل في الخلفية بشكل دائم، بتحافظ على اتصال WebSocket مباشر
 * بـ Home Assistant (مستقلة تمامًا عن React Native)، وبتراقب حالة
 * كيان الإنذار. لو الحالة بقت "triggered"، بتطلع تنبيه فوق شاشة القفل
 * (Full-Screen Intent) زي مكالمة واردة.
 */
class AlarmMonitorService : Service() {
  private var client: OkHttpClient? = null
  private var webSocket: WebSocket? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val reconnectHandler = Handler(Looper.getMainLooper())
  private var msgId = 1
  private var stopped = false

  companion object {
    const val CHANNEL_MONITOR = "alarm_monitor_channel"
    const val CHANNEL_ALERT = "alarm_alert_channel"
    const val NOTIF_ID_MONITOR = 1001
    const val NOTIF_ID_ALERT = 1002
    const val PREFS = "alarm_monitor"
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannels()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    stopped = false
    startForeground(NOTIF_ID_MONITOR, buildMonitorNotification())
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FamilyHA:AlarmMonitor")
    try { wakeLock?.acquire(12 * 60 * 60 * 1000L) } catch (e: Exception) { /* ignore */ }
    connect()
    return START_STICKY
  }

  override fun onDestroy() {
    stopped = true
    reconnectHandler.removeCallbacksAndMessages(null)
    webSocket?.close(1000, "service stopped")
    try { wakeLock?.let { if (it.isHeld) it.release() } } catch (e: Exception) { /* ignore */ }
    super.onDestroy()
  }

  private fun prefs() = getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun connect() {
    val baseUrl = prefs().getString("baseUrl", null) ?: return
    val token = prefs().getString("token", null) ?: return
    val wsUrl = baseUrl.trim().trimEnd('/')
      .replaceFirst(Regex("^http:"), "ws:")
      .replaceFirst(Regex("^https:"), "wss:") + "/api/websocket"

    client = OkHttpClient.Builder().pingInterval(30, TimeUnit.SECONDS).build()
    val request = Request.Builder().url(wsUrl).build()
    webSocket = client?.newWebSocket(
      request,
      object : WebSocketListener() {
        override fun onMessage(webSocket: WebSocket, text: String) {
          try {
            val json = JSONObject(text)
            when (json.optString("type")) {
              "auth_required" -> {
                webSocket.send(JSONObject().put("type", "auth").put("access_token", token).toString())
              }
              "auth_ok" -> {
                webSocket.send(
                  JSONObject().put("id", msgId).put("type", "subscribe_events").put("event_type", "state_changed").toString(),
                )
                msgId++
              }
              "event" -> {
                val event = json.optJSONObject("event") ?: return
                val data = event.optJSONObject("data") ?: return
                val entityId = data.optString("entity_id")
                val watchedEntity = prefs().getString("entityId", "") ?: ""
                if (entityId.isNotEmpty() && entityId == watchedEntity) {
                  val newState = data.optJSONObject("new_state")?.optString("state")
                  if (newState == "triggered") showFullScreenAlert()
                }
              }
            }
          } catch (e: Exception) {
            // رسالة غير متوقعة، تجاهلها ولا توقف الاتصال
          }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          scheduleReconnect()
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
          scheduleReconnect()
        }
      },
    )
  }

  private fun scheduleReconnect() {
    if (stopped || !prefs().getBoolean("enabled", false)) return
    reconnectHandler.postDelayed({ if (!stopped) connect() }, 8000)
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_MONITOR, "مراقبة الإنذار", NotificationManager.IMPORTANCE_MIN),
      )
      val alertChannel = NotificationChannel(CHANNEL_ALERT, "تنبيه الإنذار", NotificationManager.IMPORTANCE_HIGH)
      alertChannel.enableVibration(true)
      nm.createNotificationChannel(alertChannel)
    }
  }

  private fun buildMonitorNotification(): Notification {
    return NotificationCompat.Builder(this, CHANNEL_MONITOR)
      .setContentTitle("Family HA")
      .setContentText("مراقبة الإنذار نشطة في الخلفية")
      .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setOngoing(true)
      .build()
  }

  private fun showFullScreenAlert() {
    val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val fullScreenPendingIntent = PendingIntent.getActivity(
      this,
      0,
      fullScreenIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(this, CHANNEL_ALERT)
      .setContentTitle("🚨 تم تشغيل الإنذار")
      .setContentText("افتح للتعطيل")
      .setSmallIcon(android.R.drawable.ic_dialog_alert)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setFullScreenIntent(fullScreenPendingIntent, true)
      .setAutoCancel(true)
      .build()
    val nm = getSystemService(NotificationManager::class.java)
    nm.notify(NOTIF_ID_ALERT, notification)
    // ملاحظة: ما بنستدعيش startActivity() هنا مباشرة عمدًا - أندرويد
    // بيمنع إطلاق Activity من خدمة خلفية مباشرة (Background Activity
    // Launch restrictions). الآلية الصحيحة والموثّقة هي الاعتماد على
    // setFullScreenIntent فوق بس، والنظام نفسه بيفتح الشاشة تلقائيًا
    // لو الجهاز مقفول/الشاشة مطفية - بشرط إن صلاحية full-screen intent
    // ممنوحة فعليًا (راجع canUseFullScreenIntent في AlarmMonitorModule).
  }
}
