import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Plus, Bell, Search, Settings, MessageCircle, MapPin, Vote, CalendarRange,
  Wallet, FolderOpen, Megaphone, Users, Trophy, Link2, Sparkles,
} from "lucide-react";
import { useToast } from "../Toast.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { loadExpenses, loadSettlements } from "../roamsplit/roomStorage";
import {
  inr, placeToItineraryItem, makeItineraryDays,
  voteOnPoll, pollVoteByMember, pollWinningIds, isAdmin, canCreatePoll, canAddItinerary,
  groupSubtitle, initials, avatarStyle, groupProgress, tripIdForGroup,
  togglePlaceVote as engineTogglePlaceVote,
  DECISION_STEPS, PRIVACY_OPTIONS,
} from "./groupsEngine";
import {
  subscribeGroup, subscribeUserGroups, subscribeUnread,
  createGroup, joinGroupByCode, sendMessage, editMessage, deleteMessage,
  togglePinMessage, toggleReaction, markMessagesRead,
  addPoll, upsertPoll, deletePoll,
  addPlace, upsertPlace, togglePlaceVote,
  saveItinerary, ensureTopic,
  uploadGroupFile, deleteGroupFile,
  addAnnouncement, togglePinAnnouncement, deleteAnnouncement,
  setMember, removeMember, leaveGroup, deleteGroup, updateGroup, revokeInvite,
  addActivityLocal, notifyGroup, markAllNotifsRead, deleteNotif,
  subscribeUserNotifs,
} from "./groupsStore";
import "./RoamGroups.css";
import ChatView from "./ChatView";
import PlacesView from "./PlacesView";
import PollsView from "./PollsView";
import ItineraryView from "./ItineraryView";
import FilesView from "./FilesView";
import AnnouncementsView from "./AnnouncementsView";
import MembersView from "./MembersView";
import ExpensesView from "./ExpensesView";
import { CreateGroupSheet, JoinGroupSheet, InviteSheet, GroupSettingsSheet, NotifsPanel, GroupSearchModal, FinalPlanSheet } from "./Sheets";

