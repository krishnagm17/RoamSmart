import { useEffect, useState } from "react";
import { Plane, Eye, Trash2 } from 'lucide-react';
import './LuxuryForms.css'; // Utilizing shared luxury styles

export default function MyTripsScreen({ onViewTrip, onSplitExpenses }) {
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("roam_saved_trips") || "[]");
      setTrips(saved);
    } catch {
      setTrips([]);
    }
  }, []);

  function deleteTrip(index) {
    const updated = trips.filter((_, i) => i !== index);
    localStorage.setItem("roam_saved_trips", JSON.stringify(updated));
    setTrips(updated);
  }

  if (trips.length === 0) {
    return (
      <div className="luxury-page-wrapper">
        <header className="luxury-header" style={{marginTop: '100px'}}>
          <span className="luxury-kicker">TRAVEL ARCHIVE</span>
          <h1 className="luxury-title font-display italic">No journeys recorded.</h1>
          <p className="luxury-subtitle">Your planned trips will appear here. Start planning your first adventure.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="luxury-page-wrapper" style={{maxWidth: '1000px'}}>
      <header className="luxury-header" style={{textAlign: 'left', marginBottom: '60px'}}>
        <span className="luxury-kicker">TRAVEL ARCHIVE</span>
        <h1 className="luxury-title font-display">My <span className="italic text-sand">Trips</span></h1>
      </header>
      
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px'}}>
        {trips.map((trip, i) => (
          <div key={i} className="glass-surface" style={{padding: '32px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
            
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px'}}>
              <div style={{background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '50%'}}>
                <Plane size={24} className="text-sand" />
              </div>
              <button 
                onClick={() => deleteTrip(i)}
                style={{background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px'}}
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div style={{flexGrow: 1}}>
              <h3 className="font-display" style={{fontSize: '32px', marginBottom: '8px', lineHeight: 1.1}}>{trip.title || "Untitled Trip"}</h3>
              <p style={{color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase'}}>{trip.subtitle || "Upcoming Journey"}</p>
              
              {trip.tags && (
                <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '24px'}}>
                  {trip.tags.slice(0, 3).map((tag, ti) => (
                    <span key={ti} style={{fontSize: '11px', border: '1px solid rgba(212, 184, 134, 0.3)', color: 'var(--accent)', padding: '4px 12px', borderRadius: '20px', fontFamily: 'var(--font-mono)'}}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{marginTop: '32px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '10px'}}>
              <button
                className="btn-outline-sand"
                style={{flex: 1, justifyContent: 'center'}}
                onClick={() => onViewTrip && onViewTrip(trip)}
                type="button"
              >
                <Eye size={16} /> Read Itinerary
              </button>
              {onSplitExpenses && (
                <button
                  className="btn-sand"
                  style={{flex: 1, justifyContent: 'center'}}
                  onClick={() => onSplitExpenses && onSplitExpenses(trip)}
                  type="button"
                >
                  🧾 Split
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
