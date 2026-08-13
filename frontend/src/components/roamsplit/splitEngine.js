// RoamSplit — pure expense-splitting + settlement logic.
// No React here; everything is deterministic and unit-testable.

export const SPLIT_METHODS = ["equal", "custom", "percentage", "shares"];

export const CATEGORIES = [
  "Hotel", "Food", "Transportation", "Flights", "Train", "Bus",
  "Tickets", "Activities", "Shopping", "Fuel", "Parking", "Other"
];

export const CATEGORY_EMOJI = {
  Hotel: "🏨", Food: "🍜", Transportation: "🚕", Flights: "✈️", Train: "🚆",
  Bus: "🚌", Tickets: "🎟️", Activities: "🎯", Shopping: "🛍️", Fuel: "⛽",
  Parking: "🅿️", Other: "🧾"
};

export const SETTLEMENT_STATUS = [
  "pending", "initiated", "paid", "failed", "cancelled", "disputed"
];

// Destination names for a trip (single or multi). Pure — no storage access.
export function tripDestinations(trip) {
  if (!trip) return [];
  const f = trip.formData || {};
  const list = Array.isArray(f.destinations) && f.destinations.length
    ? f.destinations
    : (Array.isArray(trip.destinations) && trip.destinations.length ? trip.destinations : null);

  if (list) {
    return list
      .map((d) => String(d?.name || "").split(",")[0].trim())
      .filter(Boolean);
  }
  if (f.destination) return [String(f.destination).split(",")[0].trim()];
  if (trip.destination) return [String(trip.destination).split(",")[0].trim()];
  return [];
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const RE_INR = new RegExp('^(\\d{1,3})(?=(\\d{2})+(\\d{3})$)');

// Indian number formatting (lakh / crore style) with ₹ prefix.
export function inr(value) {
  const n = Number(value) || 0;
  const sign = n < 0 ? "−" : "";
  let str = String(Math.round(Math.abs(n)));
  str = str.replace(RE_INR, "$1,").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}₹${str}`;
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function daysAgo(iso) {
  if (!iso) return 9999;
  return Math.floor((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 86400000);
}

export function uid(prefix = "u") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`;
}

export function validateUpi(upi) {
  if (!upi) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,}[@][a-zA-Z]{2,40}$/.test(upi.trim());
}

export function validateAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 100_000_000;
}

// Given an expense, produce { uid: shareAmount }. Share logic lives here.
export function computeShares(expense) {
  const { amount, split } = expense;
  const parts = split?.parts || [];
  const totalValue =
    split?.method === "percentage" ? round2((parts.reduce((s, p) => s + Number(p.value || 0), 0)) / 100) :
    split?.method === "shares" ? (parts.reduce((s, p) => s + Number(p.value || 0), 0) || 1) : 1;

  return parts.reduce((acc, p) => {
    let share;
    switch (split?.method) {
      case "custom":
        share = Number(p.value || 0);
        break;
      case "percentage":
        share = round2(amount * (Number(p.value || 0) / 100));
        break;
      case "shares":
        share = round2(amount * (Number(p.value || 0) / totalValue));
        break;
      case "equal":
      default:
        share = round2(amount / (parts.length || 1));
        break;
    }
    acc[p.uid] = share;
    return acc;
  }, {});
}

// Validate a split. Returns { error } or null.
export function splitError(expense) {
  const amount = Number(expense.amount);
  if (!validateAmount(expense.amount)) return "Enter a valid amount greater than 0.";

  const method = expense.split?.method;
  const parts = expense.split?.parts || [];
  if (parts.length === 0) return "Select at least one participant.";
  if (parts.some((p) => !p.uid)) return "Participants are invalid.";

  if (method === "custom") {
    const total = round2(parts.reduce((s, p) => s + Number(p.value || 0), 0));
    if (parts.some((p) => Number(p.value) < 0 || !Number.isFinite(Number(p.value))))
      return "Custom amounts must be positive numbers.";
    if (Math.abs(total - amount) > 0.01)
      return `Custom amounts add up to ${inr(total)}, but the expense is ${inr(amount)}.`;
  } else if (method === "percentage") {
    const total = round2(parts.reduce((s, p) => s + Number(p.value || 0), 0));
    if (parts.some((p) => Number(p.value) < 0)) return "Percentages must be positive.";
    if (Math.abs(total - 100) > 0.01) return `Percentages add up to ${total}%, but must total 100%.`;
  } else if (method === "shares") {
    if (parts.some((p) => Number(p.value) < 1 || !Number.isInteger(Number(p.value))))
      return "Shares must be whole numbers of 1 or more.";
  }

  // Multiple payers must add up to the expense amount.
  const payers = expense.payers || [];
  if (payers.length > 0) {
    const paidTotal = round2(payers.reduce((s, p) => s + Number(p.amount || 0), 0));
    if (payers.some((p) => Number(p.amount) <= 0)) return "Every payer contribution must be more than 0.";
    if (Math.abs(paidTotal - amount) > 0.01)
      return `Paid amounts add up to ${inr(paidTotal)}, but the total is ${inr(amount)}.`;
  }

  return null;
}

