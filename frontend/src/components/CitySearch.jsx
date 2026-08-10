import { useMemo, useState, useEffect } from "react";

let cachedLocations = null;
let fetchPromise = null;

// Loads the shared /locations.json place list once and caches it.
export function useLocations() {
  const [locations, setLocations] = useState(cachedLocations || []);

  useEffect(() => {
    if (cachedLocations) return;
    if (!fetchPromise) {
      fetchPromise = fetch("/locations.json")
        .then((res) => res.json())
        .then((data) => {
          cachedLocations = data || [];
          return cachedLocations;
        })
        .catch((err) => {
          console.error("Failed to load locations:", err);
          return [];
        });
    }
    fetchPromise.then((data) => {
      setLocations(data);
    });
  }, []);

  return locations;
}

// Ranks "City, District, State" strings against a query, like the original
// StepOne autocomplete, so multi-destination picks feel identical.
export function matchLocations(locationsList, query, limit = 8) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const filtered = [];
  for (let i = 0; i < locationsList.length; i += 1) {
    const city = locationsList[i];
    const cityLower = city.toLowerCase();
    const index = cityLower.indexOf(q);
    if (index !== -1) {
      let score = 2;
      if (index === 0) score = 0;
      else {
        const charBefore = cityLower[index - 1];
        if (charBefore === " " || charBefore === "," || charBefore === "(") score = 1;
      }
      filtered.push({ city, score });
    }
  }
  return filtered
    .sort((a, b) => (a.score !== b.score ? a.score - b.score : a.city.localeCompare(b.city)))
    .map((item) => item.city)
    .slice(0, limit);
}

// Reusable autocomplete input for a city/place. Keep the look & feel of the
// original luxury form but fully reusable across single and multi planning.
export default function CitySearch({ name, value, onChange, onBlur, placeholder }) {
  const [open, setOpen] = useState(false);
  const locationsList = useLocations();

  const matches = useMemo(() => matchLocations(locationsList, value), [value, locationsList]);

  function chooseCity(city) {
    onChange(city);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        className="luxury-input"
        style={{ width: "100%" }}
        aria-autocomplete="list"
        aria-controls={`${name}-suggestions`}
        aria-expanded={open && matches.length > 0}
        autoComplete="off"
        name={name}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
          if (typeof onBlur === "function") onBlur();
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        role="combobox"
        type="text"
        value={value}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, width: "100%",
            background: "var(--bg-main)", border: "1px solid var(--border-color)",
            zIndex: 50, maxHeight: "200px", overflowY: "auto",
            borderRadius: "8px", marginTop: "4px",
          }}
        >
          {matches.map((city) => (
            <button
              key={city}
              style={{
                width: "100%", textAlign: "left", padding: "12px 16px",
                background: "transparent", border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                color: "var(--text-primary)", cursor: "pointer", fontFamily: "var(--font-body)",
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => chooseCity(city)}
              type="button"
            >
              {city}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}