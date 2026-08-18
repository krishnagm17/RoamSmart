// RoamGroups — Supabase data layer (replaces the Firestore/Firebase one).
// Groups, members, chat, polls, places, topics, itinerary, files, announcements,
// activity, notifications, expenses, settlements + realtime all live in Supabase
// (see supabase/schema.sql) keyed by Firebase UID via the Firebase JWT bridge.
//
// When Supabase is not configured yet (VITE_SUPABASE_URL/ANON_KEY placeholders) this
// falls back to the localStorage mode in ./groupsStorage so the app keeps working.
// Export names are identical to the previous Firestore/GroupsAPI.
import { supabase, SUPABASE_READY, nowIso } from "../../supabase";
import {
  uid, newGroup, groomGroup, newMessage, newPoll, newPlace, newTopic, memberFromUser,
} from "./groupsEngine";
import { DEMO_USERS } from "./groupsEngine";
import * as local from "./groupsStorage";

export const FS_UNAVAILABLE = "Supabase is not configured yet. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in frontend/.env and apply supabase/schema.sql.";

export function fsReady() {
  return SUPABASE_READY && !!supabase;
}

// ---------- Ref helpers (kept mostly for API parity) ----------
export const groupDoc = (gid) => gid;
export const memberDoc = () => null;
export const subCol = () => null;
export const userGroupLink = () => null;
export const userGroupsCol = () => null;
export const userNotifsCol = () => null;
export const inviteDoc = (code) => String(code || "").toUpperCase();
export const userMutesDoc = () => null;

// ---------- local fallback event buses ----------
const groupBus = new Map(); // gid -> Set<cb(parts)>
const msgsBus = new Map();  // gid -> Set<cb(messages)>
const globalBus = new Set(); // cb() — groups list + notifications
const notifsBus = new Set(); 

function localParts(gid) {
  const group = local.groupById(gid);
  return {
    group: group ? groomGroup(group) : null,
    members: local.loadMembers(gid),
    messages: local.loadMessages(gid),
    polls: local.loadPolls(gid),
    places: local.loadPlaces(gid),
    topics: local.loadTopics(gid),
    files: local.loadFiles(gid),
    announcements: local.loadAnnouncements(gid),
    activity: local.loadActivity(gid),
    itinerary: local.loadItinerary(gid) || null,
    finalplan: local.loadFinalPlan(gid) || null,
  };
}
function emitLocalGroup(gid) {
  (groupBus.get(gid) || []).forEach((cb) => cb(localParts(gid)));
  (msgsBus.get(gid) || []).forEach((cb) => cb(local.loadMessages(gid)));
}
function emitLocalGlobal() {
  globalBus.forEach((cb) => cb());
}
export function emitNotifsRefresh() {
  notifsBus.forEach((cb) => cb());
}

