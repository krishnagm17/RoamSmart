import { motion } from 'framer-motion';

const severityConfig = {
  critical: { border: '#e63946', emoji: 'ðŸ”´', label: 'CRITICAL' },
  danger:   { border: '#e76f51', emoji: 'ðŸš¨', label: 'DANGER' },
  warning:  { border: '#f4a261', emoji: 'âš ï¸', label: 'WARNING' }
};

const typeIcons = {
  heavy_rain:   'ðŸŒ§ï¸',
  flood_risk:   'ðŸŒŠ',
  extreme_heat: 'ðŸŒ¡ï¸',
  place_closed: 'ðŸš«',
  poor_aqi:     'ðŸ˜·',
  official_hazard: 'ðŸ›¡ï¸'
};

const typeLabels = {
  heavy_rain:   'Heavy Rain / Storm Warning',
  flood_risk:   'Flood / Landslide Risk',
  extreme_heat: 'Extreme Heat Warning',
  place_closed: 'Place May Be Closed',
  poor_aqi:     'Poor Air Quality Warning',
  official_hazard: 'Official NDMA Hazard Alert'
};

export default function AlertCard({ alert, onDismiss }) {
  if (!alert) return null;

  const severity = severityConfig[alert.severity || 'warning'];
  const icon = typeIcons[alert.alertType] || 'âš ï¸';
  const label = typeLabels[alert.alertType] || 'Travel Alert';

  function openInMaps() {
    const q = encodeURIComponent(`${alert.activityName}, ${alert.destination}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
  }

  function formatSentTime(sentAt) {
    if (!sentAt) return '';
    try {
      const date = new Date(sentAt);
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' Â· ' + date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -100, transition: { duration: 0.25 } }}
      style={{
        border: '1px solid var(--border)',
        borderLeft: `5px solid ${severity.border}`,
        borderRadius: '12px',
        background: '#1a1a1a',
        padding: '16px',
        marginBottom: '14px',
        boxShadow: 'var(--shadow)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      {/* Alert Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }} role="img" aria-label={alert.alertType}>{icon}</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
              {label}
            </h3>
            <span style={{ fontSize: '11px', fontWeight: 600, color: severity.border }}>
              {severity.emoji} {severity.label}
            </span>
          </div>
        </div>

        {alert.dayNumber && (
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', background: '#242424', padding: '3px 8px', borderRadius: '12px' }}>
            Day {alert.dayNumber}
          </span>
        )}
      </div>

      {/* Place Details */}
      <div style={{ fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>ðŸ“</span>
        <strong style={{ color: 'var(--primary)' }}>{alert.activityName}</strong>
        <span style={{ color: 'var(--muted)' }}>({alert.destination})</span>
      </div>

      {/* Alert Message */}
      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--muted)' }}>
        {alert.condition}
      </p>

      {/* AI Advice block */}
      {alert.aiAdvice && (
        <div style={{ background: '#1e1e1e', borderLeft: '3px solid var(--primary)', borderRadius: '0 8px 8px 0', padding: '10px 12px' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ðŸ’¡ AI Advice:
          </h4>
          <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.45, fontStyle: 'italic', color: 'var(--text)' }}>
            {alert.aiAdvice}
          </p>
        </div>
      )}

      {/* Info row with Trigger Type badge */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderTop: '0.5px solid var(--border)', paddingTop: '10px' }}>
        {alert.triggerType === 'realtime' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="pulse-dot-red" style={{ width: '8px', height: '8px', background: '#e63946', borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#e63946', textTransform: 'uppercase' }}>
              Real-time alert
            </span>
          </div>
        ) : (
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#7c3aed', background: 'rgba(124, 58, 237, 0.1)', padding: '2px 8px', borderRadius: '10px', textTransform: 'uppercase' }}>
            Night before alert
          </span>
        )}

        {alert.sentAt && (
          <span style={{ fontSize: '11px', color: 'var(--hint)' }}>
            â° {formatSentTime(alert.sentAt)}
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
        <button
          className="secondary-button"
          onClick={() => onDismiss?.(alert.id)}
          style={{ minHeight: '36px', padding: '6px 12px', fontSize: '12px' }}
          type="button"
        >
          Dismiss
        </button>
        <button
          className="primary-button"
          onClick={openInMaps}
          style={{ minHeight: '36px', padding: '6px 12px', fontSize: '12px' }}
          type="button"
        >
          Open in Maps
        </button>
      </div>
    </motion.article>
  );
}
