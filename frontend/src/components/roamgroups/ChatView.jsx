import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Smile, Paperclip, MapPin, Reply, Copy, Pencil, Trash2, Pin as PinIcon, PinOff, Vote, FileText, Eye,
} from "lucide-react";
import {
  parseMentions, detectLinks, timeOf, formatDate, initials, avatarStyle, isAdmin,
  pollOptionCount, pollTotalVotes, pollClosed, pollVoteByMember, pollWinningIds,
  placeNetVotes, placeStatusMeta, POLL_TYPES,
} from "./groupsEngine";
import { PollSheet, PlaceSheet, FileSheet } from "./PollSheets";
import { supabase } from "../../supabase";

const EMOJIS = ["👍", "❤️", "😆", "🙌", "👀", "😮", "🎉", "😂", "😍", "🔥", "🤔", "🙏", "😅", "🥳", "😴", "💪"];

function dayKey(iso) {
  return String(iso).slice(0, 10);
}

function MessageLink(text) {
  const links = detectLinks(text);
  const parts = [];
  let rest = text;
  let last = 0;
  links.forEach((l) => {
    const idx = text.indexOf(l, last);
    if (idx > -1) {
      parts.push(text.slice(last, idx));
      parts.push(<a key={idx} href={l} target="_blank" rel="noreferrer" style={{ color: "#34d399", textDecoration: "underline" }}>{l}</a>);
      last = idx + l.length;
    }
  });
  parts.push(text.slice(last));
  return parts;
}

function ChatPoll({ poll, self, onVote, isAdmin, onFinalize }) {
  const total = pollTotalVotes(poll);
  const closed = pollClosed(poll);
  const myVote = pollVoteByMember(poll, self.id);
  const winners = pollWinningIds(poll);
  return (
    <div style={{ width: "calc(100% + 24px)", margin: "-4px -12px", padding: "10px 12px 6px", boxSizing: "border-box", borderRadius: 12, background: "rgba(255,255,255,0.03)" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{POLL_TYPES[poll.kind]?.icon || "🗳️"}</span>
        <b style={{ fontSize: 13, lineHeight: 1.2, flex: 1, wordBreak: "break-word" }}>{poll.title}</b>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginBottom: 8 }}>
        {total} vote{total === 1 ? "" : "s"} · {closed ? "✅ closed" : "🔓 open"}
      </div>
      {(poll.options || []).slice(0, 4).map((o) => {
        const c = pollOptionCount(poll, o.id);
        const pct = total ? Math.round((c / total) * 100) : 0;
        const chosen = myVote && myVote.optionIds.includes(o.id);
        const isWinner = closed && winners.includes(o.id);
        return (
          <button key={o.id} onClick={(e) => { e.stopPropagation(); onVote(poll, o.id); }} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box",
            background: chosen ? "rgba(16,185,129,.22)" : "rgba(255,255,255,.05)",
            border: chosen ? "1px solid rgba(16,185,129,.5)" : "1px solid rgba(255,255,255,.1)",
            borderRadius: 8, padding: "7px 10px", marginBottom: 5, cursor: "pointer",
            color: "#eef4f0", fontSize: 12.5, textAlign: "left", transition: "background .2s",
          }}>
            {isWinner && <span>🏆</span>}
            <span style={{ flex: 1, fontWeight: chosen ? 700 : 400 }}>{o.label}</span>
            {(closed || total > 0) && <span style={{ color: "rgba(255,255,255,.5)", fontSize: 11 }}>{pct}%</span>}
          </button>
        );
      })}
      {isAdmin && !closed && (
        <button onClick={(e) => { e.stopPropagation(); onFinalize(poll); }} style={{
          marginTop: 4, width: "100%", background: "rgba(16,185,129,.18)",
          border: "1px solid rgba(16,185,129,.4)", borderRadius: 8, padding: "6px 10px",
          color: "#34d399", fontSize: 11.5, fontWeight: 700, cursor: "pointer", boxSizing: "border-box",
        }}>Finalize poll</button>
      )}
    </div>
  );
}

