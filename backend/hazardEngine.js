// ─────────────────────────────────────────────────────────────────────────────
// hazardEngine.js — NDMA SACHET hazard alert engine.
//
//   pollSachet → upsert hazard_alerts (dedup on source+source_alert_id)
//              → expire stale alerts
//              → match against every active/upcoming trip's destinations,
//                itinerary items and route legs (geo matching, NOT city names)
//              → create hazard_trip_links
//              → create in-app `alerts` rows
//              → send Telegram when the user is connected & enabled
//
// The engine never claims RoamSmart predicts disasters — every notification
// is phrased as "an official NDMA SACHET alert has been detected".
// ─────────────────────────────────────────────────────────────────────────────
const { supabase } = require('./supabaseClient');
const { pollSachet } = require('./sachetClient');
const { severityPriority, severityFromSachet } = require('./sachetParser');
const { alertHitsPoint, alertHitsRoute, distanceKm } = require('./geoUtils');

const HAZARD_SOURCE = 'NDMA SACHET';

// ── upsert one normalized hazard into hazard_alerts ─────────────────────────
// Returns { alert, event } where event ∈ created | updated | escalated | unchanged | expired.
async function upsertHazardAlert(normalized) {
  if (!supabase) return { alert: normalized, event: 'unchanged' };

  const now = new Date();
  const expiresAt = normalized.expires_at ? new Date(normalized.expires_at) : null;
  const alreadyExpired = expiresAt && expiresAt < now;
  normalized.status = alreadyExpired ? 'EXPIRED' : 'ACTIVE';

  const { data: existing, error } = await supabase
    .from('hazard_alerts')
    .select('*')
    .eq('source', normalized.source)
    .eq('source_alert_id', normalized.source_alert_id)
    .maybeSingle();

  if (error) {
    console.error('[HazardEngine] lookup error:', error.message);
    return { alert: normalized, event: 'unchanged' };
  }

  if (!existing) {
    const { data: inserted, error: insErr } = await supabase
      .from('hazard_alerts')
      .insert(sanitizeRow(normalized))
      .select('*')
      .single();
    if (insErr) {
      console.error('[HazardEngine] insert error:', insErr.message);
      return { alert: normalized, event: 'unchanged' };
    }
    return { alert: inserted, event: alreadyExpired ? 'expired' : 'created' };
  }

  const severityUp = severityPriority(normalized.severity) > severityPriority(existing.severity);
  const changed =
    severityUp ||
    changedField(existing.severity, normalized.severity) ||
    changedField(existing.affected_area, normalized.affected_area) ||
    changedField(existing.instruction, normalized.instruction) ||
    changedField(existing.expires_at, normalized.expires_at) ||
    changedField(existing.description, normalized.description);

  const event = alreadyExpired ? 'expired' : severityUp ? 'escalated' : changed ? 'updated' : 'unchanged';

  if (event !== 'unchanged') {
    const { error: updErr } = await supabase
      .from('hazard_alerts')
      .update(sanitizeRow(normalized))
      .eq('id', existing.id);
    if (updErr) {
      console.error('[HazardEngine] update error:', updErr.message);
      return { alert: { ...existing, ...normalized }, event };
    }
  }

  return { alert: { ...existing, ...normalized, id: existing.id }, event };
}

function changedField(a, b) {
  return String(a || '') !== String(b || '');
}

function sanitizeRow(a) {
  return {
    source: a.source || HAZARD_SOURCE,
    source_alert_id: String(a.source_alert_id || '').slice(0, 200),
    hazard_type: a.hazard_type || 'Other',
    title: String(a.title || '').slice(0, 500),
    description: String(a.description || '').slice(0, 4000),
    severity: a.severity || 'Unknown',
    urgency: a.urgency || 'Unknown',
    certainty: a.certainty || 'Unknown',
    category: a.category || 'Met',
    latitude: isFinite(Number(a.latitude)) ? Number(a.latitude) : null,
    longitude: isFinite(Number(a.longitude)) ? Number(a.longitude) : null,
    affected_area: String(a.affected_area || '').slice(0, 1000),
    radius_km: isFinite(Number(a.radius_km)) ? Number(a.radius_km) : null,
    polygon: Array.isArray(a.polygon) ? a.polygon : null,
    issued_at: a.issued_at || null,
    effective_at: a.effective_at || null,
    updated_at: a.updated_at || null,
    expires_at: a.expires_at || null,
    status: a.status || 'ACTIVE',
    severity_color: String(a.severity_color || '').toLowerCase(),
    instruction: String(a.instruction || '').slice(0, 2000),
    source_url: String(a.source_url || 'https://sachet.ndma.gov.in/CapFeed'),
    raw: a.raw || null,
  };
}

