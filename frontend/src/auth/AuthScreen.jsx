import { useState } from "react";
import { Mail, Lock } from "lucide-react";
import { useAuth } from "./AuthContext";
import { usernameProblems, normalizeUsername } from "../firebase/authService";
import { usernameAvailable } from "../supabase/userStore";
import "./AuthScreen.css";

function LogoMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeOpacity="0.45" />
      <path d="M5.5 16.5 L9.5 10.5 L12 13.5 L14.5 9.5 L18.5 16.5" />
      <circle cx="16.1" cy="6.6" r="1.4" fill="#ffd700" stroke="none" />
    </svg>
  );
}

const inputWrap = (icon) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  position: "relative",
});

export default function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const authError = (e) => auth.mapAuthError(e);
  const reset = () => { setError(""); setInfo(""); };

  async function submit(e) {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      if (mode === "login") {
        await auth.signIn(email, password);
      } else if (mode === "signup") {
        await auth.signUp({ email, password });
      } else {
        await auth.resetPassword(email);
        setInfo("Password reset link sent. Check your inbox.");
      }
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    reset();
    setBusy(true);
    try {
      await auth.signInWithGoogle();
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  if (auth.needsVerification) {
    return <VerifyEmailScreen auth={auth} />;
  }

  if (auth.isFirebaseMock || !auth.firebaseReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card auth-mock">
          <div className="auth-mock-icon">🔐</div>
          <h2>Sign in is almost ready</h2>
          <p>
            RoamSmart uses Firebase for your account. Add your credentials to
            <br /><code>frontend/.env</code> to unlock sign in:
          </p>
          <div style={{ textAlign: "left", margin: "0 auto 18px", maxWidth: 320 }}>
            {[
              "VITE_FIREBASE_API_KEY",
              "VITE_FIREBASE_AUTH_DOMAIN",
              "VITE_FIREBASE_PROJECT_ID",
              "VITE_FIREBASE_STORAGE_BUCKET",
              "VITE_FIREBASE_MESSAGING_SENDER_ID",
              "VITE_FIREBASE_APP_ID",
            ].map((k) => (
              <div key={k} style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-secondary)", padding: "3px 0" }}>
                <span style={{ color: "var(--accent)" }}>{k}</span>=your_value
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, opacity: 0.8 }}>
            Once configured, refresh and you&apos;re in. No passwords, UPI PINs or card details are ever stored
            on your device.
          </p>
        </div>
      </div>
    );
  }

  if (auth.needsProfile) {
    return <CompleteProfile auth={auth} />;
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="logo-icon-wrapper"><LogoMark size={16} /></div>
          RoamSmart
        </div>
        <div className="auth-kicker">Traveller access</div>
        <h1 className="auth-title">
          {mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset password"}
        </h1>
        <p className="auth-sub">
          {mode === "login"
            ? "Sign in to plan, split and decide trips with your crew."
            : mode === "signup"
              ? "One account for planning, groups and shared expenses."
              : "Enter your email and we'll send a reset link."}
        </p>

        {mode !== "forgot" && (
          <div className="auth-switch">
            <button className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); reset(); }}>Sign in</button>
            <button className={mode === "signup" ? "on" : ""} onClick={() => { setMode("signup"); reset(); }}>Create account</button>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">Email</label>
            <div style={inputWrap()}>
              <Mail size={15} color="var(--hint)" />
              <input id="auth-email" type="email" className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" style={{ paddingLeft: 30 }} required />
            </div>
          </div>

          {mode !== "forgot" && (
            <div className="auth-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="auth-label" htmlFor="auth-pass">Password</label>
                {mode === "login" && (
                  <button type="button" className="auth-link-btn" onClick={() => { setMode("forgot"); reset(); }}>Forgot?</button>
                )}
              </div>
              <div style={inputWrap()}>
                <Lock size={15} color="var(--hint)" />
                <input id="auth-pass" type="password" className="auth-input" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" style={{ paddingLeft: 30 }} required minLength={6} />
              </div>
              {mode === "signup" && <div className="auth-hint">Min 6 characters. You'll verify your email right after — and only after that is your account active.</div>}
            </div>
          )}

          {error && <div className="auth-err">{error}</div>}
          {info && <div className="auth-ok">{info}</div>}

          <div className="auth-actions">
            <button className="auth-btn primary" disabled={busy} type="submit">
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </button>
          </div>
        </form>

        {mode === "forgot" && (
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <button className="auth-link-btn" onClick={() => { setMode("login"); reset(); }}>← Back to sign in</button>
          </div>
        )}

        {mode !== "forgot" && (
          <>
            <div className="auth-divider">or</div>
            <button className="auth-btn ghost" onClick={google} disabled={busy} type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" style={{ verticalAlign: "middle", marginRight: 8 }}>
                <path fill="#ea4335" d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.06-3.06C17.4 1.86 14.9.82 12 .82 7.55.82 3.7 3.44 1.9 7.22l3.56 2.76C6.4 7.3 8.94 5.04 12 5.04z"/>
                <path fill="#4285f4" d="M23.49 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.61l3.55 2.76c2.1-1.94 3.88-4.8 3.88-8.56z"/>
                <path fill="#fbbc05" d="M5.46 14.02a6.99 6.99 0 0 1 0-4.04L1.9 7.22a11.47 11.47 0 0 0 0 9.56l3.56-2.76z"/>
                <path fill="#34a853" d="M12 23.18c3.1 0 5.7-1.02 7.6-2.78l-3.55-2.76c-1.04.7-2.38 1.12-4.05 1.12-3.06 0-5.6-2.26-6.5-5.34l-3.56 2.76c1.8 3.78 5.65 6.4 10.06 6.4z"/>
              </svg>
              Continue with Google
            </button>
          </>
        )}

        <div className="auth-terms">
          Your info is kept private and only shared with people you add to a trip group.
          <br />No UPI PIN, OTP or bank passwords are ever stored.
        </div>
      </div>
    </div>
  );
}

function UsernameField({ setUsername }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState({ checking: false, ok: null });
  const change = (e) => {
    const v = e.target.value.replace(/\s/g, "");
    setValue(v);
    setUsername(v);
    const norm = normalizeUsername(v);
    const problem = usernameProblems(norm);
    if (problem) { setState({ checking: false, ok: null }); return; }
    setState({ checking: true, ok: null });
    clearTimeout(UsernameField._t);
    UsernameField._t = setTimeout(async () => {
      const res = await usernameAvailable(norm);
      setState({ checking: false, ok: res.ok });
    }, 350);
  };
  const norm = normalizeUsername(value);
  const problem = usernameProblems(norm);
  let hint = null;
  let tone = null;
  if (norm) {
    if (problem) { hint = problem; tone = "err"; }
    else if (state.checking) { hint = "Checking availability…"; }
    else if (state.ok === null) { hint = ""; }
    else if (state.ok) { hint = "@" + norm + " is available"; tone = "ok"; }
    else { hint = "That username is taken."; tone = "err"; }
  }
  return (
    <div className="auth-field">
      <label className="auth-label" htmlFor="auth-user">Username</label>
      <div style={inputWrap()}>
        <span
          dangerouslySetInnerHTML={{ __html: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>` }}
          style={{ position: "absolute", left: 11, color: "var(--hint)", display: "inline-flex", pointerEvents: "none" }}
        />
        <input id="auth-user" className="auth-input" value={value} onChange={change}
          placeholder="e.g. priya.onthroad" style={{ paddingLeft: 32 }} required />
      </div>
      {hint && <div className={tone === "err" ? "auth-err" : tone === "ok" ? "auth-ok" : "auth-hint"}>{hint}</div>}
      <div className="auth-hint">Your public handle for groups, search and settling up. Unique and permanent once claimed.</div>
    </div>
  );
}
UsernameField._t = null;

function CompleteProfile({ auth }) {
  const [displayName, setDisplayName] = useState(auth.user?.displayName || "");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const norm = normalizeUsername(username);
  const problem = usernameProblems(norm);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      await auth.completeProfile({ displayName: displayName.trim() || "Traveller", username: norm });
    } catch (err) {
      setError(auth.mapAuthError(err) || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">RoamSmart</div>
        <div className="auth-kicker">One last step</div>
        <h1 className="auth-title">Pick your handle</h1>
        <p className="auth-sub">
        {auth.user?.emailVerified
          ? "Your Google account is verified. Choose a public username to get started."
          : "Almost there! Choose how you appear to the people you travel with."}
        </p>
        <form onSubmit={submit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="cp-name">Display name</label>
            <input id="cp-name" className="auth-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Enter your full name" />
          </div>
          <UsernameField setUsername={(v) => setUsername(v)} />
          {error && <div className="auth-err">{error}</div>}
          <button className="auth-btn gold" disabled={busy} type="submit" style={{ marginTop: 14 }}>
            {busy ? "Saving…" : "Create my handle"}
          </button>
        </form>
      </div>
    </div>
  );
}

function VerifyEmailScreen({ auth }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {tone, text}
  const flash = (tone, text) => { setMsg({ tone, text }); setTimeout(() => setMsg(null), 3500); };

  async function resend() {
    setBusy(true);
    try {
      await import("../firebase/authService").then((m) => m.resendVerification());
      flash("ok", "Verification email sent — check your inbox.");
    } catch (err) {
      flash("err", auth.mapAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterVerify() {
    setBusy(true);
    try {
      const u = await auth.refreshUser();
      if (u && u.emailVerified) flash("ok", "Email verified — welcome! Your profile is being set up.");
      else flash("err", "Not verified yet. Check your inbox and click the link, then try again.");
    } catch (err) {
      flash("err", auth.mapAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">RoamSmart</div>
        <div className="auth-kicker">Account activation</div>
        <h1 className="auth-title">Verify your email</h1>
        <p className="auth-sub">One last step before your account is active.</p>

        <div className="auth-verify-box">
          We&apos;ve sent a verification link to <b>{auth.user?.email}</b>. Click it in your inbox,
          then come back and press the button below. Your account is only activated after the email is verified.
        </div>

        {msg && <div className={msg.tone === "err" ? "auth-err" : "auth-ok"} style={{ marginBottom: 10 }}>{msg.text}</div>}

        <button className="auth-btn primary" onClick={continueAfterVerify} disabled={busy} type="button" style={{ marginBottom: 10 }}>
          {busy ? "Checking…" : "I've verified — continue"}
        </button>
        <button className="auth-btn ghost" onClick={resend} disabled={busy} type="button">
          Resend verification email
        </button>

        <div style={{ marginTop: 14, textAlign: "center" }}>
          <button className="auth-link-btn" onClick={() => auth.signOut()}>This email isn't mine — sign out</button>
        </div>
      </div>
    </div>
  );
}