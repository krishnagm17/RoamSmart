import { useEffect, useState } from "react";
import { inr, computeBalances } from "../roamsplit/splitEngine";
import {
  tripIdForGroup, groupDestinations,
} from "./groupsEngine";
import {
  loadExpenses, saveExpenses, loadSettlements, saveSettlements, loadTravellers, saveTravellers, upsertSettlement,
  ensureSplitTripRow, pullSplitTrip, subscribeSplitTrip,
} from "../roamsplit/roomStorage";
import ExpenseFormSheet from "../roamsplit/ExpenseFormSheet";
import ExpenseList from "../roamsplit/ExpenseList";
import ExpenseDetailSheet from "../roamsplit/ExpenseDetailSheet";
import BalancesView from "../roamsplit/BalancesView";
import UpiSheet from "../roamsplit/UpiSheet";

export default function ExpensesView({ g, act }) {
  const tripId = tripIdForGroup(g.group);
  const [tab, setTab] = useState("balances");
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [payTarget, setPayTarget] = useState(null);
  const [, setTick] = useState(0);

  // Share group expenses through Supabase and live-update when a member
  // anywhere adds / settles an expense.
  useEffect(() => {
    if (!tripId || !g.self?.id) return () => {};
    ensureSplitTripRow(tripId, {
      name: g.group.name,
      destination: (groupDestinations(g.group)[0]) || g.group.name,
      startDate: g.group.startDate,
      endDate: g.group.endDate,
      userId: g.self.id,
      selfName: g.self.name,
      selfUpi: g.self.upi || "",
      isSplitGroup: false,
    }).then(() => pullSplitTrip(tripId)).then(() => setTick((n) => n + 1)).catch(() => {});
    return subscribeSplitTrip(tripId, () => setTick((n) => n + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, g.self?.id]);

  if (!tripId) return <div className="rg-empty"><p>Set trip dates to enable group expenses.</p></div>;

  ensureTravellers(tripId, g.members, g.self);
  const expenses = loadExpenses(tripId);
  const settlements = loadSettlements(tripId);
  const travellers = loadTravellers(tripId);
  const balances = computeBalances(expenses, settlements, travellers);
  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  function onSaveExpense(expense) {
    const isNew = !expenses.some((e) => e.id === expense.id);
    const list = loadExpenses(tripId);
    const idx = list.findIndex((e) => e.id === expense.id);
    if (idx >= 0) list[idx] = expense;
    else list.unshift(expense);
    saveExpenses(tripId, list);
    act.onExpenseEvent(isNew ? "added" : "updated", expense);
    setForm(null);
  }

  function onDelete(expense) {
    saveExpenses(tripId, loadExpenses(tripId).filter((e) => e.id !== expense.id));
    act.onExpenseEvent("deleted", expense);
    setDetail(null);
  }

  function openPay(target) {
    const t = travellers.find((x) => x.id === target.uid) || {};
    setPayTarget({ uid: target.uid, name: target.name, amount: target.amount, upi: t.upi || "" });
  }

  function upiHandler(action) {
    if (action.initiated || action.done) {
      const existing = loadSettlements(tripId).find(
        (s) => s.fromUid === g.self.id && s.toUid === payTarget.uid && (s.status === "pending" || s.status === "initiated")
      );
      const settlement = existing || { id: "s" + Math.random().toString(36).slice(2), tripId, fromUid: g.self.id, fromName: g.self.name, toUid: payTarget.uid, toName: payTarget.name, amount: Number(payTarget.amount), status: "pending", createdAt: new Date().toISOString() };
      settlement.status = action.initiated ? "initiated" : "paid";
      settlement.initiatedApp = action.app;
      upsertSettlement(tripId, settlement);
      act.onExpenseEvent(action.done ? "settled" : "requested", settlement);
      setPayTarget(null);
    }
  }

  const tabs = [
    { id: "balances", label: `Balances` },
    { id: "expenses", label: `Expenses${expenses.length ? ` · ${expenses.length}` : ""}` },
    { id: "settle", label: "Settle up" },
  ];

  return (
    <div>
      <div className="rg-section" style={{ marginTop: 4 }}>
        <h2>Group expenses</h2>
        <button className="rg-btn rg-btn-sm rg-btn-primary" onClick={() => setForm({ open: true, editing: null })}>+ Add expense</button>
      </div>
      <div className="rg-stat-grid" style={{ marginBottom: 12 }}>
        <div className="rg-sum-item"><span>Total</span><b>{inr(total)}</b></div>
        <div className="rg-sum-item"><span>Your balance</span><b style={{ color: (balances[g.self.id]?.net || 0) >= 0 ? "#34d399" : "#f87171" }}>{inr(balances[g.self.id]?.net || 0)}</b></div>
      </div>
      <div className="rg-folder-tabs">
        {tabs.map((t) => <button key={t.id} className={`rg-chip ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === "balances" && (
        <BalancesView travellers={travellers} expenses={expenses} settlements={settlements}
          selfUid={g.self.id} onPay={openPay} onOpenSettleUp={() => setTab("settle")} />
      )}
      {tab === "expenses" && (
        expenses.length === 0 ? <div className="rg-empty"><p>No expenses recorded yet.</p></div>
          : <ExpenseList expenses={expenses} selfUid={g.self.id} travellers={travellers} destinations={groupDestinations(g.group)} onOpen={(e) => setDetail(e)} />
      )}
      {tab === "settle" && (
        <div>
          {Object.values(balances).filter((b) => b.net !== 0).map((b) => {
            const name = travellers.find((t) => t.id === b.id)?.name || "Them";
            return (
              <div className="rg-list-row" key={b.id}>
                <span className="rg-act-ic">💸</span>
                <div className="rg-list-body">
                  <div className="rg-list-name">{name}</div>
                  <div className="rg-list-sub">{b.net > 0 ? "you're owed" : "you owe"} · {inr(Math.abs(b.net))}</div>
                </div>
                {b.net < 0 && <button className="rg-btn rg-btn-sm rg-btn-primary" onClick={() => openPay(b)}>Pay now</button>}
              </div>
            );
          })}
          {Object.values(balances).filter((b) => b.net !== 0).length === 0 && <div className="rg-empty"><p>All settled up 🎉</p></div>}
        </div>
      )}

      {form && (
        <ExpenseFormSheet editing={form.editing} tripId={tripId} travellers={travellers}
          destinations={groupDestinations(g.group)}
          selfUid={g.self.id} selfName={g.self.name}
          onSave={onSaveExpense} onClose={() => setForm(null)} showToast={act.showToast} />
      )}
      {detail && (
        <ExpenseDetailSheet expense={detail} travellers={travellers} selfUid={g.self.id} settlements={settlements}
          onEdit={() => { setForm({ open: true, editing: detail }); setDetail(null); }}
          onDelete={() => onDelete(detail)}
          onSettleWith={(payer) => { setDetail(null); openPay({ uid: payer.uid, name: payer.name, amount: 0 }); }}
          onClose={() => setDetail(null)} />
      )}
      {payTarget && (
        <UpiSheet amount={payTarget.amount} recipientName={payTarget.name} recipientUpi={payTarget.upi}
          tripLabel={g.group.name} onMarkPaid={upiHandler} onClose={() => setPayTarget(null)} />
      )}
    </div>
  );
}

function ensureTravellers(tripId, members, self) {
  const map = (m) => ({ id: m.id, name: m.username || m.name, upi: m.upi || "", isYou: m.id === self.id });
  let list = loadTravellers(tripId);
  const next = [];
  members.forEach((m) => {
    if (!list.some((t) => t.id === m.id)) next.push(map(m));
  });
  if (!list.some((t) => t.id === self.id)) next.push(map(self));
  if (next.length) saveTravellers(tripId, [...list, ...next]);
}