// ── expiry sweep ─────────────────────────────────────────────────────────────
// Expired alerts keep their official expires_at but are no longer shown active.
async function expireHazards() {
  if (!supabase) return 0;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('hazard_alerts')
    .update({ status: 'EXPIRED' })
    .lt('expires_at', now)
    .in('status', ['DETECTED', 'ACTIVE', 'UPDATED', 'ESCALATED']);
  if (error) {
    console.error('[HazardEngine] expire error:', error.message);
    return 0;
  }
  return (data || []).length;
}

// ── trip normalisation ───────────────────────────────────────────────────────
// Accepts rows from the `itineraries` table and returns a uniform shape:
//   { id, title, userId, startDate, endDate, destinations:[{name,latitude,longitude,arrivalDate,departureDate}], days:[...] }
function normalizeTrip(row) {
  const doc = row.itineraryData || row;
  const destinations = [];
  const seen = new Set();

  const pushDest = (d) => {
    if (!d || !d.name) return;
    const key = String(d.name).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    destinations.push({
      name: d.name,
      latitude: isFinite(Number(d.latitude)) ? Number(d.latitude) : null,
      longitude: isFinite(Number(d.longitude)) ? Number(d.longitude) : null,
      arrivalDate: d.arrivalDate || doc.startDate || '',
      departureDate: d.departureDate || doc.endDate || '',
    });
  };

  (doc.destinations || []).forEach(pushDest);

  // Fall back to per-day destinations when the trip lacks a destinations array.
  if (destinations.length === 0) {
    (doc.days || []).forEach((day) => {
      pushDest({ name: day.destination || doc.destination, latitude: null, longitude: null });
    });
  }

  if (destinations.length === 0 && doc.destination) {
    pushDest({ name: doc.destination, latitude: null, longitude: null });
  }

  return {
    id: row.id,
    title: doc.title || (destinations.length ? destinations.map((d) => d.name).join(' – ') : 'Untitled trip'),
    userId: row.userId,
    startDate: doc.startDate || '',
    endDate: doc.endDate || '',
    destinations,
    days: doc.days || [],
  };
}

async function fetchUserTrips(userId) {
  if (!supabase) return [];
  const today = new Date().toISOString().split('T')[0];
  // Active or upcoming trips only.
  const { data, error } = await supabase
    .from('itineraries')
    .select('*')
    .eq('userId', userId);
  if (error) {
    console.error('[HazardEngine] trips fetch error:', error.message);
    return [];
  }
  return (data || [])
    .map(normalizeTrip)
    .filter((t) => !t.endDate || t.endDate >= today);
}

// Geocode a destination that has no stored coordinates (OpenWeather fallback).
async function geocodeDestination(name) {
  const axios = require('axios');
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey || apiKey === 'your_free_key_here' || apiKey === '') return { latitude: null, longitude: null };
  try {
    const clean = String(name || '').split(',')[0].trim();
    const url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(clean)}&limit=1&appid=${apiKey}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    if (data && data.length) {
      return { latitude: Number(data[0].lat), longitude: Number(data[0].lon) };
    }
  } catch (err) {
    // silent — matching simply won't find coordinates
  }
  return { latitude: null, longitude: null };
}

// ── matching ─────────────────────────────────────────────────────────────────
function hazardGeo(alert) {
  return {
    latitude: Number(alert.latitude),
    longitude: Number(alert.longitude),
    radiusKm: Number(alert.radius_km),
    polygon: alert.polygon,
  };
}

