import { useState } from "react";
import { Plus, Trash2, ImagePlus } from "lucide-react";
import { compressToDataUrl } from "../roamsplit/splitEngine";
import { POLL_TYPES } from "./groupsEngine";
import { Overlay } from "./Sheets";

// ═══ CREATE POLL ═══════════════════════════════════════════
export function PollSheet({ self, canCreate, onSave, onClose }) {
  const [kind, setKind] = useState("destination");
  const [title, setTitle] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [type, setType] = useState("single");
  const [anonymous, setAnonymous] = useState(false);
  const [allowChange, setAllowChange] = useState(true);
  const [deadline, setDeadline] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    if (!canCreate) return setErr("You don't have permission to create polls in this group.");
    if (!title.trim()) return setErr("Give the poll a question.");
    const clean = opts.map((o) => o.trim()).filter(Boolean);
    if (clean.length < 2) return setErr("Add at least 2 options.");
    onSave({ kind, title, options: Array.from(new Set(clean)), type, anonymous, allowChange, deadline: deadline || null });
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="rg-sheet-title">New poll</h3>
      <p className="rg-sheet-sub">Turn a discussion into a decision — everyone votes, the group moves on.</p>

      <div className="rg-field">
        <span className="rg-label">Poll type</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(POLL_TYPES).map(([k, v]) => (
            <button key={k} className={`rg-chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)} type="button">
              {v.icon} {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rg-field">
        <span className="rg-label">Question</span>
        <input className="rg-input" placeholder="e.g. Where should we go on Day 2?" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="rg-field">
        <span className="rg-label">Options</span>
        {opts.map((o, i) => (
          <div key={i} className="rg-row" style={{ gap: 8, marginBottom: 8 }}>
            <input className="rg-input" style={{ flex: 1 }} value={o} placeholder={`Option ${i + 1}`} onChange={(e) => setOpts((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
            {opts.length > 2 && <button className="rg-icon-btn" onClick={() => setOpts((p) => p.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}
          </div>
        ))}
        <button className="rg-btn rg-btn-ghost rg-btn-sm" onClick={() => setOpts((p) => [...p, ""])}><Plus size={14} /> Add option</button>
      </div>

      <div className="rg-field">
        <span className="rg-label">Voting</span>
        <div className="rg-row" style={{ gap: 8 }}>
          <button className={`rg-chip ${type === "single" ? "on" : ""}`} onClick={() => setType("single")}>Single choice</button>
          <button className={`rg-chip ${type === "multiple" ? "on" : ""}`} onClick={() => setType("multiple")}>Multiple choice</button>
          <button className={`rg-chip ${anonymous ? "on" : ""}`} onClick={() => setAnonymous((v) => !v)}>🙈 Anonymous</button>
          <button className={`rg-chip ${allowChange ? "on" : ""}`} onClick={() => setAllowChange((v) => !v)}>Allow vote change</button>
        </div>
      </div>

      <div className="rg-field">
        <span className="rg-label">Poll ends (optional)</span>
        <input className="rg-input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </div>

      {err && <div className="rg-error" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="rg-row" style={{ gap: 10 }}>
        <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="rg-btn rg-btn-primary" style={{ flex: 1 }} onClick={submit}>Create poll</button>
      </div>
    </Overlay>
  );
}

// ═══ SHARE PLACE ═══════════════════════════════════════════
const PLACE_EMOJI = ["📍", "🏖️", "⛰️", "🏛️", "🌊", "🛕", "🎡", "🌄"];
export function PlaceSheet({ onSave, onClose }) {
  const [p, setP] = useState({ name: "", emoji: "📍", location: "", description: "", rating: "", cost: "", hours: "", duration: "", mapText: "", image: null });
  const [err, setErr] = useState("");
  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }));

  async function pickImage(file) {
    if (!file) return;
    set("image", await compressToDataUrl(file, 700, 0.7));
  }

  function submit() {
    if (!p.name.trim()) return setErr("Place name is required.");
    onSave(p);
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="rg-sheet-title">Share a place</h3>
      <p className="rg-sheet-sub">Members suggest, vote and finalize places together — final picks move into the itinerary.</p>

      <div className="rg-field">
        <span className="rg-label">Place name</span>
        <div className="rg-row" style={{ gap: 8 }}>
          <input className="rg-input" style={{ flex: 1 }} placeholder="e.g. Dudhsagar Falls" value={p.name} onChange={(e) => set("name", e.target.value)} />
        </div>
      </div>
      <div className="rg-row" style={{ gap: 8, marginBottom: 14 }}>
        {PLACE_EMOJI.map((e) => (
          <button key={e} className={`rg-chip ${p.emoji === e ? "on" : ""}`} onClick={() => set("emoji", e)}>{e}</button>
        ))}
      </div>
      <div className="rg-field">
        <span className="rg-label">Location</span>
        <input className="rg-input" placeholder="e.g. Mollem, Goa" value={p.location} onChange={(e) => set("location", e.target.value)} />
      </div>

      <ImageArea current={p.image} onPick={pickImage} />

      <div className="rg-field">
        <span className="rg-label">Description</span>
        <textarea className="rg-textarea" placeholder="What makes this a must-visit? Timings, crowds, tips…" value={p.description} onChange={(e) => set("description", e.target.value)} />
      </div>

      <div className="rg-row" style={{ gap: 8 }}>
        <div className="rg-field" style={{ flex: 1 }}>
          <span className="rg-label">Rating (0–5)</span>
          <input className="rg-input" type="number" min="0" max="5" step="0.1" value={p.rating} onChange={(e) => set("rating", e.target.value)} />
        </div>
        <div className="rg-field" style={{ flex: 1 }}>
          <span className="rg-label">Est. cost (₹)</span>
          <input className="rg-input" placeholder="e.g. 800/person" value={p.cost} onChange={(e) => set("cost", e.target.value)} />
        </div>
        <div className="rg-field" style={{ flex: 1 }}>
          <span className="rg-label">Duration</span>
          <input className="rg-input" placeholder="e.g. 3 hrs" value={p.duration} onChange={(e) => set("duration", e.target.value)} />
        </div>
      </div>

      <div className="rg-field">
        <span className="rg-label">Opening hours / map note</span>
        <input className="rg-input" placeholder="e.g. 8 AM – 5 PM · 20 km from Panaji" value={p.hours} onChange={(e) => set("hours", e.target.value)} />
      </div>

      {err && <div className="rg-error" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="rg-row" style={{ gap: 10 }}>
        <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="rg-btn rg-btn-primary" style={{ flex: 1 }} onClick={submit}>Suggest place</button>
      </div>
    </Overlay>
  );
}

function ImageArea({ current, onPick }) {
  return (
    <div className="rg-field">
      <span className="rg-label">Photo (optional)</span>
      <label className="rg-input" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: 10 }}>
        {current ? <img src={current} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover" }} /> : <ImagePlus size={18} />}
        <span className="rg-hint">{current ? "Tap to change" : "Tap to add a photo"}</span>
        <input type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files && e.target.files[0])} />
      </label>
    </div>
  );
}

// ═══ SHARE FILE / LINK ═════════════════════════════════════
export function FileSheet({ onSave, onClose }) {
  const [tab, setTab] = useState("upload");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [type, setType] = useState("image");
  const [err, setErr] = useState("");

  async function onFile(f) {
    if (!f) return;
    setType(f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "document");
    setName(f.name);
    if (f.size < 400 * 1024) {
      const reader = new FileReader();
      reader.onload = () => setDataUrl(String(reader.result));
      reader.readAsDataURL(f);
    } else {
      setDataUrl("");
    }
  }

  function submit() {
    if (tab === "upload") {
      if (!name.trim()) return setErr("Choose a file first.");
      onSave({ kind: type, name: name.trim(), dataUrl: dataUrl || null, caption: caption.trim(), folder: type === "image" ? "photos" : type === "video" ? "videos" : "documents" });
    } else {
      if (!/^https?:\/\//i.test(url.trim())) return setErr("Enter a full URL (https://…).");
      onSave({ kind: "link", name: url.trim(), dataUrl: null, caption: caption.trim() || url.trim(), folder: "links" });
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="rg-sheet-title">Share to the group</h3>
      <p className="rg-sheet-sub">Tickets, confirmations, maps, PDFs — one shared space for the trip.</p>
      <div className="rg-folder-tabs">
        <button className={`rg-chip ${tab === "upload" ? "on" : ""}`} onClick={() => setTab("upload")}>Upload</button>
        <button className={`rg-chip ${tab === "link" ? "on" : ""}`} onClick={() => setTab("link")}>Link</button>
      </div>
      {tab === "upload" ? (
        <div className="rg-field">
          <span className="rg-label">File (image, video, PDF, documents)</span>
          <label className="rg-input" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: 12 }}>
            <PaperclipIcon />
            <span className="rg-hint">{name || "Tap to choose a file"}</span>
            <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" hidden onChange={(e) => onFile(e.target.files && e.target.files[0])} />
          </label>
          {name && <p className="rg-hint" style={{ marginTop: 6 }}>File preview stored for files under 400 KB; larger files are listed as documents.</p>}
        </div>
      ) : (
        <div className="rg-field">
          <span className="rg-label">Link URL</span>
          <input className="rg-input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      )}
      <div className="rg-field">
        <span className="rg-label">Caption</span>
        <input className="rg-input" placeholder="e.g. Hotel booking confirmation" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </div>
      {err && <div className="rg-error" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="rg-row" style={{ gap: 10 }}>
        <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="rg-btn rg-btn-primary" style={{ flex: 1 }} onClick={submit}>Share</button>
      </div>
    </Overlay>
  );
}

function PaperclipIcon() {
  return <span style={{ fontSize: 18 }}>📎</span>;
}