import { ArrowRight } from "lucide-react";
import { inr, computeBalances, suggestSettlements } from "./splitEngine";

export default function SettleUpView({
  travellers, expenses, settlements, selfUid, tripLabel,
  onPay, onUpdateSettlement, onClose,
}) {
  const balances = computeBalances(expenses, settlements, travellers);
  const suggestions = suggestSettlements(balances, settlements);
  const inProgress = (settlements || []).filter((s) => s.status === "pending" || s.status === "initiated");

  const mine = suggestions.filter((s) => s.fromUid === selfUid);
  const others = suggestions.filter((s) => s.fromUid !== selfUid);

  function nameOf(id) {
    const t = travellers.find((x) => x.id === id);
    return t ? t.name : "Someone";
  }

  function statusPill(status) {
    return <span className={`rs-status-pill rs-st-${status}`}>{status}</span>;
  }

  return (
    <div>
      {mine.length === 0 && others.length === 0 && inProgress.length === 0 && (
        <div className="rs-empty">
          <div style={{ fontSize: 34 }}>✅</div>
          <b>Nothing to settle</b>
          <p>No outstanding balances right now.</p>
        </div>
      )}

      {mine.length > 0 && (
        <>
          <div className="rs-section" style={{ marginTop: 0 }}>
            <h2>Pay what you owe</h2>
          </div>
          {mine.map((s) => (
            <div key={`${s.fromUid}-${s.toUid}`} className="rs-person">
              <span className="rs-ava">{nameOf(s.fromUid).slice(0, 1).toUpperCase()}</span>
              <div className="rs-person-body">
                <div className="rs-person-name">Pay {nameOf(s.toUid)}</div>
                <div className="rs-person-sub">{inr(s.amount)}</div>
              </div>
              <button className="rs-btn rs-btn-primary" style={{ width: "auto", padding: "10px 14px", fontSize: 13 }}
                type="button" onClick={() => onPay({ uid: s.toUid, name: nameOf(s.toUid), amount: s.amount })}>
                Pay Now <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </>
      )}

      {others.length > 0 && (
        <>
          <div className="rs-section">
            <h2>Others need to pay</h2>
            <span className="rs-muted" style={{ fontSize: 12.5 }}>Share the request with them</span>
          </div>
          {others.map((s) => (
            <div key={`${s.fromUid}-${s.toUid}`} className="rs-person">
              <span className="rs-ava alt">{nameOf(s.fromUid).slice(0, 1).toUpperCase()}</span>
              <div className="rs-person-body">
                <div className="rs-person-name">{nameOf(s.fromUid)} → {nameOf(s.toUid)}</div>
                <div className="rs-person-sub">{inr(s.amount)}</div>
              </div>
              <span className="rs-exp-tag rs-tag-pending">request</span>
            </div>
          ))}
        </>
      )}

      {inProgress.length > 0 && (
        <>
          <div className="rs-section">
            <h2>In progress</h2>
          </div>
          {inProgress.map((s) => (
            <div key={s.id} className="rs-person">
              <span className="rs-ava sm">{s.fromName.slice(0, 1).toUpperCase()}</span>
              <div className="rs-person-body">
                <div className="rs-person-name">{s.fromName} → {s.toName}</div>
                <div className="rs-person-sub">{inr(s.amount)} · {s.initiatedApp || "manual request"}</div>
              </div>
              {statusPill(s.status)}
              {s.fromUid === selfUid && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="rs-btn rs-btn-primary" style={{ width: "auto", padding: "9px 12px", fontSize: 12 }}
                    type="button" onClick={() => onUpdateSettlement(s, "paid")}
                    title="Confirm the money reached them">
                    Mark paid
                  </button>
                  <button className="rs-btn rs-btn-danger" style={{ width: "auto", padding: "9px 12px", fontSize: 12 }}
                    type="button" onClick={() => onUpdateSettlement(s, "cancelled")}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}