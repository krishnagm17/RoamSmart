import { motion, AnimatePresence } from 'framer-motion';

const severityConfig = {
  critical: { bg: '#fce4ec', border: '#e63946', emoji: '🔴' },
  danger:   { bg: '#fde8e1', border: '#e76f51', emoji: '🚨' },
  warning:  { bg: '#fff3cd', border: '#f4a261', emoji: '⚠️' }
};

export default function AlertBanner({ alerts, onViewAll, onDismiss }) {
  if (!alerts || alerts.length === 0) return null;

  // Find highest severity: critical > danger > warning
  let highestSeverity = 'warning';
  if (alerts.some(a => a.severity === 'critical')) highestSeverity = 'critical';
  else if (alerts.some(a => a.severity === 'danger')) highestSeverity = 'danger';

  const config = severityConfig[highestSeverity];
  const count = alerts.length;

  // Construct text summary
  const alertSummaryText = alerts.slice(0, 2).map(a => `${a.activityName} (${a.condition})`).join(', ');
  const moreCount = count - 2;
  const summaryText = moreCount > 0 
    ? `${alertSummaryText} and ${moreCount} more...` 
    : alertSummaryText;

  return (
    <AnimatePresence>
      <motion.div
        className="alert-banner"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        style={{
          width: '100%',
          background: config.bg,
          borderLeft: `4px solid ${config.border}`,
          padding: '12px 32px 12px 16px',
          fontSize: '13px',
          lineHeight: '1.4',
          position: 'relative',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          alignItems: 'flex-start'
        }}
      >
        {/* Dismiss Button */}
        <button
          onClick={() => {
            // Dismiss all current alerts in the banner
            alerts.forEach(a => onDismiss?.(a.id));
          }}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          aria-label="Dismiss banner"
          type="button"
        >
          ×
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--text)' }}>
          <span>{config.emoji}</span>
          <span>{count} Travel Warning{count > 1 ? 's' : ''} Detected</span>
        </div>

        <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
          {summaryText}
        </div>

        <button
          onClick={onViewAll}
          className="text-button"
          style={{
            marginTop: '4px',
            padding: 0,
            fontSize: '12px',
            fontWeight: 600,
            color: config.border,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
          type="button"
        >
          View details & AI advice →
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
