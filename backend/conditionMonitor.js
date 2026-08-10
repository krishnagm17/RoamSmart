// ─────────────────────────────────────────────────────────────────────────────
// conditionMonitor.js — live travel-condition monitoring for trip destinations.
//
//   • Every 6h we capture a snapshot per active/upcoming destination:
//       - weather (OpenWeatherMap current + forecast)   [weight 40%]
//       - air quality (IQAir)                           [weight 25%]
//       - crowd level (existing prediction heuristic)   [weight 35%]
//   • Snapshots go into `condition_snapshots` (history for the UI).
//   • When a threshold crosses (e.g. heat ≥ 40°C, AQI ≥ 150, crowd ≥ 75) we
//     write a `condition_alerts` row and (optionally) notify via Telegram.
//
// Never claims to predict disasters — it reports observed/forecast conditions.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const { supabase } = require('./supabaseClient');
const { geocodeCity } = require('./conditionChecker');
const { getWeatherContext, computeCrowdScore } = require('./crowdUtils');
const THRESHOLDS = {
  heat:        { warn: 38,  danger: 42, critical: 46 },   // °C
  rain:        { warn: 15,  danger: 30, critical: 50 },   // mm / 3h
  wind:        { warn: 45,  danger: 65, critical: 90 },   // km/h
  aqi:         { warn: 150, danger: 200, critical: 300 }, // US AQI
  crowd:       { warn: 65,  danger: 78, critical: 90 },   // /100
  storm:       { warn: false },                            // thunderstorm flag
};

function severityFor(value, key) {
  const t = THRESHOLDS[key];
  if (!t || !isFinite(Number(value))) return null;
  if (value >= t.critical) return 'critical';
  if (value >= t.danger) return 'danger';
  if (value >= t.warn) return 'warning';
  return null;
}

// Fetch weather snapshot for a destination on a given date.
async function fetchWeatherSnapshot(destination, dateStr) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey || apiKey === 'your_free_key_here' || apiKey === '') return null;
  const coords = await geocodeCity(destination);
  if (!coords) return null;

  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=metric&cnt=8`;
  const { data } = await axios.get(url, { timeout: 6000 });

  const target = new Date(dateStr).toISOString().split('T')[0];
  const forecasts = (data.list || []).filter((f) => f.dt_txt.startsWith(target));

  if (forecasts.length === 0) return null;

  const maxTemp = Math.max(...forecasts.map((f) => f.main.temp));
  const minTemp = Math.min(...forecasts.map((f) => f.main.temp_min));
  const maxRain = Math.max(...forecasts.map((f) => f.rain?.['3h'] || 0));
  const maxWind = Math.max(...forecasts.map((f) => f.wind.speed * 3.6));
  const hasStorm = forecasts.some((f) => String(f.weather[0].main).toLowerCase() === 'thunderstorm');
  const mainCondition = forecasts[0].weather[0].description || 'Unknown';
  const humidity = Math.max(...forecasts.map((f) => f.main.humidity));

  return { maxTemp, minTemp, maxRain, maxWind, hasStorm, mainCondition, humidity, coords };
}

// Fetch AQI snapshot (IQAir). Uses the geocoded coordinates when available so
// we never need a state name, then falls back to the city endpoint.
async function fetchAqiSnapshot(destination, coords) {
  const key = process.env.IQAIR_API_KEY;
  if (!key || key === 'your_key' || key === '') return null;

  const base = `http://api.airvisual.com/v2`;
  const url = coords && isFinite(Number(coords.lat)) && isFinite(Number(coords.lon))
    ? `${base}/nearest_city?lat=${coords.lat}&lon=${coords.lon}&key=${key}`
    : null;

  try {
    if (url) {
      const { data } = await axios.get(url, { timeout: 6000 });
      const pollution = data?.data?.current?.pollution;
      if (pollution && pollution.aqius) {
        return { aqi: pollution.aqius, pollutant: pollution.mainus || 'PM2.5' };
      }
    }
  } catch {
    // fall through to city endpoint
  }

  const cleanDest = destination.split(',')[0].trim();
  const cityUrl = `${base}/city?city=${encodeURIComponent(cleanDest)}&state=&country=India&key=${key}`;
  try {
    const { data } = await axios.get(cityUrl, { timeout: 6000 });
    const pollution = data?.data?.current?.pollution;
    if (!pollution || !pollution.aqius) return null;
    return { aqi: pollution.aqius, pollutant: pollution.mainus || 'PM2.5' };
  } catch {
    return null;
  }
}

