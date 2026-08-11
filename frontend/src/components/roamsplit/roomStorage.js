// RoamSplit — persistence + helpers.
//
// Primary storage is Supabase so every member of a group / trip sees the same
// split (tables: groups, groupMembers, expenses, settlements, notifications —
// see supabase/schema.sql). When Supabase is not configured the exact same API
// falls back to localStorage so the feature keeps working offline / in demo mode.
//
// The synchronous loaders still read a localStorage cache (the UI reads them
// during render); the async `pullSplitTrip` + `subscribeSplitTrip` helpers keep
// that cache in sync with Supabase (including changes made by other members).
import { supabase, SUPABASE_READY, nowIso } from "../../supabase";
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

const fsReady = () => SUPABASE_READY && !!supabase;

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
export function saveExpenses(tripId, list) {
  const ok = write(KEYS.expenses(tripId), list);
  pushExpenseList(tripId, list).catch(() => {});
  return ok;
}

export function loadSettlements(tripId) { return read(KEYS.settlers(tripId), []); }
export function saveSettlements(tripId, list) {
  const ok = write(KEYS.settlers(tripId), list);
  pushSettlementList(tripId, list).catch(() => {});
  return ok;
}

export function loadTravellers(tripId) { return read(KEYS.travellers(tripId), []); }
export function saveTravellers(tripId, list) {
  const ok = write(KEYS.travellers(tripId), list);
  pushTravellers(tripId, list).catch(() => {});
  return ok;
}

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
  emitSplitLocal(tripId);
}

export function deleteExpense(tripId, expenseId, userId) {
  const list = loadExpenses(tripId);
  const exp = list.find((e) => e.id === expenseId);
  if (!exp) return false;
  if (exp.creatorUid && exp.creatorUid !== userId) return false; // auth guard
  saveExpenses(tripId, list.filter((e) => e.id !== expenseId));
  if (fsReady() && tripId && exp) {
    supabase.from("expenses").delete().eq("id", expenseId).catch(() => {});
  }
  emitSplitLocal(tripId);
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
  emitSplitLocal(tripId);
}

