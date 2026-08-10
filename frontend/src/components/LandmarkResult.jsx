import { useState } from "react";
import { motion } from "framer-motion";
import { useCrowdPrediction } from "../hooks/useCrowdPrediction";
import CrowdDetailModal from "./CrowdDetailModal";
import { Camera, MapPin, Sparkles, AlertCircle, Plus, Users, Map, RefreshCw } from 'lucide-react';
import './LuxuryForms.css';

export default function LandmarkResult({ result, capturedImage, onScanAnother, showToast }) {
  const { predictions, loading, predict } = useCrowdPrediction();
  const [crowdModalOpen, setCrowdModalOpen] = useState(false);

  if (!result) return null;

  if (!result.identified) {
    return (
      <div className="luxury-page-wrapper" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh'}}>
        <AlertCircle size={48} className="text-sand" style={{marginBottom: '24px'}} />
        <h2 className="font-display italic" style={{fontSize: '32px'}}>Could Not Identify</h2>
        <p className="luxury-subtitle" style={{marginTop: '12px', textAlign: 'center', maxWidth: '400px'}}>
          {result.error || "We couldn't identify this landmark. Try a clearer photo or a different angle."}
        </p>
        <button className="btn-sand" onClick={onScanAnother} style={{marginTop: '32px'}}>
          <Camera size={18} /> Try Again
        </button>
      </div>
    );
  }

  function openInMaps() {
    const query = encodeURIComponent(`${result.name}, ${result.location}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  }

  function handleCheckCrowd() {
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    predict({
      placeName: result.name,
      placeType: result.type || 'monument',
      destination: result.location || 'India',
      visitDate: todayStr,
      visitTime: timeStr,
      cacheKey: `scanner-${result.name}`
    });
    setCrowdModalOpen(true);
  }

  function addToItinerary() {
    try {
      const saved = JSON.parse(localStorage.getItem("roam_landmark_itinerary") || "[]");
      saved.push({
        name: result.name,
        location: result.location,
        description: result.description,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem("roam_landmark_itinerary", JSON.stringify(saved));
      showToast?.("Added to your itinerary!", "success");
    } catch {
      showToast?.("Could not save. Try again.", "error");
    }
  }

  const infoSections = [
    { key: "history",       label: "History",         value: result.history },
    { key: "architecture",  label: "Architecture",    value: result.architecture },
    { key: "significance",  label: "Significance",    value: result.significance },
    { key: "visiting_tips", label: "Visiting Tips",   value: result.visiting_tips },
    { key: "best_time",     label: "Best Time",       value: result.best_time_to_visit },
    { key: "entry_fee",     label: "Entry Fee",       value: result.entry_fee },
    { key: "timings",       label: "Timings",         value: result.timings }
  ];

  return (
    <div className="luxury-page-wrapper">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px'}}>
          <div>
            <span className="luxury-kicker">DISCOVERED</span>
            <h1 className="font-display" style={{fontSize: '48px', margin: '8px 0'}}>{result.name}</h1>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)'}}>
              <MapPin size={16} />
              <span>{result.location}</span>
              {result.type && (
                <>
                  <span style={{margin: '0 8px'}}>•</span>
                  <span className="font-mono" style={{letterSpacing: '1px', fontSize: '11px', color: 'var(--accent)'}}>{result.type}</span>
                </>
              )}
            </div>
          </div>
          <button className="btn-outline-sand" onClick={onScanAnother}>
            <Camera size={16} /> Scan Another
          </button>
        </div>

        {capturedImage && (
          <div style={{width: '100%', height: '400px', borderRadius: '24px', overflow: 'hidden', position: 'relative', marginBottom: '48px'}}>
            <img src={capturedImage} alt={result.name} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            <div style={{position: 'absolute', top: '24px', right: '24px', background: 'rgba(20, 26, 38, 0.55)', backdropFilter: 'blur(10px)', padding: '8px 16px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(255, 255, 255, 0.25)'}}>
              <Sparkles size={14} color="#fff" />
              <span className="font-mono" style={{fontSize: '11px', color: '#fff'}}>AI VERIFIED</span>
            </div>
          </div>
        )}

        <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '48px'}}>
          <div>
            {result.description && (
              <p style={{fontSize: '18px', lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: '48px'}}>
                {result.description}
              </p>
            )}

            <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>
              {infoSections.map((sec) => sec.value && (
                <div key={sec.key}>
                  <h3 className="font-display italic" style={{fontSize: '24px', color: 'var(--accent)', marginBottom: '12px'}}>{sec.label}</h3>
                  <p style={{color: 'var(--text-secondary)', lineHeight: 1.5}}>{sec.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
            <div className="glass-surface" style={{padding: '24px', borderRadius: '16px'}}>
              <h3 className="font-mono" style={{fontSize: '11px', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '24px'}}>ACTIONS</h3>
              <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <button className="btn-sand" onClick={addToItinerary} style={{width: '100%', justifyContent: 'center'}}>
                  <Plus size={18} /> Add to Itinerary
                </button>
                <button className="btn-outline-sand" onClick={handleCheckCrowd} style={{width: '100%', justifyContent: 'center'}}>
                  <Users size={18} /> Check Live Crowds
                </button>
                <button className="btn-outline-sand" onClick={openInMaps} style={{width: '100%', justifyContent: 'center', border: 'none'}}>
                  <Map size={18} /> Open in Maps
                </button>
              </div>
            </div>

            {result.fun_facts && result.fun_facts.length > 0 && (
              <div className="glass-surface" style={{padding: '24px', borderRadius: '16px'}}>
                <h3 className="font-mono" style={{fontSize: '11px', letterSpacing: '1px', color: 'var(--accent)', marginBottom: '16px'}}>FUN FACTS</h3>
                <ul style={{listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px'}}>
                  {result.fun_facts.map((fact, i) => (
                    <li key={i} style={{color: 'var(--text-secondary)', fontSize: '14px', position: 'relative', paddingLeft: '16px'}}>
                      <span style={{position: 'absolute', left: 0, top: '6px', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)'}} />
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <CrowdDetailModal
        prediction={predictions[`scanner-${result.name}`]}
        placeName={result.name}
        isOpen={crowdModalOpen}
        onClose={() => setCrowdModalOpen(false)}
        isLoading={loading[`scanner-${result.name}`]}
      />
    </div>
  );
}