// ---------- row <-> object mappers (camelCase columns) ----------
function rowToGroup(r) {
  return {
    id: r.id,
    ...(r.data || {}),
    code: r.code, name: r.name, destination: r.destination, destinationEmoji: r.destinationEmoji,
    image: r.image, startDate: r.startDate, endDate: r.endDate, privacy: r.privacy,
    memberCount: r.memberCount, createdBy: r.createdBy, settings: r.settings || {},
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}
function toGroupRow(g) {
  return {
    id: g.id,
    name: g.name || "", destination: g.destination || "", destinationEmoji: g.destinationEmoji || "",
    image: g.image || null, startDate: g.startDate || "", endDate: g.endDate || "",
    privacy: g.privacy || "public", code: g.code, memberCount: g.memberCount || 0,
    createdBy: g.createdBy || g.creatorId || "", settings: g.settings || {}, data: g,
    createdAt: g.createdAt || nowIso(), updatedAt: g.updatedAt || nowIso(),
  };
}
function rowToMember(r) {
  return {
    id: r.firebaseUid, name: r.name, username: r.username, email: r.email, phone: r.phone,
    avatar: r.avatar, upi: r.upi, role: r.role, status: r.status, joinedAt: r.joinedAt, lastReadAt: r.lastReadAt,
  };
}
function toMemberRow(m, gid) {
  return {
    gid, firebaseUid: m.id, role: m.role || "member", status: m.status || "joined",
    name: m.name || "", username: m.username || "", email: m.email || "", phone: m.phone || "",
    avatar: m.avatar || null, upi: m.upi || "", joinedAt: m.joinedAt || nowIso(), lastReadAt: m.lastReadAt || 0,
  };
}
function rowToMessage(r) {
  return {
    id: r.id, gid: r.gid, uid: r.uid, name: r.name, kind: r.kind, text: r.text,
    attachment: r.attachment, placeId: r.placeId, pollId: r.pollId, topicId: r.topicId,
    replyTo: r.replyTo, mentions: r.mentions || [], reactions: r.reactions || {},
    pinned: !!r.pinned, edited: !!r.edited, createdAt: r.createdAt,
  };
}
function toMessageRow(m) {
  return {
    id: m.id, gid: m.gid, uid: m.uid, name: m.name, kind: m.kind, text: m.text,
    attachment: m.attachment ?? null, placeId: m.placeId ?? null, pollId: m.pollId ?? null,
    topicId: m.topicId ?? null, replyTo: m.replyTo ?? null, mentions: m.mentions || [],
    reactions: m.reactions || {}, pinned: !!m.pinned, edited: !!m.edited, createdAt: m.createdAt,
  };
}
const rowToDoc = (r) => ({ id: r.id, ...(r.data || {}) });
const toDocRow = (doc) => ({ id: doc.id, gid: doc.gid, data: doc, createdAt: doc.createdAt });

function makeActor(u, role) {
  return {
    id: u.id, name: u.name || "", username: u.username || "", email: u.email || "",
    phone: u.phone || "", avatar: u.avatar || null, upi: u.upi || "",
    role: role || "member", status: "joined", createdAt: nowIso(),
  };
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(",");
  const mime = (meta.match(/data:(.*?);/) || [])[1] || "application/octet-stream";
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ---------- subscriptions ----------

export function subscribeGroup(gid, cb) {
  if (!gid) {
    cb(null);
    return () => {};
  }
  if (!fsReady()) {
    cb(localParts(gid));
    const set = groupBus.get(gid) || new Set();
    set.add(cb);
    groupBus.set(gid, set);
    return () => {
      const s = groupBus.get(gid);
      if (s) { s.delete(cb); if (!s.size) groupBus.delete(gid); }
    };
  }

  let alive = true;
  let channel = null;
  let timer = null;
  const state = {
    group: null, members: [], messages: [], polls: [], places: [],
    topics: [], files: [], announcements: [], activity: [], itinerary: null, finalplan: null,
  };
  const emit = () => {
    if (alive && state.group) cb({ ...state, group: groomGroup(state.group) });
  };
  const refresh = async () => {
    if (!alive) return;
    try {
      const [gR, mR, msgR, pR, plR, tR, fR, aR, actR, itR, fpR] = await Promise.all([
        supabase.from("groups").select("*").eq("id", gid).maybeSingle(),
        supabase.from("groupMembers").select("*").eq("gid", gid).order("joinedAt", { ascending: true }).limit(200),
        supabase.from("messages").select("*").eq("gid", gid).order("createdAt", { ascending: false }).limit(500),
        supabase.from("polls").select("*").eq("gid", gid).order("createdAt", { ascending: false }).limit(200),
        supabase.from("places").select("*").eq("gid", gid).order("createdAt", { ascending: false }).limit(300),
        supabase.from("groupTopics").select("*").eq("gid", gid).order("createdAt", { ascending: true }).limit(100),
        supabase.from("sharedFiles").select("*").eq("gid", gid).order("createdAt", { ascending: false }).limit(200),
        supabase.from("announcements").select("*").eq("gid", gid).order("createdAt", { ascending: false }).limit(100),
        supabase.from("groupActivity").select("*").eq("gid", gid).order("createdAt", { ascending: false }).limit(300),
        supabase.from("groupItineraries").select("*").eq("gid", gid).maybeSingle(),
        supabase.from("finalPlans").select("*").eq("gid", gid).maybeSingle(),
      ]);
      if (!alive) return;
      if (gR.error || mR.error || msgR.error) {
        console.warn("subscribeGroup fetch error:", gR.error?.message || mR.error?.message || msgR.error?.message);
        return;
      }
      state.group = gR.data ? rowToGroup(gR.data) : null;
      state.members = (mR.data || []).map(rowToMember);
      state.messages = (msgR.data || []).map(rowToMessage);
      state.polls = (pR.data || []).map(rowToDoc);
      state.places = (plR.data || []).map(rowToDoc);
      state.topics = (tR.data || []).map((r) => ({ id: r.id, gid: r.gid, name: r.name, nameLower: r.nameLower, emoji: r.emoji, createdBy: r.createdBy, createdAt: r.createdAt }));
      state.files = (fR.data || []).map((r) => ({ id: r.id, gid: r.gid, uid: r.uid, name: r.name, kind: r.kind, url: r.url, path: r.path, dataUrl: r.dataUrl, caption: r.caption, folder: r.folder, sizeKB: r.sizeKB, createdAt: r.createdAt }));
      state.announcements = (aR.data || []).map(rowToDoc);
      state.activity = (actR.data || []).map((r) => ({ id: r.id, gid: r.gid, uid: r.uid, name: r.name, icon: r.icon, text: r.text, kind: r.kind, createdAt: r.createdAt }));
      state.itinerary = itR.data ? itR.data.data : null;
      state.finalplan = fpR.data ? fpR.data.data : null;
      emit();
    } catch (err) {
      console.error("subscribeGroup unexpected error:", err);
    }
  };

  const tables = [
    ["groups", "id"], ["groupMembers", "gid"], ["messages", "gid"], ["polls", "gid"], ["places", "gid"],
    ["groupTopics", "gid"], ["sharedFiles", "gid"], ["announcements", "gid"], ["groupActivity", "gid"],
    ["groupItineraries", "gid"], ["finalPlans", "gid"],
  ];
  channel = supabase.channel(`rg:${gid}`);
  tables.forEach(([table, col]) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `${col}=eq.'${gid}'` }, () => {
      if (!timer) timer = setTimeout(() => { timer = null; refresh(); }, 60);
    });
  });
  channel.subscribe();
  refresh();

  return () => {
    alive = false;
    if (channel) supabase.removeChannel(channel);
    if (timer) clearTimeout(timer);
  };
}

