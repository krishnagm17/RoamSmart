import { useState, useEffect } from 'react';
import { MessageCircle, Copy, Check, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import api from '../api.js';

export default function TelegramSettings({ userId, showToast }) {
  const [status, setStatus] = useState({ connected: false });
  const [statusLoading, setStatusLoading] = useState(true);
  const [link, setLink] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const res = await api.get(`/api/telegram/status/${userId}`);
        setStatus(res.data);
      } catch {
        // status endpoint may be unavailable — assume disconnected
      } finally {
        setStatusLoading(false);
      }
    })();
  }, [userId]);

  // When a link is generated, poll until connected (or timeout).
  useEffect(() => {
    if (!link || !userId) return;
    setPolling(true);
    const timer = setInterval(async () => {
      try {
        const res = await api.get(`/api/telegram/status/${userId}`);
        setStatus(res.data);
        if (res.data.connected) {
          clearInterval(timer);
          setPolling(false);
          showToast?.('Telegram connected! You will now receive alerts here.', 'success');
        }
      } catch {
        // keep polling
      }
    }, 3000);
    const timeout = setTimeout(() => {
      clearInterval(timer);
      setPolling(false);
    }, 5 * 60 * 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [link, userId, showToast]);

  async function handleConnect() {
    if (!userId) return;
    setLinkLoading(true);
    try {
      const res = await api.post('/api/telegram/connect', { userId });
      if (res.data.link) setLink(res.data.link);
      showToast?.('Open the Telegram link to connect.', 'info');
    } catch (err) {
      console.error('Telegram connect error:', err);
      showToast?.('Could not create a connect link. Try again.', 'error');
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleDisconnect() {
    try {
      await api.post('/api/telegram/disconnect', { userId });
      setStatus({ connected: false });
      setLink('');
      showToast?.('Telegram disconnected.', 'info');
    } catch (err) {
      showToast?.('Could not disconnect.', 'error');
    }
  }

  function handleCopy() {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <div className="telegram-actions">
            <button className="btn-secondary" onClick={handleDisconnect}>Disconnect</button>
          </div>
        </div>
      ) : (
        <div className="telegram-disconnected">
          {!link ? (
            <>
              <p className="telegram-muted">
                Connect your Telegram so official hazard warnings and travel condition alerts reach you instantly.
              </p>
              <button className="btn-primary" onClick={handleConnect} disabled={linkLoading}>
                {linkLoading ? <Loader2 size={15} className="spin" /> : <MessageCircle size={15} />}
                {linkLoading ? 'Creating link…' : 'Connect Telegram'}
              </button>
              {status.botUsername && (
                <p className="telegram-bot-hint">Bot: @{status.botUsername}</p>
              )}
            </>
          ) : (
            <div className="telegram-link-box">
              <p className="telegram-muted">
                Open this link in Telegram (or your phone) and tap <strong>Start</strong>. Your chat will be linked securely.
              </p>
              {polling && <p className="telegram-polling"><RefreshCw size={12} className="spin" /> Waiting for you to press Start…</p>}
              <div className="telegram-link-row">
                <code className="telegram-link">{link}</code>
                <button className="btn-secondary telegram-copy" onClick={handleCopy} title="Copy link">
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
              <a href={link} target="_blank" rel="noopener noreferrer" className="telegram-open-btn btn-primary">
                Open in Telegram <ExternalLink size={14} />
              </a>
              <button className="btn-secondary telegram-cancel" onClick={() => setLink('')}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
