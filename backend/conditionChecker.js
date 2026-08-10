const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Use GEMINI_MODEL or fallback
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');

// ─── HELPER: Geocode destination ───────────────────────────────────

async function geocodeCity(cityName) {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey || apiKey === "your_free_key_here" || apiKey === "") {
      return null;
    }
    const cleanDest = cityName.split(',')[0].trim();
    const url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cleanDest)}&limit=1&appid=${apiKey}`;
    const res = await axios.get(url, { timeout: 5000 });
    if (!res.data || res.data.length === 0) return null;
    return { lat: res.data[0].lat, lon: res.data[0].lon };
  } catch (err) {
    console.error('Geocoding error:', err.message);
    return null;
  }
}

// ─── HELPER: Get AI advice for any alert ──────────────────────────

async function getAIAdvice(alertType, placeName, destination, condition) {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return `Please take general precautions at ${placeName} due to ${condition}.`;
    }
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = `A tourist has planned to visit ${placeName} in ${destination}.
Alert type: ${alertType}
Condition: ${condition}

Give exactly 2 short sentences of practical advice for a tourist visiting this place.
What should they do — reschedule, take precautions, or proceed carefully?
Be specific. Mention alternatives if needed.
Respond with ONLY the advice text. No labels. No JSON.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('AI Advice generation error:', err.message);
    return `Be cautious while visiting ${placeName}. Monitor local updates and weather conditions closely.`;
  }
}

// ─── CHECK 1: Heavy rain or storm ─────────────────────────────────

async function checkHeavyRain(destination, activityDate) {
  try {
    const coords = await geocodeCity(destination);
    if (!coords) return null;

    const apiKey = process.env.OPENWEATHER_API_KEY;
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=metric&cnt=8`;
    const res  = await axios.get(url, { timeout: 5000 });

    const targetDate = new Date(activityDate).toISOString().split('T')[0];
    const forecasts  = res.data.list.filter(f =>
      f.dt_txt.startsWith(targetDate)
    );

    if (forecasts.length === 0) return null;

    const maxRain     = Math.max(...forecasts.map(f => f.rain?.['3h'] || 0));
    const conditions  = forecasts.map(f => f.weather[0].main);
    const hasStorm    = conditions.includes('Thunderstorm');
    const hasHeavyRain = maxRain > 15;

    if (!hasStorm && !hasHeavyRain) return null;

    const severity = hasStorm ? 'critical' : maxRain > 30 ? 'danger' : 'warning';
    const condition = hasStorm
      ? `Thunderstorm expected with ${maxRain.toFixed(0)}mm rainfall`
      : `Heavy rain expected — ${maxRain.toFixed(0)}mm rainfall predicted`;

    return {
      alertType: 'heavy_rain',
      severity,
      condition,
      data: { maxRain, hasStorm, forecasts: forecasts.length }
    };
  } catch (err) {
    console.error('Rain check error:', err.message);
    return null;
  }
}

// ─── CHECK 2: Flood or landslide risk ─────────────────────────────

async function checkFloodRisk(destination, activityDate) {
  try {
    const coords = await geocodeCity(destination);
    if (!coords) return null;

    const apiKey = process.env.OPENWEATHER_API_KEY;
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=metric&cnt=16`;
    const res  = await axios.get(url, { timeout: 5000 });

    const totalRainLast48h = res.data.list
      .slice(0, 16)
      .reduce((sum, f) => sum + (f.rain?.['3h'] || 0), 0);

    const hillStations = [
      'manali','shimla','darjeeling','ooty','munnar','coorg',
      'mussoorie','nainital','kodaikanal','wayanad',
      'lonavala','mahabaleshwar','mount abu','lansdowne',
      'gangtok','cherrapunji','shillong','leh','dharamshala'
    ];

    const isHillStation = hillStations.some(h =>
      destination.toLowerCase().includes(h)
    );

    const floodThreshold     = isHillStation ? 40 : 80;
    const landslideThreshold = isHillStation ? 30 : 999;

    if (totalRainLast48h < floodThreshold) return null;

    const isLandslideRisk = isHillStation && totalRainLast48h > landslideThreshold;
    const severity = isLandslideRisk ? 'critical' : 'danger';
    const condition = isLandslideRisk
      ? `Landslide risk — ${totalRainLast48h.toFixed(0)}mm rain in 48hrs in hilly terrain`
      : `Flood risk — ${totalRainLast48h.toFixed(0)}mm accumulated rainfall in 48 hours`;

    return {
      alertType: 'flood_risk',
      severity,
      condition,
      data: { totalRainLast48h, isHillStation, isLandslideRisk }
    };
  } catch (err) {
    console.error('Flood check error:', err.message);
    return null;
  }
}

// ─── CHECK 3: Extreme heat ────────────────────────────────────────