export function subscribeUserGroups(uid, cb) {
  if (!fsReady()) {
    const feed = () => cb(local.loadGroups().map((g) => {
      const m = local.loadMembers(g.id).find((x) => x.id === uid);
      return {
        gid: g.id,
        role: m?.role || (g.createdBy === uid ? "admin" : "member"),
        joinedAt: m?.joinedAt || new Date().toISOString(),
        lastReadAt: m?.lastReadAt || 0,
        group: groomGroup(g),
      };
    }));
    feed();
    globalBus.add(feed);
    return () => globalBus.delete(feed);
  }

  let alive = true;
  let channel = null;
  const refresh = async () => {
    if (!alive) return;
    const { data: links } = await supabase.from("groupMembers").select("gid, role, joinedAt, lastReadAt").eq("firebaseUid", uid);
    const gids = (links || []).map((l) => l.gid);
    let groups = [];
    if (gids.length) {
      const { data: gs } = await supabase.from("groups").select("*").in("id", gids);
      // Hide RoamSplit containers (standalone split groups + per-trip splits) —
      // they are only ever surfaced inside the RoamSplit screen.
      groups = (gs || []).filter((g) => !(g.data && (g.data._isSplitGroup === true || g.data._isTripSplit === true)));
    }
    const byId = Object.fromEntries(groups.map((g) => [g.id, groomGroup(rowToGroup(g))]));
    const out = (links || [])
      .map((l) => ({ gid: l.gid, role: l.role, joinedAt: l.joinedAt, lastReadAt: l.lastReadAt || 0, group: byId[l.gid] }))
      .filter((e) => e.group)
      .sort((a, b) => (b.joinedAt || 0) > (a.joinedAt || 0) ? 1 : -1);
    if (alive) cb(out);
  };
  channel = supabase.channel(`rg-user:${uid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "groupMembers", filter: `"firebaseUid"=eq.'${uid}'` }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, refresh)
    .subscribe();
  refresh();
  return () => {
    alive = false;
    if (channel) supabase.removeChannel(channel);
  };
}

export function subscribeUnread(gid, cb) {
  if (!fsReady()) {
    if (!gid) return () => {};
    const feed = () => cb(local.loadMessages(gid));
    feed();
    const set = msgsBus.get(gid) || new Set();
    set.add(feed);
    msgsBus.set(gid, set);
    return () => {
      const s = msgsBus.get(gid);
      if (s) { s.delete(feed); if (!s.size) msgsBus.delete(gid); }
    };
  }
  if (!gid) return () => {};
  let alive = true;
  const refresh = async () => {
    if (!alive) return;
    const { data } = await supabase.from("messages").select("*").eq("gid", gid).order("createdAt", { ascending: false }).limit(200);
    if (!alive) return;
    cb((data || []).map(rowToMessage));
  };
  const channel = supabase.channel(`rg-unread:${gid}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `gid=eq.'${gid}'` }, refresh)
    .subscribe();
  refresh();
  return () => {
    alive = false;
    if (channel) supabase.removeChannel(channel);
  };
}

