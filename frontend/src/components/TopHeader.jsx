import React, { useState, useEffect } from 'react';
import { Settings, Menu, X, Bell, Plane, BookOpen, ScanLine, ShieldAlert, Wallet, Map, Users, User, Radar } from 'lucide-react';
import './TopHeader.css';

function LogoMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.45" />
      <path d="M5.5 16.5 L9.5 10.5 L12 13.5 L14.5 9.5 L18.5 16.5" />
      <circle cx="16.1" cy="6.6" r="1.4" fill="#ffd700" stroke="none" />
    </svg>
  );
}

const navItems = [
  { id: 'plan', label: 'Plan', icon: Plane },
  { id: 'trips', label: 'Trips', icon: Map },
  { id: 'split', label: 'Split', icon: Wallet },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'safety', label: 'Safety', icon: Radar },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'scanner', label: 'Scanner', icon: ScanLine },
  { id: 'sos', label: 'Alerts', icon: Bell },
];

export default function TopHeader({ activeTab, setActiveTab, setSettingsModalOpen, unreadCount = 0, profile = null, signedIn = true }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu when tab changes
  useEffect(() => {
    setMenuOpen(false);
  }, [activeTab]);

  const handleNav = (id) => {
    setActiveTab(id);
    setMenuOpen(false);
  };

  return (
    <>
      <header
        className={[
          'editorial-nav',
          activeTab !== 'dashboard' ? 'solid-nav' : '',
          scrolled && activeTab === 'dashboard' ? 'scrolled-nav' : '',
        ].filter(Boolean).join(' ')}
      >
        {/* Logo */}
        <div className="nav-logo" onClick={() => handleNav('dashboard')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleNav('dashboard')}>
          <div className="logo-icon-wrapper">
            <LogoMark size={18} />
          </div>
          <span className="logo-text">
            Roam<span className="font-display italic ml-1">Smart</span>
          </span>
        </div>

        {/* Desktop Nav */}
        <nav className="nav-links" aria-label="Main navigation">
          {navItems.map(({ id, label }) => (
            <button
              key={id}
              className={activeTab === id ? 'active' : ''}
              onClick={() => handleNav(id)}
            >
              {label}
              {id === 'sos' && unreadCount > 0 && (
                <span className="nav-alert-dot" aria-label={`${unreadCount} alerts`} />
              )}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="nav-actions">
          {signedIn ? (
            <button className="nav-user-chip" onClick={() => handleNav('profile')} title="Your profile" aria-label="Profile">
              {profile?.avatarUrl ? (
                <img className="nav-user-avatar" src={profile.avatarUrl} alt="" />
              ) : (
                <span className="nav-user-avatar nav-user-avatar-fallback">
                  {(profile?.displayName || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="nav-user-name">{(profile?.displayName || profile?.username || 'Profile').split(' ')[0]}</span>
            </button>
          ) : (
            <button className="btn-sand nav-cta-btn" onClick={() => handleNav('profile')} title="Sign in" aria-label="Sign in">
              Sign in
            </button>
          )}
          {setSettingsModalOpen && (
            <button
              className="nav-icon-btn"
              onClick={() => setSettingsModalOpen(true)}
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          )}

          {/* Hamburger (mobile) */}
          <button
            className="nav-hamburger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div className={`mobile-drawer ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen}>
        <div className="mobile-drawer-inner">
          <div className="mobile-drawer-header">
<div className="mobile-drawer-logo">
              <div className="logo-icon-wrapper small">
                <LogoMark size={14} />
              </div>
              <span className="logo-text" style={{ fontSize: '18px' }}>
                Roam<span className="font-display italic ml-1">Smart</span>
              </span>
            </div>
          </div>

          <nav className="mobile-nav">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`mobile-nav-item ${activeTab === id ? 'active' : ''}`}
                onClick={() => handleNav(id)}
              >
                <Icon size={18} className="mobile-nav-icon" />
                <span>{label}</span>
                {id === 'sos' && unreadCount > 0 && (
                  <span className="mobile-alert-count">{unreadCount}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="mobile-drawer-footer">
            <button className="btn-sand" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleNav('plan')}>
              Start planning your trip
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {menuOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}

