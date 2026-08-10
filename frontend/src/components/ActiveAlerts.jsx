import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AlertCard from './AlertCard';

export default function ActiveAlerts({ alerts, isOpen, onClose, onDismiss }) {
  const [activeTab, setActiveTab] = useState('All');

  const getSeverityPriority = (sev) => {
    if (sev === 'critical') return 3;
    if (sev === 'danger') return 2;
    return 1;
  };

  // Sort: Critical first, then danger, then warning, then newest first
  const sortedAlerts = useMemo(() => {
    if (!alerts) return [];
    return [...alerts].sort((a, b) => {
      const prioDiff = getSeverityPriority(b.severity) - getSeverityPriority(a.severity);
      if (prioDiff !== 0) return prioDiff;
      return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
    });
  }, [alerts]);

  // Filter based on selected tab
  const filteredAlerts = useMemo(() => {
    if (activeTab === 'Critical') {
      return sortedAlerts.filter(a => a.severity === 'critical' || a.severity === 'danger');
    }
    if (activeTab === 'Warnings') {
      return sortedAlerts.filter(a => a.severity === 'warning');
    }
    return sortedAlerts; // All
  }, [sortedAlerts, activeTab]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="active-alerts-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 350,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <motion.div
            className="active-alerts-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '480px',
              height: '90vh',
              background: '#1a1a1a',
              borderRadius: '20px 20px 0 0',
              boxShadow: '0 -8px 40px rgba(0,0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 20px 24px'
            }}
          >
            {/* Drag Handle */}
            <div 
              style={{
                width: '36px',
                height: '4px',
                margin: '4px auto 16px',
                borderRadius: '4px',
                background: '#2e2e33',
                flexShrink: 0
              }}
            />

            {/* Close Button */}
            <button 
              onClick={onClose} 
              type="button" 
              aria-label="Close Alerts Panel"
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
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--muted)',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>

            {/* Header Titles */}
            <div style={{ flexShrink: 0, marginBottom: '16px' }}>
              <h2 style={{ margin: '0 0 2px', fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text)' }}>
                ðŸ”” Travel Alerts
              </h2>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {alerts.length} active alert{alerts.length !== 1 ? 's' : ''} for your itineraries
              </span>
            </div>

            {/* Tabs Selector */}
            <div 
              style={{ 
                display: 'flex', 
                background: '#242424', 
                padding: '3px', 
                borderRadius: '8px', 
                marginBottom: '16px',
                flexShrink: 0
              }}
            >
              {['All', 'Critical', 'Warnings'].map((tab) => {
                const isActive = activeTab === tab;
                let tabCount = 0;
                if (tab === 'All') tabCount = sortedAlerts.length;
                else if (tab === 'Critical') tabCount = sortedAlerts.filter(a => a.severity === 'critical' || a.severity === 'danger').length;
                else if (tab === 'Warnings') tabCount = sortedAlerts.filter(a => a.severity === 'warning').length;

                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flex: 1,
                      border: 0,
                      borderRadius: '6px',
                      background: isActive ? '#2e2e33' : 'transparent',
                      color: isActive ? 'var(--text)' : 'var(--muted)',
                      padding: '6px 0',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                      transition: 'background 0.15s ease'
                    }}
                    type="button"
                  >
                    {tab}
                    <span style={{ fontSize: '10px', background: isActive ? 'var(--accent-light)' : '#2e2e33', color: isActive ? 'var(--primary)' : 'var(--muted)', padding: '1px 5px', borderRadius: '10px' }}>
                      {tabCount}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Alert List Container */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              <AnimatePresence initial={false}>
                {filteredAlerts.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', textAlign: 'center', padding: '0 20px' }}>
                    <div 
                      style={{ 
                        width: '56px', 
                        height: '56px', 
                        background: 'rgba(87,201,143,0.14)', 
                        borderRadius: '50%', 
                        color: 'var(--primary)', 
                        display: 'grid', 
                        placeItems: 'center', 
                        fontSize: '28px',
                        marginBottom: '16px'
                      }}
                    >
                      âœ“
                    </div>
                    <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: '18px' }}>
                      No active alerts
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                      {activeTab === 'All' 
                        ? 'All your planned stops look good! We will alert you if weather or conditions change.'
                        : `No active ${activeTab.toLowerCase()} warnings at this time.`}
                    </p>
                  </div>
                ) : (
                  filteredAlerts.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      onDismiss={onDismiss}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