export default function RoamGroupsScreen({ joinCode, setActiveTab }) {
  const { showToast } = useToast();
  const auth = useAuth();
  const userId = auth.user?.uid;
  const profile = auth.profile || {};
  const self = useMemo(() => ({
    id: userId,
    name: profile.displayName || "You",
    username: profile.username || "",
    email: profile.email || "",
    phone: profile.phone || "",
    avatar: profile.avatarUrl || null,
    upi: profile.upi || "",
    role: "member",
  }), [userId, profile]);

  const [groups, setGroups] = useState([]);
  const [unreadMap, setUnreadMap] = useState({});
  const [activeGid, setActiveGid] = useState(null);
  const [parts, setParts] = useState(null);
  const [tab, setTab] = useState("chat");
  const [notifs, setNotifs] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [newItemDay, setNewItemDay] = useState(null);

  // Live group list
  useEffect(() => {
    if (!userId) return () => {};
    return subscribeUserGroups(userId, setGroups);
  }, [userId]);

  // Live data for the open group
  useEffect(() => {
    if (!activeGid) { setParts(null); return () => {}; }
    return subscribeGroup(activeGid, (p) => setParts(p));
  }, [activeGid]);

  // Live per-user notifications (Supabase, realtime)
  useEffect(() => {
    if (!userId) return () => {};
    return subscribeUserNotifs(userId, (list) => setNotifs(list || []));
  }, [userId]);

  // Unread badges per group on the home screen
  const lastReadRef = useRef({});
  lastReadRef.current = groups.reduce((a, e) => ({ ...a, [e.gid]: e.lastReadAt || 0 }), {});
  useEffect(() => {
    const unsubs = groups.map((e) =>
      subscribeUnread(e.gid, (msgs) => {
        const last = lastReadRef.current[e.gid] || 0;
        const count = msgs.filter((m) => m.uid !== userId && new Date(m.createdAt || 0).getTime() > last).length;
        setUnreadMap((prev) => (prev[e.gid] === count ? prev : { ...prev, [e.gid]: count }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [groups, userId]);

  // Auto-join from invite link (#roamgroups=CODE)
  useEffect(() => {
    if (!joinCode || !userId) return;
    (async () => {
      const res = await joinGroupByCode(joinCode, self);
      if (res.ok) {
        openGroup(res.group.id);
        showToast(`Joined ${res.group.name} 🎉`, "success");
      } else {
        showToast(res.error || "Invalid invite code", "error");
      }
    })();
    // eslint-disable-next-line
  }, [joinCode, userId]);

  const group = parts?.group || null;
  const members = parts?.members || [];
  const messages = parts?.messages || [];
  const polls = parts?.polls || [];
  const places = parts?.places || [];
  const topics = parts?.topics || [];
  let itinerary = parts?.itinerary || null;
  const files = parts?.files || [];
  const announcements = parts?.announcements || [];
  const activity = parts?.activity || [];

  // Ensure an itinerary doc exists for the open group
  useEffect(() => {
    if (group && !itinerary) {
      saveItinerary(group.id, { days: makeItineraryDays(group), suggestions: [] }).catch(() => {});
      setParts((p) => (p ? { ...p, itinerary: { days: makeItineraryDays(group), suggestions: [] } } : p));
    }
    // eslint-disable-next-line
  }, [group?.id, !!itinerary]);

  const selfRecord = members.find((m) => m.id === userId) || { ...self, status: "joined", createdAt: new Date().toISOString() };
  const isAdminSelf = isAdmin(selfRecord);

  const errToast = (err) => showToast(err?.message || "Something went wrong. Please try again.", "error");

  // ── action bag passed to feature views ─────────────────────
  function log(icon, text, kind) {
    if (!group) return;
    addActivityLocal({ gid: group.id, uidRaw: selfRecord.id, name: selfRecord.name, icon, text, kind: kind || "generic" }).catch(() => {});
  }
  function notify(text, kind, icon) {
    if (!group) return;
    notifyGroup({ gid: group.id, gidName: group.name, text, kind: kind || "group", icon: icon || "🔔", excludeUids: [userId] }).catch(() => {});
  }

  const act = {
    showToast,
    openChat: () => setTab("chat"),

    // ── messages ──
    sendMessage: (data) => {
      sendMessage({ group, member: selfRecord, kind: data.kind || "text", text: data.text || "", attachment: data.attachment || null, placeId: data.placeId || null, pollId: data.pollId || null, topicId: data.topicId || null, replyTo: data.replyTo || null, mentions: data.mentions || [] })
        .catch(errToast);
      log("💬", `sent "${data.text?.slice(0, 40)}"`, "message");
    },
    editMessage: (id, text) => editMessage(group.id, id, text, selfRecord, isAdminSelf).then((ok) => { if (ok) log("✏️", "edited a message", "message"); }).catch(errToast),
    deleteMessage: (msg) => deleteMessage(group.id, msg.id, selfRecord, isAdminSelf).then((ok) => { if (ok) log("🗑️", "deleted a message", "message"); }).catch(errToast),
    togglePin: (msg) => togglePinMessage(group.id, msg.id).catch(errToast),
    toggleReaction: (msg, emoji) => toggleReaction(group.id, msg.id, emoji, userId).catch(errToast),

    // ── polls ──
    votePoll: (poll, optionId) => {
      const existing = pollVoteByMember(poll, userId);
      if (!poll.allowChange && existing) return;
      let optionIds;
      if (poll.type === "multiple") {
        const cur = existing ? existing.optionIds : [];
        optionIds = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId];
      } else {
        optionIds = [optionId];
      }
      voteOnPoll(poll, selfRecord, optionIds);
      upsertPoll(group.id, poll).catch(errToast);
    },
    finalizePoll: (poll) => {
      poll.finalizedBy = selfRecord.id;
      poll.finalizedOptionIds = pollWinningIds(poll);
      upsertPoll(group.id, poll).catch(errToast);
      const winner = (poll.options || []).find((o) => o.id === pollWinningIds(poll)[0])?.label;
      log("🏁", `finalized poll "${poll.title}" → ${winner || "winner"}`, "decision");
      notify(`Poll "${poll.title}" finalized`, "decision", "🏁");
    },
    deletePoll: (poll) => { deletePoll(group.id, poll.id).catch(errToast); log("🗑️", `deleted poll "${poll.title}"`, "poll"); },
    addPoll: (data) => {
      addPoll({ group, member: selfRecord, ...data }).then((poll) => {
        log("🗳️", `created poll "${data.title}"`, "poll");
        notify(`New poll: "${data.title}" — vote now!`, "poll", "🗳️");
      }).catch(errToast);
    },

    // ── places ──
    togglePlaceVote: (place, dir) => {
      engineTogglePlaceVote(place, selfRecord, dir);
      upsertPlace(group.id, place).catch(errToast);
    },
    finalizePlace: (place, status) => {
      place.status = status;
      upsertPlace(group.id, place).catch(errToast);
      if (status === "finalized") {
        const item = placeToItineraryItem(place, null);
        const it = itinerary || { days: makeItineraryDays(group), suggestions: [] };
        const day = it.days.find((d) => d.items.length < 5) || it.days[0];
        if (day) day.items.push({ ...item, time: "10:00", category: "Activities" });
        saveItinerary(group.id, it).catch(errToast);
        log("✅", `finalized ${place.name} → added to itinerary`, "decision");
        notify(`"${place.name}" was finalized to the itinerary`, "decision", "✅");
      } else {
        log(status === "rejected" ? "❌" : "🗳️", `${place.name} ${status === "rejected" ? "rejected" : "opened for voting"}`, "decision");
      }
    },
    addPlaceToItinerary: (place) => {
      const it = itinerary || { days: makeItineraryDays(group), suggestions: [] };
      const day = it.days.find((d) => d.items.length < 5) || it.days[0];
      if (day) day.items.push(placeToItineraryItem(place, day));
      saveItinerary(group.id, it).catch(errToast);
      log("🗓️", `added ${place.name} to the itinerary`, "itinerary");
    },
    createPollFromPlace: (place) => {
      addPoll({ group, member: selfRecord, kind: "activity", title: `Should we visit ${place.name}?`, options: [place.name, "Maybe another time"] }).catch(errToast);
      log("🗳️", `started a poll about ${place.name}`, "poll");
    },
    addPlaceToPoll: (place) => act.createPollFromPlace(place),
    addPlace: (data) => {
      addPlace({ group, member: selfRecord, data }).then((place) => {
        log("📍", `suggested ${place.name}`, "place");
        notify(`${selfRecord.name} suggested "${place.name}"`, "place", "📍");
      }).catch(errToast);
    },

    // ── itinerary ──
    addItineraryItem: (dayId) => setNewItemDay(dayId),
    saveItineraryItem: (dayId, item) => {
      const it = itinerary || { days: makeItineraryDays(group), suggestions: [] };
      const day = it.days.find((d) => d.id === dayId);
      if (day) day.items.push({ id: uid2(), time: item.time || "10:00", title: item.title, type: "custom", category: item.category || "Custom", estimate: item.estimate || "", note: item.note || "", byUid: selfRecord.id });
      saveItinerary(group.id, it).catch(errToast);
      setNewItemDay(null);
      log("🗓️", `added "${item.title}" to the itinerary`, "itinerary");
    },
    removeItineraryItem: (dayId, itemId) => {
      const it = itinerary || { days: [], suggestions: [] };
      const day = it.days.find((d) => d.id === dayId);
      if (day) day.items = day.items.filter((x) => x.id !== itemId);
      saveItinerary(group.id, it).catch(errToast);
    },
    addItinerarySuggestion: (data) => {
      const it = itinerary || { days: makeItineraryDays(group), suggestions: [] };
      it.suggestions = it.suggestions || [];
      it.suggestions.push({ id: uid2(), byUid: selfRecord.id, name: selfRecord.name, type: data.type, text: data.text, targetDayId: data.targetDayId || null, votes: [selfRecord.id], status: "open", createdAt: new Date().toISOString() });
      saveItinerary(group.id, it).catch(errToast);
      log("💡", `suggested "${data.text.slice(0, 40)}" for the itinerary`, "itinerary");
    },
    voteSuggestion: (s, uidRaw) => {
      const it = itinerary || { days: [], suggestions: [] };
      const sg = it.suggestions.find((x) => x.id === s.id);
      if (!sg) return;
      sg.votes = sg.votes.includes(uidRaw) ? sg.votes.filter((v) => v !== uidRaw) : [...sg.votes, uidRaw];
      saveItinerary(group.id, it).catch(errToast);
    },
    resolveSuggestion: (s, status) => {
      const it = itinerary || { days: [], suggestions: [] };
      const sg = it.suggestions.find((x) => x.id === s.id);
      if (!sg) return;
      sg.status = status;
      if (status === "approved" && sg.targetDayId) {
        const day = it.days.find((d) => d.id === sg.targetDayId);
        if (day) day.items.push({ id: uid2(), time: "10:00", title: sg.text, type: sg.type === "place" ? "place" : "custom", category: sg.type === "place" ? "Activities" : "Custom", estimate: "", note: `Suggested by ${sg.name}`, byUid: sg.byUid });
      }
      saveItinerary(group.id, it).catch(errToast);
      log("✅", `${status === "approved" ? "approved" : "rejected"} itinerary suggestion by ${sg.name}`, "itinerary");
    },

    // ── files ──
    addFile: (data) => {
      uploadGroupFile({ gid: group.id, uid: selfRecord.id, name: data.name, dataUrl: data.dataUrl, caption: data.caption, folder: data.folder, kind: data.kind })
        .then((f) => { log("📎", `shared ${data.name.slice(0, 30)}`, "file"); return f; })
        .catch((e) => { log("📎", `shared ${data.name.slice(0, 30)}`, "file"); if (e) errToast({ message: "File saved locally — Firebase Storage not configured." }); });
    },
    deleteFile: (f) => deleteGroupFile(group.id, f).catch(errToast),

    // ── announcements ──
    addAnnouncement: (d) => {
      addAnnouncement({ group, self: selfRecord, title: d.title, body: d.body, pinned: d.pinned, imageDataUrl: d.imageDataUrl })
        .then(() => {
          log("📢", `posted announcement "${d.title}"`, "announcement");
          notify(`Announcement: "${d.title}"`, "announcement", "📢");
        })
        .catch(errToast);
    },
    togglePinAnnouncement: (a) => togglePinAnnouncement(group.id, a).catch(errToast),
    deleteAnnouncement: (a) => deleteAnnouncement(group.id, a).catch(errToast),

    // ── members ──
    addMember: (m) => {
      setMember(group.id, m).then(() => {
        log("👋", `invited ${m.name}`, "member");
        notify(`${m.name} joined the group`, "member", "👋");
      }).catch(errToast);
    },
    promoteMember: (m) => { setMember(group.id, { ...m, role: "admin" }).catch(errToast); log("👑", `made ${m.name} an admin`, "member"); },
    removeMember: (m) => { removeMember(group.id, m.id).catch(errToast); log("🚪", `removed ${m.name}`, "member"); },
    leaveGroup: () => {
      leaveGroup(group.id, userId).then(() => setActiveGid(null)).catch(errToast);
      showToast("You left the group", "info");
    },
    revokeInvites: () => { revokeInvite(group.code).catch(errToast); showToast("Invite link revoked", "info"); },

    // ── expenses (RoamSplit integration) ──
    onExpenseEvent: (kind, expense) => {
      if (kind === "added") log("💰", `added expense ${expense.title} ${inr(expense.amount)}`, "expense");
      else if (kind === "settled") log("💸", `settled ${inr(expense.amount)} with ${expense.toName || "someone"}`, "expense");
      else if (kind === "requested") log("💸", `requested ${inr(expense.amount)} from ${expense.toName || "someone"}`, "expense");
      else log("💳", `updated expense ${expense.title}`, "expense");
    },
  };

  function openGroup(gid) {
    setActiveGid(gid);
    setTab("chat");
    markMessagesRead(userId, gid).catch(() => {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onCreate(form) {
    try {
      const g = await createGroup({ data: form, self, withDemo: !!form.addMembers });
      setActiveGid(g.id);
      setTab("chat");
      setCreateOpen(false);
      showToast(`Group "${g.name}" created 🎉`, "success");
    } catch (e) {
      errToast({ message: e?.message || "Could not create the group." });
    }
  }

  const unreadCount = notifs.filter((n) => !n.read).length;
  const g = group
    ? {
        self: selfRecord, group, members, messages, polls, places, topics, itinerary, files, announcements, activity,
        isAdmin: isAdminSelf, canCreatePolls: canCreatePoll(group, selfRecord), canAddItinerary: canAddItinerary(group, selfRecord),
      }
    : null;

  return (
    <div className="rg-wrap">
      {!group || !g ? (
        <GroupsHome
          groups={groups} self={self} notifs={notifs} unreadMap={unreadMap}
          onCreate={() => setCreateOpen(true)} onJoin={() => setJoinOpen(true)}
          onOpen={openGroup} onNotifs={() => setNotifsOpen(true)}
          unreadCount={unreadCount}
        />
      ) : (
        <GroupView
          g={g} act={act} tab={tab} setTab={setTab}
          onBack={() => { setActiveGid(null); setParts(null); setTab("chat"); }}
          onInvite={() => setInviteOpen(true)} onSettings={() => setSettingsOpen(true)}
          onSearch={() => setSearchOpen(true)} onFinal={() => setFinalOpen(true)}
          onNotifs={() => setNotifsOpen(true)} unreadCount={unreadCount}
          onDeleteGroup={() => { deleteGroup(group.id).then(() => setActiveGid(null)).catch(errToast); showToast("Group deleted", "info"); }}
          newItemDay={newItemDay} onNewItemClose={() => setNewItemDay(null)} onNewItemSave={act.saveItineraryItem}
          progress={groupProgress(group, { places, polls, itinerary, expenses: loadExpenses(tripIdForGroup(group) || ""), settlements: loadSettlements(tripIdForGroup(group) || "") })}
        />
      )}

      {createOpen && <CreateGroupSheet self={self} onClose={() => setCreateOpen(false)} onSave={onCreate} />}
      {joinOpen && (
        <JoinGroupSheet self={self}
          onJoin={(code) => joinGroupByCode(code, self)}
          onClose={() => setJoinOpen(false)}
          onJoined={(grp) => { setJoinOpen(false); openGroup(grp.id); showToast(`Joined ${grp.name}`, "success"); }} />
      )}
      {inviteOpen && group && (
        <InviteSheet group={group} members={members} self={selfRecord}
          onAddMember={act.addMember} onClose={() => setInviteOpen(false)} onInvite={() => {}} onRevoke={act.revokeInvites} />
      )}
      {settingsOpen && group && (
        <GroupSettingsSheet group={group} self={selfRecord} isAdmin={isAdminSelf}
            isCreator={group.createdBy ? group.createdBy === selfRecord.id : isAdminSelf}
            onSave={(ng) => { updateGroup(group.id, ng).then(() => { setSettingsOpen(false); showToast("Settings saved", "success"); }).catch(errToast); }}
            onDelete={() => { deleteGroup(group.id).then(() => { setSettingsOpen(false); setActiveGid(null); showToast("Group deleted", "info"); }).catch(errToast); }}
            onClose={() => setSettingsOpen(false)} />
      )}
      {notifsOpen && (
        <NotifsPanel notifs={notifs}
          onMarkAll={() => { markAllNotifsRead(userId).catch(errToast); }}
          onDismiss={(id) => { deleteNotif(userId, id).catch(errToast); }}
          onOpenGroup={(gid) => { setNotifsOpen(false); openGroup(gid); }}
          onClose={() => setNotifsOpen(false)} />
      )}
      {searchOpen && group && (
        <GroupSearchModal group={group} data={{ messages, members, places, polls, files, topics, expenses: loadExpenses(tripIdForGroup(group) || "") }}
          onClose={() => setSearchOpen(false)} />
      )}
      {finalOpen && group && (
        <FinalPlanSheet group={group} data={{ itinerary, places, polls, expenses: loadExpenses(tripIdForGroup(group) || ""), settlements: loadSettlements(tripIdForGroup(group) || ""), members }}
          onClose={() => setFinalOpen(false)}
          onPushTrip={(plan) => {
            try {
              const saved = JSON.parse(localStorage.getItem("roam_saved_trips") || "[]");
              localStorage.setItem("roam_saved_trips", JSON.stringify([{ ...plan, formData: plan.formData }, ...saved.filter((t) => t.title !== plan.title)]));
              showToast("Saved to My Trips 🗺️", "success");
            } catch { showToast("Could not save trip", "error"); }
          }} />
      )}
    </div>
  );
}

function uid2() {
  return "it_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function GroupsHome({ groups, self, notifs, unreadMap, onCreate, onJoin, onOpen, onNotifs, unreadCount }) {
  return (
    <div className="rg-groups-pad">
      <div className="rg-head">
        <div style={{ flex: 1 }}>
          <div className="rg-kicker">RoamGroups</div>
          <h1 className="rg-title">Plan trips together</h1>
          <p className="rg-sub">Chat, vote, decide and lock the itinerary as a team.</p>
        </div>
        <button className="rg-back" onClick={onNotifs} aria-label="Notifications" style={{ position: "relative" }}>
          <Bell size={18} />
          {unreadCount > 0 && <span className="rg-count-pill" style={{ position: "absolute", top: -4, right: -4, fontSize: 10, width: 18, height: 18 }}>{unreadCount}</span>}
        </button>
      </div>

      <div className="rg-card" style={{ marginBottom: 16, borderColor: "rgba(224,168,78,.35)" }}>
        <div className="rg-row" style={{ gap: 12 }}>
          <span className="rg-act-ic"><Sparkles size={17} /></span>
          <div style={{ flex: 1 }}>
            <b style={{ fontFamily: "var(--font-display, serif)" }}>How a trip gets decided</b>
            <div className="rg-flow" style={{ marginTop: 10 }}>
              {DECISION_STEPS.map((s, i) => (
                <span key={s.key}>
                  {i > 0 && <span className="rg-flow-arrow">→</span>}
                  <span className="rg-flow-step">{s.icon} {s.label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rg-row" style={{ gap: 10, marginBottom: 18 }}>
        <button className="rg-btn rg-btn-primary" style={{ flex: 1 }} onClick={onCreate}><Plus size={16} /> Create group</button>
        <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={onJoin}><Link2 size={16} /> Join with code</button>
      </div>

      {groups.length === 0 ? (
        <div className="rg-empty">
          <div style={{ fontSize: 42 }}>🧭</div>
          <b>No trip groups yet</b>
          <p>Create a group for your next trip, add your friends, and start turning suggestions into a locked plan.</p>
        </div>
      ) : (
        <>
          <div className="rg-section"><h2>Your groups</h2></div>
          {groups.map((entry) => {
            const grp = entry.group;
            const unread = unreadMap[entry.gid] || 0;
            const mcount = grp.memberCount || 0;
            return (
              <div key={entry.gid} className="rg-group-card" onClick={() => onOpen(entry.gid)} role="button">
                <span className="rg-group-thumb">{grp.image ? <img src={grp.image} alt="" /> : "🎒"}</span>
                <div className="rg-group-body">
                  <div className="rg-group-name">{grp.name}</div>
                  <div className="rg-group-meta">
                    {groupSubtitle(grp)} · {mcount} member{mcount === 1 ? "" : "s"}
                    <br/><span style={{ opacity: 0.8, fontSize: "0.95em" }}>Created by {entry.members?.find((m) => m.role === "admin")?.name || entry.members?.[0]?.name || "Someone"}</span>
                  </div>
                </div>
                {unread > 0 && <span className="rg-group-unread">{unread}</span>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function GroupView({ g, act, tab, setTab, onBack, onInvite, onSettings, onSearch, onFinal, onNotifs, unreadCount, onDeleteGroup, newItemDay, onNewItemClose, onNewItemSave, progress }) {
  const tabs = [
    { id: "chat", label: "Chat", icon: MessageCircle },
    { id: "places", label: "Places", icon: MapPin },
    { id: "polls", label: "Polls", icon: Vote },
    { id: "itinerary", label: "Itinerary", icon: CalendarRange },
    { id: "expenses", label: "Expenses", icon: Wallet },
    { id: "files", label: "Files", icon: FolderOpen },
    { id: "announcements", label: "Announcements", icon: Megaphone },
    { id: "members", label: "Members", icon: Users },
  ];
  const bottomTabs = ["chat", "places", "polls", "itinerary", "members"];
  const privacy = PRIVACY_OPTIONS.find((p) => p.id === g.group.privacy)?.label || g.group.privacy;

  return (
    <div>
      <div className="rg-head">
        <button className="rg-back" onClick={onBack} aria-label="Back"><ArrowLeft size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rg-kicker">RoamGroups · {privacy}</div>
          <h2 className="rg-title" style={{ fontSize: 19, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.group.name}</h2>
        </div>
        <button className="rg-back" onClick={onSearch} aria-label="Search"><Search size={17} /></button>
        <button className="rg-back" onClick={onFinal} aria-label="Final plan"><Trophy size={17} /></button>
        <button className="rg-back" onClick={onNotifs} aria-label="Notifications" style={{ position: "relative" }}>
          <Bell size={17} />
          {unreadCount > 0 && <span className="rg-count-pill" style={{ position: "absolute", top: -4, right: -4, fontSize: 9, width: 17, height: 17 }}>{unreadCount}</span>}
        </button>
        <button className="rg-back" onClick={onSettings} aria-label="Settings"><Settings size={17} /></button>
      </div>

      <div className="rg-cover">
        {g.group.image && <img className="rg-cover-img" src={g.group.image} alt="" />}
        <div className="rg-cover-body">
          <h2>{g.group.name}</h2>
          <p className="rg-sub">
            {groupSubtitle(g.group)}
            <br/><span style={{ opacity: 0.85, fontSize: "0.9em" }}>Created by {g.members?.find((m) => m.role === "admin")?.name || g.members?.[0]?.name || "Someone"}</span>
          </p>
          <div className="rg-row" style={{ marginTop: 12, gap: 8 }}>
            {(g.members || []).slice(0, 5).map((m) => (
              <span key={m.id} className="rg-ava" title={m.name} style={m.avatar ? { backgroundImage: `url(${m.avatar})`, backgroundSize: "cover" } : avatarStyle(m.name)}>{!m.avatar && initials(m.name)}</span>
            ))}
            <button className="rg-btn rg-btn-sm rg-btn-gold" style={{ marginLeft: "auto" }} onClick={onInvite}>+ Invite</button>
          </div>
        </div>
      </div>

      <div className="rg-progress">
        <div className="rg-prog-item">
          <div className="rg-prog-top"><span>Places decided</span><b>{progress.placesFinalized}/{progress.placesTotal}</b></div>
          <div className="rg-bar"><div className="rg-bar-fill" style={{ width: `${progress.placesPct}%` }} /></div>
        </div>
        <div className="rg-prog-item">
          <div className="rg-prog-top"><span>Itinerary</span><b>{progress.itineraryPct}%</b></div>
          <div className="rg-bar"><div className="rg-bar-fill" style={{ width: `${progress.itineraryPct}%` }} /></div>
        </div>
        <div className="rg-prog-item">
          <div className="rg-prog-top"><span>Open polls</span><b>{progress.pollsPending}</b></div>
          <div className="rg-bar"><div className="rg-bar-fill gold" style={{ width: "100%" }} /></div>
        </div>
        <div className="rg-prog-item">
          <div className="rg-prog-top"><span>Settled</span><b>{progress.settledPct}%</b></div>
          <div className="rg-bar"><div className="rg-bar-fill gold" style={{ width: `${progress.settledPct}%` }} /></div>
        </div>
      </div>

      <div className="rg-tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`rg-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}><Icon size={14} /> {label}</button>
        ))}
      </div>

      {tab === "chat" && <ChatView g={g} act={act} />}
      {tab === "places" && <PlacesView g={g} act={act} />}
      {tab === "polls" && <PollsView g={g} act={act} />}
      {tab === "itinerary" && <ItineraryView g={g} act={act} />}
      {tab === "expenses" && <ExpensesView g={g} act={act} />}
      {tab === "files" && <FilesView g={g} act={act} />}
      {tab === "announcements" && <AnnouncementsView g={g} act={act} />}
      {tab === "members" && <MembersView g={g} act={act} />}

      <nav className="rg-bottom-nav">
        {bottomTabs.map((id) => {
          const t = tabs.find((x) => x.id === id);
          const Icon = t.icon;
          return (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              <Icon size={19} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {newItemDay && <NewItemSheet onClose={onNewItemClose} onSave={(item) => onNewItemSave(newItemDay, item)} />}
    </div>
  );
}

function NewItemSheet({ onClose, onSave }) {
  const [f, setF] = useState({ title: "", time: "10:00", category: "Activities", estimate: "", note: "" });
  const [err, setErr] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  function submit() {
    if (!f.title.trim()) return setErr("Give the stop a name.");
    onSave(f);
  }
  return (
    <div className="rg-overlay" onClick={onClose}>
      <div className="rg-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rg-sheet-handle" />
        <h3 className="rg-sheet-title">Add to itinerary</h3>
        <div className="rg-field">
          <span className="rg-label">Name</span>
          <input className="rg-input" placeholder="e.g. Dudhsagar Falls" value={f.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="rg-row" style={{ gap: 8 }}>
          <div className="rg-field" style={{ flex: 1 }}>
            <span className="rg-label">Time</span>
            <input className="rg-input" type="time" value={f.time} onChange={(e) => set("time", e.target.value)} />
          </div>
          <div className="rg-field" style={{ flex: 1 }}>
            <span className="rg-label">Category</span>
            <input className="rg-input" value={f.category} onChange={(e) => set("category", e.target.value)} />
          </div>
        </div>
        <div className="rg-field">
          <span className="rg-label">Est. cost (₹)</span>
          <input className="rg-input" placeholder="e.g. 800" value={f.estimate} onChange={(e) => set("estimate", e.target.value)} />
        </div>
        <div className="rg-field">
          <span className="rg-label">Note</span>
          <input className="rg-input" placeholder="Optional note" value={f.note} onChange={(e) => set("note", e.target.value)} />
        </div>
        {err && <div className="rg-error" style={{ marginBottom: 10 }}>{err}</div>}
        <div className="rg-row" style={{ gap: 10 }}>
          <button className="rg-btn rg-btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="rg-btn rg-btn-primary" style={{ flex: 1 }} onClick={submit}>Add stop</button>
        </div>
      </div>
    </div>
  );
}