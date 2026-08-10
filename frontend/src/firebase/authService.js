// Firebase auth helpers — thin wrappers over firebase/auth with friendly error mapping.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  reload as firebaseReload,
} from "firebase/auth";
import { auth, isFirebaseMock } from "../firebase";

export const AUTH_UNAVAILABLE = "Firebase is not configured yet. Set VITE_FIREBASE_* keys in frontend/.env.";

export function authReady() {
  return !isFirebaseMock && !!auth;
}

export function mapAuthError(err) {
  if (isFirebaseMock || !auth) return AUTH_UNAVAILABLE;
  const code = err?.code || "";
  const map = {
    "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account found for this email. Try signing up.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a bit and try again.",
    "auth/account-exists-with-different-credential": "An account already exists with this email. Try signing in instead.",
    "auth/credential-already-in-use": "This account is already linked to RoamSmart.",
    "auth/popup-closed-by-user": "Sign-in popup was closed before completing.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/requires-recent-login": "Please sign in again to continue.",
  };
  return map[code] || err?.message?.replace(/^Firebase: /, "") || "Something went wrong. Please try again.";
}

export async function emailSignUp(email, password) {
  if (!authReady()) throw new Error(AUTH_UNAVAILABLE);
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await sendEmailVerification(cred.user);
  } catch {
    // verification email send is best-effort; local new-tab page can still resend it
  }
  return cred.user;
}

export async function emailSignIn(email, password) {
  if (!authReady()) throw new Error(AUTH_UNAVAILABLE);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function googleSignIn() {
  if (!authReady()) throw new Error(AUTH_UNAVAILABLE);
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function requestPasswordReset(email) {
  if (!authReady()) throw new Error(AUTH_UNAVAILABLE);
  await sendPasswordResetEmail(auth, email);
}

export async function resendVerification() {
  if (!authReady() || !auth.currentUser) return;
  try {
    await sendEmailVerification(auth.currentUser);
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function refreshUser() {
  if (!auth || !auth.currentUser) return null;
  await firebaseReload(auth.currentUser);
  return auth.currentUser;
}

export async function signOutUser() {
  if (!auth) return;
  await firebaseSignOut(auth);
}

export function onAuthState(cb) {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

// ---------- Username rules ----------

export const USERNAME_RULES = {
  min: 3,
  max: 20,
  pattern: /^[a-zA-Z][a-zA-Z0-9_.]{1,18}[a-zA-Z0-9]$/,
};

export function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase();
}

export function usernameProblems(raw) {
  const v = String(raw || "").trim();
  if (!v) return "Choose a username.";
  if (v.length < USERNAME_RULES.min) return `Username must be at least ${USERNAME_RULES.min} characters.`;
  if (v.length > USERNAME_RULES.max) return `Username must be ${USERNAME_RULES.max} characters or fewer.`;
  if (!USERNAME_RULES.pattern.test(v)) {
    return "Use 3–20 characters: start with a letter, then letters, numbers, dots, underscores or hyphens.";
  }
  return null;
}