// ─────────────────────────────────────────────────────────────────────────────
// sachetParser.js — normalize official NDMA SACHET alerts into RoamSmart's
// hazard_alerts schema. Handles both:
//   • the official CAP XML payloads from /cap_public_website/FetchXMLFile
//   • the SACHET JSON list from /cap_public_website/FetchAllAlertDetails
//
// Hazard types are kept as free text (the system must not be hard-coded so it
// can only support a fixed list — new official categories must flow through).
// ─────────────────────────────────────────────────────────────────────────────
const { parseCircle, parsePolygon } = require('./geoUtils');

// Normalize CAP severity vocabulary to a stable set for display/priority.
const SEVERITY_MAP = {
  Extreme: 'Extreme',
  Severe: 'Severe',
  Moderate: 'Moderate',
  Minor: 'Minor',
  Unknown: 'Unknown',
};

const SEVERITY_ORDER = { Extreme: 5, Severe: 4, Moderate: 3, Minor: 2, Unknown: 1 };

function normalizeSeverity(sev) {
  const key = SEVERITY_MAP[sev] ? sev : String(sev || 'Unknown').trim();
  return Object.prototype.hasOwnProperty.call(SEVERITY_MAP, key) ? key : 'Unknown';
}

// SACHET JSON uses severity = LOW | WATCH | ALERT | WARNING and a severity_color
// (yellow | orange | red). Map those to the CAP-ish vocabulary.
function severityFromSachet(sev, color) {
  const s = String(sev || '').toUpperCase();
  const c = String(color || '').toLowerCase();
  if (s === 'WARNING' || c === 'red') return 'Extreme';
  if (s === 'ALERT' || c === 'orange') return 'Severe';
  if (s === 'WATCH' || c === 'yellow') return 'Moderate';
  return 'Unknown';
}

function titleCase(str) {
  return String(str || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Resolve a key that may carry a `cap:` namespace prefix.
function pick(obj, key) {
  if (!obj) return undefined;
  const direct = obj[key];
  if (direct !== undefined) return direct;
  for (const k of Object.keys(obj)) {
    if (k.endsWith(`:${key}`)) return obj[k];
  }
  return undefined;
}

// Parse CAP 1.2 XML into a normalized alert object. `parsed` is the object
// produced by fast-xml-parser with preserveOrder=false.
function parseCapXml(parsed) {
  const alertNode = pick(parsed, 'alert');
  if (!parsed || !alertNode) return null;
  const alert = alertNode || {};
  const infoNodes = pick(alert, 'info');
  const info = Array.isArray(infoNodes) ? infoNodes[0] : infoNodes || {};
  const areaNodes = pick(info, 'area');
  const area = Array.isArray(areaNodes) ? areaNodes[0] : areaNodes || {};
  const circleStr = pick(area, 'circle');
  const polygonStr = pick(area, 'polygon');
  const circle = parseCircle(circleStr);
  const polygon = parsePolygon(polygonStr);

  const event = titleCase(pick(info, 'event'));
  const hazardType = normalizeHazardType(event);

  return {
    source: 'NDMA SACHET',
    source_alert_id: String(pick(alert, 'identifier') || pick(alert, 'identifierText') || '').trim(),
    sender: String(pick(alert, 'sender') || '').trim(),
    hazard_type: hazardType,
    event_raw: event,
    title: String(pick(info, 'headline') || event || '').trim(),
    description: String(pick(info, 'description') || '').trim(),
    severity: normalizeSeverity(pick(info, 'severity')),
    urgency: titleCase(pick(info, 'urgency')),
    certainty: titleCase(pick(info, 'certainty')),
    category: titleCase(pick(info, 'category')),
    latitude: circle ? circle.latitude : polygon && polygon.length ? polygon[0][1] : null,
    longitude: circle ? circle.longitude : polygon && polygon.length ? polygon[0][0] : null,
    radius_km: circle ? circle.radiusKm : null,
    polygon: polygon,
    affected_area: String(pick(area, 'areaDesc') || '').trim(),
    instruction: String(pick(info, 'instruction') || '').trim(),
    issued_at: toIso(pick(alert, 'sent')),
    effective_at: toIso(pick(info, 'effective')),
    updated_at: toIso(pick(info, 'onset')),
    expires_at: toIso(pick(info, 'expires')),
    status: String(pick(alert, 'status') || 'Actual').trim(),
    msg_type: String(pick(alert, 'msgType') || '').trim(),
    source_url: pick(alert, 'identifier') ? `https://sachet.ndma.gov.in/CapFeed` : '',
    raw: parsed,
  };
}

// Parse a SACHET JSON record from FetchAllAlertDetails.
function parseSachetJson(rec) {
  if (!rec || !rec.identifier) return null;
  const centroid = String(rec.centroid || '').trim();
  const [lon, lat] = centroid.split(',').map((x) => Number(x.trim()));
  const coordsValid = isFinite(lon) && isFinite(lat);
  const hazardType = normalizeHazardType(String(rec.disaster_type || ''));

  return {
    source: 'NDMA SACHET',
    source_alert_id: String(rec.identifier),
    sender: String(rec.alert_source || '').trim(),
    hazard_type: hazardType,
    event_raw: String(rec.disaster_type || '').trim(),
    title: hazardType,
    description: String(rec.warning_message || '').trim(),
    severity: severityFromSachet(rec.severity, rec.severity_color),
    urgency: 'Unknown',
    certainty: String(rec.severity_level || 'Unknown').trim(),
    category: 'Met',
    latitude: coordsValid ? lat : null,
    longitude: coordsValid ? lon : null,
    radius_km: null,
    polygon: null,
    affected_area: String(rec.area_description || '').trim(),
    instruction: '',
    issued_at: toIso(rec.effective_start_time),
    effective_at: toIso(rec.effective_start_time),
    updated_at: toIso(rec.effective_start_time),
    expires_at: toIso(rec.effective_end_time),
    status: 'Actual',
    msg_type: 'Alert',
    severity_color: String(rec.severity_color || '').toLowerCase(),
    source_url: 'https://sachet.ndma.gov.in/CapFeed',
    raw: rec,
  };
}

// Convert various date strings (ISO-8601, "EEE MMM dd HH:mm:ss z yyyy") to ISO.
function toIso(value) {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value).toISOString();
  const s = String(value).trim();
  if (!s) return null;
  const asDate = new Date(s);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
  // SACHET JSON dates: "Tue Apr 07 03:08:00 IST 2026"
  const m = s.match(/^(\w{3}) (\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2}) (IST) (\d{4})$/);
  if (m) {
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const mon = months[m[2]];
    if (mon !== undefined) {
      const d = new Date(Date.UTC(Number(m[8]), mon, Number(m[3]), Number(m[4]) - 5, Number(m[5]) - 30, Number(m[6])));
      return d.toISOString();
    }
  }
  return null;
}