// Balances: paid - owed, after applying settled receipts.
// users: [{ id, name, upi }]
export function computeBalances(expenses, settlements, users) {
  const paid = {}, owed = {}, settleIn = {}, settleOut = {};
  users.forEach((u) => {
    paid[u.id] = 0; owed[u.id] = 0; settleIn[u.id] = 0; settleOut[u.id] = 0;
  });

  expenses.forEach((e) => {
    (e.payers || []).forEach((p) => { paid[p.uid] = round2((paid[p.uid] || 0) + Number(p.amount || 0)); });
    const shares = computeShares(e);
    Object.entries(shares).forEach(([uid, amt]) => { owed[uid] = round2((owed[uid] || 0) + amt); });
  });

  (settlements || []).forEach((s) => {
    if (s.status === "paid") {
      settleOut[s.fromUid] = round2((settleOut[s.fromUid] || 0) + Number(s.amount || 0));
      settleIn[s.toUid] = round2((settleIn[s.toUid] || 0) + Number(s.amount || 0));
    }
  });

  const result = {};
  users.forEach((u) => {
    const id = u.id;
    result[id] = {
      id,
      paid: round2(paid[id] || 0),
      owed: round2(owed[id] || 0),
      received: round2((paid[id] || 0) + (settleIn[id] || 0)),
      sent: round2((owed[id] || 0) + (settleOut[id] || 0)),
      net: round2((paid[id] || 0) - (owed[id] || 0) - (settleIn[id] || 0) + (settleOut[id] || 0)),
      settledIn: round2(settleIn[id] || 0),
      settledOut: round2(settleOut[id] || 0),
    };
  });
  return result;
}

// Settlements already in flight (pending / initiated) between pairs.
function openEdges(settlements) {
  const key = (a, b) => `${a}->${b}`;
  const map = {};
  (settlements || []).forEach((s) => {
    if (s.status === "pending" || s.status === "initiated") {
      map[key(s.fromUid, s.toUid)] = s;
    }
  });
  return map;
}

// Greedy debt-simplification: minimize the number of transfers.
export function suggestSettlements(balances, settlements) {
  const edges = openEdges(settlements);
  const creditors = Object.values(balances).filter((b) => b.net > 0.01).sort((a, b) => b.net - a.net);
  const debtors = Object.values(balances).filter((b) => b.net < -0.01).sort((a, b) => a.net - b.net);

  const suggestions = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(-debtor.net, creditor.net));
    if (amount > 0.01 && !edges[`${debtor.id}->${creditor.id}`]) {
      suggestions.push({ fromUid: debtor.id, toUid: creditor.id, amount });
    }
    if (Math.abs(debtor.net + amount) <= 0.01) i++;
    else debtor.net += amount;
    if (Math.abs(creditor.net - amount) <= 0.01) j++;
    else creditor.net -= amount;
  }
  return suggestions;
}

// Per-expense settlement info: for a user, which share is covered.
export function expenseStatusFor(expense, uid, settlements) {
  const share = computeShares(expense)[uid] || 0;
  const covered = (settlements || [])
    .filter((s) => s.status === "paid" && s.fromUid === uid && s.toUid === expense.paidById)
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  const pendingOpen = (settlements || [])
    .filter((s) => (s.status === "pending" || s.status === "initiated") && s.fromUid === uid && s.toUid === expense.paidById)
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  return { share: round2(share), covered: round2(covered), pendingOpen: round2(pendingOpen) };
}

export function computeSummary(expenses, settlements, users) {
  const balances = computeBalances(expenses, settlements, users);
  const total = round2(expenses.reduce((s, e) => s + Number(e.amount || 0), 0));
  const category = {};
  const byTraveler = {};
  const daily = {};
  const byDestination = {};
  users.forEach((u) => { byTraveler[u.id] = { name: u.name, total: 0, count: 0 }; });

  expenses.forEach((e) => {
    category[e.category || "Other"] = round2((category[e.category || "Other"] || 0) + Number(e.amount || 0));
    const d = e.spentDate || "unknown";
    daily[d] = round2((daily[d] || 0) + Number(e.amount || 0));
    const dest = e.destination || "Unknown";
    byDestination[dest] = round2((byDestination[dest] || 0) + Number(e.amount || 0));
    (e.payers || []).forEach((p) => {
      if (byTraveler[p.uid]) byTraveler[p.uid].total = round2((byTraveler[p.uid].total || 0) + Number(p.amount || 0));
      byTraveler[p.uid].count = (byTraveler[p.uid].count || 0) + 1;
    });
  });

  const settled = round2((settlements || []).filter((s) => s.status === "paid").reduce((s, x) => s + Number(x.amount || 0), 0));
  const pending = round2((settlements || []).filter((s) => s.status === "pending" || s.status === "initiated").reduce((s, x) => s + Number(x.amount || 0), 0));

  return {
    total,
    settled,
    pending,
    expenseCount: expenses.length,
    avgPerPerson: users.length ? round2(total / users.length) : 0,
    category: Object.entries(category).sort((a, b) => b[1] - a[1]),
    byTraveler: Object.entries(byTraveler).map(([id, v]) => ({ id, ...v })),
    daily: Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0])),
    byDestination: Object.entries(byDestination).sort((a, b) => b[1] - a[1]),
    balances,
  };
}

// Downscale + compress an image file into a JPEG data URL for receipt storage.
export function compressToDataUrl(file, maxDim = 1100, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please pick an image file for the receipt."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file does not look like a valid image."));
      img.onload = () => {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (err) {
          reject(new Error("Could not compress the image. Try a smaller file."));
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}