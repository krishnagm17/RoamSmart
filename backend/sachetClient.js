// ─────────────────────────────────────────────────────────────────────────────
// sachetClient.js — official NDMA SACHET feed client.
//
// Consumes the SACHET CAP XML feed exactly as documented in
//   Integration_Guide_For_Agencies.pdf (sachet.ndma.gov.in/docs):
//     GET /cap_public_website/FetchXMLFile?identifier=<id>
//       → 200 OK + ETag on change
//       → 304 Not Modified when unchanged (use cached copy)
//
// Flow per poll:
//   1. Fetch the active-alert list from
//        GET /cap_public_website/FetchAllAlertDetails        (JSON, no auth)
//   2. For every identifier, request its CAP XML carrying the previous ETag
//      (If-None-Match). 304 → nothing to do. 200 → parse the new CAP XML.
//   3. Persist the ETag map so unchanged alerts are never re-downloaded.
//   4. Any identifier that disappears from the active list is reported as
//      removed (the alert engine marks those RESOLVED/EXPIRED).
//
// No API key is required or invented — the feed is public and documented.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { supabase } = require('./supabaseClient');
const { parseCapXml, parseSachetJson } = require('./sachetParser');

const FEED_BASE = (process.env.SACHET_FEED_URL || 'https://sachet.ndma.gov.in/cap_public_website').replace(/\/$/, '');
const ALL_ALERTS_URL = `${FEED_BASE}/FetchAllAlertDetails`;
const XML_URL = `${FEED_BASE}/FetchXMLFile`;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  trimValues: true,
  cdataPropName: '__cdata',
});

const STATE_ID = 'global';
const POLL_TIMEOUT = Number(process.env.SACHET_TIMEOUT_MS) || 20000;

let state = {
  etagMap: {},        // identifier -> etag
  lastFetchedXmlAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: '',
  lastAlertCount: 0,
};

async function loadState() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('sachet_feed_state')
      .select('*')
      .eq('id', STATE_ID)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      state.etagMap = data.etagMap || {};
      state.lastFetchedXmlAt = data.lastFetchedXmlAt;
      state.lastSuccessAt = data.lastSuccessAt;
      state.lastErrorAt = data.lastErrorAt;
      state.lastError = data.lastError || '';
      state.lastAlertCount = data.lastAlertCount || 0;
    }
  } catch (err) {
    console.error('[SACHET] Failed to load feed state:', err.message);
  }
}