export function deleteSettlement(tripId, id) {
  saveSettlements(tripId, loadSettlements(tripId).filter((s) => s.id !== id));
  if (fsReady() && tripId) {
    supabase.from("settlements").delete().eq("id", id).catch(() => {});
  }
  emitSplitLocal(tripId);
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

// ============================================================================
// SUPABASE LAYER — RoamSplit data shared across a group's members.
// ============================================================================

// Local event bus used when Supabase is not available (single-device mode) so
// the UI still refreshes after writes.
const splitBus = new Map();      // tripId -> Set<cb>
const splitGroupsBus = new Set(); // cb()
const seenTripRow = new Set();

function emitSplitLocal(tripId) {
  if (!tripId) return;
  (splitBus.get(tripId) || []).forEach((cb) => { try { cb(); } catch { /* noop */ } });
}

// Ensure a `groups` row exists for a split container so the `expenses` /
// `settlements` foreign keys are satisfied. Split containers never appear on
// the RoamGroups home — they are tagged in `data` and filtered there.
export async function ensureSplitTripRow(tripId, meta) {
  if (!fsReady() || !tripId) return false;
  if (seenTripRow.has(tripId)) return true;
  const { data: existing } = await supabase.from("groups").select("id").eq("id", tripId).maybeSingle();
  if (existing) {
    seenTripRow.add(tripId);
    // Keep the current user's own membership row fresh (name / UPI) so their
    // crew always sees the latest payment details.
    if (meta?.userId) {
      await supabase.from("groupMembers").upsert(
        {
          gid: tripId, firebaseUid: meta.userId, role: "admin", status: "joined",
          name: meta.selfName || "", username: "", email: "", phone: "",
          avatar: null, upi: meta.selfUpi || "", joinedAt: nowIso(), lastReadAt: 0,
        },
        { onConflict: "gid,firebaseUid" },
      ).catch((err) => console.warn("split self-member refresh failed:", err?.message || err));
    }
    return true;
  }
  const selfUid = meta?.userId || meta?.creatorId || "";
  const isSplitGroup = !!meta?.isSplitGroup;
  const row = {
    id: tripId,
    name: meta?.name || "Trip split",
    destination: meta?.destination || "",
    destinationEmoji: "",
    image: null,
    startDate: meta?.startDate || "",
    endDate: meta?.endDate || "",
    privacy: "private",
    code: (meta?.code || tripId).toString().replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "SPLIT",
    memberCount: 1,
    createdBy: selfUid || "system",
    settings: {},
    data: {
      _isSplitGroup: isSplitGroup,
      _isTripSplit: !isSplitGroup,
      _creatorId: selfUid,
      name: meta?.name || "",
      destination: meta?.destination || "",
      startDate: meta?.startDate || "",
      endDate: meta?.endDate || "",
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const { error } = await supabase.from("groups").insert(row);
  if (error) {
    // Row was created by someone else in the meantime — treat as present.
    if (error.code === "23505" || /duplicate/i.test(error.message || "")) {
      seenTripRow.add(tripId);
      return true;
    }
    console.warn("ensureSplitTripRow failed:", error?.message || error);
    return false;
  }
  seenTripRow.add(tripId);
  if (selfUid) {
    await supabase.from("groupMembers").upsert(
      {
        gid: tripId, firebaseUid: selfUid, role: "admin", status: "joined",
        name: meta?.selfName || "", username: "", email: "", phone: "",
        avatar: null, upi: meta?.selfUpi || "", joinedAt: nowIso(), lastReadAt: 0,
      },
      { onConflict: "gid,firebaseUid" },
    ).catch((err) => console.warn("split self-member upsert failed:", err?.message || err));
  }
  return true;
}

function rowToTraveller(r) {
  return {
    id: r.firebaseUid,
    name: r.name || "",
    upi: r.upi || "",
    isYou: false,
    isReal: true,
  };
}

// Pull the latest expenses/settlements/members for a split from Supabase into
// the localStorage cache. Call once on open and via realtime subscriptions.
export async function pullSplitTrip(tripId) {
  if (!fsReady() || !tripId) return;
  const [exR, stR, memR] = await Promise.all([
    supabase.from("expenses").select("data").eq("gid", tripId),
    supabase.from("settlements").select("data").eq("gid", tripId),
    supabase.from("groupMembers").select("*").eq("gid", tripId).order("joinedAt", { ascending: true }),
  ]);
  if (!exR.error) {
    const list = (exR.data || []).map((r) => r.data).filter(Boolean);
    write(KEYS.expenses(tripId), list);
  }
  if (!stR.error) {
    const list = (stR.data || []).map((r) => r.data).filter(Boolean);
    write(KEYS.settlers(tripId), list);
  }
  if (!memR.error) {
    const list = (memR.data || []).map(rowToTraveller).filter((t) => t.id);
    write(KEYS.travellers(tripId), list);
  }
}

async function pushExpenseList(tripId, list) {
  if (!fsReady() || !tripId) return;
  const ok = await ensureSplitTripRow(tripId);
  if (!ok) return;
  for (const e of list || []) {
    if (!e?.id) continue;
    await supabase.from("expenses").upsert(
      { id: e.id, gid: tripId, data: e, createdAt: e.createdAt || nowIso() },
      { onConflict: "id" },
    ).catch(() => {});
  }
}

async function pushSettlementList(tripId, list) {
  if (!fsReady() || !tripId) return;
  const ok = await ensureSplitTripRow(tripId);
  if (!ok) return;
  for (const s of list || []) {
    if (!s?.id) continue;
    await supabase.from("settlements").upsert(
      { id: s.id, gid: tripId, data: s, createdAt: s.createdAt || nowIso() },
      { onConflict: "id" },
    ).catch(() => {});
  }
}

// Sync the traveller roster to `groupMembers`. Best-effort: rows the current
// user is not allowed to write are skipped (RLS), the admin/creator can add
// everyone, and any member can self-join a split group (see schema.sql).
async function pushTravellers(tripId, list) {
  if (!fsReady() || !tripId) return;
  const ok = await ensureSplitTripRow(tripId);
  if (!ok) return;
  for (const t of list || []) {
    if (!t?.id) continue;
    await supabase.from("groupMembers").upsert(
      {
        gid: tripId, firebaseUid: t.id, role: t.isYou ? "admin" : "member", status: "joined",
        name: t.name || "", username: "", email: "", phone: "",
        avatar: null, upi: t.upi || "", joinedAt: nowIso(), lastReadAt: 0,
      },
      { onConflict: "gid,firebaseUid" },
    ).catch(() => {});
  }
}

// Awaitable version of saveTravellers's Supabase push. Used before notifying a
// newly added member so their membership row exists when the RPC runs.
export async function syncTravellersToSupabase(tripId, list) {
  if (!fsReady() || !tripId) return;
  await ensureSplitTripRow(tripId);
  await pushTravellers(tripId, list);
}

// Real-time: refetch the split whenever anyone changes expenses, settlements
// or the member list for this trip/group.
export function subscribeSplitTrip(tripId, cb) {
  if (!tripId) return () => {};
  if (!fsReady()) {
    const set = splitBus.get(tripId) || new Set();
    set.add(cb);
    splitBus.set(tripId, set);
    return () => {
      const s = splitBus.get(tripId);
      if (s) { s.delete(cb); if (!s.size) splitBus.delete(tripId); }
    };
  }
  let alive = true;
  let channel = null;
  let busy = false;
  const refresh = async () => {
    if (busy || !alive) return;
    busy = true;
    try {
      await pullSplitTrip(tripId);
      if (alive) cb();
    } finally {
      busy = false;
    }
  };
  channel = supabase.channel(`rs:${tripId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `gid=eq.${tripId}` }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "settlements", filter: `gid=eq.${tripId}` }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "groupMembers", filter: `gid=eq.${tripId}` }, refresh)
    .subscribe();
  return () => {
    alive = false;
    if (channel) supabase.removeChannel(channel);
  };
}

// Notify every member of a split except the actor (Supabase RPC — the RLS-safe
// way to write into other users' notification rows).
export async function notifySplitMembers({ gid, gidName, text, kind, icon, excludeUids = [] }) {
  if (!fsReady() || !gid) return;
  const { error } = await supabase.rpc("notify_group", {
    p_gid: gid,
    p_gidname: gidName,
    p_text: text,
    p_kind: kind || "split",
    p_icon: icon || "💸",
    p_exclude: excludeUids,
  });
  if (error) console.warn("notify_group failed:", error?.message || error);
}

// ---------- Standalone Split Groups (independent of itinerary trips) ----------

export function loadSplitGroups() { return read(KEYS.splitGroups, []); }
export function saveSplitGroups(list) {
  const ok = write(KEYS.splitGroups, list);
  splitGroupsBus.forEach((cb) => { try { cb(); } catch { /* noop */ } });
  return ok;
}

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
    _isSplitGroup: true,
  };
  groups.unshift(group);
  saveSplitGroups(groups);
  // Persist to Supabase so other members can be added and see the group.
  if (fsReady()) {
    ensureSplitTripRow(id, {
      name: group.name, destination: group.destination,
      startDate: group.startDate, endDate: group.endDate,
      userId: creatorId, isSplitGroup: true,
    }).catch(() => {});
  }
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
  if (fsReady()) {
    supabase.from("groups").delete().eq("id", groupId).catch((err) =>
      console.warn("deleteSplitGroup supabase failed:", err?.message || err));
  }
  return { ok: true };
}

function splitRowToGroup(row) {
  const d = row.data || {};
  return {
    id: row.id,
    name: row.name || d.name || "Split group",
    destination: row.destination || d.destination || "",
    startDate: row.startDate || d.startDate || "",
    endDate: row.endDate || d.endDate || "",
    creatorId: d._creatorId || row.createdBy,
    createdAt: row.createdAt || d.createdAt || nowIso(),
    _isSplitGroup: true,
  };
}

// Live list of the standalone split groups the current user belongs to.
export function subscribeSplitGroups(userId, cb) {
  if (!userId) return () => {};
  if (!fsReady()) {
    const feed = () => cb(loadSplitGroups());
    feed();
    splitGroupsBus.add(feed);
    return () => splitGroupsBus.delete(feed);
  }
  let alive = true;
  let channel = null;
  const refresh = async () => {
    if (!alive) return;
    const { data: links } = await supabase
      .from("groupMembers").select("gid").eq("firebaseUid", userId);
    const gids = (links || []).map((l) => l.gid);
    let groups = [];
    if (gids.length) {
      const { data } = await supabase.from("groups").select("*").in("id", gids);
      groups = data || [];
    }
    const splitGroups = (groups || [])
      .filter((g) => g.data && (g.data._isSplitGroup === true))
      .map(splitRowToGroup)
      .sort((a, b) => (b.createdAt || 0) > (a.createdAt || 0) ? 1 : -1);
    if (alive) cb(splitGroups);
  };
  channel = supabase.channel(`rs-groups:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "groupMembers", filter: `"firebaseUid"=eq.${userId}` }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, refresh)
    .subscribe();
  refresh();
  return () => {
    alive = false;
    if (channel) supabase.removeChannel(channel);
  };
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
