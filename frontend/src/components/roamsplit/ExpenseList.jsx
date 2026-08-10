import { useState } from "react";
import { CATEGORY_EMOJI, inr, formatDate, daysAgo, computeShares } from "./splitEngine";

export default function ExpenseList({ expenses, selfUid, travellers, destinations, onOpen }) {
  const [filter, setFilter] = useState("");
  const destList = (destinations && destinations.length ? destinations : []);

  if (!expenses.length) {
    return (
      <div className="rs-empty">
        <div style={{ fontSize: 34 }}>🧾</div>
        <b>No expenses yet</b>
        <p>Add your first expense to start splitting the trip fairly.</p>
      </div>
    );
  }

  const sorted = [...expenses]
    .sort((a, b) =>
      (b.spentDate || "").localeCompare(a.spentDate || "") || a.title.localeCompare(b.title));

  const filtered = filter ? sorted.filter((e) => e.destination === filter) : sorted;

  const selfName = (travellers.find((t) => t.id === selfUid) || {}).name || "You";

  return (
    <div>
      {destList.length > 1 && (
        <div className="rs-field" style={{ marginBottom: 12 }}>
          <label className="rs-label">Group by destination</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button className={`rs-chip ${filter === "" ? "on" : ""}`} type="button" onClick={() => setFilter("")}>All</button>
            {destList.map((d) => (
              <button key={d} className={`rs-chip ${filter === d ? "on" : ""}`} type="button" onClick={() => setFilter(filter === d ? "" : d)}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rs-empty" style={{ padding: "24px 0" }}>
          <b>No expenses in {filter}</b>
          <p>Pick another destination or clear the filter.</p>
        </div>
      )}

      {filtered.map((e) => {
        const shares = computeShares(e);
        const myShare = shares[selfUid] || 0;
        const paidTotal = (e.payers || []).reduce((s, p) => s + Number(p.amount || 0), 0);
        const paidByNames = (e.payers || []).map((p) => p.name).filter(Boolean);
        const ago = daysAgo(e.spentDate);
        const dateLabel = ago <= 0 ? "Today" : ago === 1 ? "Yesterday" : formatDate(e.spentDate);

        return (
          <button key={e.id} className="rs-exp" type="button" onClick={() => onOpen(e)}>
            <span className="rs-exp-ic">{CATEGORY_EMOJI[e.category] || "🧾"}</span>
            <span className="rs-exp-body">
              <span className="rs-exp-title">{e.title || "Untitled expense"}</span>
              <span className="rs-exp-meta">
                {paidByNames.join(" + ")} · {e.participants?.length || 0} people · {dateLabel}
                {e.destination && <span className="rs-exp-tag" style={{ marginLeft: 6, background: "rgba(224,168,78,.15)", color: "#e0a84e" }}>{e.destination}</span>}
              </span>
            </span>
            <span className="rs-exp-amt">
              <b>{inr(paidTotal)}</b>
              <span className="rs-exp-tag rs-tag-paid" style={{ marginTop: 5, display: "inline-block" }}>
                {myShare > 0 ? `Your share ${inr(myShare)}` : "Not in share"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}