async function checkExtremeHeat(destination, activityDate) {
  try {
    const coords = await geocodeCity(destination);
    if (!coords) return null;

    const apiKey = process.env.OPENWEATHER_API_KEY;
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=metric&cnt=8`;
    const res  = await axios.get(url, { timeout: 5000 });

    const targetDate = new Date(activityDate).toISOString().split('T')[0];
    const forecasts  = res.data.list.filter(f =>
      f.dt_txt.startsWith(targetDate)
    );

    if (forecasts.length === 0) return null;

    const maxTemp       = Math.max(...forecasts.map(f => f.main.temp));
    const maxFeelsLike  = Math.max(...forecasts.map(f => f.main.feels_like));
    const maxHumidity   = Math.max(...forecasts.map(f => f.main.humidity));
    const heatIndex     = maxFeelsLike + (maxHumidity > 60 ? (maxHumidity - 60) * 0.1 : 0);

    if (maxTemp < 40 && heatIndex < 45) return null;

    const severity  = heatIndex > 52 ? 'critical' : maxTemp > 45 ? 'danger' : 'warning';
    const condition = `Extreme heat — ${maxTemp.toFixed(0)}°C, feels like ${maxFeelsLike.toFixed(0)}°C with ${maxHumidity}% humidity`;

    return {
      alertType: 'extreme_heat',
      severity,
      condition,
      data: { maxTemp, maxFeelsLike, maxHumidity, heatIndex }
    };
  } catch (err) {
    console.error('Heat check error:', err.message);
    return null;
  }
}

// ─── CHECK 4: Poor air quality (AQI) ─────────────────────────────

async function checkAirQuality(destination) {
  try {
    const iqAirKey = process.env.IQAIR_API_KEY;
    if (!iqAirKey || iqAirKey === "your_key" || iqAirKey === "") {
      return null;
    }

    const cleanDest = destination.split(',')[0].trim();
    const coords = await geocodeCity(destination);

    let aqi, pollutant;
    if (coords) {
      // nearest_city needs no state name — works for any destination.
      const nearestUrl = `http://api.airvisual.com/v2/nearest_city?lat=${coords.lat}&lon=${coords.lon}&key=${iqAirKey}`;
      const nearest = await axios.get(nearestUrl, { timeout: 5000 });
      aqi       = nearest.data?.data?.current?.pollution?.aqius;
      pollutant = nearest.data?.data?.current?.pollution?.mainus;
    }

    if (!aqi) {
      const cityUrl = `http://api.airvisual.com/v2/city?city=${encodeURIComponent(cleanDest)}&state=&country=India&key=${iqAirKey}`;
      const res  = await axios.get(cityUrl, { timeout: 5000 });
      aqi       = res.data?.data?.current?.pollution?.aqius;
      pollutant = res.data?.data?.current?.pollution?.mainus;
    }

    if (!aqi || aqi < 150) return null;

    const severity  = aqi > 300 ? 'critical' : aqi > 200 ? 'danger' : 'warning';
    const aqiLabel  = aqi > 300 ? 'Hazardous' : aqi > 200 ? 'Very Unhealthy' : 'Unhealthy';
    const condition = `AQI ${aqi} — ${aqiLabel} air quality. Main pollutant: ${pollutant?.toUpperCase() || 'PM2.5'}`;

    return {
      alertType: 'poor_aqi',
      severity,
      condition,
      data: { aqi, pollutant, aqiLabel }
    };
  } catch (err) {
    console.error('AQI check error:', err.message);
    return null;
  }
}

// ─── CHECK 5: Place temporarily closed ───────────────────────────

async function checkPlaceClosed(placeName, destination, activityDate) {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return null;
    }

    const model  = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const date   = new Date(activityDate);
    const dayOfWeek = ['Sunday','Monday','Tuesday','Wednesday',
                       'Thursday','Friday','Saturday'][date.getDay()];
    const month  = date.getMonth() + 1;

    const prompt = `Is ${placeName} in ${destination} typically closed on ${dayOfWeek}?
Also check: does it close on specific Indian holidays or for maintenance?
Current month: ${month}

Respond ONLY with JSON:
{
  "isClosed": true | false,
  "reason": "Why it is closed — e.g. closed every Monday, closed for Holi" | null,
  "alternativeDay": "Which day to visit instead" | null,
  "confidence": "High | Medium | Low"
}

Only set isClosed: true if you are highly confident this place is ACTUALLY closed.
If uncertain, set isClosed: false.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text();
    text = text.replace(/```json/g,'').replace(/```/g,'').trim();
    
    const startBrace = text.indexOf('{');
    const endBrace = text.lastIndexOf('}');
    if (startBrace === -1 || endBrace === -1) {
      return null;
    }
    const parsed = JSON.parse(text.substring(startBrace, endBrace + 1));

    if (!parsed.isClosed || parsed.confidence === 'Low') return null;

    return {
      alertType: 'place_closed',
      severity:  'warning',
      condition: parsed.reason || `${placeName} may be closed on ${dayOfWeek}`,
      data: {
        reason: parsed.reason,
        alternativeDay: parsed.alternativeDay,
        confidence: parsed.confidence
      }
    };
  } catch (err) {
    console.error('Place closed check error:', err.message);
    return null;
  }
}

// ─── MASTER CHECK: Run all checks for one activity ────────────────

async function checkAllConditions(activity, destination, activityDate) {
  const [rainAlert, floodAlert, heatAlert, aqiAlert, closedAlert] =
    await Promise.allSettled([
      checkHeavyRain(destination, activityDate),
      checkFloodRisk(destination, activityDate),
      checkExtremeHeat(destination, activityDate),
      checkAirQuality(destination),
      checkPlaceClosed(activity.name, destination, activityDate)
    ]);

  const alerts = [
    rainAlert, floodAlert, heatAlert, aqiAlert, closedAlert
  ]
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  for (const alert of alerts) {
    alert.aiAdvice = await getAIAdvice(
      alert.alertType,
      activity.name,
      destination,
      alert.condition
    );
  }

  return alerts;
}

module.exports = { checkAllConditions, geocodeCity };