async function saveState() {
  if (!supabase) return;
  try {
    await supabase.from('sachet_feed_state').upsert(
      {
        id: STATE_ID,
        etagMap: state.etagMap,
        lastFetchedXmlAt: state.lastFetchedXmlAt,
        lastSuccessAt: state.lastSuccessAt,
        lastErrorAt: state.lastErrorAt,
        lastError: state.lastError,
        lastAlertCount: state.lastAlertCount,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.error('[SACHET] Failed to save feed state:', err.message);
  }
}

function markError(message) {
  state.lastErrorAt = new Date().toISOString();
  state.lastError = String(message).slice(0, 500);
}

// 1. Active alert list (JSON).
async function fetchActiveAlertList() {
  const res = await axios.get(ALL_ALERTS_URL, { timeout: POLL_TIMEOUT });
  return Array.isArray(res.data) ? res.data : [];
}

// 2. One CAP XML payload, ETag-aware. Returns:
//   { status: 'unchanged', etag }           on 304
//   { status: 'changed', etag, xml }        on 200
//   { status: 'fallback', reason, xml }     on failure (caller falls back to JSON)
async function fetchCapXml(identifier, etag) {
  const headers = {};
  if (etag) headers['If-None-Match'] = etag;
  try {
    const res = await axios.get(XML_URL, {
      params: { identifier },
      headers,
      timeout: POLL_TIMEOUT,
      validateStatus: (s) => s === 200 || s === 304,
    });
    if (res.status === 304) return { status: 'unchanged', etag };
    return { status: 'changed', etag: res.headers && res.headers.etag, xml: res.data };
  } catch (err) {
    return { status: 'fallback', reason: err.message };
  }
}

// Full poll. `onAlert` is called for every NEW or CHANGED alert with
//   { alert, json, viaXml, viaJson }
// Returns a summary object.
async function pollSachet(onAlert) {
  if (!supabase) {
    throw new Error('Supabase not configured — SACHET persistence disabled');
  }

  let activeList;
  try {
    activeList = await fetchActiveAlertList();
  } catch (err) {
    markError(`Alert list fetch failed: ${err.message}`);
    await saveState();
    throw new Error(`SACHET alert list fetch failed: ${err.message}`);
  }

  const byId = new Map();
  for (const rec of activeList) {
    byId.set(String(rec.identifier), rec);
  }

  const summary = { checked: activeList.length, changed: 0, unchanged: 0, fallback: 0, removed: 0 };

  for (const rec of activeList) {
    const id = String(rec.identifier);
    const prevEtag = state.etagMap[id];

    const xmlRes = await fetchCapXml(id, prevEtag);

    if (xmlRes.status === 'unchanged') {
      state.etagMap[id] = xmlRes.etag || prevEtag;
      summary.unchanged += 1;
      continue;
    }

    if (xmlRes.status === 'changed') {
      try {
        const parsed = xmlParser.parse(xmlRes.xml);
        const alert = parseCapXml(parsed);
        if (!alert) throw new Error('Unparseable CAP XML');
        alert.source_alert_id = id;
        // CAP XML from SACHET does not inline the geometry — it is served from
        // FetchPolygonXMLFile (HTTP 403 in this environment). Merge the centroid
        // from the JSON list so every alert still carries usable coordinates.
        if (rec.centroid) {
          const [lon, lat] = String(rec.centroid).split(',').map((x) => Number(x.trim()));
          if (isFinite(lon) && isFinite(lat)) {
            if (!alert.latitude && !alert.longitude) {
              alert.latitude = lat;
              alert.longitude = lon;
            }
          }
        }
        if (!alert.affected_area && rec.area_description) alert.affected_area = String(rec.area_description).trim();
        if (!alert.severity_color && rec.severity_color) alert.severity_color = String(rec.severity_color).toLowerCase();
        state.etagMap[id] = xmlRes.etag;
        state.lastFetchedXmlAt = new Date().toISOString();
        summary.changed += 1;
        if (onAlert) await onAlert({ alert, json: rec, viaXml: true });
        continue;
      } catch (err) {
        // fall through to JSON fallback below
        console.warn(`[SACHET] CAP XML parse failed for ${id}: ${err.message}`);
      }
    }

    // XML unavailable → use the JSON record (still official SACHET data).
    const alert = parseSachetJson(rec);
    if (alert) {
      summary.fallback += 1;
      if (onAlert) await onAlert({ alert, json: rec, viaJson: true });
    }
  }

  // Detect identifiers that left the active feed (alert no longer listed).
  const removed = Object.keys(state.etagMap).filter((id) => !byId.has(id));
  summary.removed = removed.length;
  state.etagMap = Object.fromEntries(Object.entries(state.etagMap).filter(([k]) => byId.has(k)));

  state.lastSuccessAt = new Date().toISOString();
  state.lastError = '';
  state.lastAlertCount = activeList.length;
  await saveState();

  return { ...summary, removed, activeCount: activeList.length };
}

// Public read of feed health (used by /api/sachet/status).
function getFeedHealth() {
  const staleMs = Number(process.env.SACHET_STALE_MS) || 12 * 60 * 60 * 1000;
  const last = state.lastSuccessAt ? new Date(state.lastSuccessAt) : null;
  return {
    available: !!last,
    lastSuccessAt: state.lastSuccessAt,
    lastErrorAt: state.lastErrorAt,
    lastError: state.lastError,
    lastAlertCount: state.lastAlertCount,
    stale: last ? Date.now() - last.getTime() > staleMs : true,
    usingEtagCaching: true,
  };
}

module.exports = { pollSachet, getFeedHealth, loadState };
