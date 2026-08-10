import { AlertTriangle, Shield, HeartPulse, Flame, PhoneCall, HeartHandshake, AlertOctagon } from 'lucide-react';
import './LuxuryForms.css';

export default function SOSScreen() {
  const contacts = [
    { label: "Police", number: "100", icon: Shield, color: "#146c50" },
    { label: "Ambulance", number: "108", icon: HeartPulse, color: "#d64541" },
    { label: "Fire Brigade", number: "101", icon: Flame, color: "#d99a1b" },
    { label: "Tourist Helpline", number: "1363", icon: PhoneCall, color: "#2a9d8f" },
    { label: "Women Helpline", number: "1091", icon: HeartHandshake, color: "#c9a227" },
    { label: "Disaster Mgmt", number: "1070", icon: AlertOctagon, color: "#7c3aed" }
  ];

  function handleCall(number) {
    window.open(`tel:${number}`, "_self");
  }

  return (
    <div className="luxury-page-wrapper" style={{maxWidth: '800px'}}>
      <header className="luxury-header" style={{textAlign: 'center', marginBottom: '60px'}}>
        <div style={{display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', marginBottom: '24px', border: '1px solid rgba(239, 68, 68, 0.3)'}}>
          <AlertTriangle size={32} color="#ef4444" />
        </div>
        <h1 className="font-display italic" style={{fontSize: '48px', color: '#ef4444', marginBottom: '12px'}}>Emergency SOS</h1>
        <p className="luxury-subtitle">Tap any number below for immediate assistance.</p>
      </header>

      <button 
        onClick={() => handleCall("112")} 
        style={{
          width: '100%', 
          background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', 
          color: '#fff', 
          border: 'none', 
          padding: '24px', 
          borderRadius: '24px', 
          fontSize: '24px', 
          fontFamily: 'var(--font-display)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '16px',
          cursor: 'pointer',
          marginBottom: '48px',
          boxShadow: '0 10px 30px rgba(239, 68, 68, 0.3)',
          transition: 'transform 0.2s ease'
        }}
        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <PhoneCall size={28} />
        Call National Emergency (112)
      </button>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px'}}>
        {contacts.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.number}
              className="glass-surface"
              onClick={() => handleCall(c.number)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.3s ease',
                gap: '24px'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'var(--accent-soft)';
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
            >
              <div style={{background: 'var(--accent-soft)', padding: '16px', borderRadius: '50%'}}>
                <Icon size={24} color={c.color} />
              </div>
              <div style={{flexGrow: 1}}>
                <span style={{display: 'block', fontSize: '18px', color: 'var(--text-primary)', fontFamily: 'var(--font-display)'}}>{c.label}</span>
                <span className="font-mono" style={{display: 'block', fontSize: '14px', color: 'var(--accent)', marginTop: '4px'}}>{c.number}</span>
              </div>
            </button>
          );
        })}
      </div>

      <p style={{textAlign: 'center', marginTop: '48px', color: 'var(--text-secondary)', fontSize: '14px'}}>
        These are official Indian emergency numbers. Calls are free from any phone.
      </p>
    </div>
  );
}
