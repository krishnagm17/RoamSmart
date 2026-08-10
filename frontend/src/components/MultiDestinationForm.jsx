import { useMemo, useState } from "react";
import {
  Plus, X, GripVertical, Sparkles, ArrowRight, ArrowUpRight,
  Car, Bus, Train, Plane, AlertTriangle,
} from "lucide-react";
import CitySearch from "./CitySearch.jsx";
import api from "../api.js";

const travellerTypes = ["Solo", "Couple", "Friends Group", "Family with Kids", "Senior Citizens"];
const budgetLevels = [
  "Budget · ₹15k–₹25k per person",
  "Mid-range · ₹25k–₹50k per person",
  "Premium · ₹50k–₹1L per person",
  "Luxury · ₹1L+ per person",
];
const interests = [
  "Heritage & History", "Nature & Trekking", "Local Food & Street Food",
  "Shopping & Markets", "Adventure Sports", "Photography",
  "Wellness & Yoga", "Spiritual & Religious", "Art & Culture", "Nightlife",
];
const dietaryPreferences = ["Vegetarian", "Non-Vegetarian", "Vegan", "Jain", "Halal"];
const accommodationTypes = ["Hotel", "Hostel", "Homestay", "Resort", "Camping"];

const transportOptions = [
  { mode: "car", label: "Car", icon: Car },
  { mode: "bus", label: "Bus", icon: Bus },
  { mode: "train", label: "Train", icon: Train },
  { mode: "flight", label: "Flight", icon: Plane },
];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function uid() {
  return `d${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function dayAt(dateStr, offsetDays) {
  if (!dateStr) return "";
  const base = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  return new Date(base.getTime() + offsetDays * MS_PER_DAY).toISOString().slice(0, 10);
}

function iso(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(dateStr, n) {
  const base = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + n);
  return iso(base);
}

export default function MultiDestinationForm({ initialValues, onSubmit }) {
  const [startLocation, setStartLocation] = useState(initialValues.startLocation || initialValues.departureCity || "");
  const [endLocation, setEndLocation] = useState(initialValues.endLocation || "");
  const [startDate, setStartDate] = useState(initialValues.startDate || "");
  const [destinations, setDestinations] = useState(() => {
    if (Array.isArray(initialValues.destinations) && initialValues.destinations.length) {
      return initialValues.destinations.map((d) => ({ ...d, id: d.id || uid() }));
    }
    if (initialValues.destination) {
      return [{ id: uid(), name: initialValues.destination, days: 2, transport: "", notes: "" }];
    }
    return [{ id: uid(), name: "", days: 2, transport: "", notes: "" }];
  });

  const [numTravellers, setNumTravellers] = useState(initialValues.numTravellers || "1");
  const [travellerType, setTravellerType] = useState(initialValues.travellerType || "");
  const [budgetLevel, setBudgetLevel] = useState(initialValues.budgetLevel || "");
  const [interestSelection, setInterestSelection] = useState(
    Array.isArray(initialValues.interests) ? initialValues.interests : []
  );
  const [dietaryPreference, setDietaryPreference] = useState(initialValues.dietaryPreference || "");
  const [accommodationType, setAccommodationType] = useState(initialValues.accommodationType || "");
  const [specialRequests, setSpecialRequests] = useState(initialValues.specialRequests || "");
  const [formError, setFormError] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  const totalDays = destinations.reduce((sum, d) => sum + (Math.max(1, Number(d.days) || 1)), 0);
  const endDate = startDate ? addDays(startDate, totalDays - 1) : "";

  const withDates = useMemo(() => {
    let cursor = 0;
    return destinations.map((d) => {
      const days = Math.max(1, Number(d.days) || 1);
      const arrivalDate = startDate ? dayAt(startDate, cursor) : "";
      const departureDate = startDate ? dayAt(startDate, cursor + days - 1) : "";
      cursor += days;
      return { ...d, days, arrivalDate, departureDate };
    });
  }, [destinations, startDate]);

  const namedStops = destinations.filter((d) => String(d.name || "").trim());
  const errors = useMemo(() => {
    const next = {};
    if (!String(startLocation || "").trim()) next.startLocation = "Starting location is required.";
    if (!startDate) next.startDate = "When do you set off?";
    if (!endDate) next.endDate = "Pick a valid start date.";
    if (namedStops.length === 0) next.destinations = "Add at least one destination.";
    if (!numTravellers) next.numTravellers = "How many are travelling?";
    if (!travellerType) next.travellerType = "Select a traveller type.";
    if (!budgetLevel) next.budgetLevel = "Select a budget range.";
    return next;
  }, [startLocation, startDate, endDate, namedStops.length, numTravellers, travellerType, budgetLevel]);
  const isValid = Object.keys(errors).length === 0;

  function updateDest(index, patch) {
    setDestinations((current) =>
      current.map((d, i) => (i === index ? { ...d, ...patch } : d))
    );
  }

  function addDestination() {
    setDestinations((current) => [...current, { id: uid(), name: "", days: 2, transport: "", notes: "" }]);
  }

  function removeDestination(index) {
    setDestinations((current) => current.filter((_, i) => i !== index));
  }

  function moveDestination(from, to) {
    if (to < 0 || to >= destinations.length) return;
    setDestinations((current) => {
      const next = current.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function toggleInterest(interest) {
    setInterestSelection((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest]
    );
  }

  async function optimizeRoute() {
    const names = namedStops.map((d) => d.name);
    if (names.length < 3) {
      setFormError("Add at least 3 destinations to optimise the route.");
      return;
    }
    setOptimizing(true);
    setFormError("");
    try {
      const res = await api.post("/api/route-optimize", {
        startLocation,
        destinations: names.map((name) => ({ name })),
      });
      const data = res.data;
      if (data && Array.isArray(data.suggested) && data.suggested.length) {
        setDestinations((current) =>
          data.suggested.map((s) => current.find((d) => d.name === s.name) || { id: uid(), name: s.name, days: 2, transport: "", notes: "" })
        );
      } else {
        setFormError(data.error || "Could not optimise the route.");
      }
    } catch (err) {
      setFormError("Route optimisation failed. Check the backend is running.");
    } finally {
      setOptimizing(false);
    }
  }

  function submitForm(event) {
    event.preventDefault();
    setFormError("");
    if (!isValid) {
      const first = Object.keys(errors)[0];
      setFormError(errors[first]);
      return;
    }
    onSubmit({
      tripType: "multi",
      startLocation,
      endLocation: endLocation || startLocation,
      startDate,
      endDate,
      destinations: withDates.map(({ id, name, days, transport, notes, arrivalDate, departureDate }) => ({
        id, name, days, transport, notes, arrivalDate, departureDate,
      })),
      numTravellers: Number(numTravellers),
      travellerType,
      budgetLevel,
      interests: interestSelection,
      dietaryPreference,
      accommodationType,
      specialRequests,
    });
  }

  return (
    <form className="luxury-form multi-plan-form" onSubmit={submitForm} noValidate>
      {formError && (
        <div className="md-warning" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={16} />
          <span>{formError}</span>
        </div>
      )}

      <div className="md-field">
        <span>Route start · where does the journey begin?</span>
        <CitySearch
          name="startLocation"
          value={startLocation}
          onChange={setStartLocation}
          placeholder="e.g. Bengaluru, Karnataka"
        />
      </div>

      <div className="md-field">
        <span>Route end · where do you wrap up?</span>
        <CitySearch
          name="endLocation"
          value={endLocation}
          onChange={setEndLocation}
          placeholder="e.g. Mumbai, Maharashtra (optional — defaults to start)"
        />
      </div>

      <div className="md-field">
        <span>When do you set off?</span>
        <input
          className="luxury-input"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        {endDate && (
          <small className="md-date-badge">
            Total {totalDays} day{totalDays === 1 ? "" : "s"} · {endDate} arrival home
          </small>
        )}
      </div>

      <div className="md-field">
        <span>Your stops · in route order</span>
      </div>

      <div className="md-timeline">
        {destinations.map((dest, index) => (
          <div className="md-stop" key={dest.id}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="md-stop-number">{index + 1}</div>
              {index < destinations.length - 1 && <div className="md-stop-connector" />}
            </div>
            <div className="md-card">
              <div className="md-card-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    className="md-drag-handle"
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null && dragIndex !== index) moveDestination(dragIndex, index);
                      setDragIndex(null);
                    }}
                    title="Drag to reorder"
                  >
                    <GripVertical size={16} />
                  </span>
                  <span className="md-index">STOP {String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="md-actions">
                  <button
                    type="button"
                    className="md-icon-btn danger"
                    onClick={() => removeDestination(index)}
                    disabled={destinations.length <= 1}
                    title="Remove stop"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="md-grid-2" style={{ marginBottom: 12 }}>
                <div className="md-field" style={{ marginBottom: 0 }}>
                  <span>Destination</span>
                  <CitySearch
                    name={`dest-${index}`}
                    value={dest.name}
                    onChange={(value) => updateDest(index, { name: value })}
                    placeholder="e.g. Jaipur, Rajasthan"
                  />
                </div>
                <div className="md-field" style={{ marginBottom: 0 }}>
                  <span>Days here</span>
                  <input
                    className="luxury-input"
                    type="number"
                    min="1"
                    max="15"
                    value={dest.days}
                    onChange={(e) => updateDest(index, { days: e.target.value })}
                  />
                </div>
              </div>

              {dest.arrivalDate && (
                <div className="md-date-badge" style={{ marginBottom: 12 }}>
                  {dest.arrivalDate} → {dest.departureDate}
                </div>
              )}

              <div className="md-field" style={{ marginBottom: 12 }}>
                <span>How do you get here?</span>
                <div className="md-transport">
                  {transportOptions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        className={dest.transport === opt.mode ? "active" : ""}
                        onClick={() => updateDest(index, { transport: dest.transport === opt.mode ? "" : opt.mode })}
                      >
                        <Icon size={16} />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="md-field" style={{ marginBottom: 0 }}>
                <span>Notes for this stop (optional)</span>
                <input
                  className="luxury-input"
                  type="text"
                  value={dest.notes}
                  onChange={(e) => updateDest(index, { notes: e.target.value })}
                  placeholder="e.g. avoid weekends, must try the local thali..."
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="md-add-btn" onClick={addDestination}>
        <Plus size={18} /> Add another stop
      </button>

      {namedStops.length >= 3 && (
        <div className="md-optimize">
          <button
            type="button"
            className="btn-sand"
            style={{ padding: "12px 20px", borderRadius: 12, fontSize: 13 }}
            onClick={optimizeRoute}
            disabled={optimizing}
          >
            <Sparkles size={16} /> {optimizing ? "Optimising route…" : "Optimise route order"}
          </button>
          <small style={{ display: "block", marginTop: 8, color: "var(--text-secondary)" }}>
            Reorders stops to cut unnecessary travel kilometres.
          </small>
        </div>
      )}

      <div className="two-column-luxury">
        <div className="md-field">
          <span>How many are travelling?</span>
          <input
            className="luxury-input"
            type="number"
            min="1"
            max="20"
            value={numTravellers}
            onChange={(e) => setNumTravellers(e.target.value)}
          />
        </div>
        <div className="md-field">
          <span>Who are you travelling with?</span>
          <select className="luxury-select" value={travellerType} onChange={(e) => setTravellerType(e.target.value)}>
            <option value="">Select traveller type</option>
            {travellerTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      </div>

      <div className="md-field">
        <span>What's your budget per person?</span>
        <select className="luxury-select" value={budgetLevel} onChange={(e) => setBudgetLevel(e.target.value)}>
          <option value="">Select budget range</option>
          {budgetLevels.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
      </div>

      <div className="md-field">
        <span>What experiences seek you out?</span>
        <div className="luxury-chip-group">
          {interests.map((interest) => (
            <button
              key={interest}
              type="button"
              className={`luxury-chip ${interestSelection.includes(interest) ? "selected" : ""}`}
              onClick={() => toggleInterest(interest)}
            >
              {interest}
            </button>
          ))}
        </div>
      </div>

      <div className="two-column-luxury">
        <div className="md-field">
          <span>Dietary preference</span>
          <select className="luxury-select" value={dietaryPreference} onChange={(e) => setDietaryPreference(e.target.value)}>
            <option value="">No preference</option>
            {dietaryPreferences.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div className="md-field">
          <span>Accommodation style</span>
          <select className="luxury-select" value={accommodationType} onChange={(e) => setAccommodationType(e.target.value)}>
            <option value="">No preference</option>
            {accommodationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      </div>

      <div className="md-field">
        <span>The small, perfect detours (Special Requests)</span>
        <textarea
          className="luxury-input"
          style={{ resize: "none" }}
          rows="2"
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
          placeholder="Must-visit places, accessibility needs, anything specific..."
        />
      </div>

      <button className="btn-sand luxury-submit-btn" type="submit" disabled={!isValid}>
        Plan Multi-City Trip <ArrowUpRight size={18} />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18, color: "var(--text-secondary)", fontSize: 12 }}>
        <ArrowRight size={14} />
        <span>
          We chain {Math.max(namedStops.length, 1)} stop{namedStops.length === 1 ? "" : "s"} into one route — dates, transport
          links and budget split per leg.
        </span>
      </div>
    </form>
  );
}
