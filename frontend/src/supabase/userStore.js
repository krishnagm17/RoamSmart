// User profile + unique username reservation + avatar upload — SOVEREIGN Supabase.
// Firebase authenticates; these rows live in the public.users table (see
// supabase/schema.sql). Export names mirror the old Firestore store so consumers
// (AuthContext/AuthScreen/ProfileScreen/RoamSplit) just change the import path.
// When Supabase is not configured yet we fall back to localStorage per uid so the
// auth + profile flows still work end-to-end in mock mode.
import { supabase, SUPABASE_READY, nowIso } from "../supabase";
import { normalizeUsername } from "../firebase/authService";

export const FS_UNAVAILABLE = "Supabase is not configured yet. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in frontend/.env and apply supabase/schema.sql.";

export function fsReady() {
  return SUPABASE_READY && !!supabase;
}

export const userRef = (uid) => ({ firebaseUid: uid });
export const usernameRef = (lower) => ({ usernameLower: lower });

export const emptyProfile = {
  displayName: "",
  username: "",
  usernameLower: "",
  email: "",
  phone: "",
  bio: "",
  upi: "",
  preferredApp: "",
  avatarUrl: "",
  avatarPath: "",
  createdAt: null,
  updatedAt: null,
};

// ---------- local fallback plumbing ----------
const localKey = (uid) => `roam_profile_${uid}`;
function readLocal(uid) {
  try {
    const raw = localStorage.getItem(localKey(uid));
    return raw ? { ...emptyProfile, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}
function writeLocal(uid, patch) {
  const cur = readLocal(uid) || { ...emptyProfile, uid };
  const next = { ...cur, ...patch, uid, updatedAt: nowIso() };
  try {
    localStorage.setItem(localKey(uid), JSON.stringify(next));
  } catch (err) {
    console.error("profile local write failed:", err);
  }
  emitProfile(uid, next);
  return next;
}
const profileBus = new Map();
function emitProfile(uid, profile) {
  (profileBus.get(uid) || []).forEach((cb) => cb(profile));
}

// ---------- row <-> profile mapping (public.users) ----------
function rowToProfile(r, uid) {
  if (!r) return { ...emptyProfile, uid };
  const base = { ...emptyProfile };
  Object.keys(base).forEach((k) => delete base[k]);
  return {
    uid: r.firebaseUid || uid,
    displayName: r.displayName ?? "",
    username: r.username ?? "",
    usernameLower: r.usernameLower ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    bio: r.bio ?? "",
    upi: r.upiId ?? "",
    preferredApp: r.preferredPaymentApp ?? "",
    avatarUrl: r.avatarUrl ?? "",
    avatarPath: r.avatarPath ?? "",
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
function profileToRow(uid, p) {
  return {
    firebaseUid: uid,
    username: p.username ?? "",
    usernameLower: p.usernameLower ?? "",
    displayName: p.displayName ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    bio: p.bio ?? "",
    upiId: p.upi ?? "",
    preferredPaymentApp: p.preferredApp ?? "",
    avatarUrl: p.avatarUrl ?? "",
    updatedAt: nowIso(),
  };
}

export function listenUserProfile(uid, cb) {
  if (!uid) {
    cb(null);
    return () => {};
  }
  if (!fsReady()) {
    const initial = readLocal(uid) || { ...emptyProfile, uid };
    cb(initial);
    profileBus.set(uid, [...(profileBus.get(uid) || []), cb]);
    return () => {
      const arr = profileBus.get(uid) || [];
      profileBus.set(uid, arr.filter((f) => f !== cb));
      if (!profileBus.get(uid)?.length) profileBus.delete(uid);
    };
  }

  let alive = true;
  let channel = null;
  let unsub = () => {};
  const fetch = async () => {
    if (!alive) return;
    const { data, error } = await supabase.from("users").select("*").eq("firebaseUid", uid).maybeSingle();
    if (!alive) return;
    if (error) {
      console.warn("profile load failed:", error?.message || error);
      cb({ ...emptyProfile, uid });
      return;
    }
    cb(rowToProfile(data, uid));
  };

  (async () => {
    await fetch();
    if (!alive) return;
    try {
      channel = supabase
        .channel(`users:${uid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "users", filter: `"firebaseUid"=eq.'${uid}'` }, fetch)
        .subscribe();
      unsub = () => {
        if (channel) supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn("profile realtime skip:", err?.message || err);
    }
  })();

  return () => {
    alive = false;
    unsub();
  };
}

export async function usernameAvailable(lower) {
  if (!fsReady()) return { ok: true, error: FS_UNAVAILABLE, mock: true };
  const { data, error } = await supabase.from("users").select("firebaseUid").eq("usernameLower", lower).maybeSingle();
  if (error) return { ok: true, error: null };
  return { ok: !data, error: data ? "That username is taken." : null };
}

// Atomically-ish reserve a username + create the profile row.
export async function createUserProfile(uid, { displayName, username, email, phone = "" }) {
  if (!fsReady()) {
    const lower = normalizeUsername(username);
    writeLocal(uid, { displayName, username, usernameLower: lower, email, phone, createdAt: nowIso() });
    return;
  }
  const lower = normalizeUsername(username);
  const row = profileToRow(uid, { displayName, username, usernameLower: lower, email, phone });
  row.createdAt = nowIso();
  const { error } = await supabase
    .from("users")
    .upsert(row, { onConflict: "firebaseUid" });
  if (error?.code === "23505") throw new Error("That username is taken.");
  if (error) throw error;
}

// Claim a new username on the existing profile.
export async function claimUsername(uid, currentLower, newUsername) {
  if (!fsReady()) {
    const lower = normalizeUsername(newUsername);
    const cur = readLocal(uid) || {};
    writeLocal(uid, { username: newUsername, usernameLower: lower, ...(cur.createdAt ? {} : { createdAt: nowIso() }) });
    return;
  }
  const lower = normalizeUsername(newUsername);
  const { data, error: dupErr } = await supabase.from("users").select("firebaseUid").eq("usernameLower", lower).maybeSingle();
  if (dupErr) throw dupErr;
  if (data && data.firebaseUid !== uid) throw new Error("That username is taken.");
  const { error } = await supabase
    .from("users")
    .update({ username: newUsername, usernameLower: lower, updatedAt: nowIso() })
    .eq("firebaseUid", uid);
  if (error?.code === "23505") throw new Error("That username is taken.");
  if (error) throw error;
}

// Map the app-facing profile fields to the public.users column names.
// Callers pass camelCase ("upi", "preferredApp"); the DB stores "upiId" /
// "preferredPaymentApp" (see supabase/schema.sql). Without this the UPDATE
// silently failed and UPI IDs never reached Supabase.
export function mapProfilePatchToRow(patch = {}) {
  const row = {};
  if (patch.displayName != null) row.displayName = patch.displayName;
  if (patch.username != null) row.username = patch.username;
  if (patch.usernameLower != null) row.usernameLower = patch.usernameLower;
  if (patch.email != null) row.email = patch.email;
  if (patch.phone != null) row.phone = patch.phone;
  if (patch.bio != null) row.bio = patch.bio;
  if (patch.upi != null) row.upiId = patch.upi;
  if (patch.preferredApp != null) row.preferredPaymentApp = patch.preferredApp;
  if (patch.avatarUrl != null) row.avatarUrl = patch.avatarUrl;
  return row;
}

export async function updateUserProfile(uid, patch) {
  if (!fsReady()) {
    writeLocal(uid, patch);
    return true;
  }
  const row = mapProfilePatchToRow(patch);
  const { error } = await supabase.from("users").update({ ...row, updatedAt: nowIso() }).eq("firebaseUid", uid);
  if (error) {
    console.warn("profile update failed:", error?.message || error);
    return false;
  }
  // Keep every group membership's denormalized fields current so your crew
  // (and the group member list) always sees your latest UPI ID + name.
  if (row.upiId != null || row.displayName != null || row.preferredPaymentApp != null) {
    const sync = {};
    if (row.upiId != null) sync.upi = row.upiId;
    if (row.displayName != null) sync.name = row.displayName;
    try {
      const { error: gmErr } = await supabase.from("groupMembers").update(sync).eq("firebaseUid", uid);
      if (gmErr) console.warn("groupMembers profile sync failed:", gmErr?.message || gmErr);
    } catch (err) {
      console.warn("groupMembers profile sync error:", err?.message || err);
    }
  }
  return true;
}

const AVATAR_EXT = ["jpg", "jpeg", "png", "webp", "gif"];

export async function uploadAvatar(uid, file) {
  const ext = (file?.name?.split(".").pop() || "jpg").toLowerCase();
  const path = `avatars/${uid}/avatar.${ext}`;
  if (!fsReady()) {
    const url = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
    writeLocal(uid, { avatarUrl: url, avatarPath: "" });
    return url || null;
  }
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  await updateUserProfile(uid, { avatarUrl: data.publicUrl });
  return data.publicUrl;
}

export async function removeAvatar(uid) {
  if (!fsReady()) {
    writeLocal(uid, { avatarUrl: "", avatarPath: "" });
    return;
  }
  for (const ext of AVATAR_EXT) {
    const { error } = await supabase.storage.from("avatars").remove([`avatars/${uid}/avatar.${ext}`]);
    if (!error) break;
  }
  await updateUserProfile(uid, { avatarUrl: "", avatarPath: "" });
}

export function notificationRefs(uid) {
  return { all: (nid) => ({ firebaseUid: uid, id: nid }) };
}

// Search registered RoamSmart users by name, username, email or phone.
// Returns an array of lightweight user objects compatible with memberFromUser().
export async function searchUsers(query, excludeUids = []) {
  const q = String(query || "").trim();
  if (!q || q.length < 2) return [];

  if (!fsReady()) {
    // In local mode, we have no user directory — return empty.
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select("firebaseUid, displayName, username, email, phone, avatarUrl, upiId")
      .or(`displayName.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(10);

    if (error) {
      console.warn("User search failed:", error?.message || error);
      return [];
    }

    return (data || [])
      .filter((u) => !excludeUids.includes(u.firebaseUid))
      .map((u) => ({
        uid: u.firebaseUid,
        name: u.displayName || u.username || "User",
        username: u.username || "",
        email: u.email || "",
        phone: u.phone || "",
        avatar: u.avatarUrl || null,
        upi: u.upiId || "",
        kind: "real",
      }));
  } catch (err) {
    console.warn("User search error:", err?.message || err);
    return [];
  }
}