export function subscribeUserNotifs(uid, cb) {
  if (!fsReady()) {
    const feed = () => cb(local.loadNotifs());
    feed();
    notifsBus.add(feed);
    return () => notifsBus.delete(feed);
  }
  if (!uid) return () => {};
  let alive = true;
  const refresh = async () => {
    if (!alive) return;
    const { data } = await supabase.from("notifications").select("*").eq("firebaseUid", uid).order("createdAt", { ascending: false }).limit(60);
    if (!alive) return;
    cb((data || []).map((r) => ({ id: r.id, gid: r.gid, gidName: r.gidName, text: r.text, kind: r.kind, icon: r.icon, read: !!r.read, createdAt: r.createdAt })));
  };
  const channel = supabase.channel(`rg-notifs:${uid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `firebaseUid=eq.${uid}` }, refresh)
    .subscribe();
  notifsBus.add(refresh);
  refresh();
  return () => {
    alive = false;
    notifsBus.delete(refresh);
    if (channel) supabase.removeChannel(channel);
  };
}

// ---------- groups ----------

export async function createGroup({ data, self, withDemo = false, invited = [] }) {
  const g = newGroup(data, self);
  if (!fsReady()) {
    local.upsertGroup(g);
    const admin = makeActor(self, "admin");
    local.upsertMember(g.id, admin);
    local.addInvite({ gid: g.id, code: g.code, createdBy: self.id });
    emitLocalGroup(g.id);
    emitLocalGlobal();
    return g;
  }

  const { error: e1 } = await supabase.from("groups").insert(toGroupRow(g));
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("groupMembers").insert(toMemberRow(makeActor(self, "admin"), g.id));
  if (e2) throw e2;
  const { error: e3 } = await supabase.from("groupInvitations").insert({ code: g.code, gid: g.id, createdBy: self.id, createdAt: nowIso() });
  if (e3) throw e3;
  await addActivityLocal({ gid: g.id, uidRaw: self.id, name: self.name, icon: "✨", text: "created the group and invited friends", kind: "group" });
  return g;
}

export async function joinGroupByCode(code, self) {
  const c = String(code || "").trim().toUpperCase();
  if (!fsReady()) {
    const res = local.acceptedInvite(c, self.id, self.name);
    if (res.group) emitLocalGroup(res.group.id);
    emitLocalGlobal();
    return res;
  }

  // Step 1: Look up the invitation (public read — invites are not member-gated)
  const { data: invite, error: invErr } = await supabase
    .from("groupInvitations").select("*").eq("code", c).maybeSingle();
  if (invErr || !invite) return { ok: false, error: "Invite link not found or has been revoked." };
  if (invite.revoked) return { ok: false, error: "Invite link has been revoked." };

  const gid = invite.gid;

  // Step 2: Check if already a member (member-read is allowed for own rows)
  const { data: existing } = await supabase
    .from("groupMembers").select("firebaseUid").eq("gid", gid).eq("firebaseUid", self.id).maybeSingle();

  if (!existing) {
    // Step 3: Insert member row FIRST — this is what satisfies the RLS check on groups:member-read
    await supabase.from("groupMembers").insert(toMemberRow(makeActor(self, "member"), gid));
    // Step 4: Bump memberCount
    const { data: countRow } = await supabase
      .from("groupMembers").select("firebaseUid", { count: "exact", head: true }).eq("gid", gid);
    await supabase.from("groups").update({ memberCount: countRow || 1 }).eq("id", gid);
    await addActivityLocal({ gid, uidRaw: self.id, name: self.name, icon: "👋", text: `${self.name} joined the group`, kind: "member" });
  }

  // Step 5: Now read the group — user is a member so RLS allows it
  const { data: gRow } = await supabase.from("groups").select("*").eq("id", gid).maybeSingle();
  if (!gRow) return { ok: false, error: "Group no longer exists." };
  const group = groomGroup(rowToGroup(gRow));
  return { ok: true, group };
}

// ---------- messages ----------

export async function sendMessage({ group, member, ...data }) {
  const msg = newMessage({ group, member, ...data });
  if (!fsReady()) {
    local.addMessage(msg);
    emitLocalGroup(group.id);
    return msg;
  }
  await supabase.from("messages").insert(toMessageRow(msg));
  return msg;
}

export async function editMessage(gid, mid, text, actor, isAdmin) {
  if (!fsReady()) {
    const ok = local.editMessage(gid, mid, text, actor, isAdmin);
    emitLocalGroup(gid);
    return ok;
  }
  const { data: m } = await supabase.from("messages").select("*").eq("id", mid).maybeSingle();
  if (!m) return false;
  if (m.uid !== actor.id && !isAdmin) return false;
  await supabase.from("messages").update({ text: String(text || "").trim(), edited: true }).eq("id", mid);
  return true;
}

export async function deleteMessage(gid, mid, actor, isAdmin) {
  if (!fsReady()) {
    const ok = local.deleteMessage(gid, mid, actor, isAdmin);
    emitLocalGroup(gid);
    return ok;
  }
  const { data: m } = await supabase.from("messages").select("*").eq("id", mid).maybeSingle();
  if (!m) return false;
  if (m.uid !== actor.id && !isAdmin) return false;
  await supabase.from("messages").delete().eq("id", mid);
  return true;
}

export async function togglePinMessage(gid, mid) {
  if (!fsReady()) {
    local.togglePinMessage(gid, mid);
    emitLocalGroup(gid);
    return;
  }
  const { data: m } = await supabase.from("messages").select("pinned").eq("id", mid).maybeSingle();
  if (m) await supabase.from("messages").update({ pinned: !m.pinned }).eq("id", mid);
}

export async function toggleReaction(gid, mid, emoji, uidRaw) {
  if (!fsReady()) {
    local.toggleReaction(gid, mid, emoji, uidRaw);
    emitLocalGroup(gid);
    return;
  }
  const { data: m } = await supabase.from("messages").select("*").eq("id", mid).maybeSingle();
  if (!m) return;
  const reactions = { ...(m.reactions || {}) };
  const arr = reactions[emoji] || [];
  reactions[emoji] = arr.includes(uidRaw) ? arr.filter((u) => u !== uidRaw) : [...arr, uidRaw];
  if (!reactions[emoji].length) delete reactions[emoji];
  await supabase.from("messages").update({ reactions }).eq("id", mid);
}

export async function markMessagesRead(uid, gid) {
  if (!fsReady()) {
    if (!uid || !gid) return;
    local.markMessagesRead(gid, uid);
    emitLocalGroup(gid);
    return;
  }
  if (!uid || !gid) return;
  await supabase.from("groupMembers").update({ lastReadAt: Date.now() }).eq("gid", gid).eq("firebaseUid", uid);
}

// ---------- polls ----------

export async function addPoll({ group, member, ...data }) {
  const poll = newPoll({ group, member, ...data });
  const msg = newMessage({ group, member, kind: "poll", pollId: poll.id, text: data.title });
  if (!fsReady()) {
    local.upsertPoll(poll);
    local.addMessage(msg);
    emitLocalGroup(group.id);
    return poll;
  }
  await supabase.from("polls").insert(toDocRow(poll));
  await supabase.from("messages").insert(toMessageRow(msg));
  return poll;
}

export async function upsertPoll(gid, poll) {
  if (!fsReady()) {
    local.upsertPoll(poll);
    emitLocalGroup(gid);
    return;
  }
  await supabase.from("polls").upsert(toDocRow(poll), { onConflict: "id" });
}

export async function deletePoll(gid, pid) {
  if (!fsReady()) {
    local.deletePoll(gid, pid);
    emitLocalGroup(gid);
    return;
  }
  await supabase.from("polls").delete().eq("id", pid);
}

// ---------- places ----------

export async function addPlace({ group, member, data }) {
  const place = newPlace({ group, member, data });
  const msg = newMessage({ group, member, kind: "place", placeId: place.id, text: data.name });
  if (!fsReady()) {
    local.upsertPlace(place);
    local.addMessage(msg);
    emitLocalGroup(group.id);
    return place;
  }
  await supabase.from("places").insert(toDocRow(place));
  await supabase.from("messages").insert(toMessageRow(msg));
  return place;
}

export async function upsertPlace(gid, place) {
  if (!fsReady()) {
    local.upsertPlace(place);
    emitLocalGroup(gid);
    return;
  }
  await supabase.from("places").upsert(toDocRow(place), { onConflict: "id" });
}

export async function togglePlaceVote(gid, placeId, member, dir) {
  if (!fsReady()) {
    const p = local.loadPlaces(gid).find((x) => x.id === placeId);
    if (p) {
      const up = new Set(p.upvotes || []);
      const down = new Set(p.downvotes || []);
      if (dir === "up") {
        if (up.has(member.id)) up.delete(member.id);
        else { up.add(member.id); down.delete(member.id); }
      } else {
        if (down.has(member.id)) down.delete(member.id);
        else { down.add(member.id); up.delete(member.id); }
      }
      local.upsertPlace({ ...p, upvotes: [...up], downvotes: [...down] });
      emitLocalGroup(gid);
    }
    return;
  }
  const { data: row } = await supabase.from("places").select("*").eq("id", placeId).maybeSingle();
  if (!row) return;
  const p = row.data || {};
  const up = new Set(p.upvotes || []);
  const down = new Set(p.downvotes || []);
  if (dir === "up") {
    if (up.has(member.id)) up.delete(member.id);
    else { up.add(member.id); down.delete(member.id); }
  } else {
    if (down.has(member.id)) down.delete(member.id);
    else { down.add(member.id); up.delete(member.id); }
  }
  await supabase.from("places").update({ data: { ...p, upvotes: [...up], downvotes: [...down] } }).eq("id", placeId);
}

// ---------- itinerary / topics ----------

export async function saveItinerary(gid, it) {
  if (!fsReady()) {
    local.saveItinerary(gid, it);
    emitLocalGroup(gid);
    return;
  }
  await supabase.from("groupItineraries").upsert({ gid, data: it, updatedAt: nowIso() }, { onConflict: "gid" });
}

export async function ensureTopic(gid, member, { name, emoji }) {
  if (!fsReady()) {
    const t = local.ensureTopic(gid, member, { name, emoji });
    emitLocalGroup(gid);
    return t;
  }
  const lower = String(name).toLowerCase();
  const { data } = await supabase.from("groupTopics").select("*").eq("gid", gid).eq("nameLower", lower).maybeSingle();
  if (data) return { id: data.id, gid: data.gid, name: data.name, nameLower: data.nameLower, emoji: data.emoji, createdBy: data.createdBy, createdAt: data.createdAt };
  const t = newTopic(groomGroup({ id: gid }), member, { name, emoji });
  await supabase.from("groupTopics").insert({ id: t.id, gid, name, nameLower: lower, emoji: emoji || "📍", createdBy: member.id, createdAt: nowIso() });
  return { ...t, id: t.id };
}

// ---------- files (storage-backed) ----------

export async function uploadGroupFile({ gid, uid, name, dataUrl, caption, folder, kind }) {
  const fid = uid("f");
  let url = null;
  let path = null;
  if (dataUrl && fsReady()) {
    try {
      const blob = dataUrlToBlob(dataUrl);
      const ext = (blob.type || "").split("/")[1] || "bin";
      path = `group-media/${gid}/${fid}/${Date.now()}_${String(name || "file").replace(/[^\w.\-]+/g, "_").slice(-40)}`;
      const { error: upErr } = await supabase.storage.from("group-media").upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: true });
      if (upErr) {
        console.warn("File upload failed, storing as dataUrl only:", upErr?.message || upErr);
        url = dataUrl;
        path = null;
      } else {
        const { data: pd } = supabase.storage.from("group-media").getPublicUrl(path);
        url = pd.publicUrl;
      }
    } catch (err) {
      console.warn("File upload failed, storing as dataUrl only:", err?.message || err);
      url = dataUrl;
      path = null;
    }
  }
  const f = { id: fid, gid, uid, name, kind, url, path, dataUrl: url ? (path ? null : dataUrl) : dataUrl, caption: caption || "", folder: folder || "documents", sizeKB: dataUrl ? Math.round((dataUrl.length * 0.75) / 1024) : 0, createdAt: nowIso() };
  if (!fsReady()) {
    local.addFile(f);
    emitLocalGroup(gid);
  } else {
    await supabase.from("sharedFiles").insert({ id: f.id, gid, uid, name: f.name, kind: f.kind, url: f.url, path: f.path, dataUrl: f.dataUrl, caption: f.caption, folder: f.folder, sizeKB: f.sizeKB, createdAt: f.createdAt });
  }
  return f;
}

export async function deleteGroupFile(gid, f) {
  if (f.path && fsReady()) {
    try { await supabase.storage.from("group-media").remove([f.path]); } catch (err) { console.warn("file delete failed:", err?.message || err); }
  }
  if (!fsReady()) {
    local.deleteFile(gid, f.id);
    emitLocalGroup(gid);
    return;
  }
  await supabase.from("sharedFiles").delete().eq("id", f.id);
}

// ---------- announcements ----------

export async function addAnnouncement({ group, self, title, body, pinned, imageDataUrl }) {
  const aid = uid("an");
  let imageUrl = null;
  let imagePath = null;
  if (imageDataUrl && fsReady()) {
    try {
      const blob = dataUrlToBlob(imageDataUrl);
      imagePath = `group-media/${group.id}/${aid}/announcement_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("group-media").upload(imagePath, blob, { contentType: blob.type, upsert: true });
      if (upErr) { imageUrl = imageDataUrl; imagePath = null; }
      else imageUrl = supabase.storage.from("group-media").getPublicUrl(imagePath).data.publicUrl;
    } catch (err) {
      console.warn("Announcement image upload failed:", err?.message || err);
      imageUrl = imageDataUrl;
      imagePath = null;
    }
  }
  const a = { id: aid, gid: group.id, uid: self.id, name: self.name, title, body, pinned: !!pinned, imageUrl, imagePath, readBy: [self.id], createdAt: nowIso() };
  if (!fsReady()) {
    local.upsertAnnouncement(a);
    emitLocalGroup(group.id);
  } else {
    await supabase.from("announcements").insert(toDocRow(a));
  }
  return a;
}

