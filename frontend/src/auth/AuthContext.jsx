import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import {
  emailSignUp, emailSignIn, googleSignIn, requestPasswordReset, signOutUser, onAuthState,
  mapAuthError, authReady, refreshUser as reloadAuthUser,
} from "../firebase/authService";
import {
  listenUserProfile, createUserProfile, updateUserProfile, claimUsername,
} from "../supabase/userStore";
import { isFirebaseMock } from "../firebase";
import { SUPABASE_READY, bindFirebaseAuth, clearSupabaseAuth } from "../supabase";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  // status: "loading" | "signedOut" | "signedIn"
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [needsProfile, setNeedsProfile] = useState(false);

  useEffect(() => {
    if (!authReady()) {
      setStatus("signedOut");
      return () => {};
    }
    const unsub = onAuthState((u) => {
      if (u) {
        setUser(u);
        setStatus("signedIn");
        // Bridge the Firebase ID token into Supabase so RLS resolves auth.uid()
        // to this Firebase UID. The profile effect re-binds before subscribing too.
        if (SUPABASE_READY && typeof u.getIdToken === "function") {
          u.getIdToken()
            .then((t) => { if (t) bindFirebaseAuth(t); })
            .catch((err) => console.warn("Supabase bind failed:", err?.message || err));
        }
      } else {
        setUser(null);
        setProfile(null);
        setNeedsProfile(false);
        setStatus("signedOut");
        clearSupabaseAuth();
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to the Supabase profile whenever we have a signed-in uid.
  useEffect(() => {
    if (status !== "signedIn" || !user?.uid) {
      setProfile(null);
      setNeedsProfile(false);
      return () => {};
    }
    let alive = true;
    let unsub = () => {};
    (async () => {
      if (SUPABASE_READY && typeof user.getIdToken === "function") {
        try {
          const token = await user.getIdToken();
          await bindFirebaseAuth(token);
        } catch (err) {
          console.warn("Supabase bind before profile load failed:", err?.message || err);
        }
      }
      if (!alive) return;
      unsub = listenUserProfile(user.uid, (p) => {
        if (!alive) return;
        if (!p || !p.usernameLower) {
          setProfile(p || null);
          setNeedsProfile(true);
          return;
        }
        setProfile(p);
        setNeedsProfile(false);
      });
    })();
    return () => { alive = false; unsub(); };
  }, [status, user?.uid]);

  const signUp = useCallback(async ({ email, password }) => {
    // Account is created + verification email sent. The Firestore profile
    // (username etc.) is only created AFTER the email is verified.
    if (!authReady()) throw new Error("Firebase is not configured yet. Set VITE_FIREBASE_* keys in frontend/.env.");
    return emailSignUp(email, password);
  }, []);

  const signIn = useCallback((email, password) => emailSignIn(email, password), []);
  const signInWithGoogle = useCallback(() => googleSignIn(), []);
  const resetPassword = useCallback((email) => requestPasswordReset(email), []);
  const signOut = useCallback(async () => {
    await signOutUser();
    await clearSupabaseAuth();
    setProfile(null);
    setNeedsProfile(false);
  }, []);

  const completeProfile = useCallback(async ({ displayName, username }) => {
    if (!user?.uid) throw new Error("Not signed in.");
    await createUserProfile(user.uid, { displayName, username, email: user.email || "" });
  }, [user?.uid]);

  const updateProfile = useCallback(async (patch) => {
    if (!user?.uid) throw new Error("Not signed in.");
    await updateUserProfile(user.uid, patch);
  }, [user?.uid]);

  const changeUsername = useCallback(async (newUsername) => {
    if (!user?.uid) throw new Error("Not signed in.");
    await claimUsername(user.uid, profile?.usernameLower, newUsername);
  }, [user?.uid, profile?.usernameLower]);

  const refreshUser = useCallback(async () => {
    const u = await reloadAuthUser();
    if (u) setUser({ ...u });
    return u;
  }, []);

  const needsVerification = status === "signedIn" && !!user && !user.emailVerified;

  const value = useMemo(() => ({
    status, user, profile,
    needsProfile, needsVerification,
    isFirebaseMock,
    firebaseReady: authReady(),
    signUp, signIn, signInWithGoogle, resetPassword, signOut,
    completeProfile, updateProfile, changeUsername,
    refreshUser,
    mapAuthError,
  }), [status, user, profile, needsProfile, needsVerification, signUp, signIn, signInWithGoogle, resetPassword, signOut, completeProfile, updateProfile, changeUsername, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}