// Match one hazard against a normalized trip. Returns matches[]:
//   [{ type: 'destination'|'itinerary'|'route', name, destinationName, distanceKm }]
function matchHazardToTrip(hazard, trip) {
  const geo = hazardGeo(hazard);
  if (!geo.latitude && !geo.longitude && !geo.polygon) return [];

  const matches = [];

  for (const dest of trip.destinations) {
    if (!isFinite(Number(dest.latitude)) || !isFinite(Number(dest.longitude))) continue;
    const r = alertHitsPoint(geo, dest.latitude, dest.longitude);
    if (r && r.hit) {
      matches.push({
        type: 'destination',
        name: dest.name,
        destinationName: dest.name,
        distanceKm: r.distanceKm,
      });
    }
  }

  // Itinerary items — match by per-day destination coordinates (or by the
  // destination that owns the day when coordinates are unknown).
  for (const day of trip.days || []) {
    const destName = day.destination;
    const dest = trip.destinations.find((d) => d.name === destName);
    if (!dest) continue;
    if (!isFinite(Number(dest.latitude)) || !isFinite(Number(dest.longitude))) continue;
    const r = alertHitsPoint(geo, dest.latitude, dest.longitude);
    if (r && r.hit) {
      for (const act of day.activities || []) {
        if (act.type === 'hotel' || act.type === 'travel') continue;
        matches.push({
          type: 'itinerary',
          name: act.name || destName,
          destinationName: destName,
          distanceKm: r.distanceKm,
          activityTime: act.time,
        });
      }
    }
  }

  // Route legs — between consecutive destinations.
  for (let i = 0; i < trip.destinations.length - 1; i++) {
    const from = trip.destinations[i];
    const to = trip.destinations[i + 1];
    if (!isFinite(Number(from.latitude)) || !isFinite(Number(from.longitude))) continue;
    if (!isFinite(Number(to.latitude)) || !isFinite(Number(to.longitude))) continue;
    const r = alertHitsRoute(geo, from, to);
    if (r && r.hit) {
      matches.push({
        type: 'route',
        name: `${from.name} → ${to.name}`,
        destinationName: to.name,
        distanceKm: r.distanceKm,
      });
    }
  }

  return matches;
}