export async function togglePinAnnouncement(gid, a) {
  if (!fsReady()) {
    local.upsertAnnouncement({ ...a, pinned: !a.pinned });
    emitLocalGroup(gid);
    return;
  }
  const { data: row } = await supabase.from("announcements").select("*").eq("id", a.id).maybeSingle();
  if (row) await supabase.from("announcements").update({ data: { ...(row.data || {}), pinned: !row.data?.pinned } }).eq("id", a.id);
}

export async function deleteAnnouncement(gid, a) {
  if (a.imagePath && fsReady()) {
    try { await supabase.storage.from("group-media").remove([a.imagePath]); } catch (err) { console.warn(err); }
  }
  if (!fsReady()) {
    local.saveAnnouncements(gid, local.loadAnnouncements(gid).filter((x) => x.id !== a.id));
    emitLocalGroup(gid);
    return;
  }
  await supabase.from("announcements").delete().eq("id", a.id);
}

// ---------- members ----------

export async function setMember(gid, member) {
  if (!fsReady()) {
    const wasNew = !local.loadMembers(gid).some((m) => m.id === member.id);
    local.upsertMember(gid, member);
    local.upsertGroup({ ...local.groupById(gid), memberCount: wasNew ? local.loadMembers(gid).length : local.groupById(gid)?.memberCount });
    emitLocalGroup(gid);
    emitLocalGlobal();
    return;
  }
  const { data: existing } = await supabase.from("groupMembers").select("*").eq("gid", gid).eq("firebaseUid", member.id).maybeSingle();
  const res = await supabase.from("groupMembers").upsert(toMemberRow({ ...member, joinedAt: existing?.joinedAt || member.joinedAt || nowIso(), lastReadAt: existing?.lastReadAt || member.lastReadAt || 0 }, gid), { onConflict: "gid,firebaseUid" });
  if (res.error) throw res.error;
  if (!existing) {
    const { count } = await supabase.from("groupMembers").select("firebaseUid", { count: "exact", head: true }).eq("gid", gid);
    await supabase.from("groups").update({ memberCount: count || 0 }).eq("id", gid);
  }
}

