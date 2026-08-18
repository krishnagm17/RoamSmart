// RoamGroups — pure group-planning logic. No React; deterministic + testable.
import { uid, inr, round2, computeBalances } from "../roamsplit/splitEngine.js";

export { uid, inr, round2 };

// Identical to hooks/usePhotos.generateTripId — kept local so the engine stays React-free.
export function generateTripId(destination, startDate, endDate) {
  const raw = `${destination}-${startDate}-${endDate}`;
  try {
    return btoa(raw).replace(/[^a-zA-Z0-9]/g, "").substring(0, 20);
  } catch {
    let h = 0;
    for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
    return `g_${Math.abs(h)}`;
  }
}

export const PRIVACY_OPTIONS = [
  { id: "private", label: "Private", desc: "Only invited members can see the group" },
  { id: "inviteOnly", label: "Invite only", desc: "Join only when an admin approves" },
  { id: "linkShare", label: "Anyone with invite link", desc: "Anyone with the link can join" },
];

export function parseInviteCode(input) {
  let str = input;
  if (!str && typeof window !== "undefined") {
    str = window.location.href;
  }
  if (!str) return null;
  str = String(str).trim();

  // 1. Match roamgroups=CODE, invite=CODE, join=CODE, code=CODE in URL/string
  const match = str.match(/(?:roamgroups|invite|join|code)[=\/]([A-Za-z0-9]+)/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }

  // 2. Direct code string check (6-12 alphanumeric characters)
  const cleanStr = str.replace(/^#/, "").replace(/^\?/, "");
  if (/^[A-Za-z0-9]{6,12}$/.test(cleanStr) && !["DASHBOARD", "TRIPS", "SPLIT", "GROUPS", "PROFILE", "SCANNER", "JOURNAL", "SAFETY", "ALERTS"].includes(cleanStr.toUpperCase())) {
    return cleanStr.toUpperCase();
  }

  return null;
}

export const POLL_TYPES = {
  destination: { label: "Destination", icon: "🌍" },
  activity: { label: "Activity", icon: "🎯" },
  hotel: { label: "Hotel", icon: "🏨" },
  restaurant: { label: "Restaurant", icon: "🍜" },
  transportation: { label: "Transportation", icon: "🚆" },
  budget: { label: "Budget", icon: "💰" },
  date: { label: "Date", icon: "📅" },
  general: { label: "General", icon: "🗳️" },
};

export const DECISION_STEPS = [
  { key: "suggestion", label: "Suggestion", icon: "💡" },
  { key: "discussion", label: "Discussion", icon: "💬" },
  { key: "poll", label: "Poll", icon: "🗳️" },
  { key: "voting", label: "Voting", icon: "✅" },
  { key: "final", label: "Final Decision", icon: "🏁" },
  { key: "trip", label: "Add to Trip Plan", icon: "🗓️" },
];

export const TOPIC_TEMPLATES = [
  { name: "Places to Visit", emoji: "📍" },
  { name: "Hotels", emoji: "🏨" },
  { name: "Food", emoji: "🍜" },
  { name: "Transportation", emoji: "🚆" },
  { name: "Budget", emoji: "💰" },
  { name: "Activities", emoji: "🎯" },
  { name: "Daily Itinerary", emoji: "🗓️" },
];

export function hashId(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#10b981,#059669)",
  "linear-gradient(135deg,#e0a84e,#b5822f)",
  "linear-gradient(135deg,#22d3ee,#0e7490)",
  "linear-gradient(135deg,#a78bfa,#6d28d9)",
  "linear-gradient(135deg,#fb923c,#ea580c)",
  "linear-gradient(135deg,#f472b6,#db2777)",
  "linear-gradient(135deg,#34d399,#047857)",
  "linear-gradient(135deg,#fbbf24,#b45309)",
];
export function avatarStyle(id) {
  return { background: AVATAR_GRADIENTS[hashId(id) % AVATAR_GRADIENTS.length] };
}
export function initials(name) {
  return String(name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
export function timeOf(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
export function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return formatDate(iso.slice(0, 10));
}
export function daysBetween(start, end) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}
export function dateForDay(start, index /*0-based*/) {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + index);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function newGroup(data, self) {
  const id = uid("g");
  const code = id.replace(/^g_/, "").slice(0, 8).toUpperCase();
  return groomGroup({
    id,
    code,
    name: String(data.name || "").trim(),
    destination: String(data.destination || "").trim(),
    description: String(data.description || "").trim(),
    startDate: data.startDate,
    endDate: data.endDate,
    privacy: data.privacy || "inviteOnly",
    image: data.image || null,
    createdBy: self.id,
    createdByName: self.name,
    createdAt: new Date().toISOString(),
    finalized: false,
    settings: {
      membersCanCreatePolls: true,
      membersCanAddItinerary: true,
      allowVoteChange: true,
      allowAnonymousPolls: true,
      requireAdminForFinalize: true,
    },
  });
}

export function groomGroup(g) {
  return {
    ...g,
    settings: {
      membersCanCreatePolls: true,
      membersCanAddItinerary: true,
      allowVoteChange: true,
      allowAnonymousPolls: true,
      requireAdminForFinalize: true,
      ...(g.settings || {}),
    },
    privacy: g.privacy || "inviteOnly",
    name: g.name || "Untitled Group",
    destination: g.destination || "",
    image: g.image || null,
  };
}

export function groupDestinations(group) {
  if (!group) return [];
  if (Array.isArray(group.destinations) && group.destinations.length) {
    return group.destinations
      .map((d) => String(d?.name || d || "").split(",")[0].trim())
      .filter(Boolean);
  }
  return String(group.destination || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function groupRouteLabel(group) {
  const d = groupDestinations(group);
  return d.length > 1 ? d.join(" → ") : d[0] || "No destination";
}

export function groupSubtitle(group) {
  const dest = groupRouteLabel(group);
  const dates =
    group.startDate && group.endDate
      ? ` · ${formatDate(group.startDate)} – ${formatDate(group.endDate)}`
      : "";
  return `${dest}${dates}`;
}

// ---------- Roles & permissions ----------

export function isAdmin(member) {
  return !member || member.role === "admin" || member.isOwner;
}
export function memberRole(member) {
  return isAdmin(member) ? "admin" : "member";
}
export function canCreatePoll(group, member) {
  return isAdmin(member) || !!group.settings?.membersCanCreatePolls;
}
export function canAddItinerary(group, member) {
  return isAdmin(member) || !!group.settings?.membersCanAddItinerary;
}
export function canFinalize(group, member) {
  return isAdmin(member);
}
export function canModifyMember(group, member, target) {
  if (isAdmin(member)) return true;
  return member.id === target.id; // members manage only themselves
}

// ---------- Polls ----------

export function newPoll({ group, member, title, kind, options = [], type = "single", anonymous = false, deadline = null, allowChange = true }) {
  const now = new Date().toISOString();
  return {
    id: uid("pl"),
    gid: group.id,
    uid: member.id,
    name: member.name,
    title: String(title || "").trim(),
    kind: kind || "general",
    type,
    anonymous,
    allowChange,
    deadline,
    options: (options || []).map((o) => ({ id: uid("o"), label: o })),
    votes: [],
    finalizedBy: null,
    finalizedOptionIds: [],
    createdAt: now,
  };
}

export function pollTotalVotes(poll) {
  return (poll.votes || []).length;
}
export function pollOptionCount(poll, optionId) {
  return (poll.votes || []).filter((v) => (v.optionIds || []).includes(optionId)).length;
}
export function pollClosed(poll, now = Date.now()) {
  if (poll.finalizedBy) return true;
  if (poll.deadline && new Date(poll.deadline).getTime() < now) return true;
  return false;
}
export function pollVoteByMember(poll, uidRaw) {
  return (poll.votes || []).find((v) => v.uid === uidRaw) || null;
}
export function pollWinningIds(poll) {
  let best = -1;
  let winners = [];
  (poll.options || []).forEach((o) => {
    const c = pollOptionCount(poll, o.id);
    if (c > best) {
      best = c;
      winners = [o.id];
    } else if (c === best && c > 0) {
      winners.push(o.id);
    }
  });
  return winners;
}
export function canVotePoll(poll, member) {
  if (!member) return false;
  if (pollClosed(poll)) return false;
  if (pollVoteByMember(poll, member.id)) return !!poll.allowChange;
  return true;
}

export function voteOnPoll(poll, member, optionIds) {
  poll.votes = (poll.votes || []).filter((v) => v.uid !== member.id);
  const norm = Array.isArray(optionIds) ? optionIds : [optionIds];
  const valid = new Set((poll.options || []).map((o) => o.id));
  const picked = norm.filter((id) => valid.has(id));
  if (picked.length) {
    poll.votes.push({ uid: member.id, name: member.name, optionIds: picked, votedAt: new Date().toISOString() });
  }
  return poll;
}

// ---------- Places ----------

export function newPlace({ group, member, data }) {
  const now = new Date().toISOString();
  return {
    id: uid("plc"),
    gid: group.id,
    uid: member.id,
    authorName: member.name,
    name: String(data.name || "").trim(),
    images: data.images || [],
    emoji: data.emoji || "📍",
    location: data.location || "",
    description: data.description || "",
    rating: Number(data.rating) || 0,
    cost: data.cost ? String(data.cost) : "",
    hours: data.hours || "",
    duration: data.duration || "",
    mapText: data.mapText || "",
    upvotes: [],
    downvotes: [],
    status: "suggested", // suggested -> voting -> finalized | rejected
    assignedDay: null,
    note: data.note || "",
    createdAt: now,
  };
}

export function placeNetVotes(place) {
  return (place.upvotes || []).length - (place.downvotes || []).length;
}
export function placeVotedBy(place, member, dir) {
  return dir === "up" ? place.upvotes.includes(member.id) : place.downvotes.includes(member.id);
}
export function togglePlaceVote(place, member, dir) {
  const up = new Set(place.upvotes || []);
  const down = new Set(place.downvotes || []);
  if (dir === "up") {
    if (up.has(member.id)) up.delete(member.id);
    else {
      up.add(member.id);
      down.delete(member.id);
    }
  } else {
    if (down.has(member.id)) down.delete(member.id);
    else {
      down.add(member.id);
      up.delete(member.id);
    }
  }
  place.upvotes = [...up];
  place.downvotes = [...down];
  return place;
}

export function placeStatusMeta(place) {
  const map = {
    suggested: { label: "Suggested", tone: "info" },
    voting: { label: "Voting", tone: "warn" },
    finalized: { label: "Finalized", tone: "ok" },
    rejected: { label: "Rejected", tone: "danger" },
  };
  return map[place.status] || map.suggested;
}

// ---------- Topics ----------

export function newTopic(group, member, { name, emoji }) {
  return {
    id: uid("t"),
    gid: group.id,
    uid: member.id,
    name,
    emoji: emoji || "💬",
    createdAt: new Date().toISOString(),
  };
}

// ---------- Messages ----------

export function newMessage({ group, member, kind = "text", text = "", attachment = null, placeId = null, pollId = null, topicId = null, replyTo = null, mentions = [] }) {
  return {
    id: uid("m"),
    gid: group.id,
    uid: member.id,
    name: member.name,
    kind,
    text: String(text || ""),
    attachment,       // { name, dataUrl|url, size, type }
    placeId,
    pollId,
    topicId,
    replyTo,          // { id, name, text, kind }
    mentions,         // ['@everyone', 'user_xxx', ...]
    reactions: {},    // { '👍': [uids] }
    status: "sent",   // sent -> delivered -> read
    pinned: false,
    edited: false,
    createdAt: new Date().toISOString(),
  };
}

export function parseMentions(text, members) {
  const out = [];
  const names = new Map(members.map((m) => [String(m.name || "").toLowerCase(), m]));
  const re = /@([A-Za-z0-9_.\-]{1,24})/g;
  let m;
  while ((m = re.exec(text))) {
    const tok = m[1].toLowerCase();
    if (tok === "everyone") out.push("@everyone");
    else if (names.has(tok)) out.push(names.get(tok).id);
    else out.push(`@user:${tok}`);
  }
  return out;
}

export function detectLinks(text) {
  return (String(text || "").match(/https?:\/\/[^\s]+/g) || []);
}

export function botAbility(member) {
  return !!member && (member.bot === true || member.kind === "bot");
}

// ---------- Itinerary ----------

export function makeItineraryDays(group) {
  const total = daysBetween(group.startDate, group.endDate);
  const days = [];
  for (let i = 0; i < total; i += 1) {
    const date = dateForDay(group.startDate, i);
    days.push({
      id: uid("d"),
      date,
      dayNumber: i + 1,
      items: [],
    });
  }
  return days;
}

export function placeToItineraryItem(place, day) {
  return {
    id: uid("it"),
    time: "10:00",
    title: place.name || "Place",
    type: "place",
    placeId: place.id,
    category: "Activities",
    estimate: place.cost ? `₹${place.cost}` : "",
    note: place.note || "",
    byUid: null,
  };
}

// ---------- Final trip plan & conversion ----------

export function buildFinalPlan(group, parts) {
  const settled = (parts.settlements || []).filter((s) => s.status === "paid").reduce((a, s) => a + Number(s.amount || 0), 0);
  const totalExpenses = (parts.expenses || []).reduce((a, e) => a + Number(e.amount || 0), 0);
  const dests = groupDestinations(group);
  const multi = dests.length > 1;
  const converted = {
    title: group.name,
    subtitle: `${groupRouteLabel(group)} · finalized by the group`,
    tags: ["GROUP", ...dests.map((d) => d.toUpperCase())].slice(0, 3),
    destination: group.destination,
    startDate: group.startDate,
    endDate: group.endDate,
    formData: {
      destinations: multi ? dests.map((d) => ({ name: d })) : undefined,
      destination: group.destination,
      startDate: group.startDate,
      endDate: group.endDate,
      numTravellers: (parts.members || []).length,
      budgetLevel: "Flexible",
      interests: [],
      departureCity: "Bengaluru",
    },
    days: (parts.itinerary?.days || []).map((d) => ({
      day: d.dayNumber,
      date: d.date,
      overview: d.overview || "",
      activities: d.items.map((it) => ({
        time: it.time,
        title: it.title,
        description: it.note || "",
        category: it.type === "place" ? "Activities" : "Custom",
        estimate: it.estimate || "",
      })),
    })),
    hotels: parts.hotels || [],
    restaurants: parts.restaurants || [],
    budget: {
      transport: Math.round(totalExpenses * 0.3),
      hotels: Math.round(totalExpenses * 0.4),
      food: Math.round(totalExpenses * 0.2),
      activities: totalExpenses - Math.round(totalExpenses * 0.9),
      total: totalExpenses,
    },
    tips: [],
    bestTimeToVisit: formatDate(group.startDate),
    emergencyNumbers: { police: "100", ambulance: "108", touristHelpline: "1363" },
    finalizedPlaces: (parts.places || []).filter((p) => p.status === "finalized").map((p) => ({
      name: p.name,
      location: p.location,
      rating: p.rating,
      cost: p.cost,
      votes: p.upvotes.length - p.downvotes.length,
    })),
    groupId: group.id,
    expenses: { total: totalExpenses, settled },
  };
  return converted;
}

export function groupProgress(group, parts) {
  const places = parts.places || [];
  const finalized = places.filter((p) => p.status === "finalized").length;
  const total = places.length;
  const polls = parts.polls || [];
  const pendingPolls = polls.filter((p) => !pollClosed(p)).length;
  const days = parts.itinerary?.days || [];
  const totalSlots = days.length * 4;
  const filledSlots = days.reduce((a, d) => a + Math.min(d.items.length, 4), 0);
  const itineraryPct = totalSlots ? Math.round((filledSlots / totalSlots) * 100) : 0;
  const expenses = parts.expenses || [];
  const settlements = parts.settlements || [];
  const expTotal = expenses.reduce((a, e) => a + Number(e.amount || 0), 0);
  const settled = settlements.filter((s) => s.status === "paid").reduce((a, s) => a + Number(s.amount || 0), 0);
  const settledPct = expTotal ? Math.min(100, Math.round((settled / expTotal) * 100)) : 0;
  return {
    placesFinalized: finalized,
    placesTotal: total,
    itineraryPct,
    pollsPending: pendingPolls,
    settledPct,
    placesPct: total ? Math.round((finalized / total) * 100) : 0,
  };
}

export function decisionsForPlaces(places) {
  return places.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    votes: placeNetVotes(p),
  }));
}

// ---------- Group expenses glue ----------

export function tripIdForGroup(group) {
  if (!group) return null;
  const first = groupDestinations(group)[0] || group.name || "group";
  if (group.startDate && group.endDate) {
    return generateTripId(first, group.startDate, group.endDate);
  }
  return generateTripId(first, "x", "x");
}

export function memberBalances(groupMembers, expenses, settlements) {
  return computeBalances(
    expenses,
    settlements,
    groupMembers.map((m) => ({ id: m.id, name: m.name, upi: m.upi || "" }))
  );
}

// ---------- Search ----------

export function searchGroup(query, parts) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return { messages: [], people: [], places: [], polls: [], files: [], links: [], expenses: [] };
  const inFn = (s) => String(s || "").toLowerCase().includes(q);
  return {
    messages: (parts.messages || []).filter((m) => inFn(m.text) || inFn(m.name) || (m.topicId && inFn(parts.topics?.find((t) => t.id === m.topicId)?.name))),
    people: (parts.members || []).filter((m) => inFn(m.name) || inFn(m.username) || inFn(m.email) || inFn(m.phone)),
    places: (parts.places || []).filter((p) => inFn(p.name) || inFn(p.location) || inFn(p.description)),
    polls: (parts.polls || []).filter((p) => inFn(p.title) || inFn(p.name)),
    files: (parts.files || []).filter((f) => inFn(f.name) || inFn(f.caption)),
    links: (parts.messages || []).filter((m) => detectLinks(m.text).length && m.kind === "text").filter((m) => inFn(m.text)),
    expenses: (parts.expenses || []).filter((e) => inFn(e.title) || inFn(e.paidBy?.name)),
  };
}

