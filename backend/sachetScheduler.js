// ─────────────────────────────────────────────────────────────────────────────
// sachetScheduler.js — cron wiring for NDMA SACHET hazard scanning and
// per-destination condition snapshots.
//
//   Every 30 min   → runHazardScan() — poll feed, upsert, match trips, notify
//   Every 6 hours  → refresh active-destination condition snapshots
//   Every 10 min   → flush long-running Telegram bot updates (getUpdates loop)
// ─────────────────────────────────────────────────────────────────────────────
const cron = require('node-cron');
const { runHazardScan } = require('./hazardEngine');
const { refreshDestinationConditions } = require('./conditionMonitor');
const { handleBotMessage } = require('./telegramService');

let isScanRunning = false;
let isConditionRefreshRunning = false;

const START = (fn) => async () => {
  try {
    await fn();
  } catch (err) {
    console.error('[Scheduler] job error:', err.message);
  }
};

// ─── Hazard scan: every 30 minutes ───────────────────────────────────────────
cron.schedule('*/30 * * * *', START(async () => {
  if (isScanRunning) return;
  isScanRunning = true;
  try {
    console.log('[HazardScheduler] Starting NDMA SACHET hazard scan...');
    const summary = await runHazardScan({ sendTelegram: true });
    console.log('[HazardScheduler] Scan complete:', summary);
  } finally {
    isScanRunning = false;
  }
}));

// ─── Condition snapshots: every 6 hours ──────────────────────────────────────
cron.schedule('0 */6 * * *', START(async () => {
  if (isConditionRefreshRunning) return;
  isConditionRefreshRunning = true;
  try {
    console.log('[HazardScheduler] Refreshing destination conditions...');
    const summary = await refreshDestinationConditions();
    console.log('[HazardScheduler] Condition refresh complete:', summary);
  } finally {
    isConditionRefreshRunning = false;
  }
}));

// ─── Telegram long polling (fallback when no webhook is configured) ──────────
async function pollTelegramUpdates() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === 'your_telegram_bot_token' || token === '') return;

  const axios = require('axios');
  const longPollingKey = 'roamsmart_telegram_offset';

  // Simple in-memory + Supabase offset persistence.
  const { supabase } = require('./supabaseClient');
  const { data: stateRow } = await supabase
    .from('telegram_connections')
    .select('offset')
    .eq('id', 'telegram_poll_state')
    .maybeSingle();
  let offset = (stateRow && stateRow.offset) || 0;

  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=1&offset=${offset}`;
    const { data } = await axios.get(url, { timeout: 4000 });
    if (!data.ok || !data.result || data.result.length === 0) return;

    for (const update of data.result) {
      const chatId = update.message && update.message.chat && update.message.chat.id;
      const reply = await handleBotMessage(update.message);
      if (reply && chatId) {
        const { sendTelegramMessage } = require('./telegramService');
        await sendTelegramMessage(chatId, reply);
      }
      offset = Math.max(offset, update.update_id + 1);
    }

    await supabase
      .from('telegram_connections')
      .upsert({ id: 'telegram_poll_state', offset }, { onConflict: 'id' });
  } catch (err) {
    // Network hiccups are normal for long-polling; ignore.
  }
}

cron.schedule('*/10 * * * *', START(pollTelegramUpdates));

module.exports = { pollTelegramUpdates };
