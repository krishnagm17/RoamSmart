// ─────────────────────────────────────────────────────────────────────────────
// geoUtils.js — pure geometry helpers for hazard ↔ trip geographic matching.
//   • haversine distance (km)
//   • point-in-polygon (ray casting, works for CAP polygons in [lon,lat])
//   • point-to-polygon distance approximation
//   • circle / radius matching
//   • route sampling (build intermediate points along a leg)
// No external dependencies.
// ─────────────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (Number(deg) * Math.PI) / 180;

function haversineKm(lat1, lon1, lat2, lon2) {
  const a = [Number(lat1), Number(lon1)];
  const b = [Number(lat2), Number(lon2)];
  if (!isFinite(a[0]) || !isFinite(a[1]) || !isFinite(b[0]) || !isFinite(b[1])) return null;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Distance between two {latitude, longitude} points.
function distanceKm(a, b) {
  if (!a || !b) return null;
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
}

// pointInPolygon — ray casting. `polygon` is an array of [lon, lat] pairs.
function pointInPolygon(lat, lon, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i][0]);
    const yi = Number(polygon[i][1]);
    const xj = Number(polygon[j][0]);
    const yj = Number(polygon[j][1]);
    if (!isFinite(xi) || !isFinite(yi) || !isFinite(xj) || !isFinite(yj)) continue;
    const intersect =
      yi > Number(lat) !== yj > Number(lat) &&
      Number(lon) < ((xj - xi) * (Number(lat) - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Minimum distance from a point to a polygon boundary + whether it is inside.
// Returns { inside, distanceKm }.
function distanceToPolygon(lat, lon, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 2) return { inside: false, distanceKm: Infinity };
  if (pointInPolygon(lat, lon, polygon)) return { inside: true, distanceKm: 0 };
  let min = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const d = distanceToSegmentKm(lat, lon, Number(a[1]), Number(a[0]), Number(b[1]), Number(b[0]));
    if (d < min) min = d;
  }
  return { inside: false, distanceKm: min };
}

function distanceToSegmentKm(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return haversineKm(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return haversineKm(px, py, cx, cy);
}

// Does a point fall within `radiusKm` of a center, OR inside a polygon?
// `alertGeo` may carry { latitude, longitude, radiusKm, polygon }.
function alertHitsPoint(alertGeo, lat, lon) {
  if (!alertGeo || !isFinite(Number(lat)) || !isFinite(Number(lon))) return null;
  const polygon = alertGeo.polygon;
  if (Array.isArray(polygon) && polygon.length >= 3) {
    const poly = distanceToPolygon(Number(lat), Number(lon), polygon);
    return { hit: poly.inside, distanceKm: poly.inside ? 0 : poly.distanceKm, method: 'polygon' };
  }
  if (isFinite(Number(alertGeo.latitude)) && isFinite(Number(alertGeo.longitude))) {
    const d = haversineKm(lat, lon, Number(alertGeo.latitude), Number(alertGeo.longitude));
    const radius = isFinite(Number(alertGeo.radiusKm)) ? Number(alertGeo.radiusKm) : 100; // default 100 km
    return { hit: d <= radius, distanceKm: d, method: 'radius' };
  }
  return null;
}

// Sample `steps` intermediate points along the great-circle path a→b.
// Returns [{ latitude, longitude }].
function sampleRoute(a, b, steps = 5) {
  if (!a || !b || !a.latitude || !a.longitude || !b.latitude || !b.longitude) return [];
  const out = [];
  const aLat = toRad(Number(a.latitude));
  const aLon = toRad(Number(a.longitude));
  const bLat = toRad(Number(b.latitude));
  const bLon = toRad(Number(b.longitude));
  const dLat = bLat - aLat;
  const dLon = bLon - aLon;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const lat = aLat + dLat * f;
    const lon = aLon + dLon * f;
    out.push({ latitude: (lat * 180) / Math.PI, longitude: (lon * 180) / Math.PI });
  }
  return out;
}

// Does an alert hit any point along a route leg? Returns the closest distance.
function alertHitsRoute(alertGeo, from, to, steps = 6) {
  const points = sampleRoute(from, to, steps);
  let best = { hit: false, distanceKm: Infinity };
  for (const p of points) {
    const r = alertHitsPoint(alertGeo, p.latitude, p.longitude);
    if (!r) continue;
    if (r.hit) return { hit: true, distanceKm: 0, method: r.method };
    if (r.distanceKm < best.distanceKm) best = { hit: false, distanceKm: r.distanceKm, method: r.method };
  }
  return best;
}

// Normalize a CAP circle string like "lon,lat radius" or "lat,lon radius".
// CAP circles are "lon,lat radius(km)". Returns { latitude, longitude, radiusKm }.
function parseCircle(circleStr) {
  if (!circleStr) return null;
  const m = String(circleStr).trim().match(/^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s+([\d.]+)\s*(km)?\s*$/i);
  if (!m) return null;
  return { longitude: Number(m[1]), latitude: Number(m[2]), radiusKm: Number(m[3]) };
}

// Parse a CAP polygon string: multiple "lon,lat" pairs separated by spaces.
function parsePolygon(polygonStr) {
  if (!polygonStr) return null;
  const pairs = String(polygonStr).trim().split(/\s+/);
  const out = [];
  for (const pair of pairs) {
    const p = pair.split(',');
    if (p.length !== 2) continue;
    const lon = Number(p[0]);
    const lat = Number(p[1]);
    if (isFinite(lon) && isFinite(lat)) out.push([lon, lat]);
  }
  return out.length >= 3 ? out : null;
}

module.exports = {
  haversineKm,
  distanceKm,
  pointInPolygon,
  distanceToPolygon,
  alertHitsPoint,
  sampleRoute,
  alertHitsRoute,
  parseCircle,
  parsePolygon,
};
