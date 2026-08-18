// ─────────────────────────────────────────────────────────────────────────────
// telegramService.js — secure Telegram connect/verify + hazard dispatch.
//
//   Secure connect flow (no phone number required):
//   1. User taps "Connect Telegram" → POST /api/telegram/connect { userId }
//      → returns a one-time token (stored server-side, exp 10 min).
//   2. User sends /start <token> to the RoamSmart bot → bot resolves userId,
//      stores telegramChatId against userProfiles, replies "Connected ✓".
//   3. Frontend polls POST /api/telegram/status until status === 'connected'.
//
//   The bot token never reaches the frontend; the deep link is built server-side.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const { supabase } = require('./supabaseClient');
const crypto = require('crypto');

const TOKEN_TTL_MS = 10 * 60 * 1000;

const HAZARD_EMOJI = {
  extreme: '🔴',
  severe:  '🚨',
  moderate:'⚠️',
  minor:   'ℹ️',
};

const HAZARD_LABEL = {
  flood: 'Flood',
  landslide: 'Landslide',
  earthquake: 'Earthquake',
  cyclone: 'Cyclone',
  lightning: 'Lightning',
  forest_fire: 'Forest Fire',
  tsunami: 'Tsunami',
  heatwave: 'Heatwave',
  cold_wave: 'Cold Wave',
  dust_storm: 'Dust Storm',
  hailstorm: 'Hailstorm',
  thunderstorm: 'Thunderstorm',
  fog: 'Fog',
  other: 'Hazard',
};

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'your_telegram_bot_token' || token === '') return null;
  return token;
}

function buildDeepLink(token) {
  const botName = (process.env.TELEGRAM_BOT_USERNAME || '').replace('@', '');
  const base = botName ? `https://t.me/${botName}` : `https://t.me/YourBotUsername`;
  return `${base}?start=${token}`;
}

// ── token management ──────────────────────────────────────────────────────────
function newConnectToken(userId) {
  const token = crypto.randomBytes(16).toString('hex');
  global.__telegramConnectTokens = global.__telegramConnectTokens || new Map();
  global.__telegramConnectTokens.set(token, { userId, createdAt: Date.now() });
  return token;
}

function consumeConnectToken(token) {
  const store = global.__telegramConnectTokens || new Map();
  const entry = store.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    store.delete(token);
    return null;
  }
  store.delete(token);
  return entry.userId;
}

// ── generate connect deep link ────────────────────────────────────────────────
async function createConnectLink(userId) {
  if (!supabase) return { ok: false, reason: 'Supabase not configured' };

  const token = newConnectToken(userId);
  return {
    ok: true,
    link: buildDeepLink(token),
    expiresInSeconds: TOKEN_TTL_MS / 1000,
    botUsername: (process.env.TELEGRAM_BOT_USERNAME || 'RoamSmartBot').replace('@', ''),
  };
}

// ── resolve /start token (called by the bot webhook / polling loop) ──────────
async function handleStartCommand(token, message) {
  const chatId = String(message.chat.id);
  const telegramUserId = String(message.from.id);
  const username = message.from.username || '';

  const userId = consumeConnectToken(token);
  if (!userId) return 'This link has expired. Open the app and tap "Connect Telegram" to get a fresh link.';

  const telegramData = {
    connected: true,
    chatId: chatId,
    telegramUserId: telegramUserId,
    username: username,
    connectedAt: new Date().toISOString()
  };

  const { error } = await supabase
    .from('users')
    .update({ telegram: telegramData })
    .eq('firebaseUid', userId);

  // Keep userProfiles synced for older backend logic
  await supabase
    .from('userProfiles')
    .update({ telegramChatId: String(chatId) })
    .eq('userId', userId);

  if (error) return 'Could not save your chat. Please try again.';

  return `✅ RoamSmart Telegram Connected!\nYou will now receive important RoamSmart alerts here.\nYou can manage your notification preferences from the RoamSmart website.`;
}

