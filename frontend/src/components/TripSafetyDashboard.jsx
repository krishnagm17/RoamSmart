import { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, Satellite, ExternalLink, Bell, MessageCircle, MapPin, CloudSun, Users, Wind } from 'lucide-react';
import { useHazards } from '../hooks/useHazards';
import { useTripSafety } from '../hooks/useTripSafety';
import TelegramSettings from './TelegramSettings';
import './TripSafetyDashboard.css';

const SEVERITY_LABEL = {
  extreme: 'Extreme',
  severe: 'Severe',
  moderate: 'Moderate',
  minor: 'Minor',
};

const SEVERITY_COLOR = {
  extreme: '#d93025',
  severe: '#f04a3a',
  moderate: '#f9a825',
  minor: '#1e8e3e',
};

function HazardTypeIcon({ type }) {
  const t = String(type || '').toLowerCase();
  if (t.includes('flood')) return '🌊';
  if (t.includes('landslide')) return '🏔️';
  if (t.includes('cyclone')) return '🌀';
  if (t.includes('earthquake')) return '🌍';
  if (t.includes('lightning')) return '⚡';
  if (t.includes('tsunami')) return '🌊';
  if (t.includes('fire')) return '🔥';
  if (t.includes('heat')) return '🌡️';
  if (t.includes('cold')) return '🥶';
  if (t.includes('fog')) return '🌫️';
  if (t.includes('rain')) return '🌧️';
  return '⚠️';
}

function RiskBadge({ level }) {
  const l = String(level || '').toUpperCase();
  const cls = l.includes('VERY') ? 'risk-very-high' : l === 'HIGH' ? 'risk-high' : l === 'MODERATE' ? 'risk-moderate' : 'risk-low';
  return <span className={`risk-badge ${cls}`}>{l || 'N/A'}</span>;
}

export default function TripSafetyDashboard({ userId, trip, showToast }) {
  const { hazards, feed, loading, refresh } = useHazards(userId);
  const { assessment, loading: riskLoading, assess } = useTripSafety();

  const [tab, setTab] = useState('hazards');
  const [tgOpen, setTgOpen] = useState(false);

  useEffect(() => {
    if (trip) assess(trip);
  }, [trip, assess]);

  const activeCount = hazards.filter((h) => h.status === 'ACTIVE' || h.status === 'DETECTED' || h.status === 'UPDATED' || h.status === 'ESCALATED').length;

  return (
    <div className="safety-dashboard">
      {/* Header */}
      <div className="safety-header">
        <div>
          <h1 className="safety-title">🛡️ Travel Safety Hub</h1>
          <p className="safety-subtitle">Official NDMA SACHET hazards + live conditions for your destinations.</p>
        </div>
        <div className="safety-header-actions">
          <button className="btn-secondary safety-refresh" onClick={refresh}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn-primary safety-telegram-btn" onClick={() => setTgOpen(!tgOpen)}>
            <MessageCircle size={14} /> {tgOpen ? 'Close' : 'Telegram'}
          </button>
        </div>
      </div>

      {tgOpen && (
        <div className="safety-telegram-panel">
          <TelegramSettings userId={userId} showToast={showToast} />
        </div>
      )}

      {/* Feed status strip */}
      <div className={`safety-feed-strip ${feed?.available ? 'feed-ok' : 'feed-warn'}`}>
        <Satellite size={14} />
        <span>
          {feed?.available
            ? `NDMA SACHET feed connected · ${feed.lastAlertCount || 0} active alerts · last sync ${new Date(feed.lastSuccessAt).toLocaleTimeString('en-IN')}`
            : feed?.stale
              ? 'Official hazard information temporarily unavailable — retrying.'
              : 'Official hazard information temporarily unavailable.'}
        </span>
        <a href="https://sachet.ndma.gov.in" target="_blank" rel="noopener noreferrer" className="feed-link">
          NDMA SACHET <ExternalLink size={12} />
        </a>
      </div>

      {/* Tabs */}
      <div className="safety-tabs">
        <button className={`safety-tab ${tab === 'hazards' ? 'active' : ''}`} onClick={() => setTab('hazards')}>
          <ShieldAlert size={15} /> Hazards <span className="safety-tab-count">{activeCount}</span>
        </button>
        <button className={`safety-tab ${tab === 'trip' ? 'active' : ''}`} onClick={() => setTab('trip')}>
          <CloudSun size={15} /> Trip Conditions
        </button>
        <button className={`safety-tab ${tab === 'conditions' ? 'active' : ''}`} onClick={() => setTab('conditions')}>
          <Users size={15} /> Destination Health
        </button>
      </div>

      <div className="safety-tab-content">
        {tab === 'hazards' && <HazardsTab hazards={hazards} loading={loading} />}
        {tab === 'trip' && <TripTab assessment={assessment} loading={riskLoading} />}
        {tab === 'conditions' && <ConditionsTab assessment={assessment} loading={riskLoading} />}
      </div>
    </div>
  );
}

function HazardsTab({ hazards, loading }) {
  if (loading) return <div className="safety-loading">Loading official alerts…</div>;
  if (!hazards || hazards.length === 0) {
    return (
      <div className="safety-empty">
        <ShieldAlert size={40} style={{ opacity: 0.4 }} />
        <p>No active official hazards found for your destinations right now.</p>
        <p className="safety-empty-note">This reflects official NDMA SACHET data only. Local weather conditions are shown under Trip Conditions.</p>
      </div>
    );
  }

  return (
    <div className="hazard-grid">
      {hazards.map((h) => (
        <HazardCard key={h.id} hazard={h} />
      ))}
    </div>
  );
}