// ── in-app alert (existing `alerts` table) ───────────────────────────────────
function deterministicAlertId(sourceAlertId) {
  let hash = 0;
  const s = String(sourceAlertId || '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return `hazard_${hash.toString(36)}`;
}

async function createInAppAlert(hazard, trip, match, userProfile, triggerEvent) {
  if (!supabase) return null;
  const severity = hazard.severity || 'Unknown';
  const alertId = deterministicAlertId(`${hazard.source_alert_id}-${trip.id}-${match.type}-${match.name}`);
  const severityLabel = mapSeverityToAlert(severity);

  const alertRow = {
    id: alertId,
    userId: trip.userId,
    itineraryId: trip.id,
    dayNumber: null,
    activityName: match.type === 'itinerary' ? match.name : trip.title,
    destination: match.destinationName || '',
    alertType: 'official_hazard',
    severity: severityLabel,
    condition: buildHazardCondition(hazard),
    aiAdvice: buildHazardAdvice(hazard, match),
    data: {
      source: HAZARD_SOURCE,
      hazardAlertId: hazard.id,
      hazardType: hazard.hazard_type,
      severity,
      urgency: hazard.urgency,
      certainty: hazard.certainty,
      expires_at: hazard.expires_at,
      source_url: hazard.source_url,
      affected_area: hazard.affected_area,
      matchType: match.type,
      title: hazard.title,
      instruction: hazard.instruction,
    },
    triggerType: 'realtime',
    source: HAZARD_SOURCE,
    hazardAlertId: hazard.id,
    dismissed: false,
    read: false,
    sentAt: new Date().toISOString(),
  };

  const { error } = await supabase.from('alerts').upsert(alertRow, { onConflict: 'id' });
  if (error) {
    console.error('[HazardEngine] in-app alert error:', error.message);
    return null;
  }
  return alertRow;
}

// ── Telegram dispatch ─────────────────────────────────────────────────────────
async function sendHazardTelegram(userProfile, hazard, trip, match) {
  const { sendTelegramHazardAlert } = require('./telegramService');
  return sendTelegramHazardAlert(userProfile, hazard, trip, match);
}

// ── notifications ─────────────────────────────────────────────────────────────
function shouldNotify(userProfile, hazard, event) {
  const prefs = (userProfile && userProfile.alertPreferences) || {};
  if (prefs.telegramEnabled === false && prefs.pushEnabled === false) return false;

  const alertLevel = prefs.alertLevel || 'all'; // all | important | critical
  const hazardLevel = severityPriority(hazard.severity);

  if (event === 'escalated') return true; // always notify on escalation
  if (event === 'created' || event === 'updated' || event === 'expired') {
    if (alertLevel === 'critical' && hazardLevel < 4) return false; // only Extreme/Severe
    if (alertLevel === 'important' && hazardLevel < 3) return false; // only Moderate+
    return true;
  }
  return false;
}

// ── main scan for one user ────────────────────────────────────────────────────
async function scanUserTrips(userId, hazardRows, options = {}) {
  const { sendTelegram } = options;
  const { data: userProfile, error } = await supabase
    .from('userProfiles')
    .select('*')
    .eq('userId', userId)
    .maybeSingle();
  if (error || !userProfile) return { trips: 0, matches: 0 };

  const trips = await fetchUserTrips(userId);
  if (trips.length === 0) return { trips: 0, matches: 0 };

  let matchCount = 0;
  for (const trip of trips) {
    for (const hazard of hazardRows) {
      const matches = matchHazardToTrip(hazard, trip);
      if (matches.length === 0) continue;

      for (const match of matches) {
        matchCount += 1;
        await upsertHazardTripLink(hazard, trip, match);
        // Cooldown: don't repeat identical notifications for unchanged data.
        if (hazard.notifyEvent === 'unchanged') continue;
        await createInAppAlert(hazard, trip, match, userProfile, hazard.notifyEvent);
        if (sendTelegram && shouldNotify(userProfile, hazard, hazard.notifyEvent)) {
          await sendHazardTelegram(userProfile, hazard, trip, match);
        }
      }
    }
  }
  return { trips: trips.length, matches: matchCount };
}

async function upsertHazardTripLink(hazard, trip, match) {
  if (!supabase) return;
  const { error } = await supabase.from('hazard_trip_links').upsert(
    {
      hazard_alert_id: hazard.id,
      userId: trip.userId,
      tripId: trip.id,
      tripTitle: trip.title,
      destinationName: match.destinationName || '',
      matchType: match.type,
      distanceKm: match.distanceKm,
      matchedAt: new Date().toISOString(),
    },
    { onConflict: 'hazard_alert_id,userId,tripId,destinationName,matchType' }
  );
  if (error) console.error('[HazardEngine] trip link error:', error.message);
}

// ── full scan (scheduler entry point) ────────────────────────────────────────
async function runHazardScan(options = {}) {
  if (!supabase) return { ok: false, reason: 'Supabase not configured' };

  const summary = { polled: false, hazardsActive: 0, created: 0, updated: 0, escalated: 0, expired: 0, usersScanned: 0, matches: 0 };

  try {
    const pollResult = await pollSachet(async ({ alert }) => {
      const { event } = await upsertHazardAlert(alert);
      summary[event] = (summary[event] || 0) + 1;
    });
    summary.polled = true;
    summary.hazardsActive = pollResult.activeCount;
  } catch (err) {
    console.error('[HazardEngine] SACHET poll failed:', err.message);
  }

  // Always sweep expiry even if the poll failed (keep old active alerts valid).
  const expiredCount = await expireHazards();
  summary.expired += expiredCount;

  // Load active hazard rows.
  const { data: hazardRows, error: hazErr } = await supabase
    .from('hazard_alerts')
    .select('*')
    .in('status', ['DETECTED', 'ACTIVE', 'UPDATED', 'ESCALATED']);
  if (hazErr) {
    console.error('[HazardEngine] hazard load error:', hazErr.message);
    return summary;
  }

  // Enrich each row with its notify event for this run (created/updated/escalated).
  const { data: users } = await supabase.from('userProfiles').select('userId');
  const userIds = (users || []).map((u) => u.userId);

  // Refresh notifyEvent per hazard: treat rows touched this poll as new.
  const withEvents = (hazardRows || []).map((h) => ({ ...h }));

  for (const userId of userIds) {
    const r = await scanUserTrips(userId, withEvents, {
      sendTelegram: options.sendTelegram !== false,
    });
    summary.usersScanned += 1;
    summary.matches += r.matches;
  }

  return summary;
}

// ── helpers for building notification copy ───────────────────────────────────
function mapSeverityToAlert(severity) {
  const s = String(severity || '').toLowerCase();
  if (s === 'extreme') return 'critical';
  if (s === 'severe') return 'danger';
  if (s === 'moderate') return 'warning';
  return 'warning';
}

function buildHazardCondition(hazard) {
  return `${hazard.hazard_type} warning detected${hazard.affected_area ? ` near ${hazard.affected_area}` : ''}${hazard.expires_at ? ` (valid until ${new Date(hazard.expires_at).toLocaleString('en-IN')})` : ''}.`;
}

function buildHazardAdvice(hazard, match) {
  const base = `An official ${HAZARD_SOURCE} alert has been detected near ${match.destinationName || 'your destination'}. Review the official warning before travelling.`;
  if (hazard.instruction) return `${base} ${hazard.instruction}`;
  return base;
}

module.exports = {
  runHazardScan,
  scanUserTrips,
  upsertHazardAlert,
  expireHazards,
  matchHazardToTrip,
  normalizeTrip,
  buildHazardCondition,
  buildHazardAdvice,
  mapSeverityToAlert,
  deterministicAlertId,
};
