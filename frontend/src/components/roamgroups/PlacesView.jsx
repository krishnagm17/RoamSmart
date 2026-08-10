import { useMemo, useState } from "react";
import { MapPin, Heart, ThumbsDown, Check, Clock, CalendarRange } from "lucide-react";
import { placeNetVotes, placeStatusMeta, inr, formatDate } from "./groupsEngine";
import { PlaceSheet } from "./PollSheets";

function PlaceCard({ place, self, isAdmin, onVote, onFinalize, onAddToItinerary, onPoll, onAddToPoll }) {
  const net = placeNetVotes(place);
  const votedUp = place.upvotes.includes(self.id);
  const votedDown = place.downvotes.includes(self.id);
  const meta = placeStatusMeta(place);

  return (
    <div className="rg-place-card">
      {place.images && place.images[0] ? (
        <img className="rg-place-img" src={place.images[0]} alt={place.name} />
      ) : (
        <div className="rg-place-img" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>{place.emoji || "📍"}</div>
      )}
      <div className="rg-place-body">
        <div className="rg-row" style={{ justifyContent: "space-between" }}>
          <div className="rg-place-name">{place.name}</div>
          <span className={`rg-status-pill rg-st-${meta.tone}`}>{meta.label}</span>
        </div>
        {place.location && <div className="rg-place-loc"><MapPin size={12} /> {place.location}</div>}
        {place.description && <p className="rg-place-desc">{place.description}</p>}
        <div className="rg-place-meta">
          {place.rating > 0 && <div><b>Rating</b>⭐ {place.rating.toFixed(1)}</div>}
          {place.cost && <div><b>Est. cost</b>{inr(place.cost.replace(/[^0-9]/g, ""))}{place.cost.replace(/[^0-9]/g, "") ? "/person" : ""}</div>}
          {place.hours && <div><b>Hours</b>{place.hours}</div>}
          {place.duration && <div><b>Duration</b>{place.duration}</div>}
        </div>

        <div className="rg-place-actions">
          <button className={`rg-vote-btn ${votedUp ? "on up" : ""}`} onClick={() => onVote(place, "up")}><Heart size={14} /> {net}</button>
          <button className={`rg-vote-btn ${votedDown ? "on down" : ""}`} onClick={() => onVote(place, "down")}><ThumbsDown size={13} /></button>
          <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={() => onPoll(place)}>🗳️ Create poll</button>
          <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={() => onAddToItinerary(place)}>+ Itinerary</button>
        </div>

        {isAdmin && (
          <div className="rg-row" style={{ gap: 8, marginTop: 10 }}>
            <button className="rg-btn rg-btn-sm rg-btn-primary" disabled={place.status === "finalized"} onClick={() => onFinalize(place, "finalized")}><Check size={14} /> Finalize</button>
            <button className="rg-btn rg-btn-sm rg-btn-danger" disabled={place.status === "rejected"} onClick={() => onFinalize(place, "rejected")}>Reject</button>
            {place.status !== "voting" && <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={() => onFinalize(place, "voting")}>Open voting</button>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlacesView({ g, act }) {
  const [showSheet, setShowSheet] = useState(false);
  const { places } = g;
  const sorted = useMemo(() => [...places].sort((a, b) => placeNetVotes(b) - placeNetVotes(a)), [places]);
  const voting = sorted.filter((p) => p.status !== "finalized" && p.status !== "rejected");
  const decided = sorted.filter((p) => p.status === "finalized" || p.status === "rejected");

  return (
    <div>
      <div className="rg-section" style={{ marginTop: 4 }}>
        <h2>Places everyone wants to visit</h2>
        <button className="rg-btn rg-btn-sm rg-btn-primary" onClick={() => setShowSheet(true)}>📍 Suggest place</button>
      </div>
      <p className="rg-hint" style={{ marginBottom: 12 }}>
        Upvote/downvote suggestions. Admins finalize the winners — finalized places flow straight into the itinerary.
      </p>

      {sorted.length === 0 && (
        <div className="rg-empty"><b>No places yet</b><p>Share a destination with the group to start voting.</p></div>
      )}

      {voting.map((p) => (
        <PlaceCard key={p.id} place={p} self={g.self} isAdmin={g.isAdmin}
          onVote={act.togglePlaceVote} onFinalize={act.finalizePlace} onAddToItinerary={act.addPlaceToItinerary} onPoll={act.createPollFromPlace} onAddToPoll={act.addPlaceToPoll} />
      ))}

      {decided.length > 0 && (
        <>
          <div className="rg-section"><h2>Final decisions</h2></div>
          {decided.map((p) => (
            <div className="rg-list-row" key={p.id}>
              <span className="rg-act-ic">{p.status === "finalized" ? "✅" : "❌"}</span>
              <div className="rg-list-body">
                <div className="rg-list-name">{p.name}</div>
                <div className="rg-list-sub">{p.status === "finalized" ? "Finalized" : "Rejected"} · {placeNetVotes(p)} votes</div>
              </div>
            </div>
          ))}
        </>
      )}

      {showSheet && <PlaceSheet onClose={() => setShowSheet(false)} onSave={(data) => { act.addPlace(data); setShowSheet(false); }} />}
    </div>
  );
}