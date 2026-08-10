import { useEffect, useState, useMemo } from "react";
import { Plus, Wallet, Receipt, Scale, PieChart, Bell, UserRound, ArrowLeft } from "lucide-react";
import "./RoamSplit.css";
import {
  inr, computeBalances, computeShares, suggestSettlements, tripDestinations,
} from "./splitEngine";
import {
  loadExpenses, loadSettlements, loadTravellers, saveTravellers,
  loadProfile, saveProfile, loadNotifications, saveNotifications, loadTrips,
  tripIdFor, tripLabelFor, ensureSelfInTravellers,
  currentUser, upsertExpense, deleteExpense,
  newSettlement, upsertSettlement,
  addNotification, wasOnboarded, markOnboarded,
} from "./roomStorage";
import ExpenseFormSheet from "./ExpenseFormSheet";
import ExpenseList from "./ExpenseList";
import ExpenseDetailSheet from "./ExpenseDetailSheet";
import BalancesView from "./BalancesView";
import SettleUpView from "./SettleUpView";
import TripSummaryView from "./TripSummaryView";
import NotificationsView from "./NotificationsView";
import UpiSheet from "./UpiSheet";
import { PaymentProfileSheet } from "./PaymentProfileSheet";

export default function RoamSplitScreen({ trip, userId, setActiveTab, showToast }) {
  const [profile, setProfileState] = useState(loadProfile);
  const [selectedTrip, setSelectedTrip] = useState(trip || null);

  const tripId = useMemo(() => tripIdFor(selectedTrip), [selectedTrip]);
  const tripLabel = useMemo(() => tripLabelFor(selectedTrip), [selectedTrip]);
  const destinations = useMemo(() => tripDestinations(selectedTrip || trip || {}), [selectedTrip, trip]);

  const [travellers, setTravellers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [notifications, setNotifications] = useState(loadNotifications);

  const [view, setView] = useState("overview");
  const [form, setForm] = useState(null);        // null | { open, editing }
  const [detail, setDetail] = useState(null);    // expense
  const [payTarget, setPayTarget] = useState(null); // { uid, name, amount }
  const [profileOpen, setProfileOpen] = useState(false);
  const [intro, setIntro] = useState(!wasOnboarded());

  const self = currentUser(userId, profile);

  function reload() {
    if (!tripId) return;
    let list = loadTravellers(tripId);
    list = ensureSelfInTravellers(list, self);
    if (list.length !== loadTravellers(tripId).length) saveTravellers(tripId, list);
    setTravellers(list);
    setExpenses(loadExpenses(tripId));
    setSettlements(loadSettlements(tripId));
  }

  useEffect(() => { reload(); // eslint-disable-line
  }, [tripId]);

  function notify(message) {
    addNotification(tripLabel, message);
    setNotifications(loadNotifications());
  }

  function closeForm() { setForm(null); }

  function onSaveExpense(expense) {
    const isNew = !expenses.some((e) => e.id === expense.id);
    upsertExpense(tripId, expense);
    reload();
    closeForm();
    if (isNew) {
      const myShare = computeShares(expense)[userId] || 0;
      notify(`${self.name} added ${expense.title} ${inr(expense.amount)}. Your share ${inr(myShare)}.`);
      showToast(`Expense added · your share ${inr(myShare)}`, "success");
    } else {
      notify(`${self.name} updated ${expense.title} to ${inr(expense.amount)}.`);
      showToast("Expense updated", "success");
    }
  }

  function onDeleteExpense(expense) {
    const ok = deleteExpense(tripId, expense.id, userId);
    if (!ok) { showToast("Only the person who added this expense can delete it", "error"); return; }
    notify(`${expense.title} ${inr(expense.amount)} was deleted.`);
    setDetail(null);
    reload();
    showToast("Expense deleted", "info");
  }

  function onAddTraveller(t) {
    const list = [...travellers, t];
    saveTravellers(tripId, list);
    setTravellers(list);
    notify(`${t.name} joined the split.`);
  }

  function onSaveProfile(p) {
    saveProfile(p);
    setProfileState(p);
    // Sync payment profile to the signed-in user's Firestore profile when available.
    if (typeof userId === "string") {
      import("../../supabase/userStore").then(({ updateUserProfile }) => {
        updateUserProfile(userId, {
          displayName: p.displayName || "",
          upi: p.upi || "",
          preferredApp: p.preferredApp || "",
        }).catch(() => {});
      });
    }
    reload();
  }

  function onSaveSettlement(settlement) {
    upsertSettlement(tripId, settlement);
    reload();
    setPayTarget(null);
  }

  function openPay(target) {
    setPayTarget({
      uid: target.uid,
      name: target.name,
      amount: target.amount,
      upi: (travellers.find((t) => t.id === target.uid) || {}).upi || "",
    });
  }

  function upiHandler(action) {
    const target = payTarget;
    if (!target) return;
    if (action.initiated) {
      const settlement = newSettlement(tripId, self.id, self.name, target.uid, target.name, target.amount);
      settlement.status = "initiated";
      settlement.initiatedApp = action.app;
      settlement.upiRef = "upi://"; // only the payment direction is recorded — never credentials
      upsertSettlement(tripId, settlement);
      notify(`Payment request sent to ${target.name} for ${inr(target.amount)} via ${action.app}.`);
      showToast(`Opened ${action.app} for ${inr(target.amount)}`, "info");
      reload();
    }
    if (action.done) {
      const existing = (loadSettlements(tripId) || []).find((s) =>
        s.fromUid === self.id && s.toUid === target.uid &&
        (s.status === "pending" || s.status === "initiated"));
      const settlement = existing || newSettlement(tripId, self.id, self.name, target.uid, target.name, target.amount);
      settlement.status = "paid";
      upsertSettlement(tripId, settlement);
      notify(`You paid ${target.name} ${inr(target.amount)}.`);
      showToast(`Marked ${inr(target.amount)} as paid 🎉`, "success");
      reload();
    }
  }

  function updateSettlementStatus(st, status) {
    st.status = status;
    upsertSettlement(tripId, st);
    if (status === "paid") notify(`You confirmed payment of ${inr(st.amount)} to ${st.toName}.`);
    if (status === "cancelled") notify(`Settlement with ${st.toName} was cancelled.`);
    reload();
    showToast(`Settlement ${status}`, status === "paid" ? "success" : "info");
  }

  const balances = useMemo(
    () => (travellers.length ? computeBalances(expenses, settlements, travellers) : {}),
    [expenses, settlements, travellers],
  );
  const myBal = balances[userId] || { net: 0, received: 0, sent: 0 };
  const suggestions = useMemo(
    () => (travellers.length ? suggestSettlements(balances, settlements) : []),
    [balances, settlements, travellers],
  );
  const myPayTotal = suggestions.filter((s) => s.fromUid === userId).reduce((s, x) => s + x.amount, 0);
  const pendingCount = settlements.filter((s) => s.status === "pending" || s.status === "initiated").length;
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const myPaid = expenses.reduce((s, e) => s + (e.payers || []).filter((p) => p.uid === userId).reduce((a, p) => a + Number(p.amount || 0), 0), 0);
  const recent = [...expenses].sort((a, b) => (b.spentDate || "").localeCompare(a.spentDate || "")).slice(0, 5);
  const recentNotifs = notifications.slice(0, 3);

  function markAllRead() {
    saveNotifications(notifications.map((n) => ({ ...n, read: true })));
    setNotifications(loadNotifications());
  }

  function clearNotifs() {
    saveNotifications([]);
    setNotifications([]);
  }

  // ── Trip picker (no trip selected yet) ─────────────────────
  if (!tripId) {
    const trips = loadTrips();
    return (
      <div className="rs-wrap">
        <div className="rs-head">
          <div>
            <div className="rs-kicker">RoamSplit</div>
            <h1 className="rs-title">Split a trip</h1>
            <p className="rs-sub">Pick a journey to open its expense group.</p>
          </div>
        </div>

        {trips.length === 0 ? (
          <div className="rs-empty">
            <div style={{ fontSize: 40 }}>🧭</div>
            <b>No trips recorded yet</b>
            <p>Plan an itinerary first — then open RoamSplit for that trip to start splitting expenses.</p>
            <button className="rs-btn rs-btn-primary" style={{ width: "auto", display: "inline-flex", marginTop: 16 }}
              type="button" onClick={() => setActiveTab("plan")}>
              Plan a trip
            </button>
          </div>
        ) : (
          <>
            {trips.map((t) => {
              const id = tripIdFor(t);
              const tExps = id ? loadExpenses(id).length : 0;
              return (
                <div key={id || t.title} className="rs-trip-card" onClick={() => { setSelectedTrip(t); setView("overview"); }} role="button">
                  <span className="rs-ava">{String(tripLabelFor(t)).slice(0, 1)}</span>
                  <div className="rs-trip-body">
                    <div className="rs-trip-name">{tripLabelFor(t)}</div>
                    <div className="rs-trip-dates">{tExps} expense{tExps === 1 ? "" : "s"} recorded</div>
                  </div>
                  <ArrowLeft size={18} style={{ transform: "rotate(180deg)", color: "var(--text-secondary)" }} />
                </div>
              );
            })}
          </>
        )}

        <div style={{ marginTop: 24 }}>
          <button className="rs-btn rs-btn-ghost" style={{ width: "100%" }} type="button"
            onClick={() => setProfileOpen(true)}>
            <UserRound size={16} /> Your payment profile
          </button>
        </div>
        {profileOpen && <PaymentProfileSheet profile={profile} onSave={onSaveProfile} onClose={() => setProfileOpen(false)} showToast={showToast} />}
      </div>
    );
  }

  function goBack() {
    if (view === "overview") {
      if (!trip && selectedTrip) { setSelectedTrip(null); return; }
      setActiveTab("dashboard");
    } else {
      setView("overview");
    }
  }

  const heading = {
    overview: "Overview",
    expenses: "Expense history",
    balances: "Trip balances",
    settle: "Settle up",
    summary: "Trip summary",
    notifications: "Notifications",
  }[view];

  return (
    <div className="rs-wrap">
      {/* Nav header */}
      <div className="rs-head">
        <button className="rs-back" type="button" onClick={goBack} aria-label="Back"><ArrowLeft size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rs-kicker">RoamSplit · {view !== "overview" ? heading : tripLabel}</div>
          <h2 className="rs-title" style={{ fontSize: 19, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {view === "overview" ? "Trip expenses" : heading}
          </h2>
        </div>
        <button className="rs-back" type="button" onClick={() => setView("notifications")} aria-label="Notifications" style={{ position: "relative" }}>
          <Bell size={17} />
          {notifications.some((n) => !n.read) && (
            <span style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
          )}
        </button>
      </div>

      {/* Intro card */}
      {intro && (
        <div className="rs-card" style={{ marginBottom: 14, borderColor: "rgba(224,168,78,.4)" }}>
          <b style={{ fontFamily: "var(--font-display, serif)" }}>Welcome to RoamSplit 🧾</b>
          <p className="rs-hint" style={{ margin: "6px 0 10px" }}>
            Record expenses, split fairly, settle balances and pay via UPI. Add your UPI ID so friends can pay you back.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="rs-btn rs-btn-gold" style={{ flex: 1 }} type="button"
              onClick={() => { setProfileOpen(true); markOnboarded(); setIntro(false); }}>
              Add UPI ID
            </button>
            <button className="rs-btn rs-btn-ghost" style={{ flex: 1 }} type="button"
              onClick={() => { markOnboarded(); setIntro(false); }}>
              Not now
            </button>
          </div>
        </div>
      )}

      {view === "overview" && (
        <>
          <div className="rs-balance-hero">
            {myBal.net > 0.01 && <span className="rs-hero-badge">You will receive</span>}
            {myBal.net < -0.01 && <span className="rs-hero-badge warn">You owe</span>}
            <div className="rs-hero-label">Your trip balance</div>
            <div className={`rs-hero-amount ${myBal.net > 0.01 ? "positive" : myBal.net < -0.01 ? "negative" : ""}`}>
              {inr(myBal.net)}
            </div>
            <div className="rs-hero-foot">
              {tripLabel} · {travellers.length} traveller{travellers.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="rs-btns">
            <button className="rs-btn rs-btn-primary" type="button" onClick={() => setForm({ open: true, editing: null })}>
              <Plus size={16} /> Add Expense
            </button>
            <button className="rs-btn rs-btn-gold" type="button" onClick={() => setView("balances")}>
              <Scale size={15} /> Balances
            </button>
            <button className="rs-btn rs-btn-ghost" type="button" onClick={() => setView("expenses")}>
              <Receipt size={15} /> View Expenses
            </button>
            <button className="rs-btn rs-btn-ghost" type="button" onClick={() => setView("settle")}>
              <Wallet size={15} /> Settle Up
            </button>
          </div>

          <div className="rs-stat-grid">
            <div className="rs-sum-item"><span>Total expenses</span><b>{inr(totalSpent)}</b></div>
            <div className="rs-sum-item"><span>You paid</span><b>{inr(myPaid)}</b></div>
            <div className="rs-sum-item"><span>Pending settlements</span><b>{pendingCount}</b></div>
            <div className="rs-sum-item"><span>Balance</span><b style={{ color: myBal.net >= 0 ? "#34d399" : "#f87171" }}>
              {myBal.net >= 0 ? inr(myBal.net) : "−" + inr(-myBal.net)}
            </b></div>
          </div>

          {(expenses.length > 0 || suggestions.length > 0) && (
            <div className="rs-section"><h2>Recent expenses</h2></div>
          )}
          {recent.length > 0 ? (
            <ExpenseList expenses={recent} selfUid={userId} travellers={travellers} destinations={destinations}
              onOpen={(e) => setDetail(e)} />
          ) : (
            <div className="rs-empty">
              <div style={{ fontSize: 40 }}>💸</div>
              <b>Start the split</b>
              <p>Tap Add Expense — dinner, petrol, a shared taxi. The fair-split math happens automatically.</p>
            </div>
          )}

          {(recentNotifs.length > 0 || expenses.length > 0 || suggestions.length > 0) && (
            <div className="rs-section"><h2>Activity</h2>
              <button className="rs-chip" type="button" onClick={() => setView("notifications")}>View all</button>
            </div>
          )}
          {recentNotifs.length > 0 && (
            <NotificationsView notifications={recentNotifs} onMarkAllRead={markAllRead} onClear={clearNotifs} />
          )}

          <div className="rs-divider" />
          <button className="rs-btn rs-btn-ghost" style={{ width: "100%" }} type="button" onClick={() => setView("summary")}>
            <PieChart size={15} /> End-of-trip summary & analytics
          </button>
          <button className="rs-btn rs-btn-ghost" style={{ width: "100%", marginTop: 8 }} type="button"
            onClick={() => setProfileOpen(true)}>
            <UserRound size={15} /> Payment profile · {profile.upi ? profile.upi : "add UPI ID"}
          </button>
        </>
      )}

      {view === "expenses" && (
        <ExpenseList expenses={expenses} selfUid={userId} travellers={travellers} destinations={destinations}
          onOpen={(e) => setDetail(e)} />
      )}

      {view === "balances" && (
        <BalancesView travellers={travellers} expenses={expenses} settlements={settlements}
          selfUid={userId} onPay={openPay} onOpenSettleUp={() => setView("settle")} />
      )}

      {view === "settle" && (
        <SettleUpView travellers={travellers} expenses={expenses} settlements={settlements}
          selfUid={userId} tripLabel={tripLabel}
          onPay={openPay} onUpdateSettlement={updateSettlementStatus}
          onClose={() => setView("balances")} />
      )}

      {view === "summary" && (
        <TripSummaryView travellers={travellers} expenses={expenses} settlements={settlements} selfUid={userId} />
      )}

      {view === "notifications" && (
        <NotificationsView notifications={notifications} onMarkAllRead={markAllRead} onClear={clearNotifs} />
      )}

      {/* Floating add button */}
      {view !== "overview" && (
        <button className="rs-fab" type="button" aria-label="Add expense"
          onClick={() => setForm({ open: true, editing: null })}>
          <Plus size={26} />
        </button>
      )}

      {/* Sheets */}
      {form && (
        <ExpenseFormSheet
          editing={form.editing}
          tripId={tripId}
          travellers={travellers}
          destinations={destinations}
          selfUid={userId}
          selfName={self.name}
          onSave={onSaveExpense}
          onAddTraveller={onAddTraveller}
          onClose={closeForm}
          showToast={showToast}
        />
      )}

      {detail && (
        <ExpenseDetailSheet
          expense={detail}
          travellers={travellers}
          selfUid={userId}
          settlements={settlements}
          onEdit={() => { setForm({ open: true, editing: detail }); setDetail(null); }}
          onDelete={() => onDeleteExpense(detail)}
          onSettleWith={(payer) => { setDetail(null); openPay({ uid: payer.uid, name: payer.name, amount: computeShares(detail)[userId] }); }}
          onClose={() => setDetail(null)}
        />
      )}

      {payTarget && (
        <UpiSheet
          amount={payTarget.amount}
          recipientName={payTarget.name}
          recipientUpi={payTarget.upi}
          tripLabel={tripLabel}
          onMarkPaid={upiHandler}
          onClose={() => setPayTarget(null)}
        />
      )}

      {profileOpen && <PaymentProfileSheet profile={profile} onSave={onSaveProfile} onClose={() => setProfileOpen(false)} showToast={showToast} />}
    </div>
  );
}