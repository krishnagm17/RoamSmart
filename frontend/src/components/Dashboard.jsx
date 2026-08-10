import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import {
  MapPin, Star, ArrowUpRight, ArrowRight, Check,
  Route, Compass, Users, Sparkles, Camera
} from 'lucide-react';

const U = 'https://images.unsplash.com/';

const heroPhotos = [
  { alt: 'Ganga Aarti at Varanasi ghats', src: `${U}photo-1561361513-2d000a50f0dc?q=80&w=2200&auto=format&fit=crop` },
  { alt: 'Thar desert dunes at dusk',     src: `${U}photo-1477587458883-47145ed94245?q=80&w=2200&auto=format&fit=crop` },
  { alt: 'Shikara on Dal Lake, Kashmir',  src: `${U}photo-1605649487212-47bdab064df7?q=80&w=2200&auto=format&fit=crop` },
  { alt: 'Kerala backwaters at sunrise',  src: `${U}photo-1602216056096-3b40cc0c9944?q=80&w=2200&auto=format&fit=crop` },
  { alt: 'High Himalayan passes of Ladakh', src: `${U}photo-1626621341517-bbf3d9990a23?q=80&w=2200&auto=format&fit=crop` },
];

const destinations = [
  { name: 'Jaipur', region: 'Rajasthan', chip: 'HERITAGE', days: '3 Days', difficulty: 'Easy', rating: 4.9, img: 'photo-1599661046289-e31897846e41' },
  { name: 'Goa', region: 'West Coast', chip: 'BEACH', days: '4 Days', difficulty: 'Easy', rating: 4.8, img: 'photo-1512343879784-a960bf40e7f2' },
  { name: 'Kerala', region: 'South India', chip: 'BACKWATERS', days: '5 Days', difficulty: 'Moderate', rating: 4.9, img: 'photo-1602216056096-3b40cc0c9944' },
  { name: 'Varanasi', region: 'Uttar Pradesh', chip: 'SPIRITUAL', days: '3 Days', difficulty: 'Easy', rating: 4.9, img: 'photo-1561361513-2d000a50f0dc' },
  { name: 'Leh Ladakh', region: 'Ladakh', chip: 'ADVENTURE', days: '7 Days', difficulty: 'Challenging', rating: 4.9, img: 'photo-1626621341517-bbf3d9990a23' },
  { name: 'Hampi', region: 'Karnataka', chip: 'RUINS', days: '2 Days', difficulty: 'Easy', rating: 4.7, img: 'photo-1524492412937-b28074a5d7da' },
  { name: 'Kashmir', region: 'Jammu & Kashmir', chip: 'PARADISE', days: '4 Days', difficulty: 'Moderate', rating: 4.9, img: 'photo-1605649487212-47bdab064df7' },
  { name: 'Mumbai', region: 'Maharashtra', chip: 'CITY', days: '3 Days', difficulty: 'Easy', rating: 4.6, img: 'photo-1570168007204-dfb528c6958f' },
];

const steps = [
  { icon: Compass, title: 'Choose Your Destination', desc: 'Browse our curated list of destinations across India and select your calling.' },
  { icon: Users, title: 'Enter Your Details', desc: 'Tell us your starting city, travel dates, pace and budget for the journey.' },
  { icon: Sparkles, title: 'Get AI Itinerary', desc: 'Receive a personalised, day-by-day plan powered by advanced Gemini AI.' },
];

const spotlight = {
  tag: '✦ Trip of the Month',
  title: 'Rajasthan Royal',
  accent: 'Odyssey',
  desc: 'The rose-pink old city, amber forts at dusk and desert camps under a sky full of stars — an AI-optimised sweep through the land of kings. Every stay, route and dune camp is hand-selected and live-verified.',
  img: 'photo-1477587458883-47145ed94245',
  points: [
    'Private heritage walking tour of the Pink City',
    'Sunset noir at the Amber Fort',
    'Dune camp night in the Thar',
    'Satvik + royal thali food trail',
  ],
};

