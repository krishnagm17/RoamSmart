import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Copy, Check, Link2, Search, Trash2, Users, Share2, Save, FileText, Download, Paperclip } from "lucide-react";
import { compressToDataUrl } from "../roamsplit/splitEngine";
import {
  PRIVACY_OPTIONS, POLL_TYPES, TOPIC_TEMPLATES, groupSubtitle, groupRouteLabel,
  initials, avatarStyle, timeAgo, searchDemoUsers, memberFromUser, formatDate,
  buildFinalPlan, tripIdForGroup, DEMO_USERS,
} from "./groupsEngine";
import { searchUsers } from "../../supabase/userStore";
import "./RoamGroups.css";

const EMOJI_CHOICES = ["📍", "🏖️", "⛰️", "🏛️", "🌊", "🍜", "🏨", "🎡", "🛕", "🌄", "🪂", "🐘"];

function Overlay({ children, center = false, onClose }) {
  return (
    <div className={`rg-overlay ${center ? "rg-center" : ""}`} onClick={onClose}>
      <div className="rg-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rg-sheet-handle" />
        {children}
      </div>
    </div>
  );
}
export { Overlay };

function ImageRow({ label, onPick, current }) {
  const ref = useRef(null);
  return (
    <div className="rg-field">
      <span className="rg-label">{label}</span>
      <label className="rg-input" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => ref.current && ref.current.click()}>
        {current ? <img src={current} alt="preview" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }} /> : <Paperclip size={18} />}
        <span className="rg-hint">{current ? "Tap to change" : "Tap to choose an image"}</span>
      </label>
      <input ref={ref} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files && e.target.files[0]; if (f) onPick(await compressToDataUrl(f)); }} />
    </div>
  );
}

