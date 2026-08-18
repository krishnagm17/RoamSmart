// ─────────────────────────────────────────────────────────────────────────────
// travelRiskEngine.js — composite travel-condition & hazard risk assessment.
//
//   For a given destination (or trip day), it produces a single Travel Risk
//   level using:
//       weather 40%  +  AQI 25%  +  crowd 35%
//   and then lets official NDMA SACHET hazard alerts OVERRIDE the result:
//       Extreme → HIGH RISK  (do not travel / re-route)
//       Severe  → HIGH RISK
//       Moderate→ MODERATE RISK
//       Minor   → NO ELEVATED RISK (but still surfaced in the hazard list)
//
// It never asserts RoamSmart predicts disasters — NDMA alerts are labelled
// "official government warning" and anything computed is a "local condition
// assessment".
// ─────────────────────────────────────────────────────────────────────────────
const { supabase } = require('./supabaseClient');
const { matchHazardToTrip, normalizeTrip } = require('./hazardEngine');
const {
  fetchWeatherSnapshot,
  fetchAqiSnapshot,
  fetchCrowdSnapshot,
  computeAggregateScore,
} = require('./conditionMonitor');

const SEVERITY_ORDER = { extreme: 4, severe: 3, moderate: 2, minor: 1, unknown: 0 };

const RISK_LEVELS = [
  { max: 25, level: 'LOW' },
  { max: 50, level: 'MODERATE' },
  { max: 75, level: 'HIGH' },
  { max: 100, level: 'VERY HIGH' },
];

function scoreToLevel(score) {
  for (const r of RISK_LEVELS) {
    if (score <= r.max) return r.level;
  }
  return 'VERY HIGH';
}

async function loadHazardRows() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('hazard_alerts')
    .select('*')
    .in('status', ['DETECTED', 'ACTIVE', 'UPDATED', 'ESCALATED']);
  if (error) {
    console.error('[RiskEngine] hazard load error:', error.message);
    return [];
  }
  return data || [];
}

// Assess one destination on a given date.
async function assessDestination(destination, coords, dateStr) {
  const withCoords = { ...destination, ...coords };
  const destName = withCoords.name || withCoords.destination || '';
  const { geocodeCity } = require('./conditionChecker');
  const resolvedCoords = (withCoords.latitude && withCoords.longitude) ? { lat: withCoords.latitude, lon: withCoords.longitude } : await geocodeCity(destName);
  
  const weather = await fetchWeatherSnapshot(destName, dateStr);
  const [aqi, crowd] = await Promise.all([
    fetchAqiSnapshot(destName, resolvedCoords || (weather ? weather.coords : null)),
    fetchCrowdSnapshot(destName),
  ]);
  const aggregate = computeAggregateScore(weather, aqi, crowd);
  return { weather, aqi, crowd, aggregate };
}

// Full assessment for a trip (or a synthetic trip object).
async function assessTrip(trip, dateStr) {
  const normalized = trip.destinations ? trip : normalizeTrip(trip);
  const hazards = await loadHazardRows();
  const date = dateStr || new Date().toISOString().split('T')[0];

  const dayAssessments = [];
  for (const dest of normalized.destinations) {
    const local = await assessDestination(dest, {}, date);

    // NDMA hazard override.
    const tripForMatch = { ...normalized, destinations: [dest] };
    const hazardMatches = [];
    for (const hazard of hazards) {
      for (const match of matchHazardToTrip(hazard, tripForMatch)) {
        hazardMatches.push({ hazard, match });
      }
    }

    let hazardLevel = 'NONE';
    let worstSeverity = 'minor';
    let hazardSummary = '';
    for (const { hazard, match } of hazardMatches) {
      const sev = String(hazard.severity || 'minor').toLowerCase();
      if (SEVERITY_ORDER[sev] > SEVERITY_ORDER[worstSeverity]) worstSeverity = sev;
      hazardSummary = hazard.title || hazard.hazard_type || hazardSummary;
    }

    let level = scoreToLevel(local.aggregate.score);
    let overallScore = local.aggregate.score;

    if (hazardMatches.length > 0) {
      if (SEVERITY_ORDER[worstSeverity] >= 3) {
        level = 'HIGH';
        overallScore = Math.max(overallScore, 80);
      } else if (SEVERITY_ORDER[worstSeverity] >= 2) {
        level = overallScore < 55 ? 'MODERATE' : level;
        overallScore = Math.max(overallScore, 55);
      }
      hazardLevel = worstSeverity.toUpperCase();
    }

    dayAssessments.push({
      destination: dest.name,
      latitude: dest.latitude,
      longitude: dest.longitude,
      level,
      score: overallScore,
      hazardLevel,
      hazardSummary,
      weather: local.weather,
      aqi: local.aqi,
      crowd: local.crowd,
      aggregate: local.aggregate,
      hazardMatches: hazardMatches.map(({ hazard, match }) => ({
        id: hazard.id,
        hazardType: hazard.hazard_type,
        severity: hazard.severity,
        severityColor: hazard.severity_color,
        title: hazard.title,
        description: hazard.description,
        affectedArea: hazard.affected_area,
        expiresAt: hazard.expires_at,
        source: hazard.source,
        matchType: match.type,
        distanceKm: match.distanceKm,
      })),
    });
  }

  // Trip-level: worst day dominates.
  const worst = dayAssessments.reduce((a, b) => {
    if (!a) return b;
    return SEVERITY_ORDER[b.hazardLevel.toLowerCase()] > SEVERITY_ORDER[a.hazardLevel.toLowerCase()]
      ? b
      : b.score > a.score ? b : a;
  }, null);

  return {
    tripId: normalized.id,
    tripTitle: normalized.title,
    date,
    overallLevel: worst ? worst.level : 'LOW',
    overallScore: worst ? worst.score : 0,
    overallHazardLevel: worst ? worst.hazardLevel : 'NONE',
    days: dayAssessments,
    hazardCount: dayAssessments.reduce((n, d) => n + d.hazardMatches.length, 0),
  };
}

module.exports = { assessTrip, assessDestination, scoreToLevel };
