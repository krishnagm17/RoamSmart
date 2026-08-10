function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export default function NotificationsView({ notifications, onMarkAllRead, onClear }) {
  const unread = notifications.some((n) => !n.read);

  if (!notifications.length) {
    return (
      <div className="rs-empty">
        <div style={{ fontSize: 34 }}>🔔</div>
        <b>Nothing here yet</b>
        <p>Expense and settlement activity for your split will show up here.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        {unread && (
          <button className="rs-btn rs-btn-ghost" style={{ width: "auto", padding: "9px 14px", fontSize: 13 }}
            type="button" onClick={onMarkAllRead}>
            Mark all read
          </button>
        )}
        <button className="rs-btn rs-btn-danger" style={{ width: "auto", padding: "9px 14px", fontSize: 13 }}
          type="button" onClick={onClear}>
          Clear
        </button>
      </div>
      {notifications.map((n) => (
        <div key={n.id} className={`rs-notif ${n.read ? "rs-notif-read" : "unread"}`}>
          <span className="rs-notif-dot" />
          <div style={{ flex: 1 }}>
            <p>{n.message}</p>
            <time>{n.trip}{n.trip ? " · " : ""}{timeAgo(n.createdAt)}</time>
          </div>
        </div>
      ))}
    </div>
  );
}