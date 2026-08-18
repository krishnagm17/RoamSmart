import { useState, useEffect } from 'react';
import { MessageCircle, BellRing, Loader2 } from 'lucide-react';
import api from '../api.js';

export default function TelegramSettings({ userId, showToast }) {
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [status, setStatus] = useState({ connected: false });
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const res = await api.get(`/api/telegram/status/${userId}`);
        setStatus(res.data);
      } catch {
        // assume disconnected
      } finally {
        setStatusLoading(false);
      }
    })();
  }, [userId]);

  async function handleSave() {
    if (!chatId.trim()) return showToast?.('Please enter a Chat ID.', 'error');
    setLoading(true);
    try {
      await api.post('/api/telegram/save-chat-id', { userId, chatId: chatId.trim() });
      setStatus({ connected: true });
      showToast?.('Telegram Chat ID saved!', 'success');
    } catch (err) {
      showToast?.('Could not save Chat ID. Try again.', 'error');
    } finally {
      setLoading(false);
    }
  }
  
  async function handleDisconnect() {
    try {
      await api.post('/api/telegram/disconnect', { userId });
      setStatus({ connected: false });
      setChatId('');
      showToast?.('Telegram disconnected.', 'info');
    } catch (err) {
      showToast?.('Could not disconnect.', 'error');
    }
  }

  async function handleTestAlert() {
    setTestLoading(true);
    try {
      await api.post('/api/telegram/test-alert', { userId });
      showToast?.('Test alert sent to your Telegram!', 'success');
    } catch (err) {
      showToast?.('Failed to send test alert. Make sure you messaged the bot first!', 'error');
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div className="telegram-settings">
      <div className="telegram-settings-head">
        <MessageCircle size={18} />
        <h3>Telegram Alerts</h3>
      </div>
      
      {statusLoading ? (
        <div className="telegram-loading">Checking connection…</div>
      ) : status.connected ? (
        <div className="telegram-connected">
          <div className="telegram-connected-icon">✅</div>
          <p><strong>Connected</strong></p>
          <p className="telegram-muted">You will receive travel & hazard alerts on Telegram.</p>
          <div className="telegram-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={handleTestAlert} disabled={testLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {testLoading ? <Loader2 size={14} className="spin" /> : <BellRing size={14} />}
              Test Alert
            </button>
            <button className="btn-secondary" onClick={handleDisconnect}>Disconnect</button>
          </div>
        </div>
      ) : (
        <div className="telegram-disconnected">
          <p className="telegram-muted">
            Enter your Telegram Chat ID below. You must send a message to our bot first so it can message you!
          </p>
          
          <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '400px', marginTop: '12px' }}>
            <input 
              type="text" 
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. 123456789"
              style={{ 
                flex: 1, 
                padding: '10px 14px', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)', 
                background: 'rgba(0,0,0,0.1)',
                color: 'var(--text-primary)',
                fontSize: '14px'
              }}
            />
            <button className="btn-primary" onClick={handleSave} disabled={loading} style={{ padding: '0 20px', borderRadius: '8px' }}>
              {loading ? 'Saving...' : 'Connect'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

