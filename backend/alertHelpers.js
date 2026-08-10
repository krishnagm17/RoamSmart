const { supabase } = require('./supabaseClient');

async function saveAlertToFirestore(alertData) {
  try {
    const doc = {
      ...alertData,
      sentAt:    new Date().toISOString(),
      dismissed: false,
      read:      false
    };
    const { data, error } = await supabase.from('alerts').insert([doc]).select('id').single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error('Error saving alert to Supabase:', err);
    return null;
  }
}

async function markAlertDismissed(alertId) {
  try {
    const { error } = await supabase.from('alerts').update({
      dismissed: true,
      dismissedAt: new Date().toISOString()
    }).eq('id', alertId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error dismissing alert in Supabase:', err);
    return false;
  }
}

module.exports = { saveAlertToFirestore, markAlertDismissed };
