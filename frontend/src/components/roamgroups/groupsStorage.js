// RoamGroups — localStorage persistence + helpers.
import { uid, newGroup, groomGroup, newTopic } from "./groupsEngine";

const K = {
  groups: "roam_groups",
  members: (g) => `roam_groups_members_${g}`,
  messages: (g) => `roam_groups_messages_${g}`,
  polls: (g) => `roam_groups_polls_${g}`,
  places: (g) => `roam_groups_places_${g}`,
  topics: (g) => `roam_groups_topics_${g}`,
  itinerary: (g) => `roam_groups_itinerary_${g}`,
  files: (g) => `roam_groups_files_${g}`,
  announcements: (g) => `roam_groups_announcements_${g}`,
  activity: (g) => `roam_groups_activity_${g}`,
  finalPlan: (g) => `roam_groups_finalplan_${g}`,
  notifs: "roam_groups_notifs",
  mutes: "roam_groups_mutes",
  invites: "roam_groups_invites",
  onboarded: "roam_groups_onboarded",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error("RoamGroups storage write failed:", err);
    return false;
  }
}

// ---------- Groups ----------
export function loadGroups() {
  return (read(K.groups, []) || []).map(groomGroup);
}
export function saveGroups(list) {
  return write(K.groups, list.map(groomGroup));
}
export function upsertGroup(group) {
  const list = loadGroups();
  const idx = list.findIndex((g) => g.id === group.id);
  if (idx >= 0) list[idx] = groomGroup(group);
  else list.unshift(groomGroup(group));
  return saveGroups(list);
}
export function deleteGroup(gid) {
  const list = loadGroups().filter((g) => g.id !== gid);
  saveGroups(list);
  Object.keys(localStorage)
    .filter((k) => k.startsWith(`roam_groups_${gid}_`))
    .forEach((k) => localStorage.removeItem(k));
  return true;
}
export function groupById(gid) {
  const g = loadGroups().find((x) => x.id === gid);
  return g ? groomGroup(g) : null;
}
export function groupByCode(code) {
  const c = String(code || "").trim().toUpperCase();
  return loadGroups().find((g) => String(g.code || "").toUpperCase() === c) || null;
}

// ---------- Members ----------
export function loadMembers(gid) {
  return read(K.members(gid), []);
}
export function saveMembers(gid, list) {
  return write(K.members(gid), list);
}
export function upsertMember(gid, member) {
  const list = loadMembers(gid);
  const idx = list.findIndex((m) => m.id === member.id);
  if (idx >= 0) list[idx] = member;
  else list.push(member);
  return saveMembers(gid, list);
}
export function removeMember(gid, mid) {
  return saveMembers(gid, loadMembers(gid).filter((m) => m.id !== mid));
}

// ---------- Messages ----------
export function loadMessages(gid) {
  return read(K.messages(gid), []);
}
export function saveMessages(gid, list) {
  return write(K.messages(gid), list);
}
export function addMessage(message) {
  const gid = message.gid;
  const list = loadMessages(gid);
  list.unshift(message);
  return saveMessages(gid, list);
}
export function editMessage(gid, mid, text, actor, isAdmin) {
  const list = loadMessages(gid);
  const msg = list.find((m) => m.id === mid);
  if (!msg) return false;
  if (msg.uid !== actor.id && !isAdmin) return false;
  msg.text = String(text || "").trim();
  msg.edited = true;
  return saveMessages(gid, list);
}
export function deleteMessage(gid, mid, actor, isAdmin) {
  const list = loadMessages(gid);
  const msg = list.find((m) => m.id === mid);
  if (!msg) return false;
  if (msg.uid !== actor.id && !isAdmin) return false;
  return saveMessages(gid, list.filter((m) => m.id !== mid));
}
export function togglePinMessage(gid, mid) {
  const list = loadMessages(gid);
  const msg = list.find((m) => m.id === mid);
  if (!msg) return false;
  msg.pinned = !msg.pinned;
  return saveMessages(gid, list);
}
export function toggleReaction(gid, mid, emoji, uidRaw) {
  const list = loadMessages(gid);
  const msg = list.find((m) => m.id === mid);
  if (!msg) return false;
  msg.reactions = msg.reactions || {};
  const arr = msg.reactions[emoji] || [];
  msg.reactions[emoji] = arr.includes(uidRaw) ? arr.filter((u) => u !== uidRaw) : [...arr, uidRaw];
  return saveMessages(gid, list);
}
export function markMessagesRead(gid, uidRaw) {
  const list = loadMessages(gid);
  let changed = false;
  list.forEach((m) => {
    if (m.uid !== uidRaw && m.status !== "read") {
      m.status = "read";
      changed = true;
    }
  });
  if (changed) return saveMessages(gid, list);
  return true;
}

