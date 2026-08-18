import { useState } from "react";
import { UserPlus, ShieldCheck, X, Crown } from "lucide-react";
import { initials, avatarStyle, memberRole, timeAgo } from "./groupsEngine";
import { onlineFor } from "./groupsStorage";
import { InviteSheet } from "./Sheets";

export default function MembersView({ g, act }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const members = [...(g.members || [])].sort((a, b) => (memberRole(a) === "admin" && memberRole(b) !== "admin" ? -1 : 1));

  return (
    <div>
      <div className="rg-section" style={{ marginTop: 4 }}>
        <div>
          <h2>Members</h2>
          <p className="rg-sub" style={{ marginTop: 2 }}>{members.filter((m) => m.status === "joined").length} members</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="rg-btn rg-btn-sm rg-btn-primary" onClick={() => setInviteOpen(true)}><UserPlus size={16} /> Invite</button>
        </div>
      </div>

      {members.map((m) => {
        const online = onlineFor(m);
        const role = memberRole(m);
        return (
          <div className="rg-list-row" key={m.id}>
            <span className={`rg-ava ${m.avatar ? "" : ""}`} style={m.avatar ? { backgroundImage: `url(${m.avatar})`, backgroundSize: "cover" } : avatarStyle(m.name)}>
              {!m.avatar && initials(m.name)}
              <span className={`rg-dot ${online ? "on" : "off"}`} />
            </span>
            <div className="rg-list-body">
              <div className="rg-list-name">
                {m.name}{m.id === g.self.id && " (you)"}
                {role === "admin" && <span className="rg-admin-badge"><Crown size={9} /> admin</span>}
              </div>
              <div className="rg-list-sub">
                @{m.username || m.name.toLowerCase().replace(/\s+/g, ".")}
                {m.email && ` · ${m.email}`}
                {m.phone && ` · ${m.phone}`}
                {m.status === "pending" ? " · invited, pending" : online ? ` · online` : ` · offline`}
              </div>
            </div>
            {role !== "admin" && (
              <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={() => act.promoteMember(m)}><ShieldCheck size={13} /> Make admin</button>
            )}
            {m.id === g.self.id && !g.isAdmin && (
              <button className="rg-btn rg-btn-sm rg-btn-danger" onClick={() => act.leaveGroup()}><X size={13} /> Leave</button>
            )}
            {g.isAdmin && m.id !== g.self.id && (
              <button className="rg-icon-btn" style={{ width: 32, height: 32 }} onClick={() => act.removeMember(m)}><X size={14} /></button>
            )}
          </div>
        );
      })}

      <div className="rg-divider" />
      <div className="rg-section"><h2>Activity</h2></div>
      {(g.activity || []).slice(0, 12).map((a) => (
        <div className="rg-act-row" key={a.id}>
          <span className="rg-act-ic">{a.icon || "•"}</span>
          <div style={{ flex: 1 }}>
            <p><b>{a.name}</b> {a.text}</p>
            <time>{timeAgo(a.createdAt)}</time>
          </div>
        </div>
      ))}
      {(g.activity || []).length === 0 && <p className="rg-hint">Group activity will appear here.</p>}

      {inviteOpen && (
        <InviteSheet group={g.group} members={g.members} self={g.self}
          onAddMember={(m) => { act.addMember(m); }}
          onClose={() => setInviteOpen(false)}
          onInvite={() => {}}
          onRevoke={() => act.revokeInvites()} />
      )}
    </div>
  );
}