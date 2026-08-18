import { useState, useEffect, useMemo } from "react";
import DayRoutePanel from "./DayRoutePanel";
import DayPhotoGallery from "./DayPhotoGallery";
import PhotoUploader from "./PhotoUploader";
import { generateTripId } from "../hooks/usePhotos";
import { useCrowdPrediction } from "../hooks/useCrowdPrediction";
import CrowdBadge from "./CrowdBadge";
import CrowdDetailModal from "./CrowdDetailModal";

const tagClassMap = {
  visit: "visit",
  food: "food",
  travel: "travel",
  hotel: "hotel",
  activity: "activity"
};

export default function ItineraryResult({ itinerary, formData, api, onReset, showToast, userId, onSplitExpenses, onOpenSafety }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [photoUploaderOpen, setPhotoUploaderOpen] = useState(false);
  const [photoUploaderDay, setPhotoUploaderDay] = useState(null);

  const { predictions, loading, predictBatch } = useCrowdPrediction();
  const [selectedCrowdPlace, setSelectedCrowdPlace] = useState(null);
  const [crowdModalOpen, setCrowdModalOpen] = useState(false);
  const [backendSaved, setBackendSaved] = useState(false);

  function handleOpenCrowdDetail(prediction, placeName) {
    setSelectedCrowdPlace({ prediction, placeName });
    setCrowdModalOpen(true);
  }

  function getDateForDay(startDate, dayNumber) {
    if (!startDate) return new Date().toISOString().split('T')[0];
    const date = new Date(startDate);
    date.setDate(date.getDate() + dayNumber - 1);
    return date.toISOString().split('T')[0];
  }

  useEffect(() => {
    if (!itinerary || !itinerary.days) return;

    const allActivities = (itinerary.days || []).flatMap(day =>
      (day.activities || []).map(activity => ({
        placeName:   activity.name,
        placeType:   activity.type,
        destination: day.destination || formData?.destination || itinerary.destination || itinerary.startLocation || '',
        visitDate:   getDateForDay(formData?.startDate || itinerary.startDate || new Date().toISOString(), day.day),
        visitTime:   activity.time,
        cacheKey:    `${day.day}-${activity.name}`
      }))
    );

    predictBatch(allActivities);
  }, [itinerary, formData, predictBatch]);

  useEffect(() => {
    if (!itinerary || !userId || backendSaved) return;

    let active = true;
    const saveItinerary = async () => {
      try {
        await api.post("/api/itinerary/save", {
          userId,
          itinerary: {
            ...itinerary,
            startDate: formData?.startDate || itinerary.startDate || new Date().toISOString(),
            endDate: formData?.endDate || itinerary.endDate || new Date().toISOString(),
            destination: formData?.destination || itinerary.destination || itinerary.startLocation || (Array.isArray(itinerary.destinations) ? itinerary.destinations.map((d) => d.name).join(", ") : '') || ''
          }
        });
        if (active) {
          setBackendSaved(true);
          console.log("Itinerary automatically saved to backend for environmental alerts.");
        }
      } catch (err) {
        console.error("Failed to automatically save itinerary for monitoring:", err);
      }
    };

    saveItinerary();
    return () => {
      active = false;
    };
  }, [itinerary, userId, api, backendSaved, formData]);

  const isMulti = itinerary.tripType === "multi" || (Array.isArray(itinerary.destinations) && itinerary.destinations.length > 0);


  const effectiveFormData = {
    destination: formData?.destination || itinerary.destination || itinerary.startLocation || (Array.isArray(itinerary.destinations) ? itinerary.destinations.map((d) => d.name).join(", ") : "") || "India",
    startDate: formData?.startDate || itinerary.startDate || "",
    endDate: formData?.endDate || itinerary.endDate || "",
    numTravellers: formData?.numTravellers || itinerary.numTravellers || 2,
    budgetLevel: formData?.budgetLevel || itinerary.budgetLevel || "Standard",
    ...formData
  };

  const getDestinationForDay = (dayObj) => {
    if (isMulti && formData?.destinations?.length > 0) {
      let currentDay = 1;
      for (const dest of formData.destinations) {
        currentDay += Number(dest.days || 1);
        if (dayObj.day < currentDay) return dest.name;
      }
      return formData.destinations[formData.destinations.length - 1].name;
    }
    return effectiveFormData.destination;
  };

  const multiHotels = useMemo(() => {
    if (!isMulti) return [];
    return (itinerary.destinations || []).flatMap((dest) =>
      (dest.recommendations?.hotels || []).map((name) => ({ name, area: dest.name }))
    );
  }, [itinerary, isMulti]);

  const multiRestaurants = useMemo(() => {
    if (!isMulti) return [];
    return (itinerary.destinations || []).flatMap((dest) =>
      (dest.recommendations?.restaurants || []).map((name) => ({ name, area: dest.name }))
    );
  }, [itinerary, isMulti]);

  const hotels = isMulti ? multiHotels : (itinerary.hotels || []);
  const restaurants = isMulti ? multiRestaurants : (itinerary.restaurants || []);

  const tripId = effectiveFormData
    ? generateTripId(effectiveFormData.destination || itinerary.startLocation || '', effectiveFormData.startDate, effectiveFormData.endDate)
    : '';

  function openPhotoUploader(dayNumber) {
    setPhotoUploaderDay(dayNumber);
    setPhotoUploaderOpen(true);
  }

  async function sendQuestion(event) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || chatLoading) return;

    const nextHistory = [...history, { role: "user", text: trimmed }];
    setHistory(nextHistory);
    setQuestion("");
    setChatLoading(true);
    setChatError("");

    try {
      const response = await api.post("/api/chat", {
        itinerary,
        question: trimmed,
        history
      });
      setHistory([...nextHistory, { role: "model", text: response.data.answer }]);
    } catch (err) {
      setChatError(err.response?.data?.error || "Could not answer that question. Please try again.");
      setHistory(history);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="luxury-page-wrapper">
      <section className="luxury-header" style={{textAlign: 'center', marginBottom: '60px'}}>
        <span className="luxury-kicker">YOUR ITINERARY</span>
        <h1 className="luxury-title font-display" style={{fontSize: '56px'}}>{itinerary.title}</h1>
        <p className="luxury-subtitle" style={{marginBottom: '24px'}}>{itinerary.subtitle}</p>
        <div style={{display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap'}}>
          {(itinerary.tags || []).map((tag) => (
            <span key={tag} className="luxury-chip" style={{padding: '4px 16px', fontSize: '12px'}}>{tag}</span>
          ))}
        </div>
      </section>

      <section style={{display: 'flex', flexWrap: 'wrap', marginBottom: '40px', justifyContent: 'center'}} aria-label="Trip summary">
        {isMulti ? (
          <>
            <SummaryChip icon="ti-route" label={`${itinerary.startLocation || ''} → ${(itinerary.destinations || []).map((d) => d.name).join(' → ')}${itinerary.endLocation && itinerary.endLocation !== itinerary.startLocation ? ` → ${itinerary.endLocation}` : ''}`} />
            {effectiveFormData.startDate && <SummaryChip icon="ti-calendar" label={`${effectiveFormData.startDate} to ${effectiveFormData.endDate}`} />}
            <SummaryChip icon="ti-users" label={`${effectiveFormData.numTravellers} travellers`} />
            <SummaryChip icon="ti-wallet" label={effectiveFormData.budgetLevel} />
          </>
        ) : (
          <>
            <SummaryChip icon="ti-map-pin" label={effectiveFormData.destination} />
            {effectiveFormData.startDate && <SummaryChip icon="ti-calendar" label={`${effectiveFormData.startDate} to ${effectiveFormData.endDate}`} />}
            <SummaryChip icon="ti-users" label={`${effectiveFormData.numTravellers} travellers`} />
            <SummaryChip icon="ti-wallet" label={effectiveFormData.budgetLevel} />
          </>
        )}
      </section>

      {onOpenSafety && (
        <div style={{textAlign: 'center', marginBottom: '40px'}}>
          <button type="button" className="btn-sand" style={{padding: '14px 28px'}} onClick={onOpenSafety}>
            🛡️ Travel Safety Check
          </button>
        </div>
      )}

      <CrowdOverviewCard 
        itinerary={itinerary}
        predictions={predictions}
        formData={effectiveFormData}
      />

      <Section title="Your Route Map" icon="ti-map-2">
        <DayRoutePanel
          days={itinerary.days || []}
          destination={effectiveFormData.destination}
          getDestination={getDestinationForDay}
        />
      </Section>

      <Section title="How to Reach" icon="ti-route">
        <div className="glass-surface" style={{padding: '24px', borderRadius: '12px'}}>
          <div className="font-display italic text-sand" style={{fontSize: '20px', marginBottom: '12px'}}>{itinerary.howToReach?.mode}</div>
          <p style={{color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px'}}>{itinerary.howToReach?.description}</p>
          <div style={{display: 'flex', gap: '24px', color: 'var(--text-primary)', fontSize: '14px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px'}}>
            <span style={{display: 'flex', alignItems: 'center', gap: '8px'}}><i className="ti ti-clock" aria-hidden="true" /> {itinerary.howToReach?.duration}</span>
            <span style={{display: 'flex', alignItems: 'center', gap: '8px'}}><i className="ti ti-cash" aria-hidden="true" /> {itinerary.howToReach?.estimatedCost}</span>
          </div>
        </div>
      </Section>

      {isMulti && (
        <Section title="Your Stops" icon="ti-map-pin">
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px'}}>
            {(itinerary.destinations || []).map((dest, index) => (
              <article className="glass-surface" style={{padding: '20px', borderRadius: '12px'}} key={dest.id || index}>
                <span className="font-mono text-sand" style={{fontSize: '11px', letterSpacing: '1px'}}>STOP {index + 1}</span>
                <h3 className="font-display" style={{fontSize: '20px', color: 'var(--text-primary)', margin: '6px 0'}}>{dest.name}</h3>
                <p style={{fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px'}}>{dest.tagline}</p>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                  <span className="luxury-chip" style={{fontSize: '11px'}}>{dest.days} day{dest.days === 1 ? '' : 's'}</span>
                  {dest.transport && <span className="luxury-chip" style={{fontSize: '11px', textTransform: 'capitalize'}}>{dest.transport}</span>}
                  {dest.estimatedBudget && dest.estimatedBudget !== '—' && <span className="luxury-chip" style={{fontSize: '11px'}}>{dest.estimatedBudget}</span>}
                  {dest.weather?.available && (
                    <span className="luxury-chip" style={{fontSize: '11px', textTransform: 'capitalize'}}>
                      {dest.weather.condition} · {dest.weather.temperature}°C
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </Section>
      )}

      {isMulti && (
        <Section title="Route at a Glance" icon="ti-map-2">
          <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
            {(itinerary.travelLegs || []).map((leg, index) => (
              <div className="glass-surface" style={{padding: '16px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}} key={index}>
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}>
                  <span style={{color: 'var(--text-primary)'}}>{leg.from}</span>
                  <span className="text-sand" aria-hidden="true">→</span>
                  <span style={{color: 'var(--text-primary)'}}>{leg.to}</span>
                  <span className="luxury-chip" style={{fontSize: '11px', textTransform: 'uppercase'}}>{leg.selected?.name || leg.transport || 'Local transport'}</span>
                </div>
                <div style={{textAlign: 'right', color: 'var(--text-secondary)', fontSize: '13px'}}>
                  <div>{leg.distanceKm != null ? `${leg.distanceKm} km` : '—'} · {leg.travelTime || '—'}</div>
                  {leg.selected?.estimatedCost && <div className="text-sand">{leg.selected.estimatedCost}</div>}
                </div>
              </div>
            ))}
            {itinerary.totalDistanceKm != null && (
              <p style={{color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'right', margin: 0}}>Total ~{itinerary.totalDistanceKm} km across all legs</p>
            )}
          </div>
        </Section>
      )}

      <Section title="Day-by-Day Plan" icon="ti-calendar-time">
        <div style={{display: 'flex', flexDirection: 'column', gap: '40px'}}>
          {(itinerary.days || []).map((day, index) => {
            const prevDay = (itinerary.days || [])[index - 1];
            const showStopHeader = isMulti && day.destination && (!prevDay || prevDay.destination !== day.destination);
            const stopInfo = showStopHeader
              ? (itinerary.destinations || []).find((d) => d.name === day.destination)
              : null;
            return (
              <div key={day.day}>
                {showStopHeader && (
                  <div style={{display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', flexWrap: 'wrap'}}>
                    <span className="font-mono text-sand" style={{fontSize: '13px', letterSpacing: '1px'}}>STOP {(itinerary.destinations || []).findIndex((d) => d.name === day.destination) + 1}</span>
                    <h3 className="font-display" style={{fontSize: '34px', color: 'var(--text-primary)', margin: 0}}>{day.destination}</h3>
                    {stopInfo?.tagline && <span style={{color: 'var(--text-secondary)', fontSize: '14px', fontStyle: 'italic'}}>{stopInfo.tagline}</span>}
                    {stopInfo?.weather?.available && (
                      <span className="luxury-chip" style={{fontSize: '11px', textTransform: 'capitalize'}}>{stopInfo.weather.condition} · {stopInfo.weather.temperature}°C</span>
                    )}
                  </div>
                )}
                <article className="glass-surface" style={{padding: '32px', borderRadius: '16px'}}>
                  <header style={{marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '24px'}}>
                    <span className="font-mono text-sand" style={{fontSize: '12px', letterSpacing: '1px'}}>DAY {day.day}</span>
                    <h3 className="font-display" style={{fontSize: '28px', color: 'var(--text-primary)', marginTop: '8px'}}>{day.theme}</h3>
                  </header>
              <DayConditionStrip
                destination={getDestinationForDay(day)}
                date={getDateForDay(effectiveFormData.startDate, day.day)}
                showToast={showToast}
                api={api}
              />
              <div style={{background: 'rgba(212, 184, 134, 0.1)', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px', marginBottom: '32px', color: 'var(--text-secondary)'}}>
                <i className="ti ti-bulb text-sand" style={{fontSize: '20px'}} aria-hidden="true" />
                <p style={{fontSize: '14px', lineHeight: 1.5, margin: 0}}>{day.localSecret}</p>
              </div>
              <div style={{display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '32px'}}>
                {(day.activities || []).map((activity, index) => {
                  const tagClass = tagClassMap[String(activity.type || "").toLowerCase()] || "activity";
                  return (
                    <div key={`${day.day}-${activity.time}-${index}`} style={{display: 'flex', gap: '24px'}}>
                      <div style={{width: '80px', flexShrink: 0, textAlign: 'right'}}>
                        <time className="font-mono" style={{fontSize: '13px', color: 'var(--text-secondary)'}}>{activity.time}</time>
                      </div>
                      <div style={{flexGrow: 1, paddingBottom: '24px', borderBottom: index < (day.activities || []).length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px'}}>
                          <h4 className="font-display" style={{fontSize: '20px', color: 'var(--text-primary)', margin: 0}}>{activity.name}</h4>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <span className="luxury-chip" style={{fontSize: '11px', textTransform: 'uppercase'}}>{activity.type}</span>
                            <CrowdBadge
                              prediction={predictions[`${day.day}-${activity.name}`]}
                              isLoading={loading[`${day.day}-${activity.name}`]}
                              onPress={() => handleOpenCrowdDetail(predictions[`${day.day}-${activity.name}`], activity.name)}
                            />
                          </div>
                        </div>
                        <p style={{color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, marginBottom: '12px'}}>{activity.description}</p>
                        <strong className="text-sand" style={{fontSize: '14px', fontWeight: 500}}>{activity.estimatedCost}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
              <DayPhotoGallery
                tripId={tripId}
                dayNumber={day.day}
                destination={getDestinationForDay(day)}
                formData={effectiveFormData}
                activities={day.activities || []}
                onAddPhoto={openPhotoUploader}
              />
                </article>
              </div>
            );
          })}
        </div>
      </Section>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px'}}>
        <Section title="Hotels" icon="ti-building-skyscraper">
          <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
            {hotels.map((hotel) => (
              <article className="glass-surface" style={{padding: '24px', borderRadius: '12px'}} key={hotel.name}>
                <div style={{marginBottom: '16px'}}>
                  <h3 className="font-display" style={{fontSize: '22px', color: 'var(--text-primary)', marginBottom: '4px'}}>{hotel.name}</h3>
                  <p className="font-mono text-secondary" style={{fontSize: '12px'}}>{hotel.area}</p>
                </div>
                {hotel.stars != null && (
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                    <span className="text-sand" style={{letterSpacing: '2px'}}>{renderStars(hotel.stars)}</span>
                    <strong style={{color: 'var(--text-primary)'}}>{hotel.pricePerNight}</strong>
                  </div>
                )}
                {hotel.whyRecommended && (
                  <p style={{fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0}}>{hotel.whyRecommended}</p>
                )}
              </article>
            ))}
          </div>
        </Section>

        <Section title="Restaurants" icon="ti-tools-kitchen-2">
          <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
            {restaurants.map((restaurant) => (
              <article className="glass-surface" style={{padding: '24px', borderRadius: '12px'}} key={restaurant.name}>
                <div style={{marginBottom: '16px'}}>
                  <h3 className="font-display" style={{fontSize: '22px', color: 'var(--text-primary)', marginBottom: '4px'}}>{restaurant.name}</h3>
                  <p className="font-mono text-secondary" style={{fontSize: '12px'}}>{restaurant.area}{restaurant.cuisine ? ` · ${restaurant.cuisine}` : ''}</p>
                </div>
                {restaurant.mustTry && (
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px'}}>
                    <span className="text-sand" style={{fontSize: '13px'}}>{restaurant.mustTry}</span>
                    <strong style={{color: 'var(--text-primary)'}}>{restaurant.priceForTwo}</strong>
                  </div>
                )}
              </article>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Budget Breakdown" icon="ti-report-money">
        <div className="glass-surface" style={{borderRadius: '12px', overflow: 'hidden'}}>
          {budgetRows(itinerary.budget).map(([label, value], index) => (
            <div key={label} style={{display: 'flex', justifyContent: 'space-between', padding: '16px 24px', borderBottom: index < budgetRows(itinerary.budget).length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}}>
              <span style={{color: 'var(--text-secondary)'}}>{label}</span>
              <strong className="font-mono text-sand">{value}</strong>
            </div>
          ))}
        </div>

        {isMulti && itinerary.perDestinationBudget && Object.keys(itinerary.perDestinationBudget).length > 0 && (
          <div style={{marginTop: '20px'}}>
            <h3 className="font-display" style={{fontSize: '18px', color: 'var(--text-primary)', margin: '0 0 12px'}}>Estimated per destination</h3>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
              {Object.entries(itinerary.perDestinationBudget).map(([name, cost]) => (
                <div key={name} style={{display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px'}}>
                  <span style={{color: 'var(--text-secondary)'}}>{name}</span>
                  <strong className="font-mono text-sand">{cost}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '40px'}}>
        <Section title="Local Insider Tips" icon="ti-map-2">
          <ul style={{listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px'}}>
            {(itinerary.tips || []).map((tip) => (
              <li key={tip} style={{display: 'flex', gap: '12px', color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5}}>
                <i className="ti ti-check text-sand" style={{marginTop: '2px'}} aria-hidden="true" />
                {tip}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Best Time & Safety" icon="ti-shield-heart">
          <div className="glass-surface" style={{padding: '24px', borderRadius: '12px', marginBottom: '16px'}}>
            <h3 className="font-display italic text-sand" style={{fontSize: '20px', marginBottom: '8px'}}>Best time to visit</h3>
            <p style={{color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, margin: 0}}>{itinerary.bestTimeToVisit}</p>
          </div>
          <div className="glass-surface" style={{padding: '24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
            <h3 className="font-display italic text-sand" style={{fontSize: '20px', margin: 0}}>Emergency numbers</h3>
            <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px'}}><span>Police:</span> <span className="font-mono">{itinerary.emergencyNumbers?.police || "100"}</span></div>
            <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px'}}><span>Ambulance:</span> <span className="font-mono">{itinerary.emergencyNumbers?.ambulance || "108"}</span></div>
            <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '14px'}}><span>Tourist Helpline:</span> <span className="font-mono">{itinerary.emergencyNumbers?.touristHelpline || "1363"}</span></div>
          </div>
        </Section>
      </div>

      <div style={{display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '60px'}}>
        <button type="button" className="btn-outline-sand" onClick={onReset} style={{padding: '16px 32px'}}>
          <i className="ti ti-refresh" aria-hidden="true" />
          Plan Another Trip
        </button>
        <button type="button" className="btn-sand" onClick={() => setChatOpen((open) => !open)} style={{padding: '16px 32px'}}>
          <i className="ti ti-message-circle-question" aria-hidden="true" />
          Ask a Question ↗
        </button>
      </div>

      {chatOpen && (
        <section className="chat-panel" aria-label="Ask a follow-up question">
          <div className="chat-messages">
            {history.length === 0 && <p className="empty-chat">Ask about timing, budget, restaurants, packing, or route changes.</p>}
            {history.map((message, index) => (
              <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>
                {message.text}
              </div>
            ))}
            {chatLoading && <div className="chat-bubble model">Thinking through your trip…</div>}
          </div>
          {chatError && <p className="field-error">{chatError}</p>}
          <form className="chat-form" onSubmit={sendQuestion}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a follow-up question"
              type="text"
            />
            <button type="submit" className="primary-button icon-button" disabled={!question.trim() || chatLoading}>
              <i className="ti ti-send" aria-hidden="true" />
              <span className="sr-only">Send</span>
            </button>
          </form>
        </section>
      )}

      <PhotoUploader
        isOpen={photoUploaderOpen}
        onClose={() => setPhotoUploaderOpen(false)}
        tripId={tripId}
        destination={isMulti && photoUploaderDay
          ? (itinerary.days || []).find((d) => Number(d.day) === Number(photoUploaderDay))?.destination || itinerary.startLocation
          : formData?.destination}
        formData={{ ...formData, days: itinerary.days }}
        dayNumber={photoUploaderDay}
        showToast={showToast}
      />

      <CrowdDetailModal
        prediction={selectedCrowdPlace?.prediction}
        placeName={selectedCrowdPlace?.placeName || ''}
        isOpen={crowdModalOpen}
        onClose={() => setCrowdModalOpen(false)}
        isLoading={false}
      />
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <section className="glass-surface" style={{padding: '32px', borderRadius: '16px', marginBottom: '24px'}}>
      <h2 className="font-display" style={{fontSize: '28px', color: 'var(--text-primary)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px'}}>
        <i className={`ti ${icon} text-sand`} aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}

function SummaryChip({ icon, label }) {
  return (
    <span className="luxury-chip" style={{fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(212, 184, 134, 0.1)', border: '1px solid rgba(212, 184, 134, 0.2)', padding: '8px 16px', marginRight: '12px', marginBottom: '12px'}}>
      <i className={`ti ${icon} text-sand`} aria-hidden="true" />
      {label}
    </span>
  );
}

function renderStars(stars = 0) {
  return "★".repeat(Number(stars) || 0);
}

function budgetRows(budget = {}) {
  const single = [
    ["Accommodation total", budget.accommodation],
    ["Food per day", budget.food],
    ["Local transport total", budget.localTransport],
    ["Activities total", budget.activities],
    ["Travel to destination", budget.travelToDestination],
    ["Grand total", budget.grandTotal]
  ].filter(([, value]) => value);

  if (budget.transportation || budget.entryFees) {
    return [
      ["Accommodation", budget.accommodation],
      ["Transportation (all legs)", budget.transportation],
      ["Food", budget.food],
      ["Activities", budget.activities],
      ["Entry fees", budget.entryFees],
      ["Shopping", budget.shopping],
      ["Miscellaneous", budget.miscellaneous],
      ["Grand total", budget.grandTotal]
    ].filter(([, value]) => value);
  }

  return single;
}

function CrowdOverviewCard({ itinerary, predictions, formData }) {
  if (!itinerary || !itinerary.days) return null;

  const getDayLabel = (score) => {
    if (score <= 25) return 'Mostly Low';
    if (score <= 50) return 'Mixed';
    if (score <= 75) return 'Mostly High';
    return 'Very High crowds';
  };

  const getDayRatingColor = (score) => {
    if (score <= 25) return '#52b788';
    if (score <= 50) return '#f4a261';
    if (score <= 75) return '#e76f51';
    return '#e63946';
  };

  const daySummaries = (itinerary.days || []).map(day => {
    let totalScore = 0;
    let count = 0;
    (day.activities || []).forEach(act => {
      const pred = predictions[`${day.day}-${act.name}`];
      if (pred && typeof pred.overallScore === 'number') {
        totalScore += pred.overallScore;
        count++;
      }
    });
    const avgScore = count > 0 ? Math.round(totalScore / count) : null;
    return {
      day: day.day,
      avgScore,
      label: avgScore !== null ? getDayLabel(avgScore) : 'Calculating...',
      color: avgScore !== null ? getDayRatingColor(avgScore) : '#e0e0e0'
    };
  });

  let totalHighStops = 0;
  let worstDayOfWeek = '';
  
  (itinerary.days || []).forEach(day => {
    (day.activities || []).forEach(act => {
      const pred = predictions[`${day.day}-${act.name}`];
      if (pred && (pred.overallLevel === 'High' || pred.overallLevel === 'Very High')) {
        totalHighStops++;
        if (pred.visitDay) {
          worstDayOfWeek = pred.visitDay;
        }
      }
    });
  });

  const hasPredictions = daySummaries.some(d => d.avgScore !== null);

  return (
    <section className="glass-surface" style={{ padding: '32px', borderRadius: '16px', marginBottom: '24px' }}>
      <h3 className="font-display" style={{ margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '24px', color: 'var(--text-primary)' }}>
        <i className="ti ti-users text-sand" aria-hidden="true" />
        Crowd Overview
      </h3>
      
      {!hasPredictions ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <div style={{width: '24px', height: '24px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite'}} />
          <span className="font-mono">ANALYZING CROWD SIGNALS...</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {daySummaries.map(daySum => (
            <div key={daySum.day} style={{ display: 'flex', alignItems: 'center', fontSize: '14px', height: '24px' }}>
              <span className="font-mono" style={{ width: '60px', color: 'var(--text-primary)' }}>DAY {daySum.day}</span>
              
              <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', margin: '0 16px' }}>
                {daySum.avgScore !== null && (
                  <div 
                    style={{ 
                      height: '100%', 
                      width: `${daySum.avgScore}%`, 
                      background: daySum.color,
                      borderRadius: '3px',
                      transition: 'width 0.4s ease'
                    }} 
                  />
                )}
              </div>
              
              <span className="font-mono" style={{ width: '120px', textAlign: 'right', color: daySum.avgScore !== null ? daySum.color : 'var(--text-secondary)', fontSize: '12px' }}>
                {daySum.label.toUpperCase()}
              </span>
            </div>
          ))}

          {totalHighStops > 0 && (
            <div 
              style={{ 
                marginTop: '16px', 
                padding: '16px', 
                borderRadius: '8px', 
                background: 'rgba(230, 57, 70, 0.1)', 
                borderLeft: '2px solid #e63946', 
                fontSize: '13px', 
                color: '#e63946', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px' 
              }}
            >
              <i className="ti ti-alert-triangle" style={{fontSize: '18px'}} aria-hidden="true" />
              <span>
                {worstDayOfWeek ? `${worstDayOfWeek}` : 'Planned dates'} has high crowds at {totalHighStops} of your planned stop{totalHighStops !== 1 ? 's' : ''}.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Live travel-condition strip for one day's destination.
function DayConditionStrip({ destination, date, showToast, api }) {
  const [state, setState] = useState({ loading: false, data: null, error: "" });

  useEffect(() => {
    if (!destination) return;
    let active = true;
    setState({ loading: true, data: null, error: "" });
    api.post("/api/travel-conditions", {
      destination,
      date: date || new Date().toISOString().split("T")[0]
    }).then((res) => {
      if (!active) return;
      setState({ loading: false, data: res.data });
    }).catch((err) => {
      if (!active) return;
      setState({ loading: false, error: err.response?.data?.error || "Condition data unavailable" });
    });
    return () => { active = false; };
  }, [destination, date]);

  if (!destination) return null;

  const w = state.data?.weather || {};
  const aqi = state.data?.aqi || {};
  const crowd = state.data?.crowd || {};

  return (
    <div className="glass-surface" style={{ padding: '14px 16px', borderRadius: '12px', marginBottom: '24px', fontSize: '13px', color: 'var(--text-secondary)' }}>
      {state.loading ? (
        <span className="font-mono" style={{ fontSize: '12px' }}>CHECKING CONDITIONS AT {destination.toUpperCase()}...</span>
      ) : state.error ? (
        <span style={{ fontSize: '12.5px' }}>⚠️ Travel conditions unavailable — check local advisories before heading out.</span>
      ) : (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{destination.split(',')[0]}</span>
          <span><i className="ti ti-cloud-rain" aria-hidden="true" /> {w.maxTemp != null ? `${w.maxTemp.toFixed(0)}°C` : '—'} {w.mainCondition ? `· ${w.mainCondition}` : ''} {w.maxRain != null && w.maxRain > 0 ? `· ${w.maxRain.toFixed(0)}mm rain` : ''}</span>
          <span><i className="ti ti-wind" aria-hidden="true" /> AQI {aqi.aqi ?? '—'}{aqi.pollutant ? ` (${aqi.pollutant.toUpperCase()})` : ''}</span>
          <span><i className="ti ti-users" aria-hidden="true" /> Crowd {crowd.crowdScore != null ? `${crowd.crowdScore}/100` : '—'}</span>
          {w.hasStorm && <span className="text-warning" style={{ fontWeight: 600 }}>⚠️ Thunderstorm possible</span>}
          {aqi.aqi >= 150 && <span className="text-warning" style={{ fontWeight: 600 }}>⚠️ Unhealthy air</span>}
        </div>
      )}
    </div>
  );
}

