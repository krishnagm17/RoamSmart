// ─────────────────────────────────────────────────────────────────────────────
// crowdUtils.js — shared crowd & weather context helpers.
//
//   Extracted from server.js so the condition monitor can reuse the SAME
//   holiday/weather logic that powers /api/crowd-prediction (no duplication).
//   server.js keeps its own copies; this module is only imported by the
//   backend monitoring pipeline.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');

async function getWeatherContext(destination) {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey || apiKey === 'your_free_key_here' || apiKey === '') {
      return { available: false, reason: 'No weather API key configured' };
    }
    const cleanDest = destination.split(',')[0].trim();
    const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cleanDest)}&limit=1&appid=${apiKey}`;
    const geoResponse = await axios.get(geoUrl, { timeout: 5000 });
    if (!geoResponse.data || geoResponse.data.length === 0) {
      return { available: false, reason: 'Location not found' };
    }
    const { lat, lon } = geoResponse.data[0];
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const weatherResponse = await axios.get(weatherUrl, { timeout: 5000 });
    const w = weatherResponse.data;

    return {
      available: true,
      condition: w.weather[0].description,
      temperature: Math.round(w.main.temp),
      feelsLike: Math.round(w.main.feels_like),
      humidity: w.main.humidity,
      windSpeed: w.wind.speed,
      isRaining: ['Rain', 'Drizzle', 'Thunderstorm'].includes(w.weather[0].main),
      isExtreme: ['Thunderstorm', 'Tornado', 'Squall'].includes(w.weather[0].main),
      isClear: w.weather[0].main === 'Clear',
      visibility: w.visibility > 5000 ? 'good' : 'poor',
    };
  } catch (err) {
    return { available: false, reason: 'Weather service unavailable' };
  }
}

// Deterministic heuristic crowd score (0-100) matching server.js fallback.
// `weatherContext` is optional (null → neutral).
function computeCrowdScore(destination, weatherContext) {
  const date = new Date();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = date.getDay();

  const holidays = [
    { month: 1, day: 26, name: 'Republic Day' },
    { month: 8, day: 15, name: 'Independence Day' },
    { month: 10, day: 2, name: 'Gandhi Jayanti' },
    { month: 11, day: 1, name: 'Diwali' },
    { month: 3, day: 25, name: 'Holi' },
    { month: 4, day: 14, name: 'Baisakhi' },
    { month: 10, day: 24, name: 'Dussehra' },
    { month: 12, day: 25, name: 'Christmas' },
    { month: 1, day: 1, name: 'New Year' },
  ];

  let score = 40;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isFriday = dayOfWeek === 5;
  const todayHoliday = holidays.some((h) => h.month === month && h.day === day);
  const tomorrowHoliday = holidays.some((h) => h.month === month && h.day === day + 1);
  const isLongWeekend = isFriday && tomorrowHoliday;

  if (isWeekend) score += 20;
  if (isLongWeekend) score += 15;
  if (todayHoliday) score += 20;
  if ([5, 6].includes(month)) score += 10;
  if (month === 6 || month === 7 || month === 8) score -= 8; // monsoon dip
  if (weatherContext) {
    if (weatherContext.isRaining) score -= 15;
    if (weatherContext.isExtreme) score -= 25;
    if (weatherContext.isClear) score += 10;
  }

  const nameLower = destination.toLowerCase();
  if (['temple', 'mosque', 'church', 'gurudwara'].some((k) => nameLower.includes(k))) score += 15;
  if (['market', 'bazaar', 'mall'].some((k) => nameLower.includes(k))) score += 10;

  return Math.max(5, Math.min(95, Math.round(score)));
}

module.exports = { getWeatherContext, computeCrowdScore };