// ═══ CREATE GROUP ══════════════════════════════════════════
export function CreateGroupSheet({ self, onSave, onClose }) {
  const [g, setG] = useState({ name: "", destination: "", description: "", startDate: "", endDate: "", privacy: "inviteOnly", image: null, addMembers: true });
  const [err, setErr] = useState("");
  const set = (k, v) => setG((p) => ({ ...p, [k]: v }));

  function submit() {
    if (!g.name.trim()) return setErr("Give your group a name.");
    if (!g.startDate || !g.endDate) return setErr("Trip start and end dates are required.");
    if (new Date(g.endDate) < new Date(g.startDate)) return setErr("End date must be after the start date.");
    onSave({ ...g });
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="rg-sheet-title">Create a trip group</h3>
      <p className="rg-sheet-sub">Plan together — chat, vote, decide, and lock the itinerary as a team.</p>

      <div className="rg-field">
        <span className="rg-label">Group name</span>
        <input className="rg-input" placeholder="e.g. Goa Trip 2026" value={g.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="rg-row" style={{ gap: 10 }}>
        <div className="rg-field" style={{ flex: 1 }}>
          <span className="rg-label">Destination(s)</span>
          <input className="rg-input" placeholder="e.g. Goa, Mumbai, Kochi" value={g.destination} onChange={(e) => set("destination", e.target.value)} />
          <span className="rg-hint">Separate multiple stops with commas — they become a route.</span>
        </div>
      </div>
      <div className="rg-field">
        <span className="rg-label">Trip description (optional)</span>
        <textarea className="rg-textarea" placeholder="e.g. Bangalore → Goa · beach week with the gang" value={g.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="rg-row" style={{ gap: 10 }}>
        <div className="rg-field" style={{ flex: 1 }}>
          <span className="rg-label">Start date</span>
          <input className="rg-input" type="date" value={g.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </div>
        <div className="rg-field" style={{ flex: 1 }}>
          <span className="rg-label">End date</span>
          <input className="rg-input" type="date" value={g.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </div>
      </div>

      <ImageRow label="Group profile image (optional)" current={g.image} onPick={(d) => set("image", d)} />

      <div className="rg-field">
        <span className="rg-label">Privacy</span>
        <div style={{ display: "grid", gap: 8 }}>
          {PRIVACY_OPTIONS.map((p) => (
            <label key={p.id} className={`rg-list-row ${g.privacy === p.id ? "rg-opt-check" : ""}`} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
              <input type="radio" name="privacy" checked={g.privacy === p.id} onChange={() => set("privacy", p.id)} style={{ accentColor: "#10b981" }} />
              <div className="rg-list-body">
                <div className="rg-list-name">{p.label}</div>
                <div className="rg-list-sub">{p.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <label className="rg-list-row" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={g.addMembers} onChange={(e) => set("addMembers", e.target.checked)} style={{ accentColor: "#10b981" }} />
        <div className="rg-list-body">
          <div className="rg-list-name">Add sample travel buddies</div>
          <div className="rg-list-sub">Rahul, Arjun, Priya &amp; co join instantly so you can try chat, polls and itinerary together.</div>
        </div>
      </label>

      {err && <div className="rg-error" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="rg-row" style={{ gap: 10 }}>
        <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button className="rg-btn rg-btn-primary" style={{ flex: 2 }} onClick={submit}>Create group</button>
      </div>
    </Overlay>
  );
}

// ═══ JOIN WITH CODE ════════════════════════════════════════
export function JoinGroupSheet({ self, onJoin, onJoined, onClose }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function join() {
    if (!code.trim()) return setErr("Enter the invite code.");
    setBusy(true); setErr("");
    try {
      const res = await onJoin(code.trim().toUpperCase());
      if (!res.ok) return setErr(res.error || "Could not join. Check the code.");
      onJoined(res.group);
    } catch (e) {
      setErr(e?.message || "Could not join. Check the code.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Overlay onClose={onClose}>
      <h3 className="rg-sheet-title">Join a group</h3>
      <p className="rg-sheet-sub">Paste the 8-character invite code shared by the group admin.</p>
      <div className="rg-field">
        <span className="rg-label">Invite code</span>
        <input className="rg-input" style={{ textTransform: "uppercase", fontFamily: "var(--font-mono, monospace)", letterSpacing: 3 }} placeholder="e.g. A1B2C3D4" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      {err && <div className="rg-error" style={{ marginBottom: 10 }}>{err}</div>}
      <button className="rg-btn rg-btn-primary rg-btn-block" onClick={join} disabled={busy}>{busy ? "Joining…" : "Join group"}</button>
      <div style={{ height: 8 }} />
      <button className="rg-btn rg-btn-ghost rg-btn-block" onClick={onClose}>Cancel</button>
    </Overlay>
  );
}

// ═══ INVITE / ADD MEMBERS ══════════════════════════════════
export function InviteSheet({ group, members, self, onAddMember, onClose, onInvite, onRevoke }) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);
  const [custom, setCustom] = useState({ name: "", email: "", phone: "" });
  const [realResults, setRealResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const demoResults = searchDemoUsers(q);
  const link = `${window.location.origin}${window.location.pathname}#roamgroups=${group.code}`;
  const added = new Set((members || []).map((m) => String(m.username || "").toLowerCase()));
  const addedUids = new Set((members || []).map((m) => String(m.id || "")));

  // Debounced search of real registered users
  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) { setRealResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const excludeUids = (members || []).map((m) => m.id).filter(Boolean);
      const results = await searchUsers(q.trim(), excludeUids);
      setRealResults(results);
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  const combinedResults = [
    ...realResults,
    ...demoResults.filter((d) => !realResults.some((r) => r.username === d.username)),
  ];

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  }
  function addFromUser(u) {
    if (u.kind === "real") {
      // Real registered user — use their Firebase UID as member ID so they can authenticate
      if (addedUids.has(u.uid)) return;
      onAddMember({ id: u.uid, name: u.name, username: u.username, email: u.email, phone: u.phone, avatar: u.avatar || null, upi: u.upi || "", role: "member", status: "joined", kind: "real", createdAt: new Date().toISOString() });
    } else {
      if (added.has(String(u.username).toLowerCase())) return;
      onAddMember(memberFromUser(u));
    }
  }
  function addCustom() {
    const name = custom.name.trim();
    if (!name) return;
    onAddMember(memberFromUser({ name, username: name.toLowerCase().replace(/\s+/g, "."), email: custom.email.trim(), phone: custom.phone.trim(), kind: "member" }));
    setCustom({ name: "", email: "", phone: "" });
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="rg-sheet-title">Invite people</h3>
      <p className="rg-sheet-sub">Add friends by search, username, email or phone — or share the invite link.</p>

      <div className="rg-field">
        <span className="rg-label">Invite link</span>
        <div className="rg-upi-box" style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-raised,#131a15)", border: "1px solid rgba(224,168,78,.3)", borderRadius: 13, padding: "12px 14px" }}>
          <Link2 size={16} style={{ color: "var(--accent,#e0a84e)" }} />
          <code style={{ flex: 1, fontSize: 12, color: "var(--accent,#e0a84e)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link}</code>
          <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button>
        </div>
        <div className="rg-hint" style={{ marginTop: 6 }}>Group code: <b style={{ color: "var(--accent,#e0a84e)" }}>{group.code}</b> · anyone with this can join while the link is active.</div>
      </div>

      <div className="rg-field">
        <span className="rg-label">Search RoamSmart friends</span>
        <div className="rg-row" style={{ gap: 8 }}>
          <Search size={16} style={{ color: "var(--text-secondary,#a7b3ab)" }} />
          <input className="rg-input" placeholder="Name, username, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {q.trim() && (
        <div style={{ marginBottom: 12 }}>
          {searching && <p className="rg-hint">Searching RoamSmart users…</p>}
          {!searching && combinedResults.length === 0 && <p className="rg-hint">No matches. Add them manually below.</p>}
          {combinedResults.map((u) => {
            const isReal = u.kind === "real";
            const isAdded = isReal ? addedUids.has(u.uid) : added.has(String(u.username).toLowerCase());
            return (
              <div className="rg-list-row" key={u.uid || u.username}>
                <span className="rg-ava" style={u.avatar ? { backgroundImage: `url(${u.avatar})`, backgroundSize: "cover" } : avatarStyle(u.name)}>{!u.avatar && initials(u.name)}</span>
                <div className="rg-list-body">
                  <div className="rg-list-name">
                    @{u.username}
                    {isReal && <span style={{ marginLeft: 6, fontSize: 10, background: "rgba(16,185,129,0.15)", color: "#10b981", padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>✓ RoamSmart</span>}
                  </div>
                  <div className="rg-list-sub">{u.name} · {u.email} {u.phone ? `· ${u.phone}` : ""}</div>
                </div>
                <button className="rg-btn rg-btn-sm rg-btn-primary" disabled={isAdded} onClick={() => addFromUser(u)}>
                  {isAdded ? "Added" : <><Plus size={13} /> Add</>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rg-field">
        <span className="rg-label">Add manually</span>
        <div className="rg-row" style={{ gap: 8, marginBottom: 8 }}>
          <input className="rg-input" style={{ flex: 1 }} placeholder="Full name" value={custom.name} onChange={(e) => setCustom((p) => ({ ...p, name: e.target.value }))} />
          <input className="rg-input" style={{ flex: 1 }} placeholder="Username / email" value={custom.email} onChange={(e) => setCustom((p) => ({ ...p, email: e.target.value }))} />
        </div>
        <div className="rg-row" style={{ gap: 8 }}>
          <input className="rg-input" style={{ flex: 1 }} placeholder="Phone (optional)" value={custom.phone} onChange={(e) => setCustom((p) => ({ ...p, phone: e.target.value }))} />
          <button className="rg-btn rg-btn-ghost" onClick={addCustom}><Plus size={15} /> Add member</button>
        </div>
      </div>

      <div className="rg-divider" />
      <div className="rg-row" style={{ justifyContent: "space-between" }}>
        <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={() => { onRevoke(); }}><Trash2 size={14} /> Revoke invite link</button>
        <span className="rg-hint">{members.length} members</span>
      </div>
    </Overlay>
  );
}

// ═══ GROUP SETTINGS ════════════════════════════════════════
export function GroupSettingsSheet({ group, self, isAdmin, isCreator, onSave, onDelete, onClose }) {
  const [g, setG] = useState({ ...group, name: group.name, description: group.description || "", destination: group.destination || "", startDate: group.startDate, endDate: group.endDate, privacy: group.privacy, image: group.image });
  const [err, setErr] = useState("");
  const set = (k, v) => setG((p) => ({ ...p, [k]: v }));
  const flags = [
    { key: "membersCanCreatePolls", label: "Members can create polls" },
    { key: "membersCanAddItinerary", label: "Members can add itinerary suggestions" },
    { key: "allowVoteChange", label: "Allow members to change their vote" },
    { key: "allowAnonymousPolls", label: "Allow anonymous polls" },
  ];

  function submit() {
    if (!g.name.trim()) return setErr("Group name is required.");
    onSave({ ...group, ...g });
  }
  return (
    <Overlay onClose={onClose}>
      <h3 className="rg-sheet-title">Group settings</h3>
      <p className="rg-sheet-sub">{isAdmin ? "Manage group details and security." : "Only admins can change these."}</p>
      <div className="rg-field">
        <span className="rg-label">Group name</span>
        <input className="rg-input" value={g.name} disabled={!isAdmin} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="rg-field">
        <span className="rg-label">Destination(s)</span>
        <input className="rg-input" value={g.destination} disabled={!isAdmin} onChange={(e) => set("destination", e.target.value)} />
        <span className="rg-hint">Separate multiple stops with commas.</span>
      </div>
      <div className="rg-field">
        <span className="rg-label">Description</span>
        <textarea className="rg-textarea" value={g.description} disabled={!isAdmin} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="rg-row" style={{ gap: 10 }}>
        <div className="rg-field" style={{ flex: 1 }}>
          <span className="rg-label">Start</span>
          <input className="rg-input" type="date" value={g.startDate} disabled={!isAdmin} onChange={(e) => set("startDate", e.target.value)} />
        </div>
        <div className="rg-field" style={{ flex: 1 }}>
          <span className="rg-label">End</span>
          <input className="rg-input" type="date" value={g.endDate} disabled={!isAdmin} onChange={(e) => set("endDate", e.target.value)} />
        </div>
      </div>
      <ImageRow label="Group image" current={g.image} onPick={(d) => set("image", d)} />

      <div className="rg-field">
        <span className="rg-label">Privacy</span>
        <select className="rg-select" disabled={!isAdmin} value={g.privacy} onChange={(e) => set("privacy", e.target.value)}>
          {PRIVACY_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {isAdmin && (
        <div className="rg-field">
          <span className="rg-label">Permissions</span>
          {flags.map((f) => (
            <label key={f.key} className="rg-list-row" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={!!g.settings && g.settings[f.key]} onChange={() => setG((p) => ({ ...p, settings: { ...p.settings, [f.key]: !p.settings[f.key] } }))} style={{ accentColor: "#10b981" }} />
              <div className="rg-list-body"><div className="rg-list-name">{f.label}</div></div>
            </label>
          ))}
        </div>
      )}

      {err && <div className="rg-error" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="rg-row" style={{ gap: 10 }}>
        {isCreator && <button className="rg-btn rg-btn-danger" onClick={() => { if (window.confirm("Delete this group and all its chats, polls and files?")) onDelete(); }}><Trash2 size={15} /> Delete</button>}
        <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
        {isAdmin && <button className="rg-btn rg-btn-primary" style={{ flex: 1 }} onClick={submit}>Save</button>}
      </div>
    </Overlay>
  );
}

// ═══ NOTIFICATIONS PANEL ═══════════════════════════════════
export function NotifsPanel({ notifs, onMarkAll, onDismiss, onOpenGroup, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div className="rg-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <h3 className="rg-sheet-title" style={{ margin: 0 }}>Notifications</h3>
          <p className="rg-sheet-sub" style={{ marginTop: 2 }}>Group activity across all your trips.</p>
        </div>
        <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={onMarkAll}>Mark all read</button>
      </div>
      <div style={{ minHeight: "55vh" }}>
        {notifs.length === 0 && <div className="rg-empty"><p>No notifications yet.</p></div>}
        {notifs.map((n) => (
          <div key={n.id} className={`rg-act-row ${n.read ? "" : "unread"}`}>
            <span className="rg-act-ic">{n.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p>
                <b>{n.gidName}</b> · {n.text}
              </p>
              <time>{timeAgo(n.createdAt)}</time>
            </div>
            <div className="rg-row">
              <button className="rg-icon-btn" onClick={() => n.gid && onOpenGroup(n.gid)} style={{ width: 32, height: 32 }}><Users size={14} /></button>
              <button className="rg-icon-btn" onClick={() => onDismiss(n.id)} style={{ width: 32, height: 32 }}><X size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </Overlay>
  );
}

// ═══ GROUP SEARCH ══════════════════════════════════════════
export function GroupSearchModal({ group, data, onClose }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const res = useMemo(() => {
    const r = searchGroup(q, data);
    return r;
  }, [q, data]);
  const tabs = [
    { id: "all", label: "All", items: () => { const arr = []; arr.push(...res.messages.map((m) => ({ type: "message", data: m }))); arr.push(...res.people.map((m) => ({ type: "person", data: m }))); arr.push(...res.places.map((m) => ({ type: "place", data: m }))); arr.push(...res.polls.map((m) => ({ type: "poll", data: m }))); arr.push(...res.files.map((m) => ({ type: "file", data: m }))); return arr.sort((a, b) => String(b.data.createdAt || "").localeCompare(String(a.data.createdAt || ""))); } },
    { id: "messages", label: "Messages", items: () => res.messages.map((m) => ({ type: "message", data: m })) },
    { id: "people", label: "People", items: () => res.people.map((m) => ({ type: "person", data: m })) },
    { id: "places", label: "Places", items: () => res.places.map((m) => ({ type: "place", data: m })) },
    { id: "polls", label: "Polls", items: () => res.polls.map((m) => ({ type: "poll", data: m })) },
    { id: "files", label: "Files & links", items: () => [...res.files.map((m) => ({ type: "file", data: m })), ...res.links.map((m) => ({ type: "message", data: m }))] },
    { id: "expenses", label: "Expenses", items: () => res.expenses.map((m) => ({ type: "expense", data: m })) },
  ];
  const active = tabs.find((t) => t.id === tab);
  const items = q.trim() ? (res && active ? active.items() : []) : [];
  void res;

  return (
    <Overlay onClose={onClose}>
      <h3 className="rg-sheet-title">Search {group.name}</h3>
      <p className="rg-sheet-sub">Messages, people, places, polls, files and expenses.</p>
      <div className="rg-row" style={{ gap: 8, marginBottom: 12 }}>
        <Search size={16} style={{ color: "var(--text-secondary,#a7b3ab)" }} />
        <input className="rg-input" autoFocus placeholder="e.g. hotel, Baga, budget…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="rg-folder-tabs">
        {tabs.map((t) => <button key={t.id} className={`rg-chip ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {q.trim() && items.length === 0 && <div className="rg-empty"><p>Nothing matches “{q}”.</p></div>}
      {q.trim() && items.map((it, i) => {
        if (it.type === "message") return <div key={i} className="rg-list-row"><span className="rg-act-ic">{it.data.kind === "text" ? "💬" : it.data.kind === "place" ? "📍" : "📎"}</span><div className="rg-list-body"><div className="rg-list-name">{it.data.name} · <span className="rg-hint">{timeAgo(it.data.createdAt)}</span></div><div className="rg-list-sub">{it.data.replyTo ? `↩ ${it.data.replyTo.text} — ` : ""}{(it.data.text || it.data.title || "").slice(0, 140)}</div></div></div>;
        if (it.type === "person") return <div key={i} className="rg-list-row"><span className="rg-ava" style={avatarStyle(it.data.name)}>{initials(it.data.name)}</span><div className="rg-list-body"><div className="rg-list-name">@{it.data.username}</div><div className="rg-list-sub">{it.data.email || it.data.phone || "Team member"}</div></div></div>;
        if (it.type === "place") return <div key={i} className="rg-list-row"><span className="rg-act-ic">📍</span><div className="rg-list-body"><div className="rg-list-name">{it.data.name}</div><div className="rg-list-sub">{it.data.location} · {it.data.upvotes.length} up {it.data.downvotes.length} down</div></div></div>;
        if (it.type === "poll") return <div key={i} className="rg-list-row"><span className="rg-act-ic">🗳️</span><div className="rg-list-body"><div className="rg-list-name">{it.data.title}</div><div className="rg-list-sub">{POLL_TYPES[it.data.kind]?.label || "Poll"} · {it.data.votes.length} votes</div></div></div>;
        if (it.type === "file") return <div key={i} className="rg-list-row"><span className="rg-act-ic">{it.data.kind === "link" ? "🔗" : "📎"}</span><div className="rg-list-body"><div className="rg-list-name">{it.data.name}</div><div className="rg-list-sub">{it.data.caption || ""}</div></div></div>;
        if (it.type === "expense") return <div key={i} className="rg-list-row"><span className="rg-act-ic">💰</span><div className="rg-list-body"><div className="rg-list-name">{it.data.title}</div><div className="rg-list-sub">₹{it.data.amount} · {it.data.category}</div></div></div>;
        return null;
      })}
      <button className="rg-btn rg-btn-ghost rg-btn-block" onClick={onClose} style={{ marginTop: 10 }}>Close</button>
    </Overlay>
  );
}

// ═══ FINAL TRIP PLAN ═══════════════════════════════════════
export function FinalPlanSheet({ group, data, onClose, onPushTrip }) {
  const plan = useMemo(() => {
    const days = data.itinerary?.days || [];
    if (!days.length) data.itinerary = { days: [], suggestions: [] };
    return buildFinalPlan(group, { ...data });
  }, [group, data]);
  const [copied, setCopied] = useState(false);

  function copyPlan() {
    const txt = planText(plan);
    try { navigator.clipboard.writeText(txt); } catch {}
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }
  function planText(p) {
    const dest = (p.formData?.destinations && p.formData.destinations.length)
      ? p.formData.destinations.map((d) => d.name).join(" → ")
      : p.destination;
    let t = `${p.title}\n${dest} · ${formatDate(p.startDate)} → ${formatDate(p.endDate)}\n` +
      `Members: ${(p.formData?.numTravellers || 0)}\n\n`;
    (p.days || []).forEach((d) => {
      t += `Day ${d.day} — ${d.date}\n`;
      (d.activities || []).forEach((a) => { t += `  ${a.time}  ${a.title}\n`; });
      t += "\n";
    });
    t += `Total estimated/actual: ₹${(p.budget?.total || 0)}\n`;
    return t;
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="rg-sheet-title">Final trip plan</h3>
      <p className="rg-sheet-sub">Everything the group locked in — share it, export it, or push it to My Trips.</p>

      <div className="rg-card" style={{ marginBottom: 12 }}>
        <div className="rg-row"><span className="rg-act-ic">🏁</span><div><div className="rg-list-name">{plan.title}</div><div className="rg-list-sub">{plan.subtitle}</div></div></div>
        <div className="rg-divider" />
        <div className="rg-place-meta">
          <div><b>Destination</b>{groupRouteLabel(group)}</div>
          <div><b>Members</b>{(plan.formData?.numTravellers || 0)}</div>
          <div><b>Dates</b>{formatDate(plan.startDate)} – {formatDate(plan.endDate)}</div>
          <div><b>Spent</b>₹{plan.budget?.total || 0}</div>
        </div>
      </div>

      <div className="rg-section"><h2>Finalized places</h2></div>
      {(plan.finalizedPlaces || []).length === 0 ? <p className="rg-hint">No places finalized yet — open the Places tab to lock decisions.</p>
        : (plan.finalizedPlaces || []).map((p, i) => (
          <div className="rg-list-row" key={i}><span className="rg-st-pill rg-st-ok">Finalized</span><div className="rg-list-body"><div className="rg-list-name">✅ {p.name}</div><div className="rg-list-sub">{p.location} {p.cost ? `· ₹${p.cost}` : ""}</div></div></div>
        ))}

      <div className="rg-section"><h2>Daily itinerary</h2></div>
      {(plan.days || []).length === 0 ? <p className="rg-hint">Itinerary is empty.</p>
        : (plan.days || []).map((d) => (
          <div key={d.day} className="rg-day-card">
            <div className="rg-day-head"><div className="rg-day-badge"><small>DAY</small>{d.day}</div><div><b>{d.date}</b><div className="rg-day-date">{d.activities.length} stops</div></div></div>
            {d.activities.slice(0, 8).map((a, i) => <div className="rg-it-row" key={i}><span className="rg-it-time">{a.time || "–"}</span><div className="rg-it-main"><div className="rg-it-title">{a.title}</div></div></div>)}
          </div>
        ))}

      <div className="rg-row" style={{ gap: 10, marginTop: 14 }}>
        <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={copyPlan}>{copied ? <Check size={15} /> : <Download size={15} />}{copied ? "Copied" : "Export"}</button>
        <button className="rg-btn rg-btn-gold" style={{ flex: 2 }} onClick={() => onPushTrip(plan)}><Save size={15} /> Save to My Trips</button>
      </div>
    </Overlay>
  );
}