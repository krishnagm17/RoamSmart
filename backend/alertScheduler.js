const cron = require('node-cron');
const { supabase } = require('./supabaseClient');
const { checkAllConditions } = require('./conditionChecker');
const { notifyUser } = require('./notificationEngine');
const { saveAlertToFirestore } = require('./alertHelpers');

// ─── HELPER: Calculate Day Index of trip (1-indexed) ──────────────

function getDayIndex(startDateStr, targetDateStr) {
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const target = new Date(targetDateStr);
  target.setHours(0, 0, 0, 0);
  
  const diffTime = target.getTime() - start.getTime();
  if (diffTime < 0) return -1;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// ─── HELPER: Parse activity time to minutes since midnight ─────────

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 600;
  const match = timeStr.match(/(\d+)[:.]?(\d+)?\s*(AM|PM)/i);
  if (!match) return 600;
  let hours = parseInt(match[1]);
  const mins = match[2] ? parseInt(match[2]) : 0;
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

// ─── TRIGGER 1: Night before alert (runs every day at 9:00 PM IST) ───

cron.schedule('0 21 * * *', async () => {
  console.log('[AlertScheduler] Running night-before check at 9 PM IST...');

  // Get tomorrow's date in IST
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  try {
    // Query active itineraries
    const { data: itineraries, error } = await supabase
      .from('itineraries')
      .select('*')
      .lte('itineraryData->>startDate', tomorrowStr)
      .gte('itineraryData->>endDate', tomorrowStr);

    if (error) throw error;

    for (const itinerary of (itineraries || [])) {
      const data = itinerary.itineraryData || {};
      const tomorrowDayIndex = getDayIndex(data.startDate, tomorrowStr);
      if (tomorrowDayIndex <= 0) continue;

      const tomorrowDay = (data.days || []).find(d => Number(d.day) === Number(tomorrowDayIndex));
      if (!tomorrowDay) continue;

      const destForDay = tomorrowDay.destination || data.destination || 'India';

      const { data: userProfile } = await supabase
        .from('userProfiles')
        .select('*')
        .eq('userId', itinerary.userId)
        .maybeSingle();

      if (!userProfile) continue;
      if (!userProfile.alertPreferences?.nightBeforeAlert) continue;

      const alertsFound = [];

      for (const activity of (tomorrowDay.activities || [])) {
        if (activity.type === 'hotel' || activity.type === 'travel') continue;

        // Run hazard checker
        const alerts = await checkAllConditions(
          activity,
          destForDay,
          tomorrowStr
        );

        if (alerts && alerts.length > 0) {
          alertsFound.push({ activity, alerts });

          for (const alert of alerts) {
            await saveAlertToFirestore({
              ...alert,
              itineraryId:  itinerary.id,
              userId:       itinerary.userId,
              dayNumber:    tomorrowDayIndex,
              activityName: activity.name,
              triggerType:  'night_before',
              destination:  destForDay
            });
          }
        }
      }

      if (alertsFound.length > 0) {
        for (const { activity, alerts } of alertsFound) {
          await notifyUser(
            userProfile, alerts, activity,
            tomorrowDayIndex, destForDay, 'night_before'
          );
        }
      }
    }

    console.log('[AlertScheduler] Night-before check complete.');
  } catch (err) {
    console.error('[AlertScheduler] Night-before check error:', err);
  }
}, { timezone: 'Asia/Kolkata' });

// ─── TRIGGER 2: Real-time alert (runs every 15 minutes) ───────────

cron.schedule('*/15 * * * *', async () => {
  console.log('[AlertScheduler] Running real-time check...');

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const windowStart = nowMinutes;
  const windowEnd = nowMinutes + 75; // Scan activities in the next 1h15m

  try {
    const { data: itineraries, error } = await supabase
      .from('itineraries')
      .select('*')
      .lte('itineraryData->>startDate', todayStr)
      .gte('itineraryData->>endDate', todayStr);

    if (error) throw error;

    for (const itinerary of (itineraries || [])) {
      const data = itinerary.itineraryData || {};
      const todayDayIndex = getDayIndex(data.startDate, todayStr);
      if (todayDayIndex <= 0) continue;

      const todayDay = (data.days || []).find(d => Number(d.day) === Number(todayDayIndex));
      if (!todayDay) continue;

      const destForDay = todayDay.destination || data.destination || 'India';

      const { data: userProfile } = await supabase
        .from('userProfiles')
        .select('*')
        .eq('userId', itinerary.userId)
        .maybeSingle();

      if (!userProfile) continue;
      if (!userProfile.alertPreferences?.realtimeAlert) continue;

      for (const activity of (todayDay.activities || [])) {
        if (activity.type === 'hotel' || activity.type === 'travel') continue;

        const activityMinutes = parseTimeToMinutes(activity.time);
        const isInWindow = activityMinutes >= windowStart && activityMinutes <= windowEnd;
        if (!isInWindow) continue;

        // Cooldown: prevent sending duplicate alerts for same stop in the last 2 hours
        const cooldownTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
        const { data: alreadySent } = await supabase
          .from('alerts')
          .select('id')
          .eq('itineraryId', itinerary.id)
          .eq('activityName', activity.name)
          .eq('triggerType', 'realtime')
          .gt('sentAt', cooldownTime);

        if (alreadySent && alreadySent.length > 0) continue;

        // Run hazard checker
        const alerts = await checkAllConditions(
          activity,
          destForDay,
          todayStr
        );

        if (alerts && alerts.length > 0) {
          for (const alert of alerts) {
            await saveAlertToFirestore({
              ...alert,
              itineraryId:  itinerary.id,
              userId:       itinerary.userId,
              dayNumber:    todayDayIndex,
              activityName: activity.name,
              triggerType:  'realtime',
              destination:  destForDay
            });
          }

          await notifyUser(
            userProfile, alerts, activity,
            todayDayIndex, destForDay, 'realtime'
          );
        }
      }
    }

    console.log('[AlertScheduler] Real-time check complete.');
  } catch (err) {
    console.error('[AlertScheduler] Real-time error:', err);
  }
});