const travelers = [
  {
    quote: "RoamSmart planned my entire Rajasthan run in under five seconds, and every table it booked was genuinely local.",
    name: 'Priya Menon', city: 'Mumbai', initials: 'PM',
  },
  {
    quote: "The landmark scanner is like carrying a historian in your pocket — it read Hampi better than the plaque did.",
    name: 'Arjun Krishnan', city: 'Bengaluru', initials: 'AK',
  },
  {
    quote: "Its crowd alerts rerouted us off Mysore palace minutes before the holiday surge. We watched the crowd land where we were not.",
    name: 'Sana Rahmani', city: 'Hyderabad', initials: 'SR',
  },
];

function starRating(rating) {
  return (
    <span className="gt-rating">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={13} className={i < Math.round(rating) ? 'gt-star on' : 'gt-star'} />
      ))}
      <em>{rating.toFixed(1)}</em>
    </span>
  );
}

export default function Dashboard({ setActiveTab, onStartPlan }) {
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhotoIndex((i) => (i + 1) % heroPhotos.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  function goPlan(destination) {
    if (onStartPlan) {
      onStartPlan(destination);
      return;
    }
    try {
      localStorage.setItem('roam_prefill', JSON.stringify({ destination: destination || '' }));
    } catch (err) {
      console.error('Pre-fill failed:', err);
    }
    setActiveTab('plan');
  }

  return (
    <div className="landing-page animate-fade-in">

      {/* ══ HERO ═════════════════════════════════════════════════════════ */}
      <section className="gt-hero">
        {heroPhotos.map((p, i) => (
          <img
            key={p.alt}
            className={`gt-hero-photo ${i === photoIndex ? 'active' : ''}`}
            src={p.src}
            alt={p.alt}
          />
        ))}
        <div className="gt-hero-shade" />
        <div className="gt-hero-grad" />

        <div className="gt-hero-inner">
          <span className="gt-pill">✦ The Ultimate Travel Experience</span>
          <h1 className="gt-hero-title">
            Begin Your
            <br />
            <em className="gt-grad-text">Best Trip Yet</em>
          </h1>
          <p className="gt-hero-sub">
            Plan India with AI — palaces, peaks, backwaters and beyond. Curated itineraries,
            live crowd reads, landmark stories and safety alerts for the modern traveller.
          </p>

          <div className="gt-hero-ctas">
<button className="gt-btn-solid" onClick={() => goPlan()}>
              Plan My Trip <ArrowUpRight size={17} />
            </button>
            <a className="gt-btn-ghost" href="#popular" onClick={(e) => { e.preventDefault(); document.getElementById('popular')?.scrollIntoView({ behavior: 'smooth' }); }}>
              Explore Destinations <Compass size={17} />
            </a>
          </div>
        </div>

        <div className="gt-hero-dots" aria-hidden="true">
          {heroPhotos.map((p, i) => (
            <button
              key={p.alt}
              className={`gt-hero-dot ${i === photoIndex ? 'active' : ''}`}
              onClick={() => setPhotoIndex(i)}
              aria-label={`Show slide ${i + 1}`}
            />
          ))}
        </div>
      </section>

      {/* ══ POPULAR DESTINATIONS ═════════════════════════════════════════ */}
      <section className="gt-section" id="popular">
        <div className="gt-head">
          <div>
            <span className="gt-eyebrow">Top Rated Destinations</span>
            <h2 className="gt-title">
              Popular <em className="gt-grad-text">Destinations</em>
            </h2>
            <div className="gt-title-bar" />
          </div>
<button className="gt-link" onClick={() => goPlan()}>
              View All Journeys <ArrowRight size={15} />
            </button>
        </div>

        <div className="gt-cards">
          {destinations.map((d) => (
            <article className="gt-card" key={d.name} onClick={() => goPlan(d.name)}>
              <div className="gt-card-img">
                <img src={`${U}${d.img}?q=80&w=900&auto=format&fit=crop`} alt={d.name} loading="lazy" />
                <span className="gt-card-chip">{d.chip}</span>
              </div>
              <div className="gt-card-body">
                <div className="gt-card-region">
                  <MapPin size={12} /> {d.region}
                </div>
                <h3 className="gt-card-title">{d.name}</h3>
                <div className="gt-card-meta">
                  <span className="gt-card-days"><Route size={12} /> {d.days}</span>
                  <span className={`gt-badge gt-badge-${d.difficulty === 'Moderate' ? 'b' : d.difficulty === 'Challenging' ? 'r' : 'g'}`}>{d.difficulty}</span>
                </div>
                {starRating(d.rating)}
                <button className="gt-card-plan" onClick={(e) => { e.stopPropagation(); goPlan(d.name); }}>
                  Plan This Trip <ArrowUpRight size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════════ */}
      <section className="gt-section-alt">
        <div className="gt-head center">
          <span className="gt-eyebrow">The Process</span>
          <h2 className="gt-title">
            Plan Your Trip in <em className="gt-grad-text">3 Simple Steps</em>
          </h2>
          <p className="gt-sub">Seamless trip planning designed for the modern traveller.</p>
        </div>

        <div className="gt-steps">
          {steps.map(({ icon: Icon, title, desc }, i) => (
            <div className="gt-step" key={title}>
              <span className="gt-step-num">{i + 1}</span>
              <div className="gt-step-icon"><Icon size={22} /></div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ SPOTLIGHT — TRIP OF THE MONTH ════════════════════════════════ */}
      <section className="gt-spotlight">
        <div className="gt-spot-glow" />
        <div className="gt-spot-card">
          <div className="gt-spot-visual">
            <img src={`${U}${spotlight.img}?q=80&w=1300&auto=format&fit=crop`} alt={spotlight.title} loading="lazy" />
          </div>
          <div className="gt-spot-body">
            <span className="gt-spot-tag">{spotlight.tag}</span>
            <h2 className="gt-spot-title">
              {spotlight.title} <em className="gt-grad-text">{spotlight.accent}</em>
            </h2>
            <p className="gt-spot-desc">{spotlight.desc}</p>
            <ul className="gt-spot-list">
              {spotlight.points.map((p) => (
                <li key={p}><span className="gt-spot-check"><Check size={13} /></span> {p}</li>
              ))}
            </ul>
            <button className="gt-btn-solid" onClick={() => goPlan('Jaipur')}>
              Plan This Journey <ArrowUpRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ═════════════════════════════════════════════════ */}
      <section className="gt-section">
        <div className="gt-head center">
          <span className="gt-eyebrow">Testimonials</span>
          <h2 className="gt-title">
            What Our <em className="gt-grad-text">Travellers Say</em>
          </h2>
          <p className="gt-sub">Stories of seamless journeys and hidden discoveries.</p>
        </div>

        <div className="gt-testi-grid">
          {travelers.map((t) => (
            <figure className="gt-testi-card" key={t.name}>
              <div className="gt-testi-stars">{starRating(5)}</div>
              <blockquote>“{t.quote}”</blockquote>
              <figcaption>
                <span className="gt-testi-avatar">{t.initials}</span>
                <span className="gt-testi-who">
                  <strong>{t.name}</strong>
                  <small>{t.city}</small>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ══ FINAL CTA ═══════════════════════════════════════════════════ */}
      <section className="gt-final">
        <img
          className="gt-final-photo"
          src={`${U}photo-1507525428034-b723cf961d3e?q=80&w=2200&auto=format&fit=crop`}
          alt="A quiet coastline at dusk"
          loading="lazy"
        />
        <div className="gt-final-shade" />
        <div className="gt-final-inner">
          <span className="gt-pill">The Final Step</span>
          <h2>
            Start Your <em className="gt-grad-text">Adventure</em> Today
          </h2>
          <p>
            Join thousands of travellers who found the perfect route, dodged the crowds
            and captured it all — with one AI companion by their side.
          </p>
          <div className="gt-final-ctas">
            <button className="gt-btn-solid" onClick={() => goPlan()}>
              Plan My Trip Now <ArrowUpRight size={17} />
            </button>
            <button className="gt-btn-ghost" onClick={() => setActiveTab('scanner')}>
              <Camera size={17} /> Try the Landmark Scanner
            </button>
            <button className="gt-btn-ghost" onClick={() => setActiveTab('safety')}>
              🛡️ Travel Safety Hub
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}