export async function removeMember(gid, uid) {
  if (!fsReady()) {
    local.removeMember(gid, uid);
    local.upsertGroup({ ...local.groupById(gid), memberCount: local.loadMembers(gid).length });
    emitLocalGroup(gid);
    emitLocalGlobal();
    return;
  }
  await supabase.from("groupMembers").delete().eq("gid", gid).eq("firebaseUid", uid);
  const { count } = await supabase.from("groupMembers").select("firebaseUid", { count: "exact", head: true }).eq("gid", gid);
  await supabase.from("groups").update({ memberCount: count || 0 }).eq("id", gid);
}

export async function leaveGroup(gid, uid) {
  await removeMember(gid, uid);
  if (fsReady()) {
    const { count } = await supabase.from("groupMembers").select("firebaseUid", { count: "exact", head: true }).eq("gid", gid);
    if ((count || 0) <= 0) {
      try { await deleteGroup(gid); } catch (err) { /* only creator can delete */ }
    }
  } else {
    const g = local.groupById(gid);
    if (g && local.loadMembers(gid).length <= 0) local.deleteGroup(gid);
    emitLocalGroup(gid);
    emitLocalGlobal();
  }
}

export async function deleteGroup(gid) {
  if (!fsReady()) {
    local.deleteGroup(gid);
    emitLocalGlobal();
    return;
  }
  await supabase.from("groups").delete().eq("id", gid);
}

