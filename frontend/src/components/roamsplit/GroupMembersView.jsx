import { useState, useEffect } from "react";
import { UserRound, Plus, Search, Loader, X, ShieldCheck } from "lucide-react";
import { searchUsers } from "../../supabase/userStore";

export default function GroupMembersView({ travellers, selfUid, onAddTraveller }) {
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Debounced search for real users
  useEffect(() => {
    if (!userSearch.trim() || userSearch.trim().length < 2) {
      setUserResults([]);
      setErrorMsg("");
      return;
    }
    setUserSearching(true);
    setErrorMsg("");
    const timer = setTimeout(async () => {
      const existingUids = travellers.map((t) => t.id);
      const results = await searchUsers(userSearch.trim(), existingUids);
      setUserResults(results);
      if (results.length === 0) {
        setErrorMsg(`No registered users found for "${userSearch}". Only RoamSmart members can be added.`);
      }
      setUserSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [userSearch]);

  function addRealUser(u) {
    if (travellers.some((t) => t.id === u.uid)) return;
    const newTraveller = { id: u.uid, name: u.name, upi: u.upi || "", isReal: true };
    if (typeof onAddTraveller === "function") onAddTraveller(newTraveller);
    setUserSearch("");
    setUserResults([]);
    setErrorMsg("");
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontFamily: "var(--font-display, serif)", fontSize: 18, margin: "0 0 4px" }}>Group Members</h2>
      <p className="rs-sub" style={{ marginBottom: 16 }}>
        Only registered RoamSmart users can join the split group. Search by name, username, or email.
      </p>

      {/* Real user search */}
      <div style={{ position: "relative", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card,#0f1512)", border: "1px solid var(--border,rgba(255,255,255,.1))", borderRadius: 12, padding: "10px 14px" }}>
          <Search size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
          <input
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 14 }}
            placeholder="Search registered RoamSmart users to add…"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
          />
          {userSearching && <Loader size={16} style={{ color: "var(--text-secondary)", flexShrink: 0, animation: "spin 1s linear infinite" }} />}
          {userSearch && !userSearching && (
            <button type="button" onClick={() => { setUserSearch(""); setUserResults([]); setErrorMsg(""); }}
              style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 2 }}>
              <X size={16} />
            </button>
          )}
        </div>

        {errorMsg && !userSearching && (
          <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--text-secondary)", background: "var(--bg-card,#0f1512)", border: "1px solid var(--border)", borderRadius: 12, marginTop: 8 }}>
            {errorMsg}
          </div>
        )}

        {userResults.length > 0 && (
          <div style={{ background: "var(--bg-card,#0f1512)", border: "1px solid var(--border,rgba(255,255,255,.1))", borderRadius: 12, marginTop: 8, overflow: "hidden" }}>
            {userResults.map((u) => {
              const alreadyAdded = travellers.some((t) => t.id === u.uid);
              return (
                <div key={u.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--border,rgba(255,255,255,.06))" }}>
                  <span className="rs-ava sm" style={{ background: "linear-gradient(135deg,#10b981,#059669)", flexShrink: 0, width: 36, height: 36, fontSize: 14 }}>
                    {u.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      {u.name}
                      <span style={{ fontSize: 10, background: "rgba(16,185,129,0.15)", color: "#10b981", padding: "2px 6px", borderRadius: 5, fontWeight: 600 }}>✓ RoamSmart</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>@{u.username}{u.upi ? ` · UPI: ${u.upi}` : ""}</div>
                  </div>
                  <button
                    className="rs-btn rs-btn-primary"
                    style={{ width: "auto", padding: "6px 14px", fontSize: 13 }}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={() => addRealUser(u)}
                  >
                    {alreadyAdded ? "Added" : <><Plus size={14} /> Add</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {travellers.map((t) => (
          <div key={t.id} className="rs-trip-card" style={{ cursor: "default", padding: "12px 16px" }}>
            <span className="rs-ava">{String(t.name).slice(0, 1).toUpperCase()}</span>
            <div className="rs-trip-body">
              <div className="rs-trip-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {t.name} {t.id === selfUid && <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: "normal" }}>(You)</span>}
                {t.isReal && <ShieldCheck size={14} color="#10b981" />}
              </div>
              <div className="rs-trip-dates">{t.upi ? `UPI: ${t.upi}` : "No UPI linked"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
