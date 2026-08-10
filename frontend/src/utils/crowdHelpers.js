export const crowdConfig = {
  'Low':       { color: '#2d6a4f', bg: '#d8f3dc', bar: '#52b788', emoji: '🟢', label: 'Low crowds'       },
  'Moderate':  { color: '#856404', bg: '#fff3cd', bar: '#f4a261', emoji: '🟡', label: 'Moderate crowds'  },
  'High':      { color: '#7a3020', bg: '#fde8e1', bar: '#e76f51', emoji: '🟠', label: 'High crowds'      },
  'Very High': { color: '#6b0f1a', bg: '#fce4ec', bar: '#e63946', emoji: '🔴', label: 'Very high crowds' },
};

export function getScoreColor(score) {
  if (score <= 25) return '#52b788';
  if (score <= 50) return '#f4a261';
  if (score <= 75) return '#e76f51';
  return '#e63946';
}

export function formatVisitTime(timeString) {
  if (!timeString) return '10:00';
  return timeString;
}
