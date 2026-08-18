import { useState, useEffect } from 'react';
import { MessageCircle, Save } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function TelegramSettings({ showToast }) {
  const { profile, updateProfile } = useAuth();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile?.phone) {
      setPhone(profile.phone);
    }
  }, [profile]);

  async function handleSave() {
    setLoading(true);
    try {
      await updateProfile({ phone: phone.trim() });
      showToast?.('Telegram number saved! We will connect you to our alerts bot.', 'success');
    } catch (err) {
      showToast?.('Could not save phone number. Try again.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="telegram-settings">
      <div className="telegram-settings-head">
        <MessageCircle size={18} />
        <h3>Telegram Alerts</h3>
      </div>

      <div className="telegram-disconnected">
        <p className="telegram-muted">
          Enter your Telegram phone number below. We will manually add you to our Telegram bot so you can receive official hazard warnings and travel condition alerts securely.
        </p>
        
        <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '400px', marginTop: '12px' }}>
          <input 
            type="tel" 
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 XXXXX XXXXX"
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
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

