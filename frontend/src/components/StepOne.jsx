import { useState, useEffect, useMemo } from "react";
import './LuxuryForms.css'; // Import the new luxury CSS
import { ArrowUpRight, AlertCircle, MapPinned, Route } from 'lucide-react';
import CitySearch from './CitySearch.jsx';
import MultiDestinationForm from './MultiDestinationForm.jsx';

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
  "Wellness & Yoga", "Spiritual & Religious", "Art & Culture", "Nightlife"
];
const dietaryPreferences = ["Vegetarian", "Non-Vegetarian", "Vegan", "Jain", "Halal"];
const accommodationTypes = ["Hotel", "Hostel", "Homestay", "Resort", "Camping"];

const emptyForm = {
  tripType: "single",
  destination: "", startDate: "", endDate: "", departureCity: "",
  numTravellers: "1", travellerType: "", budgetLevel: "", interests: [],
  dietaryPreference: "", accommodationType: "", specialRequests: "",
  startLocation: "", endLocation: "", destinations: []
};

function initialForm(initialValues) {
  try {
    const prefill = JSON.parse(localStorage.getItem("roam_prefill") || "null");
    if (prefill && typeof prefill === "object") {
      return { ...emptyForm, ...(initialValues || {}), ...prefill };
    }
  } catch (err) {
    console.error("Pre-fill read failed:", err);
  }
  return { ...emptyForm, ...(initialValues || {}) };
}

