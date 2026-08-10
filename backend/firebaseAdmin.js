const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let fcm;
let isMock = false;

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || './serviceAccountKey.json';
const resolvedPath = path.resolve(__dirname, serviceAccountPath);
const serviceAccountExists = fs.existsSync(resolvedPath);

if (serviceAccountExists) {
  try {
    const serviceAccount = require(resolvedPath);
    if (serviceAccount.project_id && (serviceAccount.project_id.includes('your_project') || serviceAccount.project_id === '')) {
      console.log("Firebase service account uses placeholder project ID. Falling back to local mock FCM.");
      isMock = true;
    } else {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      }
      fcm = admin.messaging();
      console.log("Firebase admin SDK initialized successfully for FCM.");
    }
  } catch (err) {
    console.error("Firebase admin init failed, falling back to mock:", err.message);
    isMock = true;
  }
} else {
  console.log("serviceAccountKey.json not found, falling back to local mock FCM.");
  isMock = true;
}

if (isMock) {
  fcm = {
    send: async (payload) => {
      console.log("[Mock FCM Messaging] Pushing message:", JSON.stringify(payload, null, 2));
      return { success: true };
    }
  };
}

module.exports = { admin, fcm };
