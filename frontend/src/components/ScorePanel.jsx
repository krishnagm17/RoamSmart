import { useEffect, useState } from "react";
import { ShieldCheck, Loader2 } from 'lucide-react';
import './LuxuryForms.css';

function getScoreColor(score) {
  if (score >= 90) return "var(--accent)";
  if (score >= 80) return "#f4a261";
  return "#e63946";
}

function getStatusColor(status) {
  if (status === "pass") return "var(--accent)";
  if (status === "warn") return "#f4a261";
  return "#e63946";
}

export default function ScorePanel({ verification, isLoading, onRegenerate }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [animateProgress, setAnimateProgress] = useState(false);

  useEffect(() => {
    if (isLoading || !verification) {
      setAnimatedScore(0);
      return;
    }

    const target = verification.overallScore || 0;
    const duration = 1500;
    const startTime = performance.now();

    let animId;
    function animate(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress * (2 - progress);
      const current = Math.round(ease * target);
      setAnimatedScore(current);

      if (progress < 1) {
        animId = requestAnimationFrame(animate);
      }
    }

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [verification, isLoading]);

  useEffect(() => {
    if (!isLoading && verification) {
      const timer = setTimeout(() => setAnimateProgress(true), 50);
      return () => clearTimeout(timer);
    } else {
      setAnimateProgress(false);
    }
  }, [verification, isLoading]);

  if (isLoading || !verification) {
    return (
      <aside className="glass-surface" style={{padding: '32px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px'}}>
        <Loader2 size={32} className="text-sand" style={{animation: 'spin 1s linear infinite', marginBottom: '16px'}} />
        <p className="font-mono text-secondary" style={{letterSpacing: '1px', fontSize: '11px'}}>VERIFYING PLAN QUALITY</p>
      </aside>
    );
  }

  const overallColor = getScoreColor(verification.overallScore);
  const circumference = 339.3;
  const strokeOffset = circumference - (animatedScore / 100) * circumference;

  return (
    <aside className="glass-surface" style={{padding: '32px', borderRadius: '16px', position: 'sticky', top: '100px'}}>
      <header style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
        <ShieldCheck size={20} className="text-sand" />
        <span className="font-mono text-secondary" style={{letterSpacing: '1px', fontSize: '12px'}}>CONCIERGE VERIFICATION</span>
      </header>

      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px'}}>
        <div style={{position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px'}}>
          <svg width="120" height="120" viewBox="0 0 120 120" style={{transform: 'rotate(-90deg)'}}>
            <circle cx="60" cy="60" r="54" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
            <circle
              cx="60" cy="60" r="54" fill="transparent" stroke={overallColor} strokeWidth="4"
              strokeDasharray={circumference} strokeDashoffset={strokeOffset} strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.1s linear" }}
            />
          </svg>
          <div style={{position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <span className="font-display" style={{fontSize: '36px', lineHeight: 1}}>{animatedScore}</span>
            <span className="font-mono" style={{fontSize: '12px', color: overallColor}}>{verification.grade}</span>
          </div>
        </div>
        <span className="font-display italic text-secondary" style={{fontSize: '18px'}}>Quality Score</span>
        {verification.verdict && (
          <p style={{fontSize: '13px', textAlign: 'center', marginTop: '12px', color: 'var(--text-secondary)'}}>
            "{verification.verdict}"
          </p>
        )}
      </div>

      <div style={{display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px'}}>
        {(verification.dimensions || []).map((dim, idx) => {
          const statusColor = getStatusColor(dim.status);
          const targetWidth = animateProgress ? `${dim.score}%` : "0%";
          const delay = `${idx * 100}ms`;

          return (
            <div key={dim.id || idx} title={dim.comment} style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '13px'}}>
                <span style={{color: 'var(--text-primary)'}}>{dim.label}</span>
                <span className="font-mono" style={{color: statusColor}}>{dim.score}</span>
              </div>
              <div style={{width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden'}}>
                <div style={{width: targetWidth, height: '100%', background: statusColor, transition: 'width 1s ease-out', transitionDelay: delay}} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
        {Array.isArray(verification.flags?.improvements) && verification.flags.improvements.length > 0 && (
          <div>
            <h4 className="font-mono text-sand" style={{fontSize: '11px', letterSpacing: '1px', marginBottom: '12px'}}>AREAS TO IMPROVE</h4>
            <ul style={{listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px'}}>
              {verification.flags.improvements.map((item, i) => (
                <li key={i} style={{fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px'}}>
                  <span style={{color: '#f4a261'}}>•</span> {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

    </aside>
  );
}