export default function StepOne({ initialValues, error, onSubmit, onRetry }) {
  const [values, setValues] = useState(initialForm(initialValues));
  const [touched, setTouched] = useState({});

  const isMulti = values.tripType === "multi";

  useEffect(() => {
    try {
      localStorage.removeItem("roam_prefill");
    } catch (err) {
      console.error("Pre-fill cleanup failed:", err);
    }
  }, []);

  // When switching to multi planning, seed a single slot from any prefilled data.
  useEffect(() => {
    if (isMulti && !values.startLocation && (!values.destinations || values.destinations.length === 0)) {
      setValues((current) => ({
        ...current,
        startLocation: current.departureCity || "",
        destinations: current.destination
          ? [{ id: "d1", name: current.destination, days: 2, transport: "", notes: "" }]
          : []
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMulti]);

  const errors = useMemo(() => validate(values), [values]);
  const isValid = Object.keys(errors).length === 0;

  function updateValue(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function toggleInterest(interest) {
    setValues((current) => {
      const selected = current.interests.includes(interest);
      return {
        ...current,
        interests: selected
          ? current.interests.filter((item) => item !== interest)
          : [...current.interests, interest]
      };
    });
  }

  function markTouched(name) {
    setTouched((current) => ({ ...current, [name]: true }));
  }

  function submitForm(event) {
    event.preventDefault();
    setTouched({
      destination: true, startDate: true, endDate: true, departureCity: true,
      numTravellers: true, travellerType: true, budgetLevel: true, interests: true
    });

    if (isValid) {
      onSubmit({
        ...values,
        numTravellers: Number(values.numTravellers)
      });
    }
  }

  if (isMulti) {
    return (
      <div className="luxury-page-wrapper">
        <header className="luxury-header">
          <span className="luxury-kicker">CONCIERGE DESK</span>
          <h1 className="luxury-title font-display">Craft your multi-city journey.</h1>
          <p className="luxury-subtitle">Weave several destinations into one seamless route — dates, transport and budget, all together.</p>
        </header>

        {error && (
          <div className="error-panel" style={{background: 'var(--danger)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px'}}>
            <AlertCircle color="#fff" />
            <div style={{color: '#fff'}}>
              <strong>{error}</strong>
              {onRetry && (
                <button type="button" className="btn-outline-sand ml-4" onClick={onRetry} style={{padding: '4px 12px', fontSize: '12px', color: '#fff', borderColor: '#fff'}}>
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        <div className="trip-type-wrap">
          <TripTypeToggle value="multi" onChange={(t) => updateValue("tripType", t)} />
        </div>

        <MultiDestinationForm
          initialValues={values}
          onSubmit={(payload) =>
            onSubmit({ ...values, ...payload, numTravellers: Number(payload.numTravellers), tripType: "multi" })
          }
        />
      </div>
    );
  }

  return (
    <div className="luxury-page-wrapper">
      <header className="luxury-header">
        <span className="luxury-kicker">CONCIERGE DESK</span>
        <h1 className="luxury-title font-display">Craft your India itinerary.</h1>
        <p className="luxury-subtitle">Tell us what you love, what you'd rather skip, and we'll compose the rest.</p>
      </header>

      {error && (
        <div className="error-panel" style={{background: 'var(--danger)', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px'}}>
          <AlertCircle color="#fff" />
          <div style={{color: '#fff'}}>
            <strong>{error}</strong>
            {onRetry && (
              <button type="button" className="btn-outline-sand ml-4" onClick={onRetry} style={{padding: '4px 12px', fontSize: '12px', color: '#fff', borderColor: '#fff'}}>
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      <div className="trip-type-wrap">
        <TripTypeToggle value="single" onChange={(t) => updateValue("tripType", t)} />
      </div>

      <form className="luxury-form" onSubmit={submitForm} noValidate>
        <Field label="Where is your heart pulling you?" error={touched.destination && errors.destination}>
          <CitySearch
            name="destination"
            onBlur={() => markTouched("destination")}
            onChange={(value) => updateValue("destination", value)}
            placeholder="e.g. Jaipur, Rajasthan"
            value={values.destination}
          />
        </Field>

        <div className="two-column-luxury">
          <Field label="When do you arrive?" error={touched.startDate && errors.startDate}>
            <input className="luxury-input" value={values.startDate} onChange={(e) => updateValue("startDate", e.target.value)} onBlur={() => markTouched("startDate")} type="date" />
          </Field>
          <Field label="When do you depart?" error={touched.endDate && errors.endDate}>
            <input className="luxury-input" value={values.endDate} onChange={(e) => updateValue("endDate", e.target.value)} onBlur={() => markTouched("endDate")} min={values.startDate} type="date" />
          </Field>
        </div>

        <Field label="Where does the journey begin?" error={touched.departureCity && errors.departureCity}>
          <CitySearch name="departureCity" onBlur={() => markTouched("departureCity")} onChange={(value) => updateValue("departureCity", value)} placeholder="e.g. Bengaluru, Karnataka" value={values.departureCity} />
        </Field>

        <div className="two-column-luxury">
          <Field label="How many are traveling?" error={touched.numTravellers && errors.numTravellers}>
            <input className="luxury-input" value={values.numTravellers} onChange={(e) => updateValue("numTravellers", e.target.value)} onBlur={() => markTouched("numTravellers")} type="number" min="1" max="20" />
          </Field>
          <Field label="Who are you traveling with?" error={touched.travellerType && errors.travellerType}>
            <select className="luxury-select" value={values.travellerType} onChange={(e) => updateValue("travellerType", e.target.value)} onBlur={() => markTouched("travellerType")}>
              <option value="">Select traveller type</option>
              {travellerTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
        </div>

        <Field label="What's your budget per person?" error={touched.budgetLevel && errors.budgetLevel}>
          <select className="luxury-select" value={values.budgetLevel} onChange={(e) => updateValue("budgetLevel", e.target.value)} onBlur={() => markTouched("budgetLevel")}>
            <option value="">Select budget range</option>
            {budgetLevels.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </Field>

        <Field label="What experiences seek you out?" error={touched.interests && errors.interests}>
          <div className="luxury-chip-grid" onBlur={() => markTouched("interests")}>
            {interests.map((interest) => (
              <button
                key={interest}
                type="button"
                className={`luxury-chip ${values.interests.includes(interest) ? "selected" : ""}`}
                onClick={() => toggleInterest(interest)}
              >
                {interest}
              </button>
            ))}
          </div>
        </Field>

        <div className="two-column-luxury">
          <Field label="Any dietary notes?">
            <select className="luxury-select" value={values.dietaryPreference} onChange={(e) => updateValue("dietaryPreference", e.target.value)}>
              <option value="">Select dietary preference</option>
              {dietaryPreferences.map((pref) => <option key={pref} value={pref}>{pref}</option>)}
            </select>
          </Field>
          <Field label="Where do you rest?">
            <select className="luxury-select" value={values.accommodationType} onChange={(e) => updateValue("accommodationType", e.target.value)}>
              <option value="">Select accommodation type</option>
              {accommodationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
        </div>

        <Field label="The small, perfect detours (Special Requests)">
          <textarea
            className="luxury-input"
            style={{resize: 'none'}}
            value={values.specialRequests}
            onChange={(e) => updateValue("specialRequests", e.target.value)}
            placeholder="Must-visit places, accessibility needs, anything specific..."
            rows="2"
          />
        </Field>

        <button className="btn-sand luxury-submit-btn" type="submit" disabled={!isValid}>
          Plan My Trip <ArrowUpRight size={18} />
        </button>
      </form>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="luxury-field">
      <span>{label}</span>
      {children}
      {error && <small className="luxury-error-text">{error}</small>}
    </label>
  );
}

function TripTypeToggle({ value, onChange }) {
  return (
    <div className="trip-type-toggle" role="radiogroup" aria-label="Trip type">
      <button
        type="button"
        role="radio"
        aria-checked={value === "single"}
        className={`trip-type-option ${value === "single" ? "active" : ""}`}
        onClick={() => onChange("single")}
      >
        <MapPinned size={18} />
        <span>
          <strong>Single Destination</strong>
          <small>One city, one plan</small>
        </span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "multi"}
        className={`trip-type-option ${value === "multi" ? "active" : ""}`}
        onClick={() => onChange("multi")}
      >
        <Route size={18} />
        <span>
          <strong>Multi-Destination</strong>
          <small>Several stops, one route</small>
        </span>
      </button>
    </div>
  );
}

function validate(values) {
  const nextErrors = {};
  const travellers = Number(values.numTravellers);

  if (!values.destination.trim()) nextErrors.destination = "Destination is required.";
  if (!values.startDate) nextErrors.startDate = "Start date is required.";
  if (!values.endDate) nextErrors.endDate = "End date is required.";
  if (values.startDate && values.endDate && new Date(values.endDate) < new Date(values.startDate)) {
    nextErrors.endDate = "End date cannot be before start date.";
  }
  if (!values.departureCity.trim()) nextErrors.departureCity = "Departure city is required.";
  if (!travellers || travellers < 1 || travellers > 20) {
    nextErrors.numTravellers = "Choose between 1 and 20 travellers.";
  }
  if (!values.travellerType) nextErrors.travellerType = "Traveller type is required.";
  if (!values.budgetLevel) nextErrors.budgetLevel = "Budget level is required.";
  if (!values.interests.length) nextErrors.interests = "Pick at least one interest.";

  return nextErrors;
}
