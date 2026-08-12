import { useEffect, useState, useMemo } from "react";
import { Plus, Wallet, Receipt, Scale, PieChart, Bell, UserRound, ArrowLeft, Trash2, X } from "lucide-react";
import "./RoamSplit.css";
import {
  inr, computeBalances, computeShares, suggestSettlements, tripDestinations,
} from "./splitEngine";
import {
  loadExpenses, loadSettlements, loadTravellers, saveTravellers,
  loadProfile, saveProfile, loadNotifications, saveNotifications,
  tripIdFor, tripLabelFor, ensureSelfInTravellers,
  currentUser, upsertExpense, deleteExpense,
  newSettlement, upsertSettlement,
  addNotification, wasOnboarded, markOnboarded,
  loadSplitGroups, createSplitGroup, deleteSplitGroup, splitGroupToTrip,
  ensureSplitTripRow, pullSplitTrip, subscribeSplitTrip, subscribeSplitGroups,
  notifySplitMembers, syncTravellersToSupabase,
  pullSplitNotifs, subscribeSplitNotifs, markSplitNotifsRead,
} from "./roomStorage";
import { useAuth } from "../../auth/AuthContext.jsx";
import ExpenseFormSheet from "./ExpenseFormSheet";
import ExpenseList from "./ExpenseList";
import ExpenseDetailSheet from "./ExpenseDetailSheet";
import BalancesView from "./BalancesView";
import SettleUpView from "./SettleUpView";
import TripSummaryView from "./TripSummaryView";
import NotificationsView from "./NotificationsView";
import UpiSheet from "./UpiSheet";
import { PaymentProfileSheet } from "./PaymentProfileSheet";
import GroupMembersView from "./GroupMembersView";

