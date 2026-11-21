package com.mkdd.familyha

import android.location.Location
import org.json.JSONArray

/** منطقة Home Assistant (zone.*) كما يمرّرها التطبيق: name = الـ entity_id الكامل
 *  للمنطقة (مثل "zone.home" / "zone.work"). بيتسجّل كـ requestId للـ geofence،
 *  وبيتبعت لـHA كـ `in_zones` عشان يثبّت الحضور عند عبور الحدود (من غير تذبذب). */
data class GeoZone(val name: String, val lat: Double, val lng: Double, val radius: Float)

/** أدوات مشتركة بين الخدمة والـ GeofenceReceiver (عشان مانكررش المنطق). */
object GeoZones {
  fun parse(raw: String): List<GeoZone> {
    if (raw.isEmpty()) return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        val name = o.optString("name")
        if (name.isEmpty()) return@mapNotNull null
        GeoZone(name, o.optDouble("lat"), o.optDouble("lng"), o.optDouble("radius", 100.0).toFloat())
      }
    } catch (e: Exception) {
      emptyList()
    }
  }

  fun distanceTo(z: GeoZone, lat: Double, lng: Double): Float {
    val out = FloatArray(1)
    Location.distanceBetween(lat, lng, z.lat, z.lng, out)
    return out[0]
  }

  /** أصغر منطقة (بنصف القطر) بتحتوي النقطة ضمن (نصف القطر + هامش)، أو null. */
  fun smallestContaining(zones: List<GeoZone>, lat: Double, lng: Double, margin: Float = 0f): GeoZone? {
    var best: GeoZone? = null
    for (z in zones) {
      if (distanceTo(z, lat, lng) <= z.radius + margin && (best == null || z.radius < best.radius)) best = z
    }
    return best
  }
}
