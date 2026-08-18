import { useMemo, useState } from "react";
import { Plus, Trash2, Check, X, Clock, Lightbulb } from "lucide-react";
import { formatDate, timeAgo } from "./groupsEngine";

function SuggestionCard({ s, g, act }) {
  const voted = (s.votes || []).includes(g.self.id);
  const target = g.itinerary?.days?.find((d) => d.id === s.targetDayId);
  return (
    <div className="rg-sug">
      <span className="rg-act-ic">💡</span>
      <div className="rg-sug-body">
        <div className="rg-sug-text">
          <b>{(g.members?.find(m=>m.id===s.byUid)?.username || g.members?.find(m=>m.id===s.byUid)?.name || s.name)}</b> suggested{s.targetDayId ? ` for Day ${target ? target.dayNumber : "?"}` : ""}: “{s.text}”
        </div>
        <div className="rg-sug-by">{s.type} · {timeAgo(s.createdAt)}</div>
        <div className="rg-sug-votes">
          <button className={`rg-vote-btn ${voted ? "on up" : ""}`} disabled={s.status !== "open"} onClick={() => act.voteSuggestion(s, g.self.id)}><Check size={13} /> {s.votes.length}</button>
          <span className="rg-hint">approve</span>
          {g.isAdmin && s.status === "open" && (
            <>
              <button className="rg-btn rg-btn-sm rg-btn-primary" onClick={() => act.resolveSuggestion(s, "approved")}>Approve → itinerary</button>
              <button className="rg-btn rg-btn-sm rg-btn-danger" onClick={() => act.resolveSuggestion(s, "rejected")}>Reject</button>
            </>
          )}
          <span className={`rg-status-pill rg-st-${s.status === "approved" ? "ok" : s.status === "rejected" ? "danger" : "warn"}`}>{s.status}</span>
        </div>
      </div>
    </div>
  );
}

export default function ItineraryView({ g, act }) {
  const [showSug, setShowSug] = useState(false);
  const [dayOpen, setDayOpen] = useState(null);
  const days = g.itinerary?.days || [];
  const suggestions = (g.itinerary?.suggestions || []).filter((s) => s.status === "open");

  return (
    <div>
      <div className="rg-section" style={{ marginTop: 4 }}>
        <h2>Shared itinerary</h2>
        <button className="rg-btn rg-btn-sm rg-btn-primary" disabled={!g.canAddItinerary} onClick={() => setShowSug(true)}><Lightbulb size={14} /> Suggest change</button>
      </div>

      {days.length === 0 && (
        <div className="rg-empty"><b>No itinerary yet</b><p>Finalize places in the Places tab, then approve suggestions here. Admins can add stops directly.</p></div>
      )}

      {days.map((d, di) => (
        <div className="rg-day-card" key={d.id}>
          <div className="rg-day-head">
            <div className="rg-day-badge"><small>DAY</small>{d.dayNumber}</div>
            <div style={{ flex: 1 }}>
              <b>{formatDate(d.date)}</b>
              <div className="rg-day-date">{d.items.length} st{d.items.length === 1 ? "op" : "ops"}</div>
            </div>
            {g.isAdmin && (
              <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={() => act.addItineraryItem(d.id)}><Plus size={13} /> Add</button>
            )}
            <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={() => setDayOpen((v) => (v === d.id ? null : d.id))}>
              {dayOpen === d.id ? "▴" : "▾"}
            </button>
          </div>
          {(dayOpen === null || dayOpen === d.id) && (
            <div>
              {(d.items || []).map((it, i) => (
                <div className="rg-it-row" key={it.id}>
                  <span className="rg-it-time">{it.time || "TBD"}</span>
                  <div className="rg-it-main">
                    <div className="rg-it-title">{it.title}</div>
                    {it.note && <div className="rg-it-note">{it.note}</div>}
                    {it.estimate && <div className="rg-it-est">{it.estimate}</div>}
                  </div>
                  {g.isAdmin && <button className="rg-icon-btn" style={{ width: 30, height: 30 }} onClick={() => act.removeItineraryItem(d.id, it.id)}><Trash2 size={13} /></button>}
                </div>
              ))}
              {d.items.length === 0 && <p className="rg-hint" style={{ margin: "6px 0 4px 68px" }}>No stops planned yet.</p>}
            </div>
          )}
        </div>
      ))}

      {suggestions.length > 0 && (
        <>
          <div className="rg-section"><h2>Pending suggestions</h2></div>
          {suggestions.map((s) => <SuggestionCard key={s.id} s={s} g={g} act={act} />)}
        </>
      )}

      {showSug && (
        <SuggestionSheet days={days} self={g.self} onClose={() => setShowSug(false)}
          onSave={(d) => { act.addItinerarySuggestion(d); setShowSug(false); }} />
      )}
    </div>
  );
}

function SuggestionSheet({ days, self, onSave, onClose }) {
  const [text, setText] = useState("");
  const [type, setType] = useState("place");
  const [dayId, setDayId] = useState(days[0]?.id || "");
  const [err, setErr] = useState("");
  const types = [
    { id: "place", label: "Place" }, { id: "activity", label: "Activity" }, { id: "restaurant", label: "Restaurant" },
    { id: "hotel", label: "Hotel" }, { id: "travel", label: "Travel time" }, { id: "change", label: "Change to schedule" },
  ];
  return (
    <div className="rg-overlay" onClick={onClose}>
      <div className="rg-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rg-sheet-handle" />
        <h3 className="rg-sheet-title">Suggest an itinerary change</h3>
        <p className="rg-sheet-sub">The group votes — once approved, an admin adds it to the official itinerary.</p>
        <div className="rg-field">
          <span className="rg-label">What should change?</span>
          <textarea className="rg-textarea" placeholder='e.g. "Add Dudhsagar Falls on Day 3"' value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="rg-row" style={{ gap: 8 }}>
          <div className="rg-field" style={{ flex: 1 }}>
            <span className="rg-label">Kind</span>
            <select className="rg-select" value={type} onChange={(e) => setType(e.target.value)}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="rg-field" style={{ flex: 1 }}>
            <span className="rg-label">For day</span>
            <select className="rg-select" value={dayId} onChange={(e) => setDayId(e.target.value)}>
              {days.map((d) => <option key={d.id} value={d.id}>Day {d.dayNumber} · {formatDate(d.date)}</option>)}
            </select>
          </div>
        </div>
        {err && <div className="rg-error" style={{ marginBottom: 10 }}>{err}</div>}
        <div className="rg-row" style={{ gap: 10 }}>
          <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="rg-btn rg-btn-primary" style={{ flex: 1 }} onClick={() => {
            if (!text.trim()) return setErr("Describe the suggestion first.");
            onSave({ text: text.trim(), type, targetDayId: dayId || null });
          }}>Suggest</button>
        </div>
      </div>
    </div>
  );
}