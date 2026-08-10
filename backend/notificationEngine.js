const twilio = require('twilio');
const { fcm } = require('./firebaseAdmin');
const axios = require('axios');

// Detect if Twilio is mock or missing
const isTwilioMock = !process.env.TWILIO_ACCOUNT_SID ||
                     process.env.TWILIO_ACCOUNT_SID.includes('your_sid') ||
                     process.env.TWILIO_ACCOUNT_SID === '';

let twilioClient = null;
if (!isTwilioMock) {
  try {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  } catch (err) {
    console.error("Failed to initialize Twilio client, entering mock mode:", err.message);
  }
}

// ─── SEND TELEGRAM MESSAGE ─────────────────────────────────────────

async function sendTelegramMessage(chatId, message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'your_telegram_bot_token' || token === '') {
    console.log(`\n[Mock Telegram Message] ChatID: ${chatId}\nMessage: 🧭 TripPlanner Alert:\n${message}\n\nOpen app for details & alternatives.\n`);
    return { success: true, mode: 'mock' };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: `🧭 *TripPlanner Alert*:\n${message}`,
      parse_mode: 'Markdown'
    }, { timeout: 5000 });
    return { success: true, mode: 'production' };
  } catch (err) {
    console.error('Telegram API error:', err.message);
    return { success: false, reason: err.message };
  }
}

const severityEmoji = {
  warning:  '⚠️',
  danger:   '🚨',
  critical: '🔴'
};

const alertTypeLabel = {
  heavy_rain:    'Heavy Rain Warning',
  flood_risk:    'Flood / Landslide Risk',
  extreme_heat:  'Extreme Heat Warning',
  place_closed:  'Place May Be Closed',
  poor_aqi:      'Poor Air Quality Warning'
};

// ─── BUILD MESSAGE TEXT ───────────────────────────────────────────

function buildAlertMessage(alert, activity, dayNumber, destination, triggerType) {
  const emoji = severityEmoji[alert.severity] || '⚠️';
  const label = alertTypeLabel[alert.alertType] || 'Travel Alert';
  const when  = triggerType === 'night_before'
    ? `tomorrow (Day ${dayNumber})`
    : `in ~1 hour`;

  return {
    short: `${emoji} ${label} — ${activity.name}, ${destination} ${when}. ${alert.aiAdvice}`,
    push: {
      title: `${emoji} ${label}`,
      body:  `${activity.name} ${when} — ${alert.condition}. Tap for details.`
    }
  };
}

// ─── SEND PUSH NOTIFICATION ───────────────────────────────────────

async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!fcmToken) return { success: false, reason: 'No FCM token' };
  
  // Real FCM send
  try {
    await fcm.send({
      token: fcmToken,
      notification: { title, body },
      data: { ...data, click_action: 'OPEN_ALERTS' },
      android: {
        priority: 'high',
        notification: {
          channelId: 'travel_alerts',
          priority:   'max',
          sound:      'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1
          }
        }
      }
    });
    return { success: true };
  } catch (err) {
    console.error('Push notification error:', err.message);
    return { success: false, reason: err.message };
  }
}

// ─── SEND SMS ─────────────────────────────────────────────────────

async function sendSMS(phoneNumber, message) {
  if (!phoneNumber) return { success: false, reason: 'No phone number' };

  if (isTwilioMock || !twilioClient) {
    console.log(`\n[Mock Twilio SMS] To: ${phoneNumber}\nMessage: 🧭 TripPlanner Alert:\n${message}\n\nOpen app for details & alternatives.\n`);
    return { success: true };
  }

  try {
    await twilioClient.messages.create({
      body: `🧭 TripPlanner Alert:\n${message}\n\nOpen app for details & alternatives.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   phoneNumber
    });
    return { success: true };
  } catch (err) {
    console.error('SMS error:', err.message);
    return { success: false, reason: err.message };
  }
}

// ─── MASTER NOTIFY ────────────────────────────────────────────────

async function notifyUser(userProfile, alerts, activity,
                          dayNumber, destination, triggerType) {
  if (!alerts || alerts.length === 0) return;

  const prefs = userProfile.alertPreferences || {};

  for (const alert of alerts) {
    const { short, push } = buildAlertMessage(
      alert, activity, dayNumber, destination, triggerType
    );

    const results = await Promise.allSettled([
      prefs.pushEnabled && userProfile.fcmToken
        ? sendPushNotification(
            userProfile.fcmToken, push.title, push.body,
            { alertType: alert.alertType, activityName: activity.name }
          )
        : Promise.resolve({ success: false, reason: 'Push disabled or no token' }),

      prefs.smsEnabled && userProfile.phoneNumber
        ? sendSMS(userProfile.phoneNumber, short)
        : Promise.resolve({ success: false, reason: 'SMS disabled or no phone' }),

      prefs.telegramEnabled && userProfile.telegramChatId
        ? sendTelegramMessage(userProfile.telegramChatId, short)
        : Promise.resolve({ success: false, reason: 'Telegram disabled or no Chat ID' })
    ]);

    console.log(`Alert notification sent for ${activity.name}:`,
      results.map(r => r.status === 'fulfilled' ? r.value : { success: false, reason: r.reason }));
  }
}

module.exports = { notifyUser, sendSMS, sendPushNotification, sendTelegramMessage };