async function handleDisconnectCommand(chatId) {
  await supabase
    .from('users')
    .update({ telegram: { connected: false } })
    .eq('telegram->>chatId', String(chatId));

  const { error } = await supabase
    .from('userProfiles')
    .update({ telegramChatId: null })
    .eq('telegramChatId', String(chatId));
    
  if (error) return 'Could not disconnect. Please try again.';
  return '🔌 Disconnected. Travel alerts will no longer be sent here.';
}

async function handleBotMessage(message) {
  const text = (message.text || '').trim();
  const chatId = String(message.chat && message.chat.id);

  if (!text) return null;

  if (text.startsWith('/start')) {
    const token = text.split(/\s+/)[1] || '';
    return handleStartCommand(token, message);
  }
  if (text === '/stop' || text === '/disconnect') {
    return handleDisconnectCommand(chatId);
  }
  if (text === '/help') {
    return [
      'Hi! I am the RoamSmart alert bot. 🤖',
      '',
      'Commands:',
      '/start <link> — connect from the app',
      '/disconnect — stop alerts on this chat',
      '/help — show this help',
      '',
      'You can also just open the app → Settings → Alerts → Telegram.',
    ].join('\n');
  }
  return null;
}

// ── dispatch ──────────────────────────────────────────────────────────────────
async function sendTelegramMessage(chatId, message) {
  const token = getBotToken();
  if (!token) {
    console.log(`\n[Mock Telegram Message] ChatID: ${chatId}\nMessage:\n${message}\n`);
    return { success: true, mode: 'mock' };
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }, { timeout: 8000 });
    return { success: true, mode: 'production' };
  } catch (err) {
    console.error('Telegram API error:', err.message);
    return { success: false, reason: err.message };
  }
}

async function sendTelegramHazardAlert(userProfile, hazard, trip, match) {
  const chatId = userProfile && userProfile.telegramChatId;
  if (!chatId) return { success: false, reason: 'No Telegram chat connected' };

  const severity = String(hazard.severity || 'moderate').toLowerCase();
  const emoji = HAZARD_EMOJI[severity] || '⚠️';
  const label = HAZARD_LABEL[String(hazard.hazard_type || 'other').toLowerCase()] || hazard.hazard_type;

  const destination = match.destinationName || 'your destination';
  const distanceLine =
    typeof match.distanceKm === 'number' && isFinite(match.distanceKm)
      ? `· within ~${Math.round(match.distanceKm)} km of ${destination}\n`
      : `· near ${destination}\n`;

  const when = hazard.expires_at
    ? `valid until ${new Date(hazard.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    : 'please check the app for details';

  const lines = [
    `${emoji} *Official NDMA SACHET Alert — ${label}*`,
    '',
    `${trip.title || 'Your trip'}: ${distanceLine}`,
    `Severity: *${capitalize(severity)}* (${when})`,
    '',
    hazard.title ? `*${hazard.title}*\n` : '',
    hazard.description ? `${truncate(hazard.description, 280)}\n` : '',
    hazard.instruction ? `⚠️ *Advisory:* ${truncate(hazard.instruction, 220)}\n` : '',
    'This is an official government warning, not a prediction by RoamSmart.',
    'Open the app for live hazard map & alternatives.',
  ].filter(Boolean);

  return sendTelegramMessage(chatId, lines.join('\n'));
}

async function sendTelegramConditionAlert(userProfile, alertType, severity, message) {
  const chatId = userProfile && userProfile.telegramChatId;
  if (!chatId) return { success: false, reason: 'No Telegram chat connected' };
  const emoji = HAZARD_EMOJI[String(severity).toLowerCase()] || '⚠️';
  const text = `${emoji} *${capitalize(alertType)}* — ${message}`;
  return sendTelegramMessage(chatId, text);
}

// ── helpers ───────────────────────────────────────────────────────────────────
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

module.exports = {
  createConnectLink,
  handleBotMessage,
  handleStartCommand,
  handleDisconnectCommand,
  sendTelegramMessage,
  sendTelegramHazardAlert,
  sendTelegramConditionAlert,
};
