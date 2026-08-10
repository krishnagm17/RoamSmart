importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

// These self.* properties are configured or we can substitute standard configs.
// To avoid crashes on undefined properties, check if they exist or fallback to placeholders.
const config = {
  apiKey:            self.FIREBASE_CONFIG_API_KEY || 'dummy_api_key',
  authDomain:        self.FIREBASE_CONFIG_AUTH_DOMAIN || 'dummy_auth_domain',
  projectId:         self.FIREBASE_CONFIG_PROJECT_ID || 'dummy_project_id',
  storageBucket:     self.FIREBASE_CONFIG_STORAGE_BUCKET || 'dummy_storage_bucket',
  messagingSenderId: self.FIREBASE_CONFIG_SENDER_ID || 'dummy_sender_id',
  appId:             self.FIREBASE_CONFIG_APP_ID || 'dummy_app_id'
};

firebase.initializeApp(config);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Travel Alert';
  const notificationOptions = {
    body:    payload.notification?.body || '',
    icon:    '/icon-192x192.png',
    badge:   '/badge-72x72.png',
    vibrate: [200, 100, 200],
    data:    payload.data,
    actions: [
      { action: 'view',    title: 'View details' },
      { action: 'dismiss', title: 'Dismiss'      }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
