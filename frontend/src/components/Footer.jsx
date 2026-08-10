import React, { useState } from 'react';
import { GitFork, ExternalLink, Link2, ArrowUpRight, Send, MapPin, Heart } from 'lucide-react';
import './Footer.css';

function LogoMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.45" />
      <path d="M5.5 16.5 L9.5 10.5 L12 13.5 L14.5 9.5 L18.5 16.5" />
      <circle cx="16.1" cy="6.6" r="1.4" fill="#ffd700" stroke="none" />
    </svg>
  );
}

const footerLinks = {
  explore: [
    { label: 'Plan a Trip', id: 'plan' },
    { label: 'My Trips', id: 'trips' },
    { label: 'Travel Safety', id: 'safety' },
    { label: 'Photo Journal', id: 'journal' },
    { label: 'Landmark Scanner', id: 'scanner' },
    { label: 'Alerts & SOS', id: 'sos' },
  ],
  resources: [
    { label: 'How It Works', href: '#' },
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms of Use', href: '#' },
    { label: 'API Docs', href: '#' },
    { label: 'Report an Issue', href: '#' },
  ],
};

const socials = [
  { icon: GitFork, href: '#', label: 'GitHub' },
  { icon: Link2, href: '#', label: 'Twitter' },
  { icon: ExternalLink, href: '#', label: 'Instagram' },
];

export default function Footer({ setActiveTab }) {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  function handleSubscribe(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
    setEmail('');
    setTimeout(() => setSubscribed(false), 4000);
  }

  return (
    <footer className="site-footer">
      {/* Ambient glow */}
      <div className="footer-glow" />

      <div className="footer-inner">
        {/* Top row */}
        <div className="footer-top">
          {/* Brand */}
          <div className="footer-brand">
            <div className="footer-logo">
              <div className="footer-logo-icon">
                <LogoMark size={18} />
              </div>
              <span className="footer-logo-text">
                Roam<span className="font-display italic text-sand">Smart</span>
              </span>
            </div>
            <p className="footer-tagline">
              An AI travel companion that listens, plans, and walks beside you â€” from the first daydream to the last lantern-lit night.
            </p>
            <div className="footer-badge">
              <MapPin size={12} />
              <span>Built for Indian travellers Â· Powered by Gemini AI</span>
            </div>
          </div>

          {/* Nav columns */}
          <div className="footer-nav-cols">
            <div className="footer-col">
              <span className="footer-col-heading font-mono">EXPLORE</span>
              <ul>
                {footerLinks.explore.map((link) => (
                  <li key={link.id}>
                    <button
                      className="footer-nav-link"
                      onClick={() => setActiveTab?.(link.id)}
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="footer-col">
              <span className="footer-col-heading font-mono">RESOURCES</span>
              <ul>
                {footerLinks.resources.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="footer-nav-link">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Newsletter */}
            <div className="footer-col footer-newsletter-col">
              <span className="footer-col-heading font-mono">STAY UPDATED</span>
              <p className="footer-newsletter-desc">
                Get travel inspiration, feature updates, and hidden gems in your inbox.
              </p>
              {subscribed ? (
                <div className="footer-subscribed">
                  <Heart size={14} className="text-sand" />
                  <span>You're in! Welcome aboard.</span>
                </div>
              ) : (
                <form className="footer-newsletter-form" onSubmit={handleSubscribe}>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="footer-email-input"
                    required
                  />
                  <button type="submit" className="footer-subscribe-btn" aria-label="Subscribe">
                    <Send size={14} />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="footer-divider" />

        {/* Bottom bar */}
        <div className="footer-bottom">
          <p className="footer-copy">
            Â© {new Date().getFullYear()} RoamSmart Â· RNIT Bengaluru Â· All rights reserved.
          </p>

          <div className="footer-socials">
            {socials.map(({ icon: Icon, href, label }) => (
              <a
                key={label}
                href={href}
                className="footer-social-btn"
                aria-label={label}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon size={16} />
              </a>
            ))}
          </div>

          <a
            href="#"
            className="footer-made-with font-mono"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          >
            Back to top <ArrowUpRight size={12} />
          </a>
        </div>
      </div>
    </footer>
  );
}
