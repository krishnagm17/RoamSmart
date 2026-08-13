import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { inr, validateUpi } from "./splitEngine";

const APPS = [
  { id: "gpay", label: "Google Pay", color: "#4285F4", mark: "G",
    launch: (q) => `https://pay.google.com/gp/p/ui/pay?${q}` },
  { id: "phonepe", label: "PhonePe", color: "#5F259F", mark: "PP",
    launch: (q) => `upi://pay?${q}` },
  { id: "paytm", label: "Paytm", color: "#00BAF2", mark: "₹",
    launch: (q) => `upi://pay?${q}` },
  { id: "upi", label: "Other UPI App", color: "#7c3aed", mark: "₹",
    launch: (q) => `upi://pay?${q}` },
];

function buildQuery({ pa, pn, am, tn }) {
  const params = [`pa=${encodeURIComponent(pa)}`, `pn=${encodeURIComponent(pn || "Traveller")}`];
  if (am) params.push(`am=${Number(am).toFixed(2)}`, "cu=INR");
  if (tn) params.push(`tn=${encodeURIComponent(tn)}`);
  return params.join("&");
}

export default function UpiSheet({
  amount, recipientName, recipientUpi, tripLabel, onMarkPaid, onClose,
}) {
  const [copied, setCopied] = useState(false);
  const [confirmPaid, setConfirmPaid] = useState(false);

  const query = buildQuery({
    pa: recipientUpi || "",
    pn: recipientName,
    am: amount,
    tn: `RoamSplit ${tripLabel || "trip"} settlement`,
  });

  async function copyUpi() {
    try {
      await navigator.clipboard.writeText(recipientUpi || "");
    } catch {
      const el = document.createElement("textarea");
      el.value = recipientUpi || "";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function launch(app) {
    window.location.href = app.launch(query);
    onMarkPaid && onMarkPaid({ app: app.label, initiated: true });
  }

  return (
    <div className="rs-overlay rs-center-sheet" onClick={onClose}>
      <div className="rs-card-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rs-sheet-handle" />
        <h3 className="rs-sheet-title">Settle Payment</h3>
        <p className="rs-sheet-sub">You owe {recipientName}</p>

        <div className="rs-pay-target">
          <span className="rs-hero-label">Amount to pay</span>
          <div className="rs-pay-amount">{inr(amount)}</div>
          <div className="rs-pay-to">To {recipientName}</div>
        </div>

        {recipientUpi && validateUpi(recipientUpi) ? (
          <>
            <div className="rs-upi-box">
              <div>
                <div className="rs-label" style={{ marginBottom: 3 }}>Recipient UPI ID</div>
                <div className="rs-upi-id">{recipientUpi}</div>
              </div>
              <button className="rs-btn rs-btn-ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={copyUpi} type="button">
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="rs-app-grid">
              {APPS.map((app) => (
                <button key={app.id} className="rs-app" type="button" onClick={() => launch(app)}>
                  <span
                    className="rs-app-logo"
                    style={{ background: app.color,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: app.mark.length > 1 ? 11 : 16 }}
                  >
                    {app.mark}
                  </span>
                  {app.label}
                </button>
              ))}
            </div>
            <button className="rs-copy-btn" type="button" onClick={copyUpi}>
              <Copy size={15} /> Copy UPI ID
            </button>
          </>
        ) : (
          <div className="rs-empty">
            <b>No UPI ID yet</b>
            <p>{recipientName} hasn't added a UPI ID. Add one from their account or settle cash between yourselves.</p>
          </div>
        )}

        <div className="rs-divider" />

        {!confirmPaid ? (
          <button
            className="rs-btn rs-btn-primary"
            type="button"
            onClick={() => setConfirmPaid(true)}
            style={{ width: "100%" }}
          >
            Mark Payment as Completed
          </button>
        ) : (
          <div style={{ background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 14, padding: 12 }}>
            <p className="rs-hint" style={{ marginTop: 0 }}>
              Only mark as completed if the money really reached {recipientName}. The app cannot verify UPI transfers on its own.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="rs-btn rs-btn-ghost" type="button" style={{ flex: 1 }} onClick={() => setConfirmPaid(false)}>Cancel</button>
              <button
                className="rs-btn rs-btn-primary" type="button" style={{ flex: 1 }}
                onClick={() => onMarkPaid && onMarkPaid({ done: true })}
              >
                Yes, mark as paid
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const preferredAppColor = (id) => (APPS.find((a) => a.id === id) || APPS[3]).color;