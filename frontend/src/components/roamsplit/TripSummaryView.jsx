import { inr, formatDate, computeSummary, computeBalances } from "./splitEngine";

export default function TripSummaryView({ travellers, expenses, settlements, selfUid }) {
  const summary = computeSummary(expenses, settlements, travellers);
  const balances = computeBalances(expenses, settlements, travellers);
  const maxCat = Math.max(...summary.category.map(([, v]) => v), 1);
  const maxTravel = Math.max(...summary.byTraveler.map((t) => t.total), 1);
  const maxDest = Math.max(...summary.byDestination.map(([, v]) => v), 1);
  const hasDestinations = summary.byDestination.some(([d]) => d !== "Unknown");

  if (!expenses.length) {
    return (
      <div className="rs-empty">
        <div style={{ fontSize: 34 }}>📊</div>
        <b>No data yet</b>
        <p>Add a few expenses and this trip summary will build itself.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="rs-summary-grid">
        <div className="rs-sum-item"><span>Total spent</span><b>{inr(summary.total)}</b></div>
        <div className="rs-sum-item"><span>Expenses</span><b>{summary.expenseCount}</b></div>
        <div className="rs-sum-item"><span>Settled</span><b>{inr(summary.settled)}</b></div>
        <div className="rs-sum-item"><span>Pending</span><b>{inr(summary.pending)}</b></div>
        <div className="rs-sum-item"><span>Avg / person</span><b>{inr(summary.avgPerPerson)}</b></div>
        <div className="rs-sum-item"><span>Your balance</span><b style={{ color: balances[selfUid]?.net >= 0 ? "#34d399" : "#f87171" }}>
          {inr(balances[selfUid]?.net || 0)}
        </b></div>
      </div>

      <div className="rs-section"><h2>Spending by category</h2></div>
      {summary.category.map(([cat, val]) => (
        <div className="rs-bar-row" key={cat}>
          <span className="rs-bar-label">{cat}</span>
          <span className="rs-bar-track"><span className="rs-bar-fill" style={{ width: `${(val / maxCat) * 100}%` }} /></span>
          <span className="rs-bar-val">{inr(val)}</span>
        </div>
      ))}

      <div className="rs-section"><h2>Spending by traveller</h2></div>
      {summary.byTraveler.map((t) => (
        <div className="rs-bar-row" key={t.id}>
          <span className="rs-bar-label">{t.name}{t.id === selfUid ? " (you)" : ""}</span>
          <span className="rs-bar-track"><span className="rs-bar-fill" style={{ width: `${(t.total / maxTravel) * 100}%`, background: t.id === selfUid ? "linear-gradient(90deg,#e0a84e,#b5822f)" : undefined }} /></span>
          <span className="rs-bar-val">{inr(t.total)}</span>
        </div>
      ))}

      {hasDestinations && (
        <>
          <div className="rs-section"><h2>Spending by destination</h2></div>
          {summary.byDestination.map(([dest, val]) => (
            <div className="rs-bar-row" key={dest}>
              <span className="rs-bar-label">{dest}</span>
              <span className="rs-bar-track"><span className="rs-bar-fill" style={{ width: `${(val / maxDest) * 100}%`, background: "linear-gradient(90deg,#7c3aed,#a78bfa)" }} /></span>
              <span className="rs-bar-val">{inr(val)}</span>
            </div>
          ))}
        </>
      )}

      <div className="rs-section"><h2>Daily spending</h2></div>
      {summary.daily.map(([date, val]) => (
        <div className="rs-bar-row" key={date}>
          <span className="rs-bar-label">{formatDate(date)}</span>
          <span className="rs-bar-track"><span className="rs-bar-fill" style={{ width: `${Math.max(4, (val / Math.max(...summary.daily.map(([, v]) => v), 1)) * 100)}%`, background: "linear-gradient(90deg,#0e7490,#22d3ee)" }} /></span>
          <span className="rs-bar-val">{inr(val)}</span>
        </div>
      ))}

      <div className="rs-divider" />
      <p className="rs-hint">
        Shares are final when every debtor has paid. Pending settlements and your trip balance
        are included above.
      </p>
    </div>
  );
}