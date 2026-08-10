import React from 'react';
import { Home, Compass, Bot, Activity, Map, MapPin, Wallet, Calendar, Heart, Plane, PieChart, ShieldAlert, Radar, User, Settings, Crown, ArrowRight } from 'lucide-react';
import './Sidebar.css';

const menuItems = [
  { name: 'Dashboard', icon: Home, id: 'dashboard' },
  { name: 'AI Trip Planner', icon: Bot, id: 'plan' },
  { name: 'My Trips', icon: Plane, id: 'trips' },
  { name: 'Travel Safety', icon: Radar, id: 'safety' },
  { name: 'Landmark Scanner', icon: MapPin, id: 'scanner' },
  { name: 'Photo Journal', icon: Compass, id: 'journal' },
  { name: 'Emergency Assistance', icon: ShieldAlert, id: 'sos' },
];

export default function Sidebar({ activeItem, setActiveItem }) {
  return (
    <aside className="sidebar dark-theme animate-fade-in">
      <div className="sidebar-logo">
        <div className="logo-icon-container">
          <Plane className="logo-icon" size={24} />
        </div>
        <div>
          <h2>RoamSmart</h2>
          <span className="logo-subtitle">Travel Smarter with AI</span>
        </div>
      </div>
      
      <div className="sidebar-scrollable">
        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const isActive = activeItem === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveItem(item.id)}
              >
                <item.icon className="nav-icon" size={18} />
                <span className="nav-label">{item.name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="premium-banner">
          <div className="premium-header">
            <h4>Upgrade to Premium</h4>
            <Crown size={16} className="text-warning" />
          </div>
          <p>Unlock advanced AI features, exclusive deals and 24/7 support.</p>
          <button className="upgrade-btn">
            Upgrade Now <ArrowRight size={14} />
          </button>
        </div>

        <div className="user-profile-widget">
          <img src="https://i.pravatar.cc/150?img=47" alt="Profile" className="profile-img" />
          <div className="profile-info">
            <span className="profile-name">Ananya Sharma</span>
            <span className="profile-level">Explorer Level 8</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
