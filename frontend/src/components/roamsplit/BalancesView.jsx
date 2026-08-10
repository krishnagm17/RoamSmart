import { useState } from "react";
import { Wallet, ArrowRight } from "lucide-react";
import { inr, computeBalances, suggestSettlements } from "./splitEngine";

export function nameOf(travellers, id) {
  const t = travellers.find((x) => x.id === id);
  return t ? t.name : "Someone";
}

export function avaColor(id, selfUid) {
  return id === selfUid ? "" : "alt";
}

export default function BalancesView({ travellers, expenses, settlements, selfUid, onPay, onOpenSettleUp }) {
  const [openQueueOnly, setOpenQueueOnly] = useState(true);
  const balances = computeBalances(expenses, settlements, travellers);
  const myBal = balances[selfUid];
  const suggestions = suggestSettlements(balances, settlements);
  const inProgress = (settlements || []).filter((s) => s.status === "pending" || s.status === "initiated");

  const creditors = suggestions.filter((s) => s.fromUid === selfUid);

  return (
    <div>
      <div className="rs-balance-hero">
        {myBal && myBal.net > 0.01 && (
          <span className="rs-hero-badge">You will receive</span>
        )}
        {myBal && myBal.net < -0.01 && (
          <span className="rs-hero-badge warn">You owe</span>
        )}
        <div className="rs-hero-label">Your trip balance</div>
        <div className={`rs-hero-amount ${myBal ? (myBal.net > 0.01 ? "positive" : myBal.net < -0.01 ? "negative" : "") : ""}`}>
          {inr(myBal ? myBal.net : 0)}
        </div>
        <div className="rs-hero-foot">
          You paid {inr(myBal ? myBal.received : 0)} · Your share {inr(myBal ? myBal.sent : 0)}
        </div>
      </div>

      {creditors.length > 0 && (
        <button className="rs-btn rs-btn-gold" style={{ width: "100%", marginBottom: 12 }}
          type="button" onClick={onOpenSettleUp}>
          <Wallet size={16} /> Settle Up — pay {inr(creditors.reduce((s, c) => s + c.amount, 0))} total
        </button>
      )}

      <div className="rs-section" style={{ marginTop: 4 }}>
        <h2>Who owes what</h2>
        <button className="rs-chip" type="button" onClick={() => setOpenQueueOnly((v) => !v)}>
          {openQueueOnly ? "Open only" : "Everyone"}
        </button>
      </div>

      {(travellers || []).map((t) => {
        const b = balances[t.id];
        if (!b) return null;
        if (openQueueOnly && Math.abs(b.net) <= 0.01 && !inProgress.some((s) => s.fromUid === t.id || s.toUid === t.id)) return null;
        const owesSomeone = b.net < -0.01;
        const receives = b.net > 0.01;
        return (
          <div key={t.id} className="rs-person">
            <span className={`rs-ava ${avaColor(t.id, selfUid)}`}>{t.name.slice(0, 1).toUpperCase()}</span>
            <div className="rs-person-body">
              <div className="rs-person-name">{t.name}{t.id === selfUid && " (you)"}</div>
              <div className="rs-person-sub">
                {receives ? `Should receive ${inr(b.net)}` : owesSomeone ? `Owes ${inr(-b.net)}` : t.id === selfUid ? "All settled 🎉" : "Settled"}
              </div>
            </div>
            {owesSomeone ? (
              t.id === selfUid ? (
                <button className="rs-btn rs-btn-primary" style={{ width: "auto", padding: "10px 14px", fontSize: 13 }}
                  type="button" onClick={onOpenSettleUp}>
                  Pay Now <ArrowRight size={14} />
                </button>
              ) : (
                <span className="rs-person-amt neg">−{inr(-b.net)}</span>
              )
            ) : receives ? (
              <span className="rs-person-amt pos" style={{ fontFamily: "monospace" }}>{inr(b.net)}</span>
            ) : (
              <span className="rs-person-amt flat">settled</span>
            )}
          </div>
        );
      })}

      {inProgress.length > 0 && (
        <>
          <div className="rs-section">
            <h2>Payments in progress</h2>
          </div>
          {inProgress.map((s) => (
            <div key={s.id} className="rs-person">
              <span className="rs-ava sm">{s.fromName.slice(0, 1).toUpperCase()}</span>
              <div className="rs-person-body">
                <div className="rs-person-name">{s.fromName} → {s.toName}</div>
                <div className="rs-person-sub">{inr(s.amount)} · {s.initiatedApp || "requested"}</div>
              </div>
              <span className={`rs-status-pill rs-st-${s.status}`}>{s.status}</span>
            </div>
          ))}
        </>
      )}

      {suggestions.length === 0 && inProgress.length === 0 && (
        <div className="rs-empty">
          <div style={{ fontSize: 34 }}>🎉</div>
          <b>All settled up</b>
          <p>Everything evens out once the current expenses are accounted for.</p>
        </div>
      )}
    </div>
  );
}