// Fetch crowd snapshot using the existing heuristic (no Gemini call needed).
async function fetchCrowdSnapshot(destination) {
  try {
    const ctx = await getWeatherContext(destination);
    const score = computeCrowdScore(destination, ctx);
    return { crowdScore: score };
  } catch {
    return null;
  }
}

// Compute an aggregate travel-condition score in [0,100]:
//   weather 40% + aqi 25% + crowd 35%.
function computeAggregateScore(weather, aqi, crowd) {
  let weatherScore = 50;
  if (weather) {
    weatherScore =
      40 +
      Math.min(60, Math.max(0, (weather.maxTemp - 20) * 4)) +        // heat
      Math.min(60, weather.maxRain * 2.2) +                          // rain
      (weather.hasStorm ? 25 : 0) +                                  // storm
      Math.min(30, (weather.maxWind - 20) * 0.8);                    // wind
    weatherScore = Math.min(100, weatherScore);
  }
  let aqiScore = 50;
  if (aqi) {
    aqiScore = Math.min(100, Math.max(0, (aqi.aqi - 20) * 0.45));
  }
  let crowdScore = 50;
  if (crowd) {
    crowdScore = crowd.crowdScore;
  }

  const weighted = weatherScore * 0.4 + aqiScore * 0.25 + crowdScore * 0.35;
  return {
    score: Math.round(weighted),
    weatherScore: Math.round(weatherScore),
    aqiScore: Math.round(aqiScore),
    crowdScore: Math.round(crowdScore),
  };
}

function mapScoreToSeverity(score) {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'danger';
  if (score >= 40) return 'warning';
  return 'normal';
}

// ── single destination scan ───────────────────────────────────────────────────
async function scanDestination(userProfile, trip, dest, dateStr) {
  if (!dest || !dest.name) return null;
  const destName = dest.name;

  const weather = await fetchWeatherSnapshot(destName, dateStr);
  const [aqi, crowd] = await Promise.all([
    fetchAqiSnapshot(destName, weather ? weather.coords : null),
    fetchCrowdSnapshot(destName),
  ]);

  const aggregate = computeAggregateScore(weather, aqi, crowd);
  const severity = mapScoreToSeverity(aggregate.score);

  const snapshot = {
    destination: destName,
    latitude: isFinite(Number(dest.latitude)) ? Number(dest.latitude) : weather?.coords?.lat || null,
    longitude: isFinite(Number(dest.longitude)) ? Number(dest.longitude) : weather?.coords?.lon || null,
    date: dateStr,
    weather,
    aqi,
    crowd,
    aggregate,
    severity,
  };

  await upsertSnapshot(snapshot);
  await checkThresholdAlerts(userProfile, trip, snapshot);

  return snapshot;
}

async function upsertSnapshot(snapshot) {
  if (!supabase) return;
  const { error } = await supabase.from('condition_snapshots').upsert(
    {
      destination: snapshot.destination,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      date: snapshot.date,
      severity: snapshot.severity,
      aggregate_score: snapshot.aggregate.score,
      weather: snapshot.weather,
      aqi: snapshot.aqi,
      crowd: snapshot.crowd,
      raw: snapshot,
      capturedAt: new Date().toISOString(),
    },
    { onConflict: 'destination,date' }
  );
  if (error) console.error('[ConditionMonitor] snapshot error:', error.message);
}

