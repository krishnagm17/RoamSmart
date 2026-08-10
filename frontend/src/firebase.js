// Firebase bootstrap — AUTH + FCM cloud messaging ONLY.
// All application data lives in Supabase (see src/supabase.js + supabase/schema.sql).
// When the project id is missing or still a placeholder, the app falls back to a graceful
// "mock" mode (like supabase.js), so the module always loads without throwing and every
// consumer can guard with isFirebaseMock.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getMessaging } from "firebase/messaging";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Identifies unconfigured / placeholder installs (same heuristic as pushNotification.js).
export const isFirebaseMock =
  !firebaseConfig.projectId ||
  firebaseConfig.projectId === "your_project_id" ||
  firebaseConfig.projectId === "your_project" ||
  firebaseConfig.projectId === "";

let app = null;
try {
  app = initializeApp(firebaseConfig);
} catch (err) {
  console.warn("Firebase app init failed:", err?.message || err);
}

let auth = null;
let messaging = null;

if (app && !isFirebaseMock) {
  try { auth = getAuth(app); } catch (err) { console.warn("Firebase auth init failed:", err?.message || err); }
  try { messaging = getMessaging(app); } catch (err) { console.warn("Firebase messaging init failed:", err?.message || err); }
}

export { app, auth, messaging };