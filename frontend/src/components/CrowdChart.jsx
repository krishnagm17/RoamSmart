import { useMemo } from 'react';
import { getScoreColor } from '../utils/crowdHelpers';

function parseHourString(hStr) {
  const parts = hStr.trim().split(' ');
  let num = parseInt(parts[0]);
  const ampm = parts[1]?.toUpperCase();
  if (ampm === 'PM' && num !== 12) num += 12;
  if (ampm === 'AM' && num === 12) num = 0;
  return num;
}

function parseWindow(windowStr) {
  if (!windowStr) return null;
  const parts = windowStr.split(/[â€“-]/);
  if (parts.length !== 2) return null;
  
  const parseTime = (timeStr) => {
    const t = timeStr.trim();
    const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) {
      const simpleMatch = t.match(/(\d+)\s*(AM|PM)/i);
      if (simpleMatch) {
        let h = parseInt(simpleMatch[1]);
        if (simpleMatch[2].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (simpleMatch[2].toUpperCase() === 'AM' && h === 12) h = 0;
        return h;
      }
      return 0;
    }
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h + m / 60;
  };

  return {
    start: parseTime(parts[0]),
    end: parseTime(parts[1])
  };
}

function isHourInWindow(hourNum, window) {
  if (!window) return false;
  if (window.start <= window.end) {
    return hourNum >= window.start && hourNum < window.end;
  } else {
    return hourNum >= window.start || hourNum < window.end;
  }
}

function parseVisitTimeHour(vt) {
  if (!vt) return 10;
  const clean = vt.trim();
  const match = clean.match(/(\d+)[:.]?(\d+)?\s*(AM|PM)?/i);
  if (!match) return 10;
  let h = parseInt(match[1]);
  const ampm = match[3] ? match[3].toUpperCase() : null;
  
  if (ampm) {
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
  }
  return h;
}

export default function CrowdChart({ hourlyForecast, visitTime, bestTimeWindow, avoidTimeWindow }) {
  const parsedBest = useMemo(() => parseWindow(bestTimeWindow), [bestTimeWindow]);
  const parsedAvoid = useMemo(() => parseWindow(avoidTimeWindow), [avoidTimeWindow]);
  const visitHour = useMemo(() => parseVisitTimeHour(visitTime), [visitTime]);

  if (!hourlyForecast || hourlyForecast.length === 0) {
    return <p className="crowd-chart-empty">No forecast data available</p>;
  }

  return (
    <div className="crowd-chart" style={{ height: '384px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {hourlyForecast.map((item, index) => {
        const hourNum = parseHourString(item.hour);
        const isBest = isHourInWindow(hourNum, parsedBest);
        const isAvoid = isHourInWindow(hourNum, parsedAvoid);
        const isCurrentVisit = hourNum === visitHour;

        let bg = 'transparent';
        if (isBest) bg = '#f0fff4';
        if (isAvoid) bg = '#fff5f5';
        if (isCurrentVisit) bg = 'rgba(244, 162, 97, 0.08)';

        const color = getScoreColor(item.score);
        const animDelay = `${index * 40}ms`;

        return (
          <div
            key={item.hour}
            className={`crowd-chart-row ${isCurrentVisit ? 'current-visit-row' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '20px',
              padding: '0 8px',
              borderRadius: '4px',
              background: bg,
              transition: 'background 0.2s ease',
              fontSize: '12px'
            }}
          >
            {/* Hour Label */}
            <span style={{ width: '50px', color: 'var(--muted)', fontWeight: 500 }}>
              {item.hour}
            </span>

            {/* Bar Container */}
            <div style={{ flex: 1, height: '12px', background: '#262626', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
              <div
                className="crowd-chart-bar-fill"
                style={{
                  height: '100%',
                  width: `${item.score}%`,
                  background: color,
                  borderRadius: '0 4px 4px 0',
                  '--target-width': `${item.score}%`,
                  animation: `barGrow 0.6s ease-out forwards`,
                  animationDelay: animDelay
                }}
              />
            </div>

            {/* Score Label / Badge column */}
            <div style={{ width: '90px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', paddingLeft: '8px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)', width: '24px', textAlign: 'right' }}>
                {item.score}
              </span>
              
              <div style={{ width: '45px', textAlign: 'left' }}>
                {isBest && <span style={{ color: '#2d6a4f', fontWeight: 600, fontSize: '10px' }}>âœ“ Best</span>}
                {isAvoid && <span style={{ color: '#e63946', fontWeight: 600, fontSize: '10px' }}>âœ— Busy</span>}
                {isCurrentVisit && !isBest && !isAvoid && <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '10px' }}>ðŸ“ Visit</span>}
              </div>
            </div>

            {/* Current Visit Indicator */}
            {isCurrentVisit && (
              <span className="visit-arrow-label" style={{ fontSize: '10px', fontWeight: 600, color: 'var(--primary)', marginLeft: '4px' }}>
                â† Your visit
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
