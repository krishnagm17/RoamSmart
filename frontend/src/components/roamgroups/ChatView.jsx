import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Smile, Paperclip, MapPin, Reply, Copy, Pencil, Trash2, Pin as PinIcon, PinOff, Vote, FileText,
} from "lucide-react";
import {
  parseMentions, detectLinks, timeOf, formatDate, initials, avatarStyle, isAdmin,
  pollOptionCount, pollTotalVotes, pollClosed, pollVoteByMember, pollWinningIds,
  placeNetVotes, placeStatusMeta, POLL_TYPES,
} from "./groupsEngine";
import { PollSheet, PlaceSheet, FileSheet } from "./PollSheets";

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
    <div className="rg-poll-card" style={{ borderColor: "rgba(16,185,129,.35)", background: "rgba(16,185,129,.06)" }}>
      <div className="rg-poll-title" style={{ fontSize: 13.5 }}>{POLL_TYPES[poll.kind]?.icon} {poll.title}</div>
      <div className="rg-poll-meta">{total} vote{total === 1 ? "" : "s"} · {closed ? "closed" : "open"}</div>
      {(poll.options || []).slice(0, 5).map((o) => {
        const c = pollOptionCount(poll, o.id);
        const pct = total ? Math.round((c / total) * 100) : 0;
        const chosen = myVote && myVote.optionIds.includes(o.id);
        return (
          <button key={o.id} className={`rg-option ${chosen ? "checked" : ""}`} onClick={() => onVote(poll, o.id)}>
            <span className="rg-opt-fill" style={{ width: closed ? `${pct}%` : "0%" }} />
            <span className="rg-opt-label">{closed && winners.includes(o.id) ? "🏆 " : ""}{o.label}</span>
            {(closed || total > 0) && <span className="rg-opt-count">{c} · {pct}%</span>}
          </button>
        );
      })}
      {isAdmin && !closed && <button className="rg-btn rg-btn-sm rg-btn-primary" style={{ marginTop: 9, width: "auto" }} onClick={() => onFinalize(poll)}>Finalize · {winners.length ? winners.map((w) => (poll.options || []).find((o) => o.id === w)?.label).join(", ") : "winner"}</button>}
    </div>
  );
}

function ChatPlace({ place, self, onVote }) {
  const net = placeNetVotes(place);
  const meta = placeStatusMeta(place);
  return (
    <div className="rg-card" style={{ overflow: "hidden", padding: 0 }}>
      {place.images && place.images[0] ? <img src={place.images[0]} alt="" style={{ width: "100%", height: 110, objectFit: "cover" }} /> : <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{place.emoji}</div>}
      <div style={{ padding: 10 }}>
        <div className="rg-row" style={{ justifyContent: "space-between" }}>
          <b style={{ fontSize: 13.5 }}>{place.name}</b>
          <span className={`rg-status-pill rg-st-${meta.tone}`}>{meta.label}</span>
        </div>
        {place.location && <div className="rg-hint" style={{ marginTop: 2 }}>📍 {place.location}</div>}
        <div className="rg-row" style={{ gap: 8, marginTop: 8 }}>
          <button className={`rg-vote-btn ${place.upvotes.includes(self.id) ? "on up" : ""}`} style={{ padding: "5px 9px", fontSize: 12 }} onClick={() => onVote(place, "up")}>❤️ {net}</button>
          {place.cost && <span className="rg-hint">₹{place.cost}/person</span>}
        </div>
      </div>
    </div>
  );
}

