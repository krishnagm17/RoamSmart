import { useState, useEffect } from 'react';
import api from '../api.js';

export default function AlertSettings({ userId, onClose, showToast }) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [nightBeforeAlert, setNightBeforeAlert] = useState(true);
  const [realtimeAlert, setRealtimeAlert] = useState(true);
  
  // Specific alert type toggles (mock preferences)
  const [rainAlerts, setRainAlerts] = useState(true);
  const [floodAlerts, setFloodAlerts] = useState(true);
  const [heatAlerts, setHeatAlerts] = useState(true);
  const [closedAlerts, setClosedAlerts] = useState(true);
  const [aqiAlerts, setAqiAlerts] = useState(true);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

  async function handleSendDemoTelegram() {
    if (!telegramChatId.trim()) return;
    setTestingTelegram(true);
    try {
      const res = await api.post('/api/test/send-demo-telegram', {
        telegramChatId: telegramChatId.trim()
      });
      if (res.data.success) {
        showToast?.(`${res.data.message} (${res.data.mode})`, 'success');
        alert(`[Telegram Dispatch Simulation]\n\nMode: ${res.data.mode}\nRecipient ChatID: ${telegramChatId}\n\nMessage Body:\n${res.data.previewText}\n\n(If running in Mock Mode, check your backend server console to see the terminal output!)`);
      }
    } catch (err) {
      console.error("Test Telegram failed:", err);
      showToast?.('Telegram Test failed: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setTestingTelegram(false);
    }
  }

  async function handleSendDemoSms() {
    if (!phoneNumber.trim()) return;
    setTestingSms(true);
    try {
      const res = await api.post('/api/test/send-demo-sms', {
        phoneNumber: phoneNumber.trim()
      });
      if (res.data.success) {
        showToast?.(`${res.data.message} (${res.data.mode})`, 'success');
        alert(`[SMS Dispatch Simulation]\n\nMode: ${res.data.mode}\nRecipient: ${phoneNumber}\n\nMessage Body:\n${res.data.previewText}\n\n(If running in Mock Mode, check your backend server console to see the terminal output!)`);
      }
    } catch (err) {
      console.error("Test SMS failed:", err);
      showToast?.('SMS Test failed: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setTestingSms(false);
    }
  }

  async function handleSimulateAlerts() {
    setSimulating(true);
    try {
      const res = await api.post('/api/test/trigger-alerts', {
        userId
      });
      if (res.data.success) {
        showToast?.(`Scan successful! ${res.data.message}`, 'success');
      } else {
        showToast?.('Alert scan completed.', 'info');
      }
      onClose?.();
    } catch (err) {
      console.error("Simulation failed:", err);
      showToast?.('Simulation check failed: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSimulating(false);
    }
  }

  useEffect(() => {
    if (!userId) return;

    async function loadPreferences() {
      try {
        const res = await api.get(`/api/user/${userId}`);
        const data = res.data;
        if (data) {
          setPhoneNumber(data.phoneNumber || '');
          if (data.alertPreferences) {
            setPushEnabled(!!data.alertPreferences.pushEnabled);
            setSmsEnabled(!!data.alertPreferences.smsEnabled);
            setTelegramEnabled(data.alertPreferences.telegramEnabled !== false);
            setNightBeforeAlert(!!data.alertPreferences.nightBeforeAlert);
            setRealtimeAlert(!!data.alertPreferences.realtimeAlert);
            setTelegramChatId(data.telegramChatId || '');
            
            // Set alert types from stored data if present, else fallback to true
            setRainAlerts(data.alertPreferences.rainAlerts !== false);
            setFloodAlerts(data.alertPreferences.floodAlerts !== false);
            setHeatAlerts(data.alertPreferences.heatAlerts !== false);
            setClosedAlerts(data.alertPreferences.closedAlerts !== false);
            setAqiAlerts(data.alertPreferences.aqiAlerts !== false);
          }
        }
      } catch (err) {
        console.error("Failed to load user preferences:", err);
      } finally {
        setLoading(false);
      }
    }

    loadPreferences();
  }, [userId]);

  async function handleSave() {
    setSaving(true);
    try {
      const preferences = {
        pushEnabled,
        smsEnabled,
        telegramEnabled,
        nightBeforeAlert,
        realtimeAlert,
        rainAlerts,
        floodAlerts,
        heatAlerts,
        closedAlerts,
        aqiAlerts
      };

      // 1. Save preferences
      await api.post('/api/user/alert-preferences', {
        userId,
        preferences
      });

      // 2. Register/Update profile to sync phone number & telegram chat id
      await api.post('/api/user/register', {
        userId,
        phoneNumber: phoneNumber || null,
        telegramChatId: telegramChatId || null
      });

      // Save locally
      if (phoneNumber) {
        localStorage.setItem('userPhone', phoneNumber);
      } else {
        localStorage.removeItem('userPhone');
      }

      if (telegramChatId) {
        localStorage.setItem('userTelegramChatId', telegramChatId);
      } else {
        localStorage.removeItem('userTelegramChatId');
      }

      showToast?.('Alert preferences saved! 🔔', 'success');
      onClose?.();
    } catch (err) {
      console.error("Failed to save alert preferences:", err);
      showToast?.('Could not save preferences. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const switchStyle = (active) => ({
    width: '42px',
    height: '24px',
    background: active ? 'var(--accent)' : 'rgba(20, 26, 38, 0.18)',
    borderRadius: '24px',
    padding: '2px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: active ? 'flex-end' : 'flex-start',
    transition: 'background 0.2s ease, justify-content 0.2s ease',
    border: 'none',
    outline: 'none',
    position: 'relative'
  });

  const handleStyle = {
    width: '20px',
    height: '20px',
    background: 'var(--bg-main)',
    borderRadius: '50%',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    display: 'block'
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
        <div className="day-photo-loading-pulse" style={{ margin: '0 auto 8px' }} />
        <span>Loading preferences...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 4px' }}>
      <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--text-primary)' }}>
        🔔 Alert Preferences
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Delivery Channels */}
        <section style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Alert Delivery Channels
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13.5px', color: 'var(--text-primary)' }}>Push notifications</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Receive instant alerts on this device</span>
              </div>
              <button
                type="button"
                style={switchStyle(pushEnabled)}
                onClick={() => setPushEnabled(!pushEnabled)}
                aria-label="Toggle push notifications"
              >
                <span style={handleStyle} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13.5px', color: 'var(--text-primary)' }}>SMS alerts</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Receive text messages on your phone</span>
              </div>
              <button
                type="button"
                style={switchStyle(smsEnabled)}
                onClick={() => setSmsEnabled(!smsEnabled)}
                aria-label="Toggle SMS alerts"
              >
                <span style={handleStyle} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13.5px', color: 'var(--text-primary)' }}>Telegram alerts</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Receive bot alerts on Telegram App</span>
              </div>
              <button
                type="button"
                style={switchStyle(telegramEnabled)}
                onClick={() => setTelegramEnabled(!telegramEnabled)}
                aria-label="Toggle Telegram alerts"
              >
                <span style={handleStyle} />
              </button>
            </div>
          </div>
        </section>

        {/* Trigger Schedule */}
        <section style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Trigger Points
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13.5px', color: 'var(--text-primary)' }}>Night before (9:00 PM IST)</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Consolidated overview for tomorrow's stops</span>
              </div>
              <button
                type="button"
                style={switchStyle(nightBeforeAlert)}
                onClick={() => setNightBeforeAlert(!nightBeforeAlert)}
                aria-label="Toggle night before alert"
              >
                <span style={handleStyle} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13.5px', color: 'var(--text-primary)' }}>Real-time (1 hour before)</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Immediate warning for incoming hazard threat</span>
              </div>
              <button
                type="button"
                style={switchStyle(realtimeAlert)}
                onClick={() => setRealtimeAlert(!realtimeAlert)}
                aria-label="Toggle real-time alert"
              >
                <span style={handleStyle} />
              </button>
            </div>
          </div>
        </section>

        {/* Alert Types */}
        <section style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Alert Categories
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={rainAlerts} onChange={() => setRainAlerts(!rainAlerts)} style={{ accentColor: 'var(--accent)' }} />
              🌧️ Heavy Rain
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={floodAlerts} onChange={() => setFloodAlerts(!floodAlerts)} style={{ accentColor: 'var(--accent)' }} />
              🌊 Flood / Landslide
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={heatAlerts} onChange={() => setHeatAlerts(!heatAlerts)} style={{ accentColor: 'var(--accent)' }} />
              🌡️ Extreme Heat
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={closedAlerts} onChange={() => setClosedAlerts(!closedAlerts)} style={{ accentColor: 'var(--accent)' }} />
              🚫 Place Closed
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" checked={aqiAlerts} onChange={() => setAqiAlerts(!aqiAlerts)} style={{ accentColor: 'var(--accent)' }} />
              😷 Air Quality
            </label>
          </div>
        </section>

        {/* Phone number for SMS */}
        {smsEnabled && (
          <section style={{ paddingBottom: '8px' }}>
            <label className="field">
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📱 Phone Number for SMS Alerts
              </span>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  style={{
                    flex: 1,
                    border: 'none', borderBottom: '1px solid var(--border-color)', background: 'transparent',
                    borderRadius: '0px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSendDemoSms}
                  className="btn-sand" style={{background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-primary)"}}
                  style={{ padding: '0 12px', minHeight: '38px', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                  disabled={!phoneNumber.trim() || testingSms}
                >
                  {testingSms ? 'Sending...' : 'Test SMS'}
                </button>
              </div>
            </label>
          </section>
        )}

        {/* Telegram Chat ID field */}
        {telegramEnabled && (
          <section style={{ paddingBottom: '8px' }}>
            <label className="field">
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                💬 Telegram Chat ID for Bot Alerts
              </span>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g. 987654321"
                  style={{
                    flex: 1,
                    border: 'none', borderBottom: '1px solid var(--border-color)', background: 'transparent',
                    borderRadius: '0px',
                    padding: '10px 12px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSendDemoTelegram}
                  className="btn-sand" style={{background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-primary)"}}
                  style={{ padding: '0 12px', minHeight: '38px', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                  disabled={!telegramChatId.trim() || testingTelegram}
                >
                  {testingTelegram ? 'Sending...' : 'Test Telegram'}
                </button>
              </div>
            </label>
          </section>
        )}

        {/* Simulation testing tool */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '4px', marginBottom: '12px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ⚡ Testing Tools (Simulation)
          </h4>
          <button
            className="btn-sand" style={{background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-primary)"}}
            onClick={handleSimulateAlerts}
            style={{ width: '100%', minHeight: '38px', fontSize: '12.5px', background: 'transparent', border: '1px dashed var(--text-secondary)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            disabled={simulating || saving}
            type="button"
          >
            <i className="ti ti-bolt" aria-hidden="true" />
            {simulating ? 'Running Scan...' : 'Trigger Immediate Alert Scan'}
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button
            className="btn-sand" style={{background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-primary)"}}
            onClick={onClose}
            style={{ flex: 1, minHeight: '40px', fontSize: '13px' }}
            disabled={saving}
            type="button"
          >
            Cancel
          </button>
          <button
            className="btn-sand"
            onClick={handleSave}
            style={{ flex: 1, minHeight: '40px', fontSize: '13px' }}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
