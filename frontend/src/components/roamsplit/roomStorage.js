// RoamSplit — localStorage persistence + helpers.
import { generateTripId } from "../../hooks/usePhotos";
import { uid } from "./splitEngine";

const KEYS = {
  expenses: (t) => `roam_split_expenses_${t}`,
  settlers: (t) => `roam_split_settlements_${t}`,
  travellers: (t) => `roam_split_travellers_${t}`,
  profile: "roam_split_profile",
  notifications: "roam_split_notifications",
  onboarding: "roam_split_onboarded",
  splitGroups: "roam_split_groups",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error("RoamSplit storage write failed:", err);
    return false;
  }
}

// Stable id for a trip, reusing the app's own trip-id strategy.
export function tripIdFor(trip) {
  if (!trip) return null;
  const f = trip.formData || {};
  if (f.destination && f.startDate && f.endDate) {
    return generateTripId(f.destination, f.startDate, f.endDate);
  }
  if (trip.id) return String(trip.id);
  return generateTripId(trip.title || "trip", trip.startDate || "x", trip.endDate || "x");
}

export function tripLabelFor(trip) {
  if (!trip) return "Unknown Trip";
  const f = trip.formData || {};
  if (f.destination) {
    const dest = String(f.destination).split(",")[0].trim();
    const dates = f.startDate
      ? `${f.startDate.slice(0, 10)}${f.endDate ? " → " + f.endDate.slice(0, 10) : ""}`
      : "";
    return `${dest}${dates ? " · " + dates : ""}`;
  }
  return trip.title || "Untitled Trip";
}

export function loadExpenses(tripId) { return read(KEYS.expenses(tripId), []); }
export function saveExpenses(tripId, list) { return write(KEYS.expenses(tripId), list); }

export function loadSettlements(tripId) { return read(KEYS.settlers(tripId), []); }
export function saveSettlements(tripId, list) { return write(KEYS.settlers(tripId), list); }

export function loadTravellers(tripId) { return read(KEYS.travellers(tripId), []); }
export function saveTravellers(tripId, list) { return write(KEYS.travellers(tripId), list); }

export function loadProfile() { return read(KEYS.profile, { displayName: "", upi: "", preferredApp: "" }); }
export function saveProfile(p) { return write(KEYS.profile, p); }

export function loadNotifications() { return read(KEYS.notifications, []); }
export function saveNotifications(list) {
  if (!write(KEYS.notifications, list.slice(0, 200))) return false;
  return true;
}

export function markOnboarded() { localStorage.setItem(KEYS.onboarding, "1"); }
export function wasOnboarded() { return localStorage.getItem(KEYS.onboarding) === "1"; }

export function loadTrips() {
  return read("roam_saved_trips", []);
}

// ---------- Traveler helpers ----------

export function currentUser(userId, profile) {
  return {
    id: userId,
    name: profile.displayName || "You",
    upi: profile.upi || "",
    isYou: true,
  };
}

export function ensureSelfInTravellers(travellers, self) {
  const existingIndex = travellers.findIndex((t) => t.id === self.id);
  if (existingIndex >= 0) {
    // Update existing self entry with latest profile info (like UPI ID)
    const list = [...travellers];
    list[existingIndex] = { ...list[existingIndex], name: self.name, upi: self.upi, isYou: true };
    return list;
  }
  return [{ id: self.id, name: self.name, upi: self.upi, isYou: true }, ...travellers];
}

// ---------- Notifications ----------

export function addNotification(tripLabel, message) {
  const list = loadNotifications();
  list.unshift({
    id: uid("n"),
    trip: tripLabel,
    message,
    createdAt: new Date().toISOString(),
    read: false,
  });
  saveNotifications(list);
}

// ---------- Expense CRUD ----------

