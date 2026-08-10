import { useMemo, useState } from "react";
import { FileText, Film, Link2, Trash2, Upload } from "lucide-react";
import { timeAgo } from "./groupsEngine";
import { FileSheet } from "./PollSheets";

const FOLDERS = [
  { id: "all", label: "All" },
  { id: "photos", label: "Photos" },
  { id: "videos", label: "Videos" },
  { id: "documents", label: "Documents" },
  { id: "links", label: "Links" },
];

export default function FilesView({ g, act }) {
  const [folder, setFolder] = useState("all");
  const [showSheet, setShowSheet] = useState(false);
  const [openIdx, setOpenIdx] = useState(null);
  const files = folder === "all" ? g.files : g.files.filter((f) => f.folder === folder);
  const counts = useMemo(() => {
    const c = { photos: 0, videos: 0, documents: 0, links: 0 };
    g.files.forEach((f) => { if (c[f.folder] != null) c[f.folder] += 1; });
    return c;
  }, [g.files]);

  return (
    <div>
      <div className="rg-section" style={{ marginTop: 4 }}>
        <h2>Shared files &amp; media</h2>
        <button className="rg-btn rg-btn-sm rg-btn-primary" onClick={() => setShowSheet(true)}><Upload size={14} /> Share</button>
      </div>
      <div className="rg-folder-tabs">
        {FOLDERS.map((f) => (
          <button key={f.id} className={`rg-chip ${folder === f.id ? "on" : ""}`} onClick={() => setFolder(f.id)}>
            {f.label}{counts[f.id] ? ` · ${counts[f.id]}` : ""}
          </button>
        ))}
      </div>

      {files.length === 0 && (
        <div className="rg-empty"><b>Nothing here yet</b><p>Share tickets, hotel confirmations, maps and documents so everyone has them.</p></div>
      )}

      {folder === "links" ? (
        files.map((f) => (
          <a key={f.id} className="rg-link-row" href={f.name} target="_blank" rel="noreferrer">
            <span className="rg-act-ic"><Link2 size={16} /></span>
            <div className="rg-list-body">
              <div className="rg-list-name">{f.caption}</div>
              <div className="rg-list-sub">{f.name} · {f.name} · by {f.name2}</div>
            </div>
          </a>
        ))
      ) : (
        <div className="rg-file-grid">
          {files.map((f, i) => (
            <div key={f.id} className="rg-file-tile" onClick={() => setOpenIdx(i)}>
              {f.kind === "image" && f.dataUrl ? <img src={f.dataUrl} alt={f.name} /> : (
                <span className="rg-file-ic">
                  {f.kind === "video" ? <Film size={26} /> : f.kind === "document" ? <FileText size={26} /> : <FileText size={26} />}
                  <span style={{ fontSize: 9 }}>{f.name.slice(-18)}</span>
                </span>
              )}
              {(f.uid === g.self.id || g.isAdmin) && (
                <button className="rg-file-x" onClick={(e) => { e.stopPropagation(); act.deleteFile(f); }} aria-label="Delete" style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 8, border: "none", background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {openIdx != null && files[openIdx] && (
        <div className="rg-overlay rg-center" onClick={() => setOpenIdx(null)}>
          <div className="rg-card" style={{ maxWidth: 520, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div className="rg-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <b>{files[openIdx].name}</b>
              <button className="rg-btn rg-btn-sm rg-btn-ghost" onClick={() => setOpenIdx(null)}>Close</button>
            </div>
            {files[openIdx].kind === "image" && files[openIdx].dataUrl ? (
              <img src={files[openIdx].dataUrl} alt="" style={{ width: "100%", borderRadius: 12 }} />
            ) : (
              <a className="rg-btn rg-btn-primary rg-btn-block" href={files[openIdx].name} target="_blank" rel="noreferrer">Open file / link</a>
            )}
            <p className="rg-hint" style={{ marginTop: 8 }}>{files[openIdx].caption} · shared {timeAgo(files[openIdx].createdAt)}</p>
          </div>
        </div>
      )}

      {showSheet && <FileSheet onClose={() => setShowSheet(false)} onSave={(d) => { act.addFile(d); setShowSheet(false); }} />}
    </div>
  );
}