// Known SACHET/IMD hazard vocabularies → stable RoamSmart labels.
const HAZARD_ALIASES = [
  { match: /cyclone/i, label: 'Cyclone' },
  { match: /tsunami/i, label: 'Tsunami' },
  { match: /avalanche/i, label: 'Avalanche' },
  { match: /cold wave|coldwave/i, label: 'Cold Wave' },
  { match: /heat wave|heatwave/i, label: 'Heat Wave' },
  { match: /lightning/i, label: 'Lightning' },
  { match: /thunderstorm|thunder\s*storm/i, label: 'Thunderstorm' },
  { match: /dust.?storm/i, label: 'Duststorm' },
  { match: /squall/i, label: 'Squall' },
  { match: /urban flood/i, label: 'Urban Flood' },
  { match: /flood/i, label: 'Flood' },
  { match: /landslide|landslip/i, label: 'Landslide' },
  { match: /earthquake/i, label: 'Earthquake' },
  { match: /fire|forest fire/i, label: 'Forest Fire' },
  { match: /drought/i, label: 'Drought' },
  { match: /smog/i, label: 'Smog' },
  { match: /air pollution/i, label: 'Air Pollution' },
  { match: /nuclear|radiological/i, label: 'Nuclear-Radiological Emergency' },
  { match: /biological/i, label: 'Biological Emergency' },
  { match: /chemical/i, label: 'Chemical Emergency' },
  { match: /hail/i, label: 'Hail' },
  { match: /heavy rain|heavy rainfall|very heavy rain/i, label: 'Heavy Rain' },
  { match: /fog/i, label: 'Fog' },
  { match: /glof|glacial/i, label: 'Glacial Lake Outburst Flood (GLOF)' },
];

function normalizeHazardType(eventRaw) {
  const ev = String(eventRaw || '').trim();
  if (!ev) return 'Other';
  for (const a of HAZARD_ALIASES) {
    if (a.match.test(ev)) return a.label;
  }
  return titleCase(ev) || 'Other';
}

// Priority used by the risk engine: higher = more severe.
function severityPriority(severity) {
  return SEVERITY_ORDER[severity] || 1;
}

module.exports = {
  parseCapXml,
  parseSachetJson,
  normalizeHazardType,
  normalizeSeverity,
  severityFromSachet,
  severityPriority,
  toIso,
};
