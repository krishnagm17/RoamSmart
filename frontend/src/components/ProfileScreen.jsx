import { useRef, useState, useEffect } from "react";
import { Camera, LogOut, Mail, User as UserIcon, AtSign, Phone, RefreshCw, ShieldCheck, Save, Trash2, MessageCircle, Copy, Check, ExternalLink } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { usernameProblems, normalizeUsername, resendVerification } from "../firebase/authService";
import { usernameAvailable, uploadAvatar, removeAvatar } from "../supabase/userStore";
import { validateUpi } from "./roamsplit/splitEngine";
import { saveProfile as saveLocalProfile } from "./roamsplit/roomStorage";
import api from "../api.js";
import "./ProfileScreen.css";

const APP_OPTIONS = ["Google Pay", "PhonePe", "Paytm", "Other UPI App"];

export default function ProfileScreen({ showToast }) {
  const auth = useAuth();
  const fileRef = useRef(null);
  const profile = auth.profile || {};
  const user = auth.user;

  // Editable fields (kept so the local form feels live)
  const [displayName, setDisplayName] = useState(profile.displayName || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [upi, setUpi] = useState(profile.upi || "");
  const [preferredApp, setPreferredApp] = useState(profile.preferredApp || "Google Pay");
  const [username, setUsername] = useState(profile.username || "");
  const [usernameCheck, setUsernameCheck] = useState(null); // { status: "checking"|"available"|"taken", text: "" }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ tone: "", text: "" });

  // Telegram connect state
  const [tgLink, setTgLink] = useState("");
  const [tgStatus, setTgStatus] = useState(() => {
    try {
      const u = auth.user;
      if (u?.uid) {
        const cached = localStorage.getItem(`roam_tg_${u.uid}`);
        if (cached) return JSON.parse(cached);
      }
    } catch {}
    return { connected: false };
  });
  const [tgBusy, setTgBusy] = useState(false);
  const [tgCopied, setTgCopied] = useState(false);

  const flash = (tone, text) => {
    setMsg({ tone, text });
    setTimeout(() => setMsg({ tone: "", text: "" }), 3000);
  };

  // Sync loaded profile into input fields on mount / refresh
  useEffect(() => {
    if (auth.profile) {
      if (auth.profile.displayName) setDisplayName(auth.profile.displayName);
      if (auth.profile.username) setUsername(auth.profile.username);
      if (auth.profile.bio) setBio(auth.profile.bio);
      if (auth.profile.phone) setPhone(auth.profile.phone);
      if (auth.profile.upi) setUpi(auth.profile.upi);
      if (auth.profile.preferredApp) setPreferredApp(auth.profile.preferredApp);
    } else if (user?.displayName && !displayName) {
      setDisplayName(user.displayName);
    }
  }, [auth.profile, user]);

  useEffect(() => {
    if (!username || username === profile.username) {
      setUsernameCheck(null);
      return;
    }
    
    const norm = normalizeUsername(username);
    const problem = usernameProblems(norm);
    if (problem) {
      setUsernameCheck({ status: "taken", text: problem });
      return;
    }

    setUsernameCheck({ status: "checking", text: "Checking..." });
    const timer = setTimeout(async () => {
      try {
        const { ok, error } = await usernameAvailable(norm);
        if (ok) {
          setUsernameCheck({ status: "available", text: `@${norm} is available` });
        } else {
          setUsernameCheck({ status: "taken", text: error || "That username is taken." });
        }
      } catch (err) {
        setUsernameCheck({ status: "taken", text: "Could not check availability." });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, profile.username]);

  async function saveProfile(e) {
    e.preventDefault();
    if (upi && !validateUpi(upi)) return flash("err", "That doesn't look like a valid UPI ID (e.g. krishna@upi).");
    setBusy(true);
    try {
      if (auth.needsProfile) {
        await auth.completeProfile({
          displayName: displayName.trim() || "Traveller",
          username: username.trim() || `user_${Math.random().toString(36).slice(2,8)}`
        });
      }

      const patch = {
        displayName: displayName.trim() || "Traveller",
        bio: bio.trim(),
        phone: phone.trim(),
        upi: upi.trim(),
        preferredApp,
      };
      await auth.updateProfile(patch);
      saveLocalProfile({ displayName: patch.displayName, upi: patch.upi, preferredApp });
      flash("ok", "Profile saved — synced to your account.");
    } catch (err) {
      flash("err", err?.message || "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveUsername() {
    const norm = normalizeUsername(username);
    const problem = usernameProblems(norm);
    if (problem) return flash("err", problem);
    if (norm === profile.usernameLower) return;
    setBusy(true);
    try {
      await auth.changeUsername(norm);
      flash("ok", `You're now @${norm}`);
    } catch (err) {
      flash("err", err?.message || "That username is taken.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfileInfo(e) {
    e.preventDefault();
    setBusy(true);
    try {
      let created = false;
      const norm = normalizeUsername(username);
      
      if (auth.needsProfile && norm) {
        const problem = usernameProblems(norm);
        if (problem) {
          flash("err", problem);
          setBusy(false);
          return;
        }
        await auth.completeProfile({
          displayName: displayName.trim() || "Traveller",
          username: norm
        });
        created = true;
      }

      const patch = {
        displayName: displayName.trim() || "Traveller",
        bio: bio.trim(),
        phone: phone.trim(),
      };
      if (norm) {
        patch.username = username.trim();
        patch.usernameLower = norm;
      }
      await auth.updateProfile(patch); 

      if (!created && username.trim() && norm !== profile.usernameLower) {
        const problem = usernameProblems(norm);
        if (problem) {
          flash("err", problem);
          setBusy(false);
          return;
        }
        await auth.changeUsername(norm);
      }

      saveLocalProfile({ displayName: patch.displayName });
      flash("ok", "Profile saved — synced to your account.");
    } catch (err) {
      flash("err", err?.message || "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return flash("err", "Avatar must be under 4MB.");
    setBusy(true);
    try {
      await uploadAvatar(user.uid, file);
      flash("ok", "Avatar updated.");
    } catch (err) {
      flash("err", "Avatar upload failed. Check Firebase Storage is enabled.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAvatar() {
    setBusy(true);
    try {
      await removeAvatar(user.uid);
      flash("ok", "Avatar removed.");
    } catch (err) {
      flash("err", "Could not remove avatar.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    try {
      await resendVerification();
      flash("ok", "Verification email sent — check your inbox.");
    } catch (err) {
      flash("err", err?.message || "Could not resend. Try again later.");
    }
  }

  const verified = !!user?.emailVerified;
  const email = user?.email || profile.email || "";

  async function refreshTgStatus() {
    if (!user?.uid) return;
    try {
      const res = await api.get(`/api/telegram/status/${user.uid}`);
      if (res.data) {
        setTgStatus(res.data);
        if (res.data.connected) {
          setTgLink("");
          try {
            localStorage.setItem(`roam_tg_${user.uid}`, JSON.stringify(res.data));
          } catch {}
        } else {
          try {
            const cached = localStorage.getItem(`roam_tg_${user.uid}`);
            if (cached && JSON.parse(cached)?.connected) {
              localStorage.removeItem(`roam_tg_${user.uid}`);
            }
          } catch {}
        }
      }
    } catch {
      try {
        const cached = localStorage.getItem(`roam_tg_${user.uid}`);
        if (cached) setTgStatus(JSON.parse(cached));
      } catch {}
    }
  }

  // Check Telegram status on mount & whenever user loads
  useEffect(() => {
    if (!user?.uid) return;
    try {
      const cached = localStorage.getItem(`roam_tg_${user.uid}`);
      if (cached) setTgStatus(JSON.parse(cached));
    } catch {}
    refreshTgStatus();
  }, [user?.uid]);

  // When connect link is displayed, poll until user taps Start in Telegram
  useEffect(() => {
    if (!tgLink || !user?.uid) return;
    const timer = setInterval(() => {
      refreshTgStatus();
    }, 3000);
    return () => clearInterval(timer);
  }, [tgLink, user?.uid]);

  async function connectTelegram() {
    if (!user) return;
    setTgBusy(true);
    try {
      const res = await api.post("/api/telegram/connect", { userId: user.uid });
      if (res.data.link) setTgLink(res.data.link);
      refreshTgStatus();
    } catch (err) {
      flash("err", "Could not create a Telegram link. Try again.");
    } finally {
      setTgBusy(false);
    }
  }

  async function disconnectTelegram() {
    if (!user) return;
    setTgBusy(true);
    try {
      await api.post("/api/telegram/disconnect", { userId: user.uid });
      setTgLink("");
      setTgStatus({ connected: false });
      try {
        localStorage.removeItem(`roam_tg_${user.uid}`);
      } catch {}
      flash("ok", "Telegram disconnected.");
    } catch {
      flash("err", "Could not disconnect.");
    } finally {
      setTgBusy(false);
    }
  }

  async function testTelegramAlert() {
    if (!user) return;
    setTgBusy(true);
    try {
      await api.post("/api/telegram/test-alert", { userId: user.uid });
      flash("ok", "Test alert sent! Check your Telegram.");
    } catch {
      flash("err", "Could not send test alert.");
    } finally {
      setTgBusy(false);
    }
  }

  function copyTgLink() {
    if (!tgLink) return;
    navigator.clipboard?.writeText(tgLink);
    setTgCopied(true);
    setTimeout(() => setTgCopied(false), 2000);
  }

  return (
    <div className="profile-wrap">
      <div className="rg-kicker">Account</div>
      <h1 className="rg-title" style={{ marginBottom: 4 }}>Your profile</h1>
      <p className="rg-sub">Handle, payment details and how your crew finds you.</p>

      {msg.text && <div className={`profile-flash ${msg.tone}`}>{msg.text}</div>}

      <div className="profile-grid">
        <div className="profile-card">
          <div className="profile-card-head">
            {profile.avatarUrl
              ? <img className="profile-avatar" src={profile.avatarUrl} alt="" />
              : <div className="profile-avatar profile-avatar-fallback">{(displayName || email || "?").slice(0, 1).toUpperCase()}</div>}
            <div style={{ flex: 1 }}>
              <div className="profile-name">{profile.displayName || displayName || "Traveller"}</div>
              <div className="profile-handle">@{profile.username || "set-a-handle"}</div>
              <div className="profile-email">
                <Mail size={13} /> {email}
                {verified
                  ? <span className="profile-verified"><ShieldCheck size={12} /> Verified</span>
                  : <button className="profile-resend" onClick={verify}><RefreshCw size={12} /> Verify email</button>}
              </div>
            </div>
            <div>
              <button className="profile-icon-btn" onClick={() => fileRef.current?.click()} title="Upload avatar" disabled={busy}><Camera size={16} /></button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              {profile.avatarUrl && (
                <button className="profile-icon-btn danger" onClick={clearAvatar} title="Remove avatar" disabled={busy}><Trash2 size={15} /></button>
              )}
            </div>
          </div>

          <div className="profile-sec-title">Who you are</div>
          <div className="profile-field">
            <label className="auth-label">Display name</label>
            <div className="profile-input-icon"><UserIcon size={15} /><input className="auth-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
          </div>
          <div className="profile-field">
            <label className="auth-label">Username</label>
            <div className="profile-input-icon"><AtSign size={15} /><input className="auth-input" value={username} onChange={(e) => setUsername(e.target.value)} onBlur={saveUsername} placeholder="enter your handle" /></div>
            
            {usernameCheck ? (
              <div style={{ fontSize: 13, marginTop: 4, color: usernameCheck.status === 'available' ? '#10b981' : usernameCheck.status === 'checking' ? '#a1a1aa' : '#ef4444' }}>
                {usernameCheck.text}
              </div>
            ) : (
              <div className="auth-hint">Your permanent handle. Changing it here releases the old one.</div>
            )}
          </div>
          <div className="profile-field">
            <label className="auth-label">Phone (for SMS alerts)</label>
            <div className="profile-input-icon"><Phone size={15} /><input className="auth-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91XXXXXXXXXX" /></div>
          </div>
          <div className="profile-field">
            <label className="auth-label">Bio</label>
            <textarea className="auth-input" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A line about how you travel" style={{ resize: "vertical" }} />
          </div>

          <button className="auth-btn primary" style={{ marginTop: 8 }} onClick={saveProfileInfo} disabled={busy}>
            <Save size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>

        <div className="profile-card">
          <div className="profile-sec-title">Payment profile</div>
          <p className="rg-sub" style={{ fontSize: 12.5 }}>
            Used when your crew settles up with you in RoamSplit. Only the UPI ID is stored — never your PIN, OTP or bank password.
          </p>
          <div className="profile-field">
            <label className="auth-label">UPI ID</label>
            <input className="auth-input" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="e.g. priya@upi" inputMode="email" />
          </div>
          <div className="profile-field">
            <label className="auth-label">Preferred UPI app</label>
            <select className="auth-input" value={preferredApp} onChange={(e) => setPreferredApp(e.target.value)}>
              {APP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="profile-safe">
            <ShieldCheck size={16} />
            <span>Your UPI PIN, banking password, OTP and cards are never requested or stored by RoamSmart.</span>
          </div>

          <button className="auth-btn primary" style={{ marginTop: 16 }} onClick={saveProfile} disabled={busy}>
            <Save size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Save profile
          </button>
        </div>
      </div>

      <div className="profile-card" style={{ marginTop: 16 }}>
        <div className="profile-sec-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageCircle size={15} /> Telegram alerts
        </div>
        <p className="rg-sub" style={{ fontSize: 12.5 }}>
          Receive official hazard warnings and travel-condition alerts instantly on Telegram.
        </p>

        {tgStatus.connected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: "#1e8e3e", fontSize: 13, fontWeight: 600 }}>
              ✅ Connected {tgStatus.username ? `(@${tgStatus.username})` : ''} — alerts will arrive on your chat.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="auth-btn secondary" onClick={testTelegramAlert} disabled={tgBusy} style={{ width: "auto", padding: "8px 14px", background: "var(--primary)", color: "white", border: "none" }}>
                Test Alert
              </button>
              <button className="auth-btn ghost" onClick={disconnectTelegram} disabled={tgBusy} style={{ width: "auto", padding: "8px 14px" }}>
                Disconnect
              </button>
            </div>
          </div>
        ) : tgLink ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              Open this link in Telegram and press <b>Start</b> to connect securely.
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <code style={{ flex: 1, fontSize: 11.5, wordBreak: "break-all", background: "rgba(0,0,0,0.05)", padding: "8px 10px", borderRadius: 8 }}>{tgLink}</code>
              <button className="profile-icon-btn" onClick={copyTgLink} title="Copy link">{tgCopied ? <Check size={15} /> : <Copy size={15} />}</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a className="auth-btn primary" href={tgLink} target="_blank" rel="noopener noreferrer" style={{ width: "auto", padding: "8px 14px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                Open in Telegram <ExternalLink size={13} />
              </a>
              <button className="auth-btn ghost" onClick={() => setTgLink("")} style={{ width: "auto", padding: "8px 14px" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="auth-btn primary" onClick={connectTelegram} disabled={tgBusy} style={{ marginTop: 4 }}>
            <MessageCircle size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {tgBusy ? "Creating link…" : "Connect Telegram"}
          </button>
        )}
        {tgStatus.botUsername && !tgStatus.connected && (
          <div className="auth-hint" style={{ marginTop: 8 }}>Bot: @{tgStatus.botUsername}</div>
        )}
      </div>

      <div className="profile-card profile-danger">
        <div style={{ flex: 1 }}>
          <b>Sign out</b>
          <div className="auth-hint">You'll need to sign back in to plan, split and manage groups.</div>
        </div>
        <button className="auth-btn ghost" onClick={() => auth.signOut()} style={{ width: "auto", padding: "10px 18px", color: "var(--danger)" }}>
          <LogOut size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Sign out
        </button>
      </div>
    </div>
  );
}