// ── threshold crossing → condition_alerts + notify ───────────────────────────
async function checkThresholdAlerts(userProfile, trip, snapshot) {
  if (!supabase) return [];
  const alerts = [];

  const weather = snapshot.weather || {};
  if (weather.maxTemp) {
    const sev = severityFor(weather.maxTemp, 'heat');
    if (sev) alerts.push({ key: 'heat', severity: sev, message: `${weather.maxTemp.toFixed(0)}°C max temperature` });
  }
  if (weather.maxRain) {
    const sev = severityFor(weather.maxRain, 'rain');
    if (sev) alerts.push({ key: 'rain', severity: sev, message: `${weather.maxRain.toFixed(0)}mm rain expected` });
  }
  if (weather.maxWind) {
    const sev = severityFor(weather.maxWind, 'wind');
    if (sev) alerts.push({ key: 'wind', severity: sev, message: `Wind up to ${weather.maxWind.toFixed(0)} km/h` });
  }
  if (weather.hasStorm) {
    alerts.push({ key: 'storm', severity: 'warning', message: 'Thunderstorm possible' });
  }
  if (snapshot.aqi && snapshot.aqi.aqi) {
    const sev = severityFor(snapshot.aqi.aqi, 'aqi');
    if (sev) alerts.push({ key: 'aqi', severity: sev, message: `AQI ${snapshot.aqi.aqi}` });
  }
  if (snapshot.crowd && snapshot.crowd.crowdScore) {
    const sev = severityFor(snapshot.crowd.crowdScore, 'crowd');
    if (sev) alerts.push({ key: 'crowd', severity: sev, message: `Crowd ${snapshot.crowd.crowdScore}/100` });
  }

  for (const a of alerts) {
    const dedupeKey = `${snapshot.destination}-${snapshot.date}-${a.key}`;
    await upsertConditionAlert(userProfile, trip, snapshot.destination, a, dedupeKey);
  }
  return alerts;
}

async function upsertConditionAlert(userProfile, trip, destination, alert, dedupeKey) {
  const { data: existing } = await supabase
    .from('condition_alerts')
    .select('id, severity')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();

  if (existing) {
    // Only re-alert if the severity escalated (avoid spam on repeat runs).
    if (severityRank(alert.severity) > severityRank(existing.severity || 'warning')) {
      await supabase
        .from('condition_alerts')
        .update({ severity: alert.severity, message: alert.message, updatedAt: new Date().toISOString() })
        .eq('id', existing.id);
      await notifyCondition(userProfile, trip, destination, alert);
    }
    return;
  }

  const { error } = await supabase.from('condition_alerts').insert({
    userId: userProfile.userId,
    itineraryId: trip?.id || null,
    destination,
    date: trip?.startDate || new Date().toISOString().split('T')[0],
    conditionType: alert.key,
    severity: alert.severity,
    message: alert.message,
    dedupe_key: dedupeKey,
    dismissed: false,
    read: false,
    createdAt: new Date().toISOString(),
  });
  if (error) {
    console.error('[ConditionMonitor] alert insert error:', error.message);
    return;
  }
  await notifyCondition(userProfile, trip, destination, alert);
}

function severityRank(s) {
  const map = { normal: 0, warning: 1, danger: 2, critical: 3 };
  return map[s] || 0;
}

async function notifyCondition(userProfile, trip, destination, alert) {
  const prefs = (userProfile && userProfile.alertPreferences) || {};
  if (prefs.telegramEnabled === false) return;

  const { sendTelegramConditionAlert } = require('./telegramService');
  const label = String(alert.key).toUpperCase();
  await sendTelegramConditionAlert(
    userProfile,
    label,
    alert.severity,
    `${alert.message} at ${destination}${trip && trip.title ? ` (${trip.title})` : ''}.`
  );
}

// ── full refresh (scheduler entry) ────────────────────────────────────────────
async function refreshDestinationConditions() {
  if (!supabase) return { ok: false, reason: 'Supabase not configured' };

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const scanned = 0;

  const { data: users } = await supabase.from('userProfiles').select('*');
  const seen = new Set();

  for (const userProfile of users || []) {
    const { data: itineraries } = await supabase
      .from('itineraries')
      .select('*')
      .eq('userId', userProfile.userId);
    for (const row of itineraries || []) {
      const doc = row.itineraryData || row;
      const endDate = doc.endDate || '';
      if (endDate && endDate < dateStr) continue; // already travelled

      const destinations = [];
      const push = (d) => {
        if (!d || !d.name) return;
        const key = `${userProfile.userId}::${String(d.name).toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        destinations.push(d);
      };
      (doc.destinations || []).forEach(push);
      if (destinations.length === 0 && doc.destination) push({ name: doc.destination });

      for (const dest of destinations) {
        await scanDestination(userProfile, row, dest, dateStr);
      }
    }
  }

  return { ok: true, scanned };
}

module.exports = {
  refreshDestinationConditions,
  scanDestination,
  fetchWeatherSnapshot,
  fetchAqiSnapshot,
  fetchCrowdSnapshot,
  computeAggregateScore,
  severityFor,
};
