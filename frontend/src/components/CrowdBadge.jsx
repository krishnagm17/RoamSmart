import { crowdConfig } from '../utils/crowdHelpers';

export default function CrowdBadge({ prediction, isLoading, onPress }) {
  if (isLoading) {
    return (
      <div 
        className="crowd-badge-shimmer" 
        style={{
          width: '60px',
          height: '20px',
          borderRadius: '20px',
          background: '#2a2a2e',
          animation: 'shimmer 1.5s infinite linear'
        }}
        aria-hidden="true"
      />
    );
  }

  if (!prediction || !prediction.overallLevel) {
    return null;
  }

  const level = prediction.overallLevel;
  const config = crowdConfig[level];

  if (!config) return null;

  return (
    <button
      className="crowd-badge"
      style={{
        background: config.bg,
        color: config.color,
        borderRadius: '20px',
        padding: '3px 10px',
        fontSize: '11px',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        border: 'none',
        outline: 'none',
        transition: 'transform 0.15s ease'
      }}
      onClick={(e) => {
        e.stopPropagation();
        onPress?.();
      }}
      title="Tap to see hourly forecast"
      type="button"
      onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.04)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      <span>{config.emoji}</span>
      <span>{level}</span>
    </button>
  );
}
