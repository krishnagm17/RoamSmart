import { useState } from "react";
import { Pencil, Trash2, ArrowRight, X } from "lucide-react";
import { CATEGORY_EMOJI, inr, formatDate, computeShares, expenseStatusFor } from "./splitEngine";
import { canEditExpense } from "./roomStorage";

export default function ExpenseDetailSheet({
  expense, travellers, selfUid, settlements,
  onEdit, onDelete, onSettleWith, onClose,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const shares = computeShares(expense);
  const payers = expense.payers || [];
  const paidTotal = payers.reduce((s, p) => s + Number(p.amount || 0), 0);
  const participants = (expense.participants || []).map((id) => travellers.find((t) => t.id === id) || { id, name: "Unknown" });
  const allowEdit = canEditExpense(expense, selfUid);

  const myShare = shares[selfUid] || 0;

  return (
    <div className="rs-overlay" onClick={onClose}>
      <div className="rs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rs-sheet-handle" />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="rs-exp-ic" style={{ fontSize: 24 }}>{CATEGORY_EMOJI[expense.category] || "🧾"}</span>
          <div>
            <h3 className="rs-sheet-title" style={{ margin: 0 }}>{expense.title || "Untitled expense"}</h3>
            <div className="rs-muted" style={{ fontSize: 13 }}>{expense.category}</div>
          </div>
        </div>

        <div className="rs-detail-block" style={{ margin: "16px 0" }}>
          <div className="rs-hero-label">Total amount</div>
          <div className="rs-hero-amount" style={{ marginTop: 4 }}>{inr(paidTotal)}</div>
          <div className="rs-muted" style={{ fontSize: 13 }}>
            {formatDate(expense.spentDate)} · {participants.length} people
            {expense.destination && <span className="rs-exp-tag" style={{ marginLeft: 6, background: "rgba(224,168,78,.15)", color: "#e0a84e" }}>{expense.destination}</span>}
          </div>
        </div>

        <div className="rs-divider" />

        <div className="rs-section" style={{ marginTop: 0 }}>
          <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: .5 }}>Paid by</h2>
        </div>
        {payers.map((p) => (
          <div key={p.uid} className="rs-person" style={{ padding: "10px 12px" }}>
            <span className={`rs-ava ${p.uid === selfUid ? "" : "alt"}`}>{p.name.slice(0, 1).toUpperCase()}</span>
            <div className="rs-person-body">
              <div className="rs-person-name">{p.name}{p.uid === selfUid && " (you)"}</div>
            </div>
            <span className="rs-person-amt pos">{inr(p.amount)}</span>
          </div>
        ))}

        <div className="rs-section">
          <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: .5 }}>Split between</h2>
        </div>
        {participants.map((t) => {
          const share = shares[t.id] || 0;
          const st = expenseStatusFor(expense, t.id, settlements);
          const tag =
            st.share <= 0.005 ? "rs-tag-paid"
            : (expense.payers || []).some((p) => p.uid === t.id)
              ? "rs-tag-paid"
              : "rs-tag-pending";
          const tagText =
            st.share <= 0.005 ? "settled"
            : (expense.payers || []).some((p) => p.uid === t.id) ? "paid by them"
            : st.pendingOpen > 0 ? `paying ${inr(st.pendingOpen)}`
            : "not paid";
          return (
            <div key={t.id} className="rs-person" style={{ padding: "10px 12px" }}>
              <span className={`rs-ava ${t.id === selfUid ? "" : "alt"}`}>{t.name.slice(0, 1).toUpperCase()}</span>
              <div className="rs-person-body">
                <div className="rs-person-name">{t.name}{t.id === selfUid && " (you)"}</div>
                <div className="rs-person-sub">Share {inr(share)}</div>
              </div>
              <span className="rs-exp-tag" style={{ alignSelf: "center" }}>
                <span className={`rs-exp-tag ${tag}`}>{tagText}</span>
              </span>
            </div>
          );
        })}

        {expense.description && (
          <>
            <div className="rs-divider" />
            <div className="rs-section" style={{ marginTop: 0 }}>
              <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: .5 }}>Note</h2>
            </div>
            <p className="rs-muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{expense.description}</p>
          </>
        )}

        {expense.receipt && (
          <>
            <div className="rs-divider" />
            <div className="rs-section" style={{ marginTop: 0 }}>
              <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: .5 }}>Receipt</h2>
            </div>
            <div className="rs-receipt-preview">
              <img src={expense.receipt.dataUrl} alt="Receipt" />
            </div>
          </>
        )}

        <div className="rs-divider" />

        {/* Own-share settlement shortcut */}
        {myShare > 0.005 && expense.paidBy && expense.paidBy.uid && expense.paidBy.uid !== selfUid && (
          <button className="rs-btn rs-btn-primary" style={{ width: "100%" }}
            type="button" onClick={() => onSettleWith(expense.paidBy)}>
            Settle with {expense.paidBy.name} <ArrowRight size={15} />
          </button>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {allowEdit && (
            <button className="rs-btn rs-btn-ghost" style={{ flex: 1 }} type="button" onClick={onEdit}>
              <Pencil size={15} /> Edit
            </button>
          )}
          {allowEdit && !confirmDelete ? (
            <button className="rs-btn rs-btn-danger" style={{ flex: 1, width: "auto", padding: "14px" }}
              type="button" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} />
            </button>
          ) : null}
          {confirmDelete && (
            <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
              <span className="rs-hint" style={{ margin: 0 }}>Delete?</span>
              <button className="rs-btn rs-btn-danger" style={{ flex: 1 }} type="button" onClick={onDelete}>Yes</button>
              <button className="rs-btn rs-btn-ghost" style={{ flex: 1 }} type="button" onClick={() => setConfirmDelete(false)}>No</button>
            </div>
          )}
          <button className="rs-btn rs-btn-ghost" style={{ flex: 1 }} type="button" onClick={onClose}><X size={15} /> Close</button>
        </div>
      </div>
    </div>
  );
}