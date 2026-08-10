import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { validateUpi } from "./splitEngine";

const APP_OPTIONS = ["Google Pay", "PhonePe", "Paytm", "Other UPI App"];

export function PaymentProfileSheet({ profile, onSave, onClose, showToast }) {
  const [form, setForm] = useState({
    displayName: profile.displayName || "",
    upi: profile.upi || "",
    preferredApp: profile.preferredApp || "Google Pay",
  });
  const [error, setError] = useState("");

  function save() {
    const upi = form.upi.trim();
    if (upi && !validateUpi(upi)) {
      setError("That doesn't look like a valid UPI ID (e.g. krishna@upi).");
      return;
    }
    onSave({ displayName: form.displayName.trim(), upi, preferredApp: form.preferredApp });
    showToast("Payment profile saved", "success");
    onClose();
  }

  function removeUpi() {
    const next = { ...form, upi: "" };
    setForm(next);
    setError("");
    onSave({ displayName: next.displayName.trim(), upi: "", preferredApp: next.preferredApp });
    showToast("UPI ID removed", "info");
    onClose();
  }

  return (
    <div className="rs-overlay rs-center-sheet" onClick={onClose}>
      <div className="rs-card-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rs-sheet-handle" />
        <h3 className="rs-sheet-title">Payment Details</h3>
        <p className="rs-sheet-sub">Used when others settle up with you.</p>

        <div className="rs-field">
          <label className="rs-label" htmlFor="rs-name">Display name</label>
          <input id="rs-name" className="rs-input" value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            placeholder="e.g. Krishna" />
        </div>

        <div className="rs-field">
          <label className="rs-label" htmlFor="rs-upi">UPI ID</label>
          <input id="rs-upi" className="rs-input" value={form.upi}
            onChange={(e) => setForm((f) => ({ ...f, upi: e.target.value }))}
            placeholder="e.g. krishna@upi" inputMode="email" />
          {error && <div className="rs-error">{error}</div>}
        </div>

        <div className="rs-field">
          <label className="rs-label" htmlFor="rs-app">Preferred UPI app</label>
          <select id="rs-app" className="rs-select" value={form.preferredApp}
            onChange={(e) => setForm((f) => ({ ...f, preferredApp: e.target.value }))}>
            {APP_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <p className="rs-hint">
          RoamSplit never stores your UPI PIN, banking password, OTP, or card details — only
          the UPI ID needed to direct a payment.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="rs-btn rs-btn-danger" type="button" onClick={removeUpi}
            style={{ flex: "none", width: "auto", padding: "14px 16px" }}
            title="Remove UPI ID">
            <Trash2 size={16} />
          </button>
          <button className="rs-btn rs-btn-primary" type="button" style={{ flex: 1 }} onClick={save}>
            <Save size={16} /> Save Payment Details
          </button>
        </div>
      </div>
    </div>
  );
}