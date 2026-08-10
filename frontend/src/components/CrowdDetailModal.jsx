import { motion, AnimatePresence } from 'framer-motion';
import CrowdChart from './CrowdChart';
import { crowdConfig } from '../utils/crowdHelpers';

export default function CrowdDetailModal({ prediction, placeName, isOpen, onClose, isLoading }) {
  if (!isOpen) return null;

  const config = prediction ? crowdConfig[prediction.overallLevel] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="crowd-detail-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <motion.div
            className="crowd-detail-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#1a1a1a',
              borderRadius: '20px 20px 0 0',
              boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.2)',
              padding: '8px 20px 28px'
            }}
          >
            {/* Drag Handle */}
            <div 
              className="crowd-detail-drag-handle" 
              style={{
                width: '36px',
                height: '4px',
                margin: '4px auto 16px',
                borderRadius: '4px',
                background: '#2e2e33',
                cursor: 'grab'
              }}
            />

            {/* Close Button */}
            <button 
              className="crowd-detail-close" 
              onClick={onClose} 
              type="button" 
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 14,
                right: 16,
                zIndex: 10,
                width: 32,
                height: 32,
                display: 'grid',
                placeItems: 'center',
                border: 0,
                borderRadius: '50%',
                background: 'rgba(0, 0, 0, 0.05)',
                color: 'var(--muted)',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>

            {isLoading ? (
              <CrowdSkeleton placeName={placeName} />
            ) : !prediction ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: '36px', color: '#e63946', marginBottom: '8px' }} />
                <h3>Could Not Predict Crowds</h3>
                <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Please try again or select another time.</p>
                <button className="primary-button" onClick={onClose} style={{ marginTop: '14px' }} type="button">Close</button>
              </div>
            ) : (
              <div className="crowd-detail-content">
                {/* Header Titles */}
                <h2 style={{ margin: '0 0 2px', fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text)' }}>
                  ðŸ“ {prediction.placeName || placeName}
                </h2>
                <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {prediction.destination} Â· {prediction.visitDay}
                </p>

                {/* Overall Level Card */}
                {config && (
                  <div 
                    style={{
                      background: config.bg,
                      color: config.color,
                      borderRadius: '12px',
                      padding: '16px',
                      textAlign: 'center',
                      marginBottom: '16px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ fontSize: '36px', marginBottom: '4px' }}>{config.emoji}</div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, margin: '0 0 4px' }}>
                      {prediction.overallLevel.toUpperCase()} CROWDS
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', fontSize: '13px', fontWeight: 600 }}>
                      <span>Score: {prediction.overallScore}/100</span>
                      <span style={{ padding: '2px 8px', borderRadius: '20px', background: 'rgba(255,255,255,0.07)', fontSize: '11px' }}>
                        Confidence: {prediction.confidence}
                      </span>
                    </div>
                  </div>
                )}

                {/* Special Alert (Holiday/Festival/Extreme Weather) */}
                {prediction.specialAlert && (
                  <div 
                    style={{
                      background: 'rgba(212,162,74,0.16)',
                      borderLeft: '3px solid #f4a261',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      marginBottom: '16px',
                      fontSize: '13px',
                      color: '#f0cd8a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>âš ï¸</span>
                    <span><strong>Alert:</strong> {prediction.specialAlert}</span>
                  </div>
                )}

                {/* Why this prediction? (Reason) */}
                <div className="crowd-info-block" style={{ background: '#1e1e1e', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ðŸ“– Why this prediction?
                  </h4>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--text)' }}>
                    {prediction.reason}
                  </p>
                </div>

                {/* Best & Avoid Time Ranges */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ background: 'rgba(87,201,143,0.14)', color: '#8ee6bd', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                    <h4 style={{ margin: '0 0 4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(142, 230, 189, 0.9)' }}>
                      âœ… Best Time to Visit
                    </h4>
                    <strong style={{ fontSize: '15px' }}>{prediction.bestTimeWindow || 'Early Morning'}</strong>
                  </div>

                  <div style={{ background: 'rgba(224,103,79,0.14)', color: '#f2a486', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                    <h4 style={{ margin: '0 0 4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(242, 164, 134, 0.9)' }}>
                      âŒ Time to Avoid
                    </h4>
                    <strong style={{ fontSize: '15px' }}>{prediction.avoidTimeWindow || 'Mid-day'}</strong>
                  </div>
                </div>

                {/* Beat the Crowd Tip */}
                {prediction.crowdTip && (
                  <div 
                    style={{
                      background: 'rgba(79,179,217,0.14)',
                      borderLeft: '3px solid #48cae4',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      marginBottom: '16px',
                      fontSize: '13px',
                      color: '#7fc9e8',
                      fontStyle: 'italic'
                    }}
                  >
                    <strong>ðŸ’¡ Tip:</strong> {prediction.crowdTip}
                  </div>
                )}

                {/* Weather & Holiday Impacts */}
                {(prediction.weatherImpact || prediction.holidayImpact) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
                    {prediction.weatherImpact && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <span>ðŸŒ¤ï¸</span>
                        <span><strong>Weather impact:</strong> {prediction.weatherImpact}</span>
                      </div>
                    )}
                    {prediction.holidayImpact && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <span>ðŸŽ‰</span>
                        <span><strong>Holiday impact:</strong> {prediction.holidayImpact}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Hourly Forecast Chart */}
                <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ðŸ“Š Hourly Forecast (6 AM â€“ 9 PM)
                </h4>
                <CrowdChart 
                  hourlyForecast={prediction.hourlyForecast}
                  visitTime={prediction.visitTime || '10:00'}
                  bestTimeWindow={prediction.bestTimeWindow}
                  avoidTimeWindow={prediction.avoidTimeWindow}
                />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CrowdSkeleton({ placeName }) {
  return (
    <div style={{ width: '100%' }}>
      {/* Title Shimmer */}
      <h2 style={{ margin: '0 0 2px', fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text)' }}>
        ðŸ“ {placeName}
      </h2>
      <div className="shimmer" style={{ width: '150px', height: '14px', borderRadius: '4px', background: '#2a2a2e', margin: '4px 0 16px', animation: 'shimmer 1.5s infinite linear' }} />

      {/* Level Card Shimmer */}
      <div style={{ height: '110px', borderRadius: '12px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear', marginBottom: '16px' }} />

      {/* Info Block Shimmer */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
        <div style={{ width: '120px', height: '10px', borderRadius: '4px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear', marginBottom: '6px' }} />
        <div style={{ width: '100%', height: '14px', borderRadius: '4px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear', marginBottom: '4px' }} />
        <div style={{ width: '90%', height: '14px', borderRadius: '4px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear' }} />
      </div>

      {/* Split Row Shimmer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div style={{ height: '60px', borderRadius: '8px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear' }} />
        <div style={{ height: '60px', borderRadius: '8px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear' }} />
      </div>

      {/* Tip Block Shimmer */}
      <div style={{ height: '40px', borderRadius: '8px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear', marginBottom: '16px' }} />

      {/* Chart Shimmer */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', height: '20px', gap: '8px' }}>
            <div style={{ width: '50px', height: '12px', borderRadius: '4px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear' }} />
            <div style={{ flex: 1, height: '12px', borderRadius: '4px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear' }} />
            <div style={{ width: '30px', height: '12px', borderRadius: '4px', background: '#2a2a2e', animation: 'shimmer 1.5s infinite linear' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