function ChatPlace({ place, self, onVote }) {
  const net = placeNetVotes(place);
  const meta = placeStatusMeta(place);
  const hasImg = place.images && place.images[0];
  return (
    <div style={{ width: "calc(100% + 24px)", margin: "-4px -12px", background: "rgba(255,255,255,0.03)", overflow: "hidden", borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
      {hasImg && <img src={place.images[0]} alt="" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: "10px 10px 0 0", display: "block" }} />}
      <div style={{ padding: hasImg ? "10px 12px" : "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>{place.emoji || "📍"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{place.name}</div>
            {place.location && <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {place.location}</div>}
          </div>
          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: meta.tone === "green" ? "rgba(16,185,129,.2)" : "rgba(255,255,255,.08)", color: meta.tone === "green" ? "#34d399" : "#a7b3ab", whiteSpace: "nowrap" }}>{meta.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <button onClick={(e) => { e.stopPropagation(); onVote(place, "up"); }} style={{
            display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "5px 10px",
            color: "#eef4f0", fontSize: 12, cursor: "pointer",
          }}>
            ❤️ {net > 0 ? `+${net}` : net}
          </button>
          {place.cost && <span style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>₹{place.cost}/person</span>}
        </div>
      </div>
    </div>
  );
}

// Load "deleted for me" message IDs from localStorage
function loadDeletedForMe(gid) {
  try { return new Set(JSON.parse(localStorage.getItem(`rg-deleted-me:${gid}`) || "[]")); } catch { return new Set(); }
}
function saveDeletedForMe(gid, set) {
  try { localStorage.setItem(`rg-deleted-me:${gid}`, JSON.stringify([...set])); } catch {}
}

export default function ChatView({ g, act }) {
  const [draft, setDraft] = useState("");
  const [topicId, setTopicId] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editId, setEditId] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [activeMsg, setActiveMsg] = useState(null);
  const [seenByMsg, setSeenByMsg] = useState(null); // message to show "seen by" for
  const [composerSheet, setComposerSheet] = useState(null);
  const [typing, setTyping] = useState(null); // "username is typing..."
  const [deletedForMe, setDeletedForMe] = useState(() => loadDeletedForMe(g?.id));
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);
  const typingChannel = useRef(null);
  const lastTypingSent = useRef(0);

  const members = g.members || [];
  const pinned = (g.messages || []).filter((m) => m.pinned);

  const messages = useMemo(() => {
    let list = (g.messages || []).filter((m) => !deletedForMe.has(m.id));
    if (topicId) list = list.filter((m) => m.topicId === topicId);
    return [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }, [g.messages, topicId, deletedForMe]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, replyTo, activeMsg]);

  // Real-time typing indicator via Supabase Broadcast
  useEffect(() => {
    if (!supabase || !g?.id || !g?.self?.id) return;
    const ch = supabase.channel(`rg-typing:${g.id}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload && payload.uid !== g.self.id) {
          setTyping(payload.username || payload.name || "Someone");
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTyping(null), 3000);
        }
      })
      .subscribe();
    typingChannel.current = ch;
    return () => {
      supabase.removeChannel(ch);
      typingChannel.current = null;
      clearTimeout(typingTimer.current);
    };
  }, [g?.id, g?.self?.id]);

  // Compute who has seen a message (members whose lastReadAt > message.createdAt)
  function seenBy(msg) {
    return members.filter(
      (mem) => mem.id !== msg.uid && mem.lastReadAt && new Date(mem.lastReadAt).getTime() > new Date(msg.createdAt).getTime()
    );
  }

  // Is this message "read" by at least one other member?
  function isRead(msg) {
    return seenBy(msg).length > 0;
  }

  function focusReply(m) {
    const senderMem = members.find((mem) => mem.id === m.uid);
    const senderName = senderMem?.username || senderMem?.name || m.name;
    setReplyTo({ id: m.id, name: senderName, text: (m.text || m.title || "").slice(0, 120), kind: m.kind });
    setEditId(null);
    taRef.current && taRef.current.focus();
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    act.sendMessage({ text, kind: "text", topicId: topicId || null, replyTo, mentions: parseMentions(text, members) });
    setDraft("");
    setReplyTo(null);
    setEmojiOpen(false);
  }

  function onComposerKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mentionOpen) return;
      if (editId) {
        act.editMessage(editId, draft.trim());
        setEditId(null);
        setDraft("");
        return;
      }
      send();
    }
  }

  function onDraftChange(v) {
    setDraft(v);
    maybeOpenMentions(v);
    // Send typing broadcast (max once every 2 seconds)
    if (v.trim() && typingChannel.current && Date.now() - lastTypingSent.current > 2000) {
      lastTypingSent.current = Date.now();
      typingChannel.current.send({
        type: "broadcast",
        event: "typing",
        payload: { uid: g.self.id, username: g.self.username || g.self.name },
      }).catch(() => {});
    }
  }

  function maybeOpenMentions(v) {
    const tail = v.replace(/(^|\s)@[A-Za-z0-9_.\-]*$/, "").length !== v.length;
    setMentionOpen(tail);
  }

  function deleteForMe(msgId) {
    const next = new Set(deletedForMe);
    next.add(msgId);
    setDeletedForMe(next);
    saveDeletedForMe(g.id, next);
  }

  async function onAttach(f) {
    if (!f) return;
    const kind = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "document";
    if (f.type.startsWith("image/") && f.size < 600 * 1024) {
      const reader = new FileReader();
      reader.onload = () => {
        act.sendMessage({ text: "", kind: "image", attachment: { name: f.name, dataUrl: reader.result, size: f.size }, topicId: topicId || null });
      };
      reader.readAsDataURL(f);
    } else {
      act.sendMessage({ text: "", kind, attachment: { name: f.name, dataUrl: null, size: f.size, type: f.type }, topicId: topicId || null });
      act.addFile({ kind, name: f.name, dataUrl: null, caption: f.name, folder: kind === "image" ? "photos" : kind === "video" ? "videos" : "documents" });
    }
    setEmojiOpen(false);
  }

  const isAdminSelf = isAdmin({ id: g.self.id, role: g.self.role }) || g.isAdmin;

  return (
    <div className="rg-chat">
      {/* Pinned + topics */}
      {pinned.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {pinned.slice(0, 3).map((m) => (
            <div className="rg-pin-banner" key={m.id} onClick={() => { setActiveMsg(m); }}>
              <span>{m.kind === "image" ? "🖼️" : "📌"}</span>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 12 }}>{m.username || m.name}</b>
                <span className="rg-hint" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text || m.attachment?.name || "Pinned"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rg-topic-row">
        <button className={`rg-chip ${!topicId ? "on" : ""}`} onClick={() => setTopicId("")}>💬 All</button>
        {(g.topics || []).map((t) => (
          <button key={t.id} className={`rg-chip ${topicId === t.id ? "on" : ""}`} onClick={() => setTopicId(t.id)}>{t.emoji} {t.name}</button>
        ))}
      </div>

      {/* Announcements banner */}
      {(g.announcements || []).filter((a) => a.pinned).slice(0, 1).map((a) => (
        <div className="rg-ann" key={a.id} style={{ padding: "9px 12px", marginBottom: 8 }}>
          <div className="rg-ann-head">📢 {a.title}</div>
          <div className="rg-ann-body" style={{ fontSize: 12.5, marginTop: 4 }}>{a.body}</div>
        </div>
      ))}

      {/* Messages */}
      <div className="rg-chat-scroll" ref={scrollRef}>
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDate = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const mine = m.uid === g.self.id;
          const read = mine ? isRead(m) : false;
          return (
            <div key={m.id}>
              {showDate && (
                <div className="rg-date-pill">
                  {dayKey(m.createdAt) === dayKey(new Date().toISOString()) ? "Today" : formatDate(dayKey(m.createdAt))} · {timeOf(m.createdAt)}
                </div>
              )}
              <MessageRow m={m} mine={mine} read={read} g={g} act={act} onOpen={setActiveMsg} onReply={focusReply}
                onSeenBy={() => setSeenByMsg(m)}
                poll={(g.polls || []).find((p) => p.id === m.pollId) || null}
                place={(g.places || []).find((p) => p.id === m.placeId) || null}
                renderPoll={(p) => <ChatPoll poll={p} self={g.self} isAdmin={isAdminSelf} onVote={act.votePoll} onFinalize={act.finalizePoll} />}
                renderPlace={(p) => <ChatPlace place={p} self={g.self} onVote={act.togglePlaceVote} />} />
            </div>
          );
        })}
        <div className="rg-typing">{typing ? `${typing} is typing…` : ""}</div>
      </div>

      {/* Reply / edit bar */}
      {(replyTo || editId) && (
        <div className="rg-card" style={{ margin: "8px 0", padding: "9px 12px" }}>
          <div className="rg-row" style={{ justifyContent: "space-between" }}>
            <span className="rg-hint" style={{ fontSize: 12 }}>{editId ? "Editing message" : `↩ Replying to ${(replyTo.username || replyTo.name)}`}</span>
            <button className="rg-btn rg-btn-sm rg-btn-ghost" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => { setReplyTo(null); setEditId(null); }}>✕</button>
          </div>
          {replyTo && <div className="rg-hint" style={{ fontSize: 12, color: "var(--accent,#e0a84e)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.text || replyTo.attachment?.name || "…"}</div>}
        </div>
      )}

      {/* Composer */}
      <div className="rg-composer">
        <div className="rg-composer-actions">
          <button className="rg-icon-btn" onClick={() => setEmojiOpen((v) => !v)}><Smile size={18} /></button>
          <button className="rg-icon-btn" onClick={() => fileRef.current && fileRef.current.click()}><Paperclip size={18} /></button>
          <button className="rg-icon-btn" onClick={() => setComposerSheet("poll")}><Vote size={18} /></button>
          <button className="rg-icon-btn" onClick={() => setComposerSheet("place")}><MapPin size={18} /></button>
          <input ref={fileRef} type="file" hidden accept="image/*,video/*,.pdf,.doc,.docx,.txt" onChange={(e) => onAttach(e.target.files && e.target.files[0])} />
        </div>
        <textarea
          ref={taRef}
          className="rg-composer-input"
          rows={1}
          placeholder={g.topic ? `Message ${g.topic.name}…` : "Type a message…  (@ to mention, Enter to send)"}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onComposerKey}
        />
        <button className="rg-send-btn" disabled={!draft.trim()} onClick={() => (editId ? (act.editMessage(editId, draft.trim()), setEditId(null), setDraft("")) : send())}><Send size={18} /></button>
      </div>

      {emojiOpen && (
        <div className="rg-card" style={{ marginTop: 8, padding: 10 }}>
          <div className="rg-emoji-grid">
            {EMOJIS.map((e) => (
              <button key={e} className="rg-emoji-cell" onClick={() => setDraft((d) => d + e)}>{e}</button>
            ))}
          </div>
        </div>
      )}

      {/* Mention suggestions */}
      {mentionOpen && draft && draft.includes("@") && (
        <div className="rg-card" style={{ marginTop: 8, padding: 8 }}>
          {members.filter((m) => m.status === "joined").map((m) => (
            <button key={m.id} className="rg-act rg-btn-sm" style={{ marginBottom: 4 }} onClick={() => {
              const before = draft.slice(0, draft.lastIndexOf("@"));
              setDraft(`${before}@${m.username || m.name} `);
              setMentionOpen(false);
            }}>@{m.username || m.name}</button>
          ))}
          <button className="rg-act rg-btn-sm" onClick={() => { const at = draft.lastIndexOf("@"); const before = draft.slice(0, at); setDraft(`${before}@everyone `); setMentionOpen(false); }}>@everyone</button>
        </div>
      )}

      {/* Seen by sheet */}
      {seenByMsg && (
        <div className="rg-overlay" onClick={() => setSeenByMsg(null)}>
          <div className="rg-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="rg-sheet-handle" />
            <b style={{ fontSize: 13, marginBottom: 10, display: "block" }}>👁️ Seen by</b>
            {seenBy(seenByMsg).length === 0 ? (
              <p className="rg-hint" style={{ margin: 0 }}>No one has seen this message yet</p>
            ) : (
              seenBy(seenByMsg).map((mem) => (
                <div key={mem.id} className="rg-list-row" style={{ border: "none", padding: "6px 0" }}>
                  <span className="rg-ava sm" style={avatarStyle(mem.id)}>{initials(mem.username || mem.name)}</span>
                  <span style={{ marginLeft: 8, fontSize: 13 }}>{mem.username || mem.name}</span>
                </div>
              ))
            )}
            <button className="rg-btn rg-btn-ghost rg-btn-block" style={{ marginTop: 12 }} onClick={() => setSeenByMsg(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Message actions */}
      {activeMsg && (
        <div className="rg-overlay" onClick={() => setActiveMsg(null)}>
          <div className="rg-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="rg-sheet-handle" />
            <div style={{ marginBottom: 10, overflow: "hidden", borderBottom: "1px solid var(--border,rgba(255,255,255,.08))", paddingBottom: 10 }}>
              <b style={{ fontSize: 13 }}>{(members.find((mem) => mem.id === activeMsg.uid)?.username || members.find((mem) => mem.id === activeMsg.uid)?.name) || activeMsg.name}</b>
              <p className="rg-hint" style={{ margin: 0 }}>{activeMsg.text || activeMsg.attachment?.name || ""}</p>
            </div>
            <div className="rg-quick-react">
              {["👍", "❤️", "😂", "🙌", "👀", "😮"].map((e) => {
                const has = (activeMsg.reactions?.[e] || []).includes(g.self.id);
                return (
                  <button key={e} className={`rg-reaction-pill ${has ? "on" : ""}`} onClick={() => { act.toggleReaction(activeMsg, e); setActiveMsg(null); }}>
                    {e} {(activeMsg.reactions?.[e] || []).length || ""}
                  </button>
                );
              })}
            </div>
            <div className="rg-actions">
              <button className="rg-act" onClick={() => { focusReply(activeMsg); setActiveMsg(null); }}><Reply size={16} /> Reply</button>
              {(activeMsg.text || "").trim() && <button className="rg-act" onClick={() => { try { navigator.clipboard.writeText(activeMsg.text); } catch {} setActiveMsg(null); }}><Copy size={16} /> Copy message</button>}
              {/* Show "Seen by" only for sender's own messages */}
              {activeMsg.uid === g.self.id && (
                <button className="rg-act" onClick={() => { setSeenByMsg(activeMsg); setActiveMsg(null); }}><Eye size={16} /> Seen by</button>
              )}
              {activeMsg.uid === g.self.id && <button className="rg-act" onClick={() => { setEditId(activeMsg.id); setDraft(activeMsg.text || ""); setActiveMsg(null); taRef.current && taRef.current.focus(); }}><Pencil size={16} /> Edit message</button>}
              {/* Delete for everyone — sender or admin only */}
              {(activeMsg.uid === g.self.id || isAdminSelf) && (
                <>
                  <button className="rg-act" style={{ color: "#f87171" }} onClick={() => { act.deleteMessage(activeMsg); setActiveMsg(null); }}>
                    <Trash2 size={16} /> Delete for everyone
                  </button>
                  <button className="rg-act" onClick={() => { act.togglePin(activeMsg); setActiveMsg(null); }}>
                    {activeMsg.pinned ? <><PinOff size={16} /> Unpin message</> : <><PinIcon size={16} /> Pin message</>}
                  </button>
                </>
              )}
              {/* Delete for me — available to everyone for any message */}
              <button className="rg-act" style={{ color: "#9ca3af" }} onClick={() => { deleteForMe(activeMsg.id); setActiveMsg(null); }}>
                <Trash2 size={16} /> Delete for me
              </button>
            </div>
            <button className="rg-btn rg-btn-ghost rg-btn-block" style={{ marginTop: 10 }} onClick={() => setActiveMsg(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Composer sheets */}
      {composerSheet === "poll" && <PollSheet self={g.self} canCreate={g.canCreatePolls} onClose={() => setComposerSheet(null)} onSave={(d) => { act.addPoll(d); setComposerSheet(null); }} />}
      {composerSheet === "place" && <PlaceSheet onClose={() => setComposerSheet(null)} onSave={(d) => { act.addPlace(d); setComposerSheet(null); }} />}
      {composerSheet === "file" && <FileSheet onClose={() => setComposerSheet(null)} onSave={(d) => { act.addFile(d); setComposerSheet(null); }} />}
    </div>
  );
}

function MessageRow({ m, mine, read, g, act, onOpen, onReply, onSeenBy, renderPoll, renderPlace, poll, place }) {
  // WhatsApp style ticks: ✓ = sent, ✓✓ grey = delivered, ✓✓ green = read
  const statusTick = mine ? (
    <span
      className="rg-tick"
      style={{ color: read ? "#34d399" : "rgba(255,255,255,0.5)", cursor: read ? "pointer" : "default" }}
      onClick={read ? onSeenBy : undefined}
      title={read ? "Tap to see who read this" : "Sent"}
    >
      {read ? "✓✓" : "✓"}
    </span>
  ) : null;
  const reactKeys = Object.entries(m.reactions || {}).filter(([, uids]) => uids.length);

  return (
    <div className={`rg-bubble-row ${mine ? "mine" : ""}`}>
      {!mine && <span className="rg-ava sm" style={avatarStyle(m.uid)}>{initials((g.members?.find((mem) => mem.id === m.uid)?.username || g.members?.find((mem) => mem.id === m.uid)?.name) || m.name)}</span>}
      <div style={{ maxWidth: "min(86%, 570px)", display: "flex", gap: 8, flexDirection: "column" }}>
        <div className={`rg-bubble ${mine ? "mine" : "other"}`} onClick={() => onOpen(m)}>
          {m.kind === "system" || m.kind === "expense" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <span style={{ fontSize: 15 }}>{m.reactions?.__icon || (m.kind === "expense" ? "💰" : "🛎️")}</span>
              <span>{m.text}</span>
            </div>
          ) : (
            <>
              {!mine && <div className="rg-msg-author">{(g.members?.find((mem) => mem.id === m.uid)?.username || g.members?.find((mem) => mem.id === m.uid)?.name) || m.name}</div>}
              {m.replyTo && (
                <div className="rg-reply-quote" onClick={(e) => { e.stopPropagation(); }}>
                  <div className="rg-rc">{(m.replyTo.username || m.replyTo.name)}</div>
                  <div>{m.replyTo.kind === "poll" ? "🗳️ poll" : m.replyTo.kind === "place" ? "📍 place" : m.replyTo.text}</div>
                </div>
              )}
              <Content m={m} renderPoll={renderPoll} renderPlace={renderPlace} poll={poll} place={place} />
              {m.topicId && <div className="rg-hint" style={{ fontSize: 10.5, marginTop: 3 }}>#{g.topics?.find((t) => t.id === m.topicId)?.name}</div>}
              {m.edited && <span className="rg-msg-edited rg-hint" style={{ fontSize: 10 }}>edited</span>}
              <div className="rg-msg-meta">
                <span>{timeOf(m.createdAt)}</span>
                {statusTick}
                {m.pinned && <span>📌</span>}
              </div>
            </>
          )}
        </div>
        {reactKeys.length > 0 && (
          <div className="rg-reactions">
            {reactKeys.map(([e, uids]) => (
              <button key={e} className={`rg-reaction-pill ${uids.includes(g.self.id) ? "on" : ""}`} onClick={() => act.toggleReaction(m, e)}>{e} {uids.length}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Content({ m, renderPoll, renderPlace, poll, place }) {
  if (m.kind === "image") {
    return (
      <div>
        {m.attachment?.dataUrl && <img src={m.attachment.dataUrl} alt="" style={{ maxWidth: 260, maxHeight: 220, borderRadius: 12, display: "block" }} />}
        {m.text && <div className="rg-msg-text" style={{ marginTop: m.attachment?.dataUrl ? 6 : 0 }}>{MessageLink(m.text)}</div>}
      </div>
    );
  }
  if (m.kind === "video") {
    return (
      <div>
        {m.attachment?.dataUrl ? (
          <video src={m.attachment.dataUrl} controls style={{ maxWidth: 260, maxHeight: 200, borderRadius: 12 }} />
        ) : (
          <div className="rg-list-row" style={{ margin: 0, border: "none", background: "rgba(255,255,255,.04)", padding: "8px 10px" }}>
            <span style={{ fontSize: 18 }}>🎬</span><span className="rg-hint">{m.attachment?.name || "Video"}</span>
          </div>
        )}
      </div>
    );
  }
  if (m.kind === "document") {
    return <div className="rg-list-row" style={{ margin: 0, border: "none", background: "rgba(255,255,255,.04)", padding: "8px 10px" }}><FileText size={18} /> <b style={{ fontSize: 12.5 }}>{m.attachment?.name}</b></div>;
  }
  if (m.kind === "link") {
    return <div className="rg-list-row" style={{ margin: 0, border: "none", background: "rgba(255,255,255,.04)", padding: "8px 10px" }}><span style={{ fontSize: 16 }}>🔗</span><a href={m.text} target="_blank" rel="noreferrer" style={{ color: "#34d399", fontSize: 13, wordBreak: "break-all" }}>{m.text}</a></div>;
  }
  if (m.kind === "place") return place ? renderPlace(place) : <div className="rg-msg-text">{m.text}</div>;
  if (m.kind === "poll") return poll ? renderPoll(poll) : <div className="rg-msg-text">{m.text}</div>;
  return <div className="rg-msg-text">{MessageLink(m.text)}</div>;
}