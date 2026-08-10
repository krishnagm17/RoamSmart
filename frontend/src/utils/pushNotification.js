import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { messaging } from '../firebase';

// Detect if Firebase config uses default placeholders or is blank
const isFirebaseMock = !import.meta.env.VITE_FIREBASE_PROJECT_ID ||
                       import.meta.env.VITE_FIREBASE_PROJECT_ID === 'your_project_id' ||
                       import.meta.env.VITE_FIREBASE_PROJECT_ID === 'your_project' ||
                       import.meta.env.VITE_FIREBASE_PROJECT_ID === '';

export async function requestPushPermission() {
  if (isFirebaseMock) {
    console.log("[Mock Push Notifications] Firebase mock active. Skipping actual push token request.");
    return { success: false, reason: 'Firebase Mock Active' };
  }

  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return { success: false, reason: 'Notifications not supported in this environment' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, reason: 'Permission denied' };
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey || vapidKey === 'your_vapid_key' || vapidKey === '') {
      console.warn("FCM VAPID key is missing or is using placeholder in frontend/.env.");
      return { success: false, reason: 'FCM VAPID key not configured' };
    }

    const token = await getToken(messaging, { vapidKey });
    return { success: true, token };
  } catch (err) {
    console.error("FCM Token request failed:", err);
    return { success: false, reason: err.message };
  }
}

export function listenForPushMessages(onAlert) {
  if (isFirebaseMock) return () => {};

  try {
    return onMessage(messaging, (payload) => {
      onAlert({
        title:     payload.notification?.title || 'Travel Alert',
        body:      payload.notification?.body || '',
        alertType: payload.data?.alertType,
        activity:  payload.data?.activityName
      });
    });
  } catch (err) {
    console.error("FCM listener setup failed:", err);
    return () => {};
  }
}
