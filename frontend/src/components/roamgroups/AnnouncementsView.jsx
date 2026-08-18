import { useState } from "react";
import { Megaphone, Pin, Trash2 } from "lucide-react";
import { timeAgo } from "./groupsEngine";

export default function AnnouncementsView({ g, act }) {
  const [showSheet, setShowSheet] = useState(false);

  return (
    <div>
      <div className="rg-section" style={{ marginTop: 4 }}>
        <h2>Announcements</h2>
        {g.isAdmin && <button className="rg-btn rg-btn-sm rg-btn-primary" onClick={() => setShowSheet(true)}><Megaphone size={14} /> New</button>}
      </div>
      <p className="rg-hint" style={{ marginBottom: 12 }}>Pinned announcements sit at the top of the group for decisions, bookings and emergency info.</p>

      {(g.announcements || []).length === 0 && (
        <div className="rg-empty"><b>No announcements</b><p>Admins can pin important trip info here.</p></div>
      )}

      {(g.announcements || []).map((a) => (
        <div className="rg-ann" key={a.id}>
          <div className="rg-row" style={{ justifyContent: "space-between" }}>
            <div className="rg-ann-head"><Megaphone size={14} /> {a.title}</div>
            <div className="rg-row">
              <button className={`rg-chip ${a.pinned ? "gold" : ""}`} style={{ padding: "4px 9px", fontSize: 11 }} onClick={() => act.togglePinAnnouncement(a)}><Pin size={11} /> {a.pinned ? "Pinned" : "Pin"}</button>
              {g.isAdmin && <button className="rg-icon-btn" style={{ width: 30, height: 30 }} onClick={() => act.deleteAnnouncement(a)}><Trash2 size={13} /></button>}
            </div>
          </div>
          <div className="rg-ann-body">{a.body}</div>
          <div className="rg-sug-by" style={{ marginTop: 8 }}>{a.name} · {timeAgo(a.createdAt)} · {a.readBy?.length || 0} read</div>
        </div>
      ))}

      <div className="rg-section"><h2>⚡ Suggested pins</h2></div>
      {(g.messages || []).filter((m) => m.pinned).length === 0 ? (
        <p className="rg-hint">Pin a chat message from the message menu to surface it here for the whole group.</p>
      ) : (
        (g.messages || []).filter((m) => m.pinned).slice(0, 6).map((m) => (
          <div className="rg-pin-banner" key={m.id} onClick={() => act.openChat()}>
            <span style={{ fontSize: 16 }}>📌</span>
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{(g.members?.find((mem) => mem.id === m.uid)?.username || g.members?.find((mem) => mem.id === m.uid)?.name) || m.name}</b>
              <span className="rg-hint" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text || "Pinned item"}</span>
            </div>
          </div>
        ))
      )}

      {showSheet && (
        <div className="rg-overlay" onClick={() => setShowSheet(false)}>
          <div className="rg-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="rg-sheet-handle" />
            <h3 className="rg-sheet-title">New announcement</h3>
            <p className="rg-sheet-sub">On topic, on time — announcements are visible to every member.</p>
            <AnnForm onSave={(d) => { act.addAnnouncement(d); setShowSheet(false); }} onClose={() => setShowSheet(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function AnnForm({ onSave, onClose }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(true);
  const [err, setErr] = useState("");
  function submit() {
    if (!title.trim() || !body.trim()) return setErr("Both title and message are required.");
    onSave({ title: title.trim(), body: body.trim(), pinned });
  }
  return (
    <>
      <div className="rg-field">
        <span className="rg-label">Title</span>
        <input className="rg-input" placeholder="e.g. Trip Decision" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="rg-field">
        <span className="rg-label">Message</span>
        <textarea className="rg-textarea" placeholder="e.g. Everyone agreed to visit Dudhsagar Falls on Day 3." value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <label className="rg-list-row" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ accentColor: "#10b981" }} />
        <div className="rg-list-body"><div className="rg-list-name">Pin at the top of the group</div></div>
      </label>
      {err && <div className="rg-error" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="rg-row" style={{ gap: 10 }}>
        <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="rg-btn rg-btn-primary" style={{ flex: 1 }} onClick={submit}>Post</button>
      </div>
    </>
  );
}