export default function ChatView({ g, act }) {
  const [draft, setDraft] = useState("");
  const [topicId, setTopicId] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editId, setEditId] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [activeMsg, setActiveMsg] = useState(null);
  const [composerSheet, setComposerSheet] = useState(null); // 'poll' | 'place' | 'file'
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  const members = g.members || [];
  const pinned = (g.messages || []).filter((m) => m.pinned);
  const messages = useMemo(() => {
    let list = g.messages || [];
    if (topicId) list = list.filter((m) => m.topicId === topicId);
    return [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }, [g.messages, topicId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, replyTo, activeMsg]);

  // Simulated typing indicator for other members after the user types (demo realism).
  const [typing, setTyping] = useState(null);
  const typingTimer = useRef(null);
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  function focusReply(m) {
    setReplyTo({ id: m.id, name: m.name, text: (m.text || m.title || "").slice(0, 120), kind: m.kind });
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
    if (typingTimer.current) clearTimeout(typingTimer.current);
    const others = members.filter((m) => m.id !== g.self.id && m.status === "joined");
    if (others.length) {
      const pick = others[Math.floor(Math.random() * others.length)];
      setTyping(pick.name);
      typingTimer.current = setTimeout(() => setTyping(null), 2200);
    }
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

  function maybeOpenMentions(v) {
    const tail = v.replace(/(^|\s)@[A-Za-z0-9_.\-]*$/, "").length !== v.length;
    setMentionOpen(tail);
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
                <b style={{ fontSize: 12 }}>{m.name}</b>
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
          return (
            <div key={m.id}>
              {showDate && (
                <div className="rg-date-pill">
                  {dayKey(m.createdAt) === dayKey(new Date().toISOString()) ? "Today" : formatDate(dayKey(m.createdAt))} · {timeOf(m.createdAt)}
                </div>
              )}
              <MessageRow m={m} mine={mine} g={g} act={act} onOpen={setActiveMsg} onReply={focusReply}
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
            <span className="rg-hint" style={{ fontSize: 12 }}>{editId ? "Editing message" : `↩ Replying to ${replyTo.name}`}</span>
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
          onChange={(e) => { setDraft(e.target.value); maybeOpenMentions(e.target.value); }}
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
              const at = draft.lastIndexOf("@") + 1;
              const before = draft.slice(0, draft.lastIndexOf("@"));
              setDraft(`${before}@${m.username || m.name} `);
              setMentionOpen(false);
            }}>@{m.username || m.name}</button>
          ))}
          <button className="rg-act rg-btn-sm" onClick={() => { const at = draft.lastIndexOf("@"); const before = draft.slice(0, at); setDraft(`${before}@everyone `); setMentionOpen(false); }}>@everyone</button>
        </div>
      )}

      {/* Message actions */}
      {activeMsg && (
        <div className="rg-overlay" onClick={() => setActiveMsg(null)}>
          <div className="rg-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="rg-sheet-handle" />
            <div style={{ marginBottom: 10, overflow: "hidden", borderBottom: "1px solid var(--border,rgba(255,255,255,.08))", paddingBottom: 10 }}>
              <b style={{ fontSize: 13 }}>{activeMsg.name}</b>
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
              {activeMsg.uid === g.self.id && <button className="rg-act" onClick={() => { setEditId(activeMsg.id); setDraft(activeMsg.text || ""); setActiveMsg(null); taRef.current && taRef.current.focus(); }}><Pencil size={16} /> Edit message</button>}
              {(activeMsg.uid === g.self.id || isAdminSelf) && (
                <>
                  <button className="rg-act" onClick={() => { act.deleteMessage(activeMsg); setActiveMsg(null); }}><Trash2 size={16} /> Delete message</button>
                  <button className="rg-act" onClick={() => { act.togglePin(activeMsg); setActiveMsg(null); }}>
                    {activeMsg.pinned ? <><PinOff size={16} /> Unpin message</> : <><PinIcon size={16} /> Pin message</>}
                  </button>
                </>
              )}
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

function MessageRow({ m, mine, g, act, onOpen, onReply, renderPoll, renderPlace, poll, place }) {
  const statusTick = mine ? (
    <span className="rg-tick">{m.status === "read" ? "✓✓" : m.status === "delivered" ? "✓✓" : "✓"}</span>
  ) : null;
  const reactKeys = Object.entries(m.reactions || {}).filter(([, uids]) => uids.length);

  return (
    <div className={`rg-bubble-row ${mine ? "mine" : ""}`}>
      {!mine && <span className="rg-ava sm" style={avatarStyle(m.uid)}>{initials(m.name)}</span>}
      <div style={{ maxWidth: "min(86%, 570px)", display: "flex", gap: 8, flexDirection: "column" }}>
        <div className={`rg-bubble ${mine ? "mine" : "other"}`} onClick={() => onOpen(m)}>
          {m.kind === "system" || m.kind === "expense" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <span style={{ fontSize: 15 }}>{m.reactions?.__icon || (m.kind === "expense" ? "💰" : "🛎️")}</span>
              <span>{m.text}</span>
            </div>
          ) : (
            <>
              {!mine && <div className="rg-msg-author">{m.name}</div>}
              {m.replyTo && (
                <div className="rg-reply-quote" onClick={(e) => { e.stopPropagation(); }}>
                  <div className="rg-rc">{m.replyTo.name}</div>
                  <div>{m.replyTo.kind === "poll" ? "🗳️ poll" : m.replyTo.kind === "place" ? "📍 place" : m.replyTo.text}</div>
                </div>
              )}
              <Content m={m} renderPoll={renderPoll} renderPlace={renderPlace} poll={poll} place={place} />
              {m.topicId && <div className="rg-hint" style={{ fontSize: 10.5, marginTop: 3 }}>#{g.topics?.find((t) => t.id === m.topicId)?.name}</div>}
              {m.edited && <span className="rg-msg-edited rg-hint" style={{ fontSize: 10 }}> edited</span>}
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