// ---------- Polls ----------
export function loadPolls(gid) {
  return read(K.polls(gid), []);
}
export function savePolls(gid, list) {
  return write(K.polls(gid), list);
}
export function upsertPoll(poll) {
  const list = loadPolls(poll.gid);
  const idx = list.findIndex((p) => p.id === poll.id);
  if (idx >= 0) list[idx] = poll;
  else list.unshift(poll);
  return savePolls(poll.gid, list);
}
export function deletePoll(gid, pid) {
  return savePolls(gid, loadPolls(gid).filter((p) => p.id !== pid));
}

// ---------- Places ----------
export function loadPlaces(gid) {
  return read(K.places(gid), []);
}
export function savePlaces(gid, list) {
  return write(K.places(gid), list);
}
export function upsertPlace(place) {
  const list = loadPlaces(place.gid);
  const idx = list.findIndex((p) => p.id === place.id);
  if (idx >= 0) list[idx] = place;
  else list.unshift(place);
  return savePlaces(place.gid, list);
}

// ---------- Topics ----------
export function loadTopics(gid) {
  return read(K.topics(gid), []);
}
export function saveTopics(gid, list) {
  return write(K.topics(gid), list);
}
export function ensureTopic(gid, member, { name, emoji }) {
  const list = loadTopics(gid);
  if (list.some((t) => t.name.toLowerCase() === String(name).toLowerCase())) return list.find((t) => t.name.toLowerCase() === String(name).toLowerCase());
  const topic = newTopic(groomGroup({ id: gid }), member, { name, emoji });
  list.push(topic);
  saveTopics(gid, list);
  return topic;
}

// ---------- Itinerary ----------
export function loadItinerary(gid) {
  return read(K.itinerary(gid), null);
}
export function saveItinerary(gid, it) {
  return write(K.itinerary(gid), it);
}

// ---------- Files ----------
export function loadFiles(gid) {
  return read(K.files(gid), []);
}
export function saveFiles(gid, list) {
  return write(K.files(gid), list);
}
export function addFile(file) {
  const list = loadFiles(file.gid);
  list.unshift(file);
  return saveFiles(file.gid, list);
}
export function deleteFile(gid, fid) {
  return saveFiles(gid, loadFiles(gid).filter((f) => f.id !== fid));
}

// ---------- Announcements ----------
export function loadAnnouncements(gid) {
  return read(K.announcements(gid), []);
}
export function saveAnnouncements(gid, list) {
  return write(K.announcements(gid), list);
}
export function upsertAnnouncement(a) {
  const list = loadAnnouncements(a.gid);
  const idx = list.findIndex((x) => x.id === a.id);
  if (idx >= 0) list[idx] = a;
  else list.unshift(a);
  return saveAnnouncements(a.gid, list);
}
export function markAnnouncementRead(gid, aid, uidRaw) {
  const list = loadAnnouncements(gid);
  const a = list.find((x) => x.id === aid);
  if (!a) return false;
  a.readBy = a.readBy || [];
  if (!a.readBy.includes(uidRaw)) a.readBy.push(uidRaw);
  return saveAnnouncements(gid, list);
}