export async function updateGroup(gid, patch) {
  if (!fsReady()) {
    const g = local.groupById(gid);
    if (g) {
      local.upsertGroup({ ...g, ...patch });
      emitLocalGroup(gid);
      emitLocalGlobal();
    }
    return;
  }
  const { data: cur } = await supabase.from("groups").select("*").eq("id", gid).maybeSingle();
  if (!cur) return;
  const upd = { data: { ...(cur.data || {}), ...patch }, updatedAt: nowIso() };
  if ("name" in patch) upd.name = patch.name;
  if ("destination" in patch) upd.destination = patch.destination;
  if ("destinationEmoji" in patch) upd.destinationEmoji = patch.destinationEmoji;
  if ("image" in patch) upd.image = patch.image ?? null;
  if ("startDate" in patch) upd.startDate = patch.startDate ?? "";
  if ("endDate" in patch) upd.endDate = patch.endDate ?? "";
  if ("privacy" in patch) upd.privacy = patch.privacy;
  if ("settings" in patch) upd.settings = patch.settings;
  await supabase.from("groups").update(upd).eq("id", gid);
}

export async function revokeInvite(code) {
  if (!fsReady()) {
    const inv = local.loadInvites().find((i) => String(i.code).toUpperCase() === String(code || "").toUpperCase());
    if (inv) local.revokeInvites(inv.gid);
    emitLocalGlobal();
    return;
  }
  await supabase.from("groupInvitations").update({ revoked: true }).eq("code", String(code || "").trim().toUpperCase());
}

