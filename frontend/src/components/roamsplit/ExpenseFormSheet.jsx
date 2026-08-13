import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Camera, X, Search, Loader } from "lucide-react";
import {
  CATEGORIES, SPLIT_METHODS, inr, round2, splitError,
  compressToDataUrl, uid,
} from "./splitEngine";
import { searchUsers } from "../../supabase/userStore";

const METHOD_LABEL = { equal: "Equal", custom: "Amount", percentage: "%", shares: "Shares" };

export default function ExpenseFormSheet({
  editing, tripId, travellers, destinations, selfUid, selfName, onSave, onAddTraveller, onClose, showToast,
}) {
  const [method, setMethod] = useState(editing?.split?.method || "equal");
  const [title, setTitle] = useState(editing?.title || "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [spentDate, setSpentDate] = useState(editing?.spentDate || new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(editing?.category || "Food");
  const [destination, setDestination] = useState(editing?.destination || (Array.isArray(destinations) && destinations[0]) || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [receipt, setReceipt] = useState(editing?.receipt || null);
  const [receiptBusy, setReceiptBusy] = useState(false);

  const [payers, setPayers] = useState(() =>
    editing?.payers && editing.payers.length
      ? editing.payers.map((p) => ({ ...p }))
      : [{ uid: selfUid, name: selfName, amount: "" }]);

  const [selectedIds, setSelectedIds] = useState(() =>
    (editing?.split?.parts || []).map((p) => p.uid).length
      ? editing.split.parts.map((p) => p.uid)
      : [selfUid]);

  const [partValues, setPartValues] = useState(() => {
    const map = {};
    (editing?.split?.parts || []).forEach((p) => { map[p.uid] = p.value; });
    return map;
  });

  // Real user search state
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const payerEdited = useRef(editing ? true : false);

  const selectedTravellers = useMemo(
    () => travellers.filter((t) => selectedIds.includes(t.id)),
    [travellers, selectedIds],
  );

  // Debounced search for real users
  useEffect(() => {
    if (!userSearch.trim() || userSearch.trim().length < 2) {
      setUserResults([]);
      return;
    }
    setUserSearching(true);
    const timer = setTimeout(async () => {
      const existingUids = travellers.map((t) => t.id);
      const results = await searchUsers(userSearch.trim(), existingUids);
      setUserResults(results);
      setUserSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [userSearch]);

  // Single payer auto-syncs amount
  useEffect(() => {
    if (payerEdited.current || payers.length !== 1) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setPayers((prev) => {
      if (prev.length !== 1 || Number(prev[0].amount) === amt) return prev;
      return [{ ...prev[0], amount: String(amt) }];
    });
  }, [amount, payers.length]);

  // Auto-fill equal shares
  useEffect(() => {
    if (method !== "equal") return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || selectedTravellers.length === 0) return;
    const each = round2(amt / selectedTravellers.length);
    setPartValues((prev) => {
      const next = { ...prev };
      selectedTravellers.forEach((t) => { next[t.id] = each; });
      return next;
    });
  }, [amount, method, selectedTravellers]);

  const draft = {
    amount: Number(amount || 0),
    split: {
      method,
      parts: selectedTravellers.map((t) => ({ uid: t.id, name: t.name, value: partValues[t.id] ?? 0 })),
    },
    payers: payers.map((p) => ({ uid: p.uid, name: p.name, amount: Number(p.amount) })),
  };

  const draftError = splitError(draft);

  useEffect(() => {
    if (selectedTravellers.length === 0) return;
    if (method === "percentage" && !selectedTravellers.some((t) => partValues[t.id] != null)) {
      const each = round2(100 / selectedTravellers.length);
      setPartValues(Object.fromEntries(selectedTravellers.map((t) => [t.id, each])));
    }
    if (method === "shares") {
      setPartValues((prev) => {
        const next = { ...prev };
        selectedTravellers.forEach((t) => { if (!next[t.id]) next[t.id] = 1; });
        return next;
      });
    }
    if (method === "custom") {
      setPartValues((prev) => {
        const next = { ...prev };
        const amt = Number(amount);
        const each = round2(amt / selectedTravellers.length);
        selectedTravellers.forEach((t) => { next[t.id] = prev[t.id] == null ? each : prev[t.id]; });
        return next;
      });
    }
  }, [method]);

  function pickTraveller(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  // Add a real registered user as a traveller
  function addRealUser(u) {
    // Check for duplicate
    if (travellers.some((t) => t.id === u.uid)) {
      showToast("This user is already in the group", "error");
      return;
    }
    const newTraveller = { id: u.uid, name: u.name, upi: u.upi || "", isReal: true };
    if (typeof onAddTraveller === "function") onAddTraveller(newTraveller);
    setSelectedIds((prev) => [...prev, u.uid]);
    setUserSearch("");
    setUserResults([]);
    showToast(`${u.name} added`, "success");
  }

  // Add another payer from the selected travellers list
  function addPayer() {
    // Find the first selected traveller who is not already a payer
    const notYetPayer = travellers.find(
      (t) => selectedIds.includes(t.id) && !payers.some((p) => p.uid === t.id)
    );
    if (!notYetPayer) {
      showToast("All selected participants are already payers. Add more people first.", "info");
      return;
    }
    payerEdited.current = true;
    setPayers((prev) => [...prev, { uid: notYetPayer.id, name: notYetPayer.name, amount: "" }]);
  }

  function setPayerAmount(idx, value) {
    payerEdited.current = true;
    setPayers((prev) => prev.map((p, i) => (i === idx ? { ...p, amount: value } : p)));
  }

  function removePayer(idx) {
    setPayers((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onReceiptChange(file) {
    if (!file) return;
    setReceiptBusy(true);
    try {
      const dataUrl = await compressToDataUrl(file);
      setReceipt({ dataUrl, name: file.name });
    } catch (err) {
      showToast(err.message || "Could not attach receipt", "error");
    } finally {
      setReceiptBusy(false);
    }
  }

  function save() {
    if (!title.trim()) { setError("Give the expense a short title."); return; }
    if (draftError) { setError(draftError); return; }
    setBusy(true);
    const expense = {
      id: editing?.id || uid("e"),
      tripId,
      title: title.trim(),
      amount: Number(Number(amount).toFixed(2)),
      spentDate,
      category,
      destination,
      description: description.trim(),
      paidBy: { uid: payers[0].uid, name: payers[0].name },
      payers: payers.map((p) => ({ uid: p.uid, name: p.name, amount: Number(Number(p.amount).toFixed(2)) })),
      split: { method, parts: selectedTravellers.map((t) => ({ uid: t.id, name: t.name, value: partValues[t.id] ?? 0 })) },
      participants: selectedTravellers.map((t) => t.id),
      receipt,
      creatorUid: editing?.creatorUid || selfUid,
      createdAt: editing?.createdAt || new Date().toISOString(),
    };
    onSave(expense);
    setBusy(false);
  }

  const paidTotal = round2(payers.reduce((s, p) => s + Number(p.amount || 0), 0));
  const amt = Number(amount) || 0;

  return (
    <div className="rs-overlay rs-center-sheet" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="rs-card-sheet" onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "90vh", overflowY: "auto", paddingBottom: 40 }}>
        <div className="rs-sheet-handle" />
        <h3 className="rs-sheet-title">{editing ? "Edit Expense" : "Add Expense"}</h3>
        <p className="rs-sheet-sub" style={{ margin: "0 0 16px" }}>Record, split and track it together.</p>

        {/* Title */}
        <div className="rs-field">
          <label className="rs-label">What was it for?</label>
          <input className="rs-input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Dinner at a beach shack" />
        </div>

        {/* Amount + Date */}
        <div className="rs-row">
          <div className="rs-field">
            <label className="rs-label">Amount (₹)</label>
            <input className="rs-input" type="number" min="1" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="rs-field">
            <label className="rs-label">Date</label>
            <input className="rs-input" type="date" value={spentDate}
              onChange={(e) => setSpentDate(e.target.value)} />
          </div>
        </div>

        {/* Category */}
        <div className="rs-field">
          <label className="rs-label">Category</label>
          <select className="rs-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Destination */}
        {destinations && destinations.length > 0 && (
          <div className="rs-field">
            <label className="rs-label">Where (destination)</label>
            <select className="rs-select" value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">— Trip-wide —</option>
              {destinations.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}

        {/* Who paid */}
        <div className="rs-field">
          <label className="rs-label">Who paid?</label>
          {payers.map((p, i) => (
            <div key={p.uid || i} className="rs-split-row" style={{ marginBottom: 8 }}>
              <span className="rs-ava alt" style={{ fontSize: 11 }}>{i === 0 ? "👤" : (p.name || "?").slice(0, 1)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name || "Unknown"}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{i === 0 ? "Paid" : "Also paid"}</div>
              </div>
              <input className="rs-split-share" type="number" min="0" placeholder="0"
                value={p.amount} onChange={(e) => setPayerAmount(i, e.target.value)} />
              {payers.length > 1 && (
                <button className="rs-chip" onClick={() => removePayer(i)} type="button"
                  style={{ border: "none", background: "transparent", color: "#f87171", padding: 4 }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <button className="rs-chip" onClick={addPayer} type="button">
              <Plus size={14} /> Add another payer
            </button>
            <span className={Math.abs(paidTotal - amt) < 0.01 ? "rs-split-total ok" : "rs-split-total bad"}>
              {inr(paidTotal)} / {inr(amt)}
            </span>
          </div>
        </div>

        {/* Split between — real user search only */}
        <div className="rs-field">
          <label className="rs-label">Split between who?</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {travellers.map((t) => (
              <button key={t.id} className={`rs-chip ${selectedIds.includes(t.id) ? "on" : ""}`}
                onClick={() => pickTraveller(t.id)} type="button">
                <span className="rs-ava sm">{t.name.slice(0, 1).toUpperCase()}</span>
                {t.name}
              </button>
            ))}
          </div>

          {/* Real user search */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card,#0f1512)", border: "1px solid var(--border,rgba(255,255,255,.1))", borderRadius: 12, padding: "8px 12px" }}>
              <Search size={14} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <input
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 13 }}
                placeholder="Search registered RoamSmart users to add…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              {userSearching && <Loader size={14} style={{ color: "var(--text-secondary)", flexShrink: 0, animation: "spin 1s linear infinite" }} />}
              {userSearch && !userSearching && (
                <button type="button" onClick={() => { setUserSearch(""); setUserResults([]); }}
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 2 }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {userSearch.trim().length >= 2 && !userSearching && userResults.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-secondary)", background: "var(--bg-card,#0f1512)", border: "1px solid var(--border)", borderRadius: 12, marginTop: 6 }}>
                No registered users found for "{userSearch}". Only RoamSmart members can be added.
              </div>
            )}

            {userResults.length > 0 && (
              <div style={{ background: "var(--bg-card,#0f1512)", border: "1px solid var(--border,rgba(255,255,255,.1))", borderRadius: 12, marginTop: 6, overflow: "hidden" }}>
                {userResults.map((u) => {
                  const alreadyAdded = travellers.some((t) => t.id === u.uid);
                  return (
                    <div key={u.uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--border,rgba(255,255,255,.06))" }}>
                      <span className="rs-ava sm" style={{ background: "linear-gradient(135deg,#10b981,#059669)", flexShrink: 0 }}>
                        {u.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          {u.name}
                          <span style={{ fontSize: 10, background: "rgba(16,185,129,0.15)", color: "#10b981", padding: "2px 5px", borderRadius: 5, fontWeight: 600 }}>✓ RoamSmart</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>@{u.username}{u.upi ? ` · UPI: ${u.upi}` : ""}</div>
                      </div>
                      <button
                        className="rs-btn rs-btn-primary"
                        style={{ width: "auto", padding: "5px 12px", fontSize: 12 }}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => addRealUser(u)}
                      >
                        {alreadyAdded ? "Added" : <><Plus size={12} /> Add</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
            Only registered RoamSmart users can be added. Search by name, username, or email.
          </p>
        </div>

        {/* Split method */}
        <div className="rs-field">
          <label className="rs-label">Split method</label>
          <div className="rs-tabs">
            {SPLIT_METHODS.map((m) => (
              <button key={m} className={`rs-tab ${method === m ? "on" : ""}`}
                onClick={() => setMethod(m)} type="button">
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>

          {selectedTravellers.map((t) => (
            <div key={t.id} className="rs-split-row">
              <span className="rs-ava sm">{t.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <div style={{ fontSize: 14 }}>{t.name}</div>
                {method === "equal" && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>equal share</div>}
                {method === "percentage" && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>% of total</div>}
                {method === "shares" && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>share count</div>}
              </div>
              <input
                className="rs-split-share"
                type="number"
                min={method === "shares" ? 1 : 0}
                disabled={method === "equal"}
                value={partValues[t.id] ?? ""}
                onChange={(e) => setPartValues((prev) => ({ ...prev, [t.id]: e.target.value }))}
              />
              {method === "percentage" && <span className="rs-split-suffix">%</span>}
              {method === "shares" && <span className="rs-split-suffix">share{Number(partValues[t.id]) === 1 ? "" : "s"}</span>}
              {method === "custom" && <span className="rs-split-suffix">₹</span>}
            </div>
          ))}

          <div className={draftError && selectedTravellers.length ? "rs-split-total bad" : "rs-split-total ok"}>
            {method === "percentage"
              ? `Total ${round2(selectedTravellers.reduce((s, t) => s + Number(partValues[t.id] || 0), 0))}%`
              : method === "shares"
                ? `${selectedTravellers.reduce((s, t) => s + Number(partValues[t.id] || 0), 0)} shares`
                : `Total ${inr(selectedTravellers.reduce((s, t) => s + Number(partValues[t.id] || 0), 0))}`}
          </div>
        </div>

        {/* Description */}
        <div className="rs-field">
          <label className="rs-label">Description (optional)</label>
          <textarea className="rs-textarea" value={description}
            onChange={(e) => setDescription(e.target.value)} placeholder="Anything the group should know…" />
        </div>

        {/* Receipt */}
        <div className="rs-field">
          <label className="rs-label">Receipt (optional)</label>
          {receipt ? (
            <div className="rs-receipt-preview">
              <img src={receipt.dataUrl} alt="Receipt preview" />
              <button className="rs-receipt-x" type="button" onClick={() => setReceipt(null)} aria-label="Remove receipt"><X size={15} /></button>
              <button className="rs-btn rs-btn-ghost" type="button" style={{ position: "absolute", bottom: 8, right: 8, width: "auto", padding: "7px 11px", fontSize: 12 }}
                onClick={() => document.getElementById("rs-receipt-input").click()}>
                <Camera size={13} /> Replace
              </button>
            </div>
          ) : (
            <label className="rs-file" htmlFor="rs-receipt-input">
              {receiptBusy ? "Compressing image…" : "📷 Tap to attach a photo of the bill"}
            </label>
          )}
          <input id="rs-receipt-input" type="file" accept="image/*" hidden
            onChange={(e) => onReceiptChange(e.target.files && e.target.files[0])} />
        </div>

        {error && <div className="rs-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
          <button className="rs-btn rs-btn-ghost" style={{ flex: 1 }} onClick={onClose} type="button">Cancel</button>
          <button className="rs-btn rs-btn-primary" style={{ flex: 1 }} onClick={save} type="button" disabled={busy}>
            {editing ? "Save Changes" : "Add Expense"}
          </button>
        </div>
      </div>
    </div>
  );
}