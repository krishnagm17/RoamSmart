import { useMemo, useState } from "react";
import {
  buildGoogleMapsSearchUrl,
  buildGoogleMapsUrl,
  getGoogleMapsStops
} from "../utils/buildMapsUrl";
import { Footprints, Car, Bus, Bike, Map, Copy, Check, ExternalLink } from 'lucide-react';

const travelModes = [
  { label: "Walking", value: "walking", icon: Footprints },
  { label: "Driving", value: "driving", icon: Car },
  { label: "Transit", value: "transit", icon: Bus },
  { label: "Cycling", value: "bicycling", icon: Bike }
];

export default function DayRoutePanel({ days = [], destination, getDestination }) {
  const firstDay = days[0]?.day || 1;
  const [selectedDay, setSelectedDay] = useState(firstDay);
  const [travelMode, setTravelMode] = useState("driving");
  const [copied, setCopied] = useState(false);

  const activeDay = useMemo(
    () => days.find((day) => Number(day.day) === Number(selectedDay)) || days[0],
    [days, selectedDay]
  );
  const activities = activeDay?.activities || [];
  const activeDestination = typeof getDestination === "function" ? getDestination(activeDay) : destination;
  const routeUrl = buildGoogleMapsUrl(activities, activeDestination, travelMode);
  const mapStops = getGoogleMapsStops(activities, activeDestination);
  const hasStopLimitWarning = mapStops.length > 10;

  function chooseDay(dayNumber) {
    setSelectedDay(dayNumber);
    setCopied(false);
  }

  function openRoute() {
    if (routeUrl) {
      window.open(routeUrl, "_blank", "noopener,noreferrer");
    }
  }

  function openStop(activity) {
    window.open(buildGoogleMapsSearchUrl(activity, activeDestination), "_blank", "noopener,noreferrer");
  }

  async function copyRoute() {
    if (!routeUrl) return;

    await navigator.clipboard.writeText(routeUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (!days.length) {
    return (
      <div className="glass-surface" style={{padding: '24px', textAlign: 'center', color: 'var(--text-secondary)'}}>
        Route stops will appear here once the itinerary includes day-wise activities.
      </div>
    );
  }

  return (
    <div className="glass-surface" style={{padding: '32px', borderRadius: '16px'}}>
      <div style={{display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '24px'}}>
        {days.map((day) => {
          const isActive = Number(day.day) === Number(selectedDay);
          return (
            <button
              className={`luxury-chip ${isActive ? "selected" : ""}`}
              key={day.day}
              onClick={() => chooseDay(day.day)}
              type="button"
            >
              Day {day.day}
            </button>
          );
        })}
      </div>

      {activeDay?.theme && <p className="font-display italic text-sand" style={{fontSize: '20px', marginBottom: '32px'}}>{activeDay.theme}</p>}

      <div style={{display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '32px'}}>
        {activities.map((activity, index) => (
          <button
            key={`${activeDay?.day}-${activity.time}-${activity.name}-${index}`}
            onClick={() => openStop(activity)}
            type="button"
            style={{
              display: 'flex', gap: '16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px', borderRadius: '8px', transition: 'background 0.2s', width: '100%', alignItems: 'flex-start'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '24px'}}>
              <div style={{width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold'}}>
                {index + 1}
              </div>
              {index < activities.length - 1 && <div style={{width: '2px', height: '100%', background: 'rgba(212, 184, 134, 0.2)', minHeight: '40px', marginTop: '8px'}} />}
            </div>
            
            <div style={{flexGrow: 1}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px'}}>
                <strong className="font-display" style={{fontSize: '18px', color: 'var(--text-primary)'}}>{activity.name}</strong>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)'}}>
                  <span className="font-mono" style={{fontSize: '12px'}}>{activity.time}</span>
                  <ExternalLink size={14} />
                </div>
              </div>
              <span style={{fontSize: '13px', color: 'var(--text-secondary)'}}>
                <span style={{color: 'var(--accent)', textTransform: 'capitalize'}}>{activity.type || "activity"}</span> <span aria-hidden="true">&middot;</span> {activity.estimatedCost}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div style={{display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', marginBottom: '24px'}}>
        {travelModes.map((mode) => {
          const Icon = mode.icon;
          const isActive = travelMode === mode.value;
          return (
            <button
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                background: isActive ? 'var(--text-primary)' : 'transparent',
                color: isActive ? 'var(--bg-main)' : 'var(--text-secondary)',
                border: `1px solid ${isActive ? 'var(--text-primary)' : 'rgba(255,255,255,0.1)'}`
              }}
              key={mode.value}
              onClick={() => setTravelMode(mode.value)}
              type="button"
            >
              <Icon size={14} />
              {mode.label}
            </button>
          );
        })}
      </div>

      <p style={{fontSize: '13px', color: hasStopLimitWarning ? '#f4a261' : 'var(--text-secondary)', marginBottom: '24px'}}>
        Day {activeDay?.day} <span aria-hidden="true">&middot;</span> {activities.length} stops{" "}
        <span aria-hidden="true">&middot;</span>{" "}
        {hasStopLimitWarning ? "showing first 10 in Google Maps" : "opens in Google Maps"}
      </p>

      <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px'}}>
        <button className="btn-sand" disabled={!routeUrl} onClick={openRoute} type="button" style={{justifyContent: 'center', padding: '16px'}}>
          <Map size={18} />
          Open Route Map
        </button>
        <button className="btn-outline-sand" disabled={!routeUrl} onClick={copyRoute} type="button" style={{justifyContent: 'center'}}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? "Copied" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}
