import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Camera, X, Loader } from "lucide-react";
import {
  CATEGORIES, SPLIT_METHODS, inr, round2, splitError,
  compressToDataUrl, uid,
} from "./splitEngine";

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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const payerEdited = useRef(editing ? true : false);

  const selectedTravellers = useMemo(
    () => travellers.filter((t) => selectedIds.includes(t.id)),
    [travellers, selectedIds],
  );

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

  return createPortal(
    <div className="rs-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="rs-sheet" onClick={(e) => e.stopPropagation()}
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
            <input className="rs-input" type="number" min="0" placeholder="0"
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="rs-field">
            <label className="rs-label">Date</label>
            <input className="rs-input" type="date" value={spentDate}
              onChange={(e) => setSpentDate(e.target.value)} />
          </div>
        </div>

        {/* Category + Destination */}
        <div className="rs-row">
          <div className="rs-field">
            <label className="rs-label">Category</label>
            <select className="rs-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="rs-field">
            <label className="rs-label">Location (optional)</label>
            <select className="rs-select" value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">-- None --</option>
              {(Array.isArray(destinations) ? destinations : []).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="rs-field">
          <label className="rs-label">Notes (optional)</label>
          <textarea className="rs-textarea" value={description} onChange={(e) => setDescription(e.target.value)}
            rows={2} placeholder="Add any details..." />
        </div>

        {/* Who Paid */}
        <div className="rs-field" style={{ marginTop: 20 }}>
          <label className="rs-label">Who Paid?</label>
          {payers.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select className="rs-select" style={{ flex: 1 }} value={p.uid}
                onChange={(e) => {
                  const sel = travellers.find((t) => t.id === e.target.value);
                  setPayers((prev) => prev.map((x, idx) => (idx === i ? { ...x, uid: sel.id, name: sel.name } : x)));
                }}>
                {travellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
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
              Total paid: {inr(paidTotal)} {Math.abs(paidTotal - amt) > 0.01 && `(Need ${inr(amt)})`}
            </span>
          </div>
        </div>

        {/* How to Split */}
        <div className="rs-field" style={{ marginTop: 24 }}>
          <label className="rs-label">How to split?</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {travellers.map((t) => (
              <button key={t.id} className={`rs-chip ${selectedIds.includes(t.id) ? "on" : ""}`}
                onClick={() => pickTraveller(t.id)} type="button">
                <span className="rs-ava sm">{t.name.slice(0, 1).toUpperCase()}</span>
                {t.name}
              </button>
            ))}
          </div>
          {selectedTravellers.length === 0 ? (
            <p className="rs-hint">Select at least one participant.</p>
          ) : (
            <div className="rs-split-box">
              <div className="rs-tabs">
                {SPLIT_METHODS.map((m) => (
                  <button key={m} className={`rs-tab ${method === m ? "on" : ""}`}
                    onClick={() => setMethod(m)} type="button">
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              <div style={{ paddingTop: 14 }}>
                {selectedTravellers.map((t) => (
                  <div key={t.id} className="rs-split-row">
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="rs-ava sm">{t.name.slice(0, 1).toUpperCase()}</span>
                      <span style={{ fontSize: 13 }}>{t.name}</span>
                    </div>
                    {method === "equal" && <span style={{ fontSize: 14, fontWeight: 600 }}>{inr(partValues[t.id] || 0)}</span>}
                    {method === "percentage" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input className="rs-split-share" type="number" min="0" max="100"
                          value={partValues[t.id] === 0 ? "" : partValues[t.id] || ""}
                          onChange={(e) => setPartValues((p) => ({ ...p, [t.id]: Number(e.target.value) }))} />
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>%</span>
                      </div>
                    )}
                    {method === "shares" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input className="rs-split-share" type="number" min="1"
                          value={partValues[t.id] === 0 ? "" : partValues[t.id] || ""}
                          onChange={(e) => setPartValues((p) => ({ ...p, [t.id]: Number(e.target.value) }))} />
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>shares</span>
                      </div>
                    )}
                    {method === "custom" && (
                      <input className="rs-split-share" type="number" min="0" placeholder="0"
                        value={partValues[t.id] === 0 ? "" : partValues[t.id] || ""}
                        onChange={(e) => setPartValues((p) => ({ ...p, [t.id]: Number(e.target.value) }))} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Receipt Attachment */}
        <div className="rs-field" style={{ marginTop: 24 }}>
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
            <button className="rs-attach-btn" type="button" onClick={() => document.getElementById("rs-receipt-input").click()} disabled={receiptBusy}>
              {receiptBusy ? <Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Camera size={16} />}
              {receiptBusy ? "Processing..." : "Attach a photo"}
            </button>
          )}
          <input id="rs-receipt-input" type="file" accept="image/*" style={{ display: "none" }}
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
    </div>,
    document.body
  );
}