// ---------- Shared demo users ----------

export const DEMO_USERS = [
  { name: "Rahul Sharma", username: "rahul.roams", email: "rahul@roamsmart.app", phone: "+91 98450 11223", kind: "demo" },
  { name: "Arjun Nair", username: "arjun.wanders", email: "arjun@roamsmart.app", phone: "+91 98765 01012", kind: "demo" },
  { name: "Priya Iyer", username: "priya.palace", email: "priya@roamsmart.app", phone: "+91 97420 55678", kind: "demo" },
  { name: "Sneha Kulkarni", username: "sneha.hikes", email: "sneha@roamsmart.app", phone: "+91 90220 33445", kind: "demo" },
  { name: "Vikram Singh", username: "vikram.globe", email: "vikram@roamsmart.app", phone: "+91 99955 77890", kind: "demo" },
  { name: "Tara Mehta", username: "tara.trails", email: "tara@roamsmart.app", phone: "+91 98110 22334", kind: "demo" },
];

export function searchDemoUsers(q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return [];
  return DEMO_USERS.filter(
    (u) => u.name.toLowerCase().includes(s) || u.username.toLowerCase().includes(s) || u.email.toLowerCase().includes(s) || String(u.phone).toLowerCase().includes(s)
  );
}

export function memberFromUser(user, role = "member") {
  return {
    id: uid("u"),
    name: user.name,
    username: user.username || user.name.toLowerCase().replace(/\s+/g, "."),
    email: user.email || "",
    phone: user.phone || "",
    avatar: null,
    role,
    status: "joined", // joined | pending
    kind: user.kind || "member",
    createdAt: new Date().toISOString(),
  };
}