export default function RoamSplitScreen({ trip, userId, setActiveTab, showToast }) {
  const auth = useAuth();
  const authProfile = auth.profile || {};
  const [profile, setProfileState] = useState(() => {
    const local = loadProfile();
    return {
      displayName: authProfile.displayName || local.displayName || "",
      upi: authProfile.upi || local.upi || "",
      preferredApp: authProfile.preferredApp || local.preferredApp || "Google Pay",
    };
  });
  const [selectedTrip, setSelectedTrip] = useState(trip || null);
  const [splitGroups, setSplitGroups] = useState(loadSplitGroups);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", destination: "", startDate: "", endDate: "" });
  const [deleteConfirm, setDeleteConfirm] = useState(null); // group id to confirm deletion

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

  // Keep the split payment profile in sync with the signed-in account (Supabase
  // users row) so the UPI ID shown here is always the same one from Profile.
  useEffect(() => {
    if (authProfile) {
      setProfileState((p) => ({
        ...p,
        displayName: authProfile.displayName != null ? authProfile.displayName : p.displayName,
        upi: authProfile.upi != null ? authProfile.upi : p.upi,
        preferredApp: authProfile.preferredApp != null ? authProfile.preferredApp : p.preferredApp,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.profile]);

  // Live list of standalone split groups this user belongs to (Supabase-backed).
  useEffect(() => {
    if (!userId) return () => {};
    return subscribeSplitGroups(userId, setSplitGroups);
  }, [userId]);

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

  // Supabase sync: make sure a split container row exists, pull the shared
  // expenses/settlements/members once, then live-update on any remote change.
  useEffect(() => {
    if (!tripId || !userId) return () => {};
    const meta = {
      name: tripLabel,
      destination: destinations[0] || tripLabel,
      startDate: selectedTrip?.startDate || selectedTrip?.formData?.startDate || "",
      endDate: selectedTrip?.endDate || selectedTrip?.formData?.endDate || "",
      userId,
      isSplitGroup: !!selectedTrip?._isSplitGroup,
      selfName: self.name,
      selfUpi: self.upi,
    };
    ensureSplitTripRow(tripId, meta)
      .then(() => pullSplitTrip(tripId))
      .then(() => reload())
      .catch((err) => console.warn("split open sync failed:", err?.message || err));
    const unsub = subscribeSplitTrip(tripId, () => reload());
    return () => { if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Merge the shared (Supabase) notifications for this split into the bell so
  // the added member actually sees "X added you to the split" / expense alerts.
  useEffect(() => {
    if (!tripId || !userId) return () => {};
    let alive = true;
    const merge = (remote) => {
      if (!alive) return;
      setNotifications((cur) => {
        const byId = new Map();
        (cur || []).forEach((n) => { if (n && n.id) byId.set(n.id, n); });
        (remote || []).forEach((n) => { if (n && n.id) byId.set(n.id, n); });
        return [...byId.values()]
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      });
    };
    pullSplitNotifs(tripId, userId).then(merge).catch(() => {});
    const unsub = subscribeSplitNotifs(tripId, userId, merge);
    return () => { alive = false; if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, userId]);

  function notify(message) {
    addNotification(tripLabel, message);
    // Keep already-shown remote notifications in the bell too.
    setNotifications((cur) => {
      const byId = new Map();
      (cur || []).forEach((n) => { if (n && n.id) byId.set(n.id, n); });
      loadNotifications().forEach((n) => { if (n && n.id) byId.set(n.id, n); });
      return [...byId.values()]
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    });
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
      notifySplitMembers({
        gid: tripId, gidName: tripLabel,
        text: `${self.name} added expense ${expense.title} ${inr(expense.amount)} — your share ${inr(myShare)}`,
        kind: "split", icon: "💰", excludeUids: [userId],
      }).catch(() => {});
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

  async function onAddTraveller(t) {
    const list = [...travellers, t];
    saveTravellers(tripId, list);
    setTravellers(list);
    notify(`${t.name} joined the split.`);
    // Sync the member row to Supabase first, then notify the newly-added member
    // (and the rest of the crew) so they receive it reliably.
    const syncResult = await syncTravellersToSupabase(tripId, list);
    if (!syncResult.ok) {
      showToast("Added locally but failed to sync to server. The member may not see the group until sync succeeds.", "error");
      return;
    }
    notifySplitMembers({
      gid: tripId, gidName: tripLabel,
      text: `${self.name} added ${t.name} to the split`,
      kind: "split", icon: "👋", excludeUids: [userId],
    }).catch(() => {});
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
      notifySplitMembers({
        gid: tripId, gidName: tripLabel,
        text: `${self.name} requested ${inr(target.amount)} from ${target.name} via ${action.app}`,
        kind: "split", icon: "💸", excludeUids: [userId],
      }).catch(() => {});
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
      notifySplitMembers({
        gid: tripId, gidName: tripLabel,
        text: `${self.name} paid ${target.name} ${inr(target.amount)}`,
        kind: "split", icon: "✅", excludeUids: [userId],
      }).catch(() => {});
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
    setNotifications((cur) => (cur || []).map((n) => ({ ...n, read: true })));
    if (tripId && userId) {
      markSplitNotifsRead(tripId, userId).catch(() => {});
    }
  }

  function clearNotifs() {
    saveNotifications([]);
    setNotifications([]);
  }

  // ── Split group picker (no group selected yet) ─────────────────────
  if (!tripId) {
    function handleCreate(e) {
      e.preventDefault();
      if (!createForm.name.trim()) return;
      const group = createSplitGroup(createForm, userId);
      setSplitGroups(loadSplitGroups());
      setCreateForm({ name: "", destination: "", startDate: "", endDate: "" });
      setShowCreate(false);
      // Open the new group immediately
      setSelectedTrip(splitGroupToTrip(group));
      setView("overview");
    }

    async function handleDelete(group) {
      const res = await deleteSplitGroup(group.id, userId);
      if (!res.ok) { showToast(res.error, "error"); return; }
      setSplitGroups(loadSplitGroups());
      setDeleteConfirm(null);
      showToast("Split group deleted", "info");
    }

    return (
      <div className="rs-wrap">
        <div className="rs-head">
          <div style={{ flex: 1 }}>
            <div className="rs-kicker">RoamSplit</div>
            <h1 className="rs-title">My Split Groups</h1>
            <p className="rs-sub">Create a group and split travel expenses with friends.</p>
          </div>
          <button className="rs-btn rs-btn-primary" style={{ width: "auto", padding: "10px 16px", gap: 6 }}
            type="button" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Group
          </button>
        </div>

        {/* Create group form */}
        {showCreate && (
          <div className="rs-overlay rs-center-sheet" onClick={() => setShowCreate(false)}>
            <div className="rs-card-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="rs-sheet-handle" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 className="rs-sheet-title" style={{ margin: 0 }}>Create Split Group</h3>
                <button className="rs-back" type="button" onClick={() => setShowCreate(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="rs-field">
                  <label className="rs-label">Group name *</label>
                  <input className="rs-input" placeholder="e.g. Goa Trip 2025" value={createForm.name}
                    onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} required />
                </div>
                <div className="rs-field">
                  <label className="rs-label">Destination</label>
                  <input className="rs-input" placeholder="e.g. Goa" value={createForm.destination}
                    onChange={(e) => setCreateForm((p) => ({ ...p, destination: e.target.value }))} />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="rs-field" style={{ flex: 1 }}>
                    <label className="rs-label">Start date</label>
                    <input className="rs-input" type="date" value={createForm.startDate}
                      onChange={(e) => setCreateForm((p) => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div className="rs-field" style={{ flex: 1 }}>
                    <label className="rs-label">End date</label>
                    <input className="rs-input" type="date" value={createForm.endDate}
                      onChange={(e) => setCreateForm((p) => ({ ...p, endDate: e.target.value }))} />
                  </div>
                </div>
                <button className="rs-btn rs-btn-primary" style={{ width: "100%", marginTop: 8 }} type="submit">
                  <Plus size={16} /> Create Group
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {deleteConfirm && (
          <div className="rs-overlay rs-center-sheet" onClick={() => setDeleteConfirm(null)}>
            <div className="rs-card-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
              <div className="rs-sheet-handle" />
              <h3 className="rs-sheet-title">Delete group?</h3>
              <p className="rs-hint" style={{ marginTop: 4 }}>This will permanently delete <b>{deleteConfirm.name}</b> and all its expenses, settlements, and members. This cannot be undone.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button className="rs-btn rs-btn-ghost" style={{ flex: 1 }} type="button" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="rs-btn rs-btn-primary" style={{ flex: 1, background: "rgba(239,68,68,0.85)" }} type="button"
                  onClick={() => handleDelete(deleteConfirm)}>Yes, delete</button>
              </div>
            </div>
          </div>
        )}

        {splitGroups.length === 0 ? (
          <div className="rs-empty">
            <div style={{ fontSize: 40 }}>💸</div>
            <b>No split groups yet</b>
            <p>Create a group to start splitting expenses with your travel companions.</p>
            <button className="rs-btn rs-btn-primary" style={{ width: "auto", display: "inline-flex", marginTop: 16 }}
              type="button" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Create your first group
            </button>
          </div>
        ) : (
          <>
            {splitGroups.map((g) => {
              const trip = splitGroupToTrip(g);
              const tExps = loadExpenses(g.id).length;
              const isCreator = g.creatorId === userId;
              return (
                <div key={g.id} className="rs-trip-card" style={{ position: "relative", paddingRight: isCreator ? 56 : 16 }}
                  onClick={() => { setSelectedTrip(trip); setView("overview"); }} role="button">
                  <span className="rs-ava">{String(g.name).slice(0, 1).toUpperCase()}</span>
                  <div className="rs-trip-body">
                    <div className="rs-trip-name">{g.name}</div>
                    <div className="rs-trip-dates">
                      {g.destination && `${g.destination} · `}{tExps} expense{tExps === 1 ? "" : "s"}
                    </div>
                  </div>
                  <ArrowLeft size={18} style={{ transform: "rotate(180deg)", color: "var(--text-secondary)", flexShrink: 0 }} />
                  {isCreator && (
                    <button
                      className="rs-back"
                      type="button"
                      style={{ position: "absolute", right: 48, top: "50%", transform: "translateY(-50%)", color: "rgba(239,68,68,0.7)" }}
                      title="Delete group"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(g); }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
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
      // Always go back to the group list
      setSelectedTrip(null);
      return;
    }
    setView("overview");
  }

  const heading = {
    overview: "Overview",
    expenses: "Expense history",
    balances: "Trip balances",
    settle: "Settle up",
    summary: "Trip summary",
    notifications: "Notifications",
    members: "Group Members",
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
            <button className="rs-btn rs-btn-ghost" type="button" onClick={() => setView("members")}>
              <UserRound size={15} /> Members
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

      {view === "members" && (
        <GroupMembersView
          travellers={travellers}
          selfUid={userId}
          onAddTraveller={onAddTraveller}
        />
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