function HazardCard({ hazard }) {
  const sev = String(hazard.severity || 'moderate').toLowerCase();
  const color = SEVERITY_COLOR[sev] || '#f9a825';
  return (
    <div className="hazard-card" style={{ borderLeftColor: color }}>
      <div className="hazard-card-head">
        <span className="hazard-icon">{HazardTypeIcon({ type: hazard.hazard_type })}</span>
        <div className="hazard-card-title-wrap">
          <h3 className="hazard-card-title">{hazard.title || hazard.hazard_type}</h3>
          <span className="hazard-type-label">{hazard.hazard_type}</span>
        </div>
        <span className="hazard-severity" style={{ background: color }}>{SEVERITY_LABEL[sev] || hazard.severity}</span>
      </div>

      {hazard.affected_area && <p className="hazard-area"><MapPin size={12} /> {hazard.affected_area}</p>}
      {hazard.description && <p className="hazard-desc">{truncate(hazard.description, 220)}</p>}
      {hazard.instruction && <p className="hazard-instruction">⚠️ Advisory: {truncate(hazard.instruction, 180)}</p>}

      <div className="hazard-card-foot">
        {hazard.expires_at && (
          <span className="hazard-validity">
            Valid until {new Date(hazard.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </span>
        )}
        {hazard.source_url && (
          <a href={hazard.source_url} target="_blank" rel="noopener noreferrer" className="hazard-source">
            NDMA SACHET <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}

function TripTab({ assessment, loading }) {
  if (loading) return <div className="safety-loading">Assessing trip conditions…</div>;
  if (!assessment || !assessment.days?.length) {
    return <div className="safety-empty"><p>Select a trip to see per-destination travel conditions and risk.</p></div>;
  }
  return (
    <div className="trip-risk-list">
      <div className="trip-risk-summary">
        <span className="trip-risk-label">Overall Trip Risk</span>
        <RiskBadge level={assessment.overallLevel} />
        {assessment.hazardCount > 0 && (
          <span className="trip-risk-hazard-note">🛡️ {assessment.hazardCount} official hazard match(es) — plan accordingly</span>
        )}
      </div>

      {assessment.days.map((d, i) => (
        <div key={i} className="trip-risk-row">
          <div className="trip-risk-dest">
            <span className="trip-risk-dest-name">{d.destination}</span>
            {d.hazardMatches?.length > 0 && (
              <span className="trip-risk-hazard-tag">⚠️ {d.hazardMatches.length} official alert</span>
            )}
          </div>
          <div className="trip-risk-scores">
            <MiniScore label="Weather" value={d.aggregate?.weatherScore} />
            <MiniScore label="AQI" value={d.aggregate?.aqiScore} />
            <MiniScore label="Crowd" value={d.aggregate?.crowdScore} />
            <span className="trip-risk-score-total">{d.aggregate?.score ?? '—'}%</span>
          </div>
          <RiskBadge level={d.level} />
        </div>
      ))}
    </div>
  );
}

function MiniScore({ label, value }) {
  return (
    <span className="mini-score" title={`${label} score`}>
      {label} <strong>{value ?? '—'}</strong>
    </span>
  );
}

function ConditionsTab({ assessment, loading }) {
  if (loading) return <div className="safety-loading">Checking destination conditions…</div>;
  if (!assessment || !assessment.days?.length) return <div className="safety-empty"><p>No trip conditions to display.</p></div>;

  return (
    <div className="condition-cards">
      {assessment.days.map((d, i) => (
        <ConditionCard key={i} day={d} />
      ))}
    </div>
  );
}

function ConditionCard({ day }) {
  const w = day.weather || {};
  const aqi = day.aqi || {};
  const crowd = day.crowd || {};
  return (
    <div className="condition-card">
      <div className="condition-card-head">
        <h4 className="condition-card-title">{day.destination}</h4>
        <span className={`condition-sev sev-${String(day.hazardLevel || 'NONE').toLowerCase()}`}>
          {day.hazardLevel && day.hazardLevel !== 'NONE' ? `${day.hazardLevel} HAZARD` : 'No official hazard'}
        </span>
      </div>
      <div className="condition-row">
        <span className="condition-item"><CloudSun size={14} /> {w.maxTemp != null ? `${w.maxTemp.toFixed(0)}°C` : '—'} {w.mainCondition || ''}</span>
        <span className="condition-item"><Wind size={14} /> {w.maxRain != null ? `${w.maxRain.toFixed(0)}mm rain` : '—'}</span>
      </div>
      <div className="condition-row">
        <span className="condition-item"><Users size={14} /> AQI {aqi.aqi ?? '—'}</span>
        <span className="condition-item">Crowd {crowd.crowdScore ?? '—'}/100</span>
      </div>
      {day.hazardMatches?.length > 0 && (
        <div className="condition-hazard-note">
          <Bell size={13} />
          <span>{day.hazardMatches.length} official NDMA alert(s) near this destination.</span>
        </div>
      )}
    </div>
  );
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