export function newExpense(tripId) {
  const now = new Date().toISOString();
  return {
    id: uid("e"),
    tripId,
    title: "",
    amount: "",
    spentDate: new Date().toISOString().slice(0, 10),
    category: "Food",
    paidBy: null,            // primary payer { uid, name }
    payers: [],              // [{ uid, name, amount }]  (supports multiple payers)
    split: { method: "equal", parts: [] }, // parts: [{ uid, name, value }]
    description: "",
    receipt: null,           // { dataUrl, name }
    creatorUid: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertExpense(tripId, expense) {
  const list = loadExpenses(tripId);
  const idx = list.findIndex((e) => e.id === expense.id);
  expense.updatedAt = new Date().toISOString();
  if (idx >= 0) list[idx] = expense;
  else list.unshift(expense);
  saveExpenses(tripId, list);
}

export function deleteExpense(tripId, expenseId, userId) {
  const list = loadExpenses(tripId);
  const exp = list.find((e) => e.id === expenseId);
  if (!exp) return false;
  if (exp.creatorUid && exp.creatorUid !== userId) return false; // auth guard
  saveExpenses(tripId, list.filter((e) => e.id !== expenseId));
  return true;
}

export function canEditExpense(expense, userId) {
  return !expense.creatorUid || expense.creatorUid === userId;
}

// ---------- Settlements ----------

export function newSettlement(tripId, fromUid, fromName, toUid, toName, amount) {
  return {
    id: uid("s"),
    tripId,
    fromUid, fromName, toUid, toName,
    amount: Number(amount),
    status: "pending",           // pending → initiated → paid / failed / cancelled / disputed
    upiRef: "",
    initiatedApp: "",
    note: "",
    createdAt: new Date().toISOString(),
    statusUpdatedAt: new Date().toISOString(),
  };
}

export function upsertSettlement(tripId, settlement) {
  const list = loadSettlements(tripId);
  const idx = list.findIndex((s) => s.id === settlement.id);
  settlement.statusUpdatedAt = new Date().toISOString();
  if (idx >= 0) list[idx] = settlement;
  else list.unshift(settlement);
  saveSettlements(tripId, list);
}

export function deleteSettlement(tripId, id) {
  saveSettlements(tripId, loadSettlements(tripId).filter((s) => s.id !== id));
}

export function findOpenSettlement(tripId, fromUid, toUid) {
  return loadSettlements(tripId).find((s) =>
    s.fromUid === fromUid && s.toUid === toUid &&
    (s.status === "pending" || s.status === "initiated"));
}

// ---------- Receipts ----------

export function attachReceipt(expense, dataUrl, name) {
  const size = dataUrl ? dataUrl.length : 0;
  // Sanity cap (~1.2 MB of compressed JPEG fits comfortably).
  if (size > 1_600_000) return { error: "Receipt too large. Try a smaller image." };
  expense.receipt = dataUrl ? { dataUrl, name: name || "receipt.jpg" } : null;
  return { error: null };
}

// ---------- Standalone Split Groups (independent of itinerary trips) ----------

export function loadSplitGroups() { return read(KEYS.splitGroups, []); }
export function saveSplitGroups(list) { return write(KEYS.splitGroups, list); }

export function createSplitGroup({ name, destination, startDate, endDate }, creatorId) {
  const groups = loadSplitGroups();
  const id = uid("sg");
  const group = {
    id,
    name: String(name || "").trim(),
    destination: String(destination || "").trim(),
    startDate: startDate || "",
    endDate: endDate || "",
    creatorId,
    createdAt: new Date().toISOString(),
  };
  groups.unshift(group);
  saveSplitGroups(groups);
  return group;
}

// Only the creator can delete a split group and all its associated data.
export function deleteSplitGroup(groupId, requestingUserId) {
  const groups = loadSplitGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return { ok: false, error: "Group not found." };
  if (group.creatorId !== requestingUserId) return { ok: false, error: "Only the group creator can delete this group." };
  // Wipe all associated expenses, settlements, and travellers
  try { localStorage.removeItem(KEYS.expenses(groupId)); } catch {}
  try { localStorage.removeItem(KEYS.settlers(groupId)); } catch {}
  try { localStorage.removeItem(KEYS.travellers(groupId)); } catch {}
  saveSplitGroups(groups.filter((g) => g.id !== groupId));
  return { ok: true };
}

// Convert a standalone split group to the trip shape expected by the rest of the screen.
export function splitGroupToTrip(group) {
  return {
    id: group.id,
    title: group.name,
    formData: {
      destination: group.destination || group.name,
      startDate: group.startDate,
      endDate: group.endDate,
    },
    startDate: group.startDate,
    endDate: group.endDate,
    _isSplitGroup: true,
    _creatorId: group.creatorId,
  };
}