// ---------- activity / notifications ----------

export async function addActivityLocal({ gid, uidRaw, name, icon, text, kind }) {
  const a = { id: uid("a"), gid, uid: uidRaw, name, icon, text: text || "", kind: kind || "generic", createdAt: nowIso() };
  if (!fsReady()) {
    local.addActivity({ gid, uidRaw, name, icon, text: text || "", kind: kind || "generic" });
    emitLocalGroup(gid);
    return;
  }
  await supabase.from("groupActivity").insert({ id: a.id, gid, uid: uidRaw, name: name || "", icon: icon || "✨", text: text || "", kind: kind || "generic", createdAt: nowIso() });
}

export async function notifyGroup({ gid, gidName, text, kind, icon, excludeUids = [], uidPrefixes = [] }) {
  if (!fsReady()) {
    local.addNotif({ gid, gidName, text, kind: kind || "group", icon: icon || "🔔" });
    emitLocalGlobal();
    return;
  }
  let exclude = excludeUids;
  if (uidPrefixes.length) {
    const { data: members } = await supabase.from("groupMembers").select("firebaseUid").eq("gid", gid);
    exclude = (members || [])
      .map((m) => m.firebaseUid)
      .filter((u) => uidPrefixes.some((p) => u.startsWith(p)))
      .concat(excludeUids);
  }
  const { error } = await supabase.rpc("notify_group", {
    p_gid: gid, p_gidname: gidName, p_text: text, p_kind: kind || "group", p_icon: icon || "🔔", p_exclude: exclude,
  });
  if (error) console.warn("notify_group failed:", error?.message || error);
}

export async function markAllNotifsRead(uid) {
  if (!fsReady()) {
    if (!uid) return;
    local.markNotifsRead();
    emitLocalGlobal();
    return;
  }
  if (!uid) return;
  const { error } = await supabase.from("notifications").update({ read: true }).eq("firebaseUid", uid);
  if (error) throw error;
  emitNotifsRefresh();
}

export async function deleteNotif(uid, nid) {
  if (!fsReady()) {
    local.deleteNotif(nid);
    emitLocalGlobal();
    return;
  }
  const { error } = await supabase.from("notifications").delete().eq("id", nid).eq("firebaseUid", uid);
  if (error) throw error;
  emitNotifsRefresh();
}

// ---------- mutes (device-local) & final plan ----------

export async function loadMutes() {
  return local.loadMutes();
}
export async function saveMutes(map) {
  return local.saveMutes(map);
}

export async function saveFinalPlan(gid, plan) {
  if (!fsReady()) {
    local.saveFinalPlan(gid, plan);
    emitLocalGroup(gid);
    return;
  }
  await supabase.from("finalPlans").upsert({ gid, data: plan, updatedAt: nowIso() }, { onConflict: "gid" });
}

export function listenFinalPlan(gid, cb) {
  if (!fsReady()) {
    cb(local.loadFinalPlan(gid) || null);
    return () => {};
  }
  if (!gid) return () => {};
  let alive = true;
  const refresh = async () => {
    if (!alive) return;
    const { data } = await supabase.from("finalPlans").select("*").eq("gid", gid).maybeSingle();
    if (!alive) return;
    cb(data ? data.data : null);
  };
  const channel = supabase.channel(`rg-final:${gid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "finalPlans", filter: `gid=eq.'${gid}'` }, refresh)
    .subscribe();
  refresh();
  return () => {
    alive = false;
    if (channel) supabase.removeChannel(channel);
  };
}