// ---------- Activity ----------
export function loadActivity(gid) {
  return read(K.activity(gid), []);
}
export function saveActivity(gid, list) {
  return write(K.activity(gid), list.slice(0, 300));
}
export function addActivity({ gid, uidRaw, name, icon, text, kind }) {
  const list = loadActivity(gid);
  list.unshift({ id: uid("a"), gid, uid: uidRaw, name, icon, text, kind, createdAt: new Date().toISOString() });
  saveActivity(gid, list);
}

// ---------- Final plan ----------
export function loadFinalPlan(gid) {
  return read(K.finalPlan(gid), null);
}
export function saveFinalPlan(gid, plan) {
  return write(K.finalPlan(gid), plan);
}

// ---------- Notifications (session user) ----------
export function loadNotifs() {
  return read(K.notifs, []);
}
export function saveNotifs(list) {
  return write(K.notifs, list.slice(0, 300));
}
export function addNotif({ gid, gidName, text, kind, icon }) {
  const list = loadNotifs();
  list.unshift({
    id: uid("n"),
    gid,
    gidName,
    text,
    kind,
    icon: icon || "🔔",
    read: false,
    createdAt: new Date().toISOString(),
  });
  saveNotifs(list);
}
export function markNotifsRead() {
  return saveNotifs(loadNotifs().map((n) => ({ ...n, read: true })));
}
export function deleteNotif(id) {
  return saveNotifs(loadNotifs().filter((n) => n.id !== id));
}

// ---------- Mutes ----------
export function loadMutes() {
  return read(K.mutes, {});
}
export function saveMutes(map) {
  return write(K.mutes, map);
}
export function mutedKinds(gid, kind) {
  const mutes = loadMutes();
  const g = mutes[gid] || {};
  if (g.all) return true;
  return !!g[kind];
}
export function toggleMute(gid, key) {
  const mutes = loadMutes();
  const g = mutes[gid] || {};
  if (key === "all") {
    g.all = !g.all;
  } else {
    g[key] = !g[key];
  }
  mutes[gid] = g;
  saveMutes(mutes);
  return mutes[gid];
}

// ---------- Invites ----------
export function loadInvites() {
  return read(K.invites, []);
}
export function saveInvites(list) {
  return write(K.invites, list);
}
export function addInvite({ gid, code, createdBy }) {
  const list = loadInvites();
  list.unshift({ id: uid("i"), gid, code, createdBy, createdAt: new Date().toISOString() });
  saveInvites(list);
  return list[0];
}
export function revokeInvites(gid) {
  return saveInvites(loadInvites().filter((i) => i.gid !== gid));
}
export function acceptedInvite(code, uidRaw, name) {
  const invite = loadInvites().find((i) => String(i.code).toUpperCase() === String(code || "").trim().toUpperCase());
  if (!invite) return { ok: false, error: "Invite link not found or has been revoked." };
  const group = groupById(invite.gid);
  if (!group) return { ok: false, error: "Group no longer exists." };
  const members = loadMembers(group.id);
  if (members.some((m) => m.id === uidRaw)) return { ok: true, group };
  if (group.privacy === "inviteOnly") {
    // Simulated approval: creator is considered online to approve instantly for demo.
  }
  members.push({ id: uidRaw, name, username: name.toLowerCase().replace(/\s+/g, "."), email: "", phone: "", avatar: null, role: "member", status: "joined", createdAt: new Date().toISOString() });
  saveMembers(group.id, members);
  return { ok: true, group };
}

export function wasOnboarded() {
  return localStorage.getItem(K.onboarded) === "1";
}
export function markOnboarded() {
  localStorage.setItem(K.onboarded, "1");
}

// ---------- Presence (simulated) ----------
export function onlineFor(member, minutes = 30) {
  if (!member) return false;
  if (member.status !== "joined") return false;
  const h = (id) => {
    let x = 0;
    for (let i = 0; i < String(id).length; i++) x = (x * 31 + id.charCodeAt(i)) | 0;
    return Math.abs(x);
  };
  const bucket = Math.floor(Date.now() / 60000 / minutes);
  return (h(member.id) + bucket) % 4 !== 0;
}