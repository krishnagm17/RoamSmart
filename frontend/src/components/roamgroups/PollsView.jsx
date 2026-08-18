import { useMemo, useState } from "react";
import { Check, Trash2, Clock, Vote } from "lucide-react";
import { POLL_TYPES, pollOptionCount, pollTotalVotes, pollClosed, pollVoteByMember, pollWinningIds, timeAgo } from "./groupsEngine";
import { PollSheet } from "./PollSheets";

function PollCard({ poll, self, isAdmin, onVote, onFinalize, onDelete }) {
  const total = pollTotalVotes(poll);
  const closed = pollClosed(poll);
  const myVote = pollVoteByMember(poll, self.id);
  const winners = pollWinningIds(poll);
  const anonymous = poll.anonymous;
  const kind = POLL_TYPES[poll.kind] || POLL_TYPES.general;

  return (
    <div className="rg-poll-card">
      <div className="rg-poll-head">
        <span style={{ fontSize: 22 }}>{kind.icon}</span>
        <div style={{ flex: 1 }}>
          <div className="rg-poll-title">{poll.title}</div>
          <div className="rg-poll-meta">
            {kind.label} · {total} vote{total === 1 ? "" : "s"} · by {(g.members?.find(m=>m.id===poll.createdBy)?.username || g.members?.find(m=>m.id===poll.createdBy)?.name || poll.name)} · {timeAgo(poll.createdAt)}
            {closed && <span className="rg-st-pill rg-st-ok" style={{ marginLeft: 6 }}>closed</span>}
          </div>
        </div>
      </div>

      {(poll.options || []).map((o) => {
        const c = pollOptionCount(poll, o.id);
        const pct = total ? Math.round((c / total) * 100) : 0;
        const isWinner = closed && winners.includes(o.id);
        const chosen = myVote && myVote.optionIds.includes(o.id);
        return (
          <button key={o.id} className={`rg-option ${chosen ? "checked" : ""}`} onClick={() => onVote(poll, o.id)}>
            <span className="rg-opt-fill" style={{ width: closed ? `${pct}%` : chosen ? `${pct}%` : "0%" }} />
            <span className="rg-opt-label">{isWinner ? "🏆 " : ""}{o.label}{anonymous && !closed ? " 🙈" : ""}</span>
            {(closed || total > 0) && <span className="rg-opt-count">{c} · {pct}%</span>}
          </button>
        );
      })}

      <div className="rg-poll-foot">
        {closed ? (
          <span className="rg-hint">{winners.length ? `${anonymous ? "Winner settled" : "Winning option"}: ${winners.map((w) => (poll.options || []).find((o) => o.id === w)?.label).join(", ")}` : "No votes"}</span>
        ) : myVote ? (
          <span className="rg-hint">{anonymous ? "Vote recorded 🙈" : `You voted · ${myVote.optionIds.map((id) => (poll.options || []).find((o) => o.id === id)?.label).join(", ")}`}</span>
        ) : (
          <span className="rg-hint">Tap an option to vote</span>
        )}
        {poll.deadline && !closed && <span className="rg-hint" style={{ marginLeft: "auto" }}><Clock size={11} /> ends {timeAgo(poll.deadline)}</span>}
        {isAdmin && (
          <>
            <button className="rg-btn rg-btn-sm rg-btn-ghost" style={{ marginLeft: "auto" }} onClick={() => onDelete(poll)}><Trash2 size={13} /> Delete</button>
            {!closed && <button className="rg-btn rg-btn-sm rg-btn-primary" onClick={() => onFinalize(poll)}><Check size={13} /> Finalize</button>}
          </>
        )}
      </div>
    </div>
  );
}

export default function PollsView({ g, act }) {
  const [showSheet, setShowSheet] = useState(false);
  const open = g.polls.filter((p) => !pollClosed(p));
  const closed = g.polls.filter((p) => pollClosed(p));

  return (
    <div>
      <div className="rg-section" style={{ marginTop: 4 }}>
        <h2>Polls and decisions</h2>
        <button className="rg-btn rg-btn-sm rg-btn-primary" disabled={!g.canCreatePolls} onClick={() => setShowSheet(true)}><Vote size={14} /> New poll</button>
      </div>
      {!g.canCreatePolls && <p className="rg-hint" style={{ marginBottom: 10 }}>Polls are admin-only in this group.</p>}

      {g.polls.length === 0 && (
        <div className="rg-empty"><b>No polls yet</b><p>Create a poll for the next group decision — destination, activity, hotel, budget and more.</p></div>
      )}
      {open.map((p) => <PollCard key={p.id} poll={p} self={g.self} isAdmin={g.isAdmin} onVote={act.votePoll} onFinalize={act.finalizePoll} onDelete={act.deletePoll} />)}
      {closed.length > 0 && (
        <>
          <div className="rg-section"><h2>Closed</h2></div>
          {closed.map((p) => <PollCard key={p.id} poll={p} self={g.self} isAdmin={g.isAdmin} onVote={act.votePoll} onFinalize={act.finalizePoll} onDelete={act.deletePoll} />)}
        </>
      )}

      {showSheet && <PollSheet self={g.self} canCreate={g.canCreatePolls} onClose={() => setShowSheet(false)} onSave={(d) => { act.addPoll(d); setShowSheet(false); }} />}
    </div>
  );
}