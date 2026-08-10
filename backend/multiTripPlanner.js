const express = require("express");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const router = express.Router();

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const MW_KEY = process.env.OPENWEATHER_API_KEY;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ── date helpers ────────────────────────────────────────────────────────────
function parseDate(str) {
  if (!str) return null;
  const d = new Date(`${String(str).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function iso(d) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function daysBetween(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b || b < a) return null;
  return Math.floor((b - a) / MS_PER_DAY) + 1;
}
function dayAt(start, index) {
  const d = parseDate(start);
  if (!d) return "";
  return iso(new Date(d.getTime() + (index - 1) * MS_PER_DAY));
}

// ── geocoding (OpenWeather → Nominatim fallback) ────────────────────────────
async function geocode(place) {
  const city = String(place || "").split(",")[0].trim();
  // 1) OpenWeather — accept only if an India candidate is present.
  if (MW_KEY && MW_KEY !== "your_free_key_here" && MW_KEY !== "") {
    try {
      let url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=6&appid=${MW_KEY}`;
      let { data } = await axios.get(url, { timeout: 6000 });
      const pick = (Array.isArray(data) ? data : []).find((x) => String(x.country || "").toUpperCase() === "IN");
      if (!pick) {
        url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(`${city}, India`)}&limit=6&appid=${MW_KEY}`;
        ({ data } = await axios.get(url, { timeout: 6000 }));
      }
      const inPick = Array.isArray(data) ? data.find((x) => String(x.country || "").toUpperCase() === "IN") : null;
      const r = pick || inPick;
      if (r) {
        return {
          name: place,
          city: r.name || city,
          country: r.country || "",
          state: r.state || "",
          latitude: Number(r.lat) || null,
          longitude: Number(r.lon) || null,
        };
      }
    } catch (err) {
      console.warn("geocode (openweather) failed for", city, err.message);
    }
  }
  // 2) Nominatim fallback — good with Indian states/regions.
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${city}, India`)}&format=json&limit=1&countrycodes=in`;
    const { data } = await axios.get(url, {
      timeout: 7000,
      headers: { "User-Agent": "RoamSmart/1.0 (trip-planner)" },
    });
    if (Array.isArray(data) && data.length && data[0].lat && data[0].lon) {
      const parts = String(data[0].display_name || "").split(",");
      return {
        name: place,
        city: parts[0] ? parts[0].trim() : city,
        country: "India",
        state: data[0].address && data[0].address.state ? data[0].address.state : (parts.length > 2 ? parts[parts.length - 2].trim() : ""),
        latitude: Number(data[0].lat) || null,
        longitude: Number(data[0].lon) || null,
      };
    }
  } catch (err) {
    console.warn("geocode (nominatim) failed for", city, err.message);
  }
  return { name: place, city, country: "", state: "", latitude: null, longitude: null };
}

// ── weather ─────────────────────────────────────────────────────────────────
async function weatherFor(place) {
  try {
    if (!MW_KEY || MW_KEY === "your_free_key_here" || MW_KEY === "") {
      return { available: false, reason: "No weather API key configured" };
    }
    const geo = await geocode(place);
    if (!geo.latitude || !geo.longitude) return { available: false, reason: "Location not found" };
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${geo.latitude}&lon=${geo.longitude}&appid=${MW_KEY}&units=metric`;
    const { data: w } = await axios.get(url, { timeout: 6000 });
    const main = (w.weather && w.weather[0]) || {};
    return {
      available: true,
      condition: main.description || "clear sky",
      icon: main.icon || null,
      temperature: Math.round(w.main.temp),
      feelsLike: Math.round(w.main.feels_like || w.main.temp),
      humidity: w.main.humidity,
      windSpeed: w.wind ? w.wind.speed : 0,
      isRaining: ["Rain", "Drizzle", "Thunderstorm"].includes(main.main),
      isExtreme: ["Thunderstorm", "Tornado", "Squall"].includes(main.main),
      isClear: main.main === "Clear",
    };
  } catch (err) {
    console.warn("weatherFor failed:", err.message);
    return { available: false, reason: "Weather service unavailable" };
  }
}

// ── distance / route ────────────────────────────────────────────────────────
function haversineKm(a, b) {
  if (!a || !b || !a.latitude || !a.longitude || !b.latitude || !b.longitude) return null;
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function osrmRoute(a, b) {
  if (!a || !b || !a.latitude || !a.longitude || !b.latitude || !b.longitude) return null;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=false`;
    const { data } = await axios.get(url, { timeout: 8000 });
    if (data && data.code === "Ok" && data.routes && data.routes[0]) {
      return { distanceKm: Math.round(data.routes[0].distance / 1000), driveMinutes: Math.round(data.routes[0].duration / 60) };
    }
  } catch (err) {
    // fall through to haversine below
  }
  return null;
}

function travelModesFor(km) {
  const kmAbs = Number(km) || 0;
  const inr = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const dur = (speed, buffer = 0) => {
    const min = kmAbs ? Math.round((kmAbs / speed) * 60) + buffer : 15;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h} hr ${m} min` : `${m} min`;
  };
  const modes = [];
  if (kmAbs <= 200) {
    modes.push({ mode: "car", name: "Drive / Cab", duration: dur(45), estimatedCost: inr(kmAbs * 9) });
    modes.push({ mode: "bus", name: "Volvo / State transport bus", duration: dur(50), estimatedCost: inr(kmAbs * 1.2) });
    modes.push({ mode: "train", name: "Short-hop train", duration: dur(65, 20), estimatedCost: inr(kmAbs) });
  } else if (kmAbs <= 600) {
    modes.push({ mode: "bus", name: "AC sleeper / Volvo bus", duration: dur(55), estimatedCost: inr(kmAbs * 1.4) });
    modes.push({ mode: "train", name: "Train", duration: dur(60, 30), estimatedCost: inr(kmAbs * 1.1) });
    modes.push({ mode: "car", name: "Drive / Road trip", duration: dur(55), estimatedCost: inr(kmAbs * 9) });
    modes.push({ mode: "flight", name: "Flight", duration: `${2 + Math.round(kmAbs / 600)} hr (incl. airport time)`, estimatedCost: inr(Math.max(1600, kmAbs * 3.2)) });
  } else {
    modes.push({ mode: "flight", name: "Flight", duration: `${2 + Math.round(kmAbs / 750)} hr (incl. airport time)`, estimatedCost: inr(Math.max(2200, kmAbs * 3.2)) });
    modes.push({ mode: "train", name: "Express train", duration: dur(65, 30), estimatedCost: inr(kmAbs * 1.1) });
  }
  return modes;
}

// ── JSON cleaning ───────────────────────────────────────────────────────────
function cleanAndParseJson(text) {
  let cleaned = String(text).replace(/```json/g, "").replace(/```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Gemini response did not include a JSON object.");
  }
  cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(cleaned);
}

async function callGemini(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  return cleanAndParseJson(result.response.text());
}

function safeList(v) {
  return Array.isArray(v) ? v : [];
}

function cityKey(name) {
  return String(name || "").split(",")[0].trim().toLowerCase();
}

// ── prompt ──────────────────────────────────────────────────────────────────
function buildMultiTripPrompt(payload, totalNights) {
  const {
    startLocation, endLocation, destinations, numTravellers, travellerType,
    budgetLevel, interests, dietaryPreference, accommodationType, specialRequests,
    startDate, endDate,
  } = payload;
  const interestsText = Array.isArray(interests) ? interests.join(", ") : interests;

  const destBlock = destinations
    .map((d, i) => {
      const leg = d.leg && d.leg.from ? d.leg : null;
      return `DESTINATION ${i + 1}: ${d.name}
- Arrival: ${d.arrivalDate}  Departure: ${d.departureDate}  (${d.days || 1} days / ${d.nights || 1} nights)
- Reach here by: ${leg ? `${leg.transport} from ${leg.from}` : i === 0 ? `from ${startLocation}` : "from the previous destination"}
- Notes: ${d.notes || "None"}`;
    })
    .join("\n");

  return `You are an expert Indian travel planner with 20 years of experience planning
multi-destination trips across every state of India.

Plan a complete multi-city tour. Every hotel, restaurant and attraction MUST be real
and actually exist at that destination — never invent names.

TRIP OVERVIEW:
- Travellers: ${numTravellers} ${travellerType || "unspecified"}
- Budget level: ${budgetLevel || "unspecified"}
- Interests: ${interestsText || "unspecified"}
- Dietary preference: ${dietaryPreference || "No preference"}
- Accommodation preference: ${accommodationType || "No preference"}
- Special requests: ${specialRequests || "None"}
- Overall trip: ${startDate} to ${endDate} (${totalNights} nights)
- Route start: ${startLocation}
- Route end: ${endLocation || startLocation}

DESTINATIONS (in route order):
${destBlock}

RULES:
1. Every place, hotel and restaurant must be REAL. No invented names.
2. Day-by-day activities appear under each destination EXACTLY for its number of days.
   Use GLOBAL day numbering across the whole trip (day 1, 2, 3 ...).
3. Each destination's days must cover only the attractions for THAT destination.
4. Food must strictly match the dietary preference.
5. All budget numbers in Indian Rupees (INR), realistic for today.
6. Give each destination top places, restaurants, hotels, activities, hidden gems and local experiences.
7. Keep "dayStartGlobal" equal to the first global day number of that destination.

Respond ONLY with valid JSON. No markdown. No code fences. No extra text. Start with { and end with }.

{
  "title": "Creative evocative title for this whole journey",
  "subtitle": "One memorable line about the multi-city journey",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "destinations": [
    {
      "name": "Name of destination 1 (as given)",
      "country": "",
      "state": "",
      "arrivalDate": "ISO date",
      "departureDate": "ISO date",
      "nights": 3,
      "tagline": "One-line description of this stop",
      "dayStartGlobal": 1,
      "recommendations": {
        "topPlaces": ["Real place 1", "Real place 2", "Real place 3"],
        "attractions": ["Real attraction 1", "Real attraction 2"],
        "restaurants": ["Real restaurant + what to order"],
        "hotels": ["Real hotel name"],
        "hiddenGems": ["Hidden gem 1"],
        "activities": ["Activity 1", "Activity 2"],
        "localExperiences": ["Local experience 1"]
      },
      "days": [
        {
          "day": 1,
          "theme": "Day theme at this destination",
          "localSecret": "One concrete local secret",
          "activities": [
            { "time": "9:00 AM", "name": "Exact real place", "description": "2-3 sentences", "type": "visit | food | travel | hotel | activity", "estimatedCost": "₹X or Free" }
          ]
        }
      ]
    }
  ],
  "budget": {
    "accommodation": "₹X–Y",
    "transportation": "₹X–Y",
    "food": "₹X–Y",
    "activities": "₹X–Y",
    "entryFees": "₹X–Y",
    "shopping": "₹X–Y",
    "miscellaneous": "₹X–Y",
    "grandTotal": "₹X–Y"
  },
  "perDestinationBudget": {
    "Goa": "₹12,000",
    "Gokarna": "₹7,000"
  },
  "tips": ["tip 1", "tip 2", "tip 3", "tip 4", "tip 5"],
  "bestTimeToVisit": "Specific months + reason",
  "emergencyNumbers": { "police": "100", "ambulance": "108", "touristHelpline": "1363" }
}`;
}

// ── normalization ───────────────────────────────────────────────────────────
function normalizeItinerary(raw, payload, geoMap, weatherMap, legs, travelBudget) {
  const startDate = payload.startDate;
  const totalDays = Math.max(1, payload.totalNights || (daysBetween(startDate, payload.endDate) - 1) || 1);
  const rawDests = safeList(raw.destinations).filter((d) => d && d.name);

  const destinations = rawDests.map((d, idx) => {
    const key = cityKey(d.name);
    const input = payload.destinations.find((p) => cityKey(p.name) === key) || {};
    const geo = geoMap[input.name] || { latitude: null, longitude: null };
    const rec = d.recommendations || {};
    const destCount = Number(input.days) || (Array.isArray(d.days) ? d.days.length : Number(d.days)) || 1;
    return {
      id: input.id || d.name,
      name: d.name,
      country: d.country || geo.country || "",
      state: d.state || geo.state || "",
      latitude: geo.latitude,
      longitude: geo.longitude,
      arrivalDate: input.arrivalDate || d.arrivalDate || dayAt(startDate, 1),
      departureDate: input.departureDate || d.departureDate || "",
      days: destCount,
      nights: destCount,
      dayPlans: safeList(d.days),
      tagline: d.tagline || `Stop ${idx + 1} of this journey`,
      dayStartGlobal: Number(d.dayStartGlobal) || 0,
      transport: input.transport || (input.leg ? input.leg : null),
      estimatedBudget: (raw.perDestinationBudget || {})[d.name] || "—",
      recommendations: {
        topPlaces: safeList(rec.topPlaces),
        attractions: safeList(rec.attractions),
        restaurants: safeList(rec.restaurants),
        hotels: safeList(rec.hotels),
        hiddenGems: safeList(rec.hiddenGems),
        activities: safeList(rec.activities),
        localExperiences: safeList(rec.localExperiences),
      },
      weather: weatherMap[input.name] || { available: false },
      notes: input.notes || "",
      image: null,
    };
  });

  // Flatten into global days. Destination i occupies slots [cumPrev, cumPrev + days).
  const globalDays = [];
  let cursor = 1;
  destinations.forEach((d) => {
    const start = cursor;
    const localDays = safeList(d.dayPlans);
    const inputFor = (payload.destinations || []).find((p) => cityKey(p.name) === cityKey(d.name)) || {};
    const count = Number(inputFor.days) || localDays.length || 1;
    localDays
      .sort((a, b) => Number(a.day || a.dayNumber) - Number(b.day || b.dayNumber))
      .forEach((day, i) => {
        const n = start + i;
        if (n > totalDays) return;
        globalDays.push({
          day: n,
          destination: d.name,
          date: dayAt(startDate, n),
          theme: day.theme || `Explore ${d.name}`,
          localSecret: day.localSecret || "",
          activities: safeList(day.activities).map((a, ai) => ({
            time: a.time || "10:00 AM",
            name: a.name || a.title || `Activity ${ai + 1}`,
            description: a.description || "",
            type: a.type || "activity",
            estimatedCost: a.estimatedCost || a.estimate || "Free",
          })),
        });
      });
    cursor = start + Math.max(count, localDays.length);
  });

  if (globalDays.length < totalDays) {
    const lastDest = destinations[destinations.length - 1];
    for (let n = globalDays.length + 1; n <= totalDays; n += 1) {
      globalDays.push({
        day: n,
        destination: (lastDest && lastDest.name) || (destinations[0] && destinations[0].name) || "",
        date: dayAt(startDate, n),
        theme: "Leisure & local exploration",
        localSecret: "",
        activities: [{ time: "10:00 AM", name: "Local highlights", description: "Leisurely explore the area at your own pace.", type: "activity", estimatedCost: "Free" }],
      });
    }
  }

  const budget = {
    accommodation: raw.budget?.accommodation || "—",
    transportation: raw.budget?.transportation || travelBudget,
    food: raw.budget?.food || "—",
    activities: raw.budget?.activities || "—",
    entryFees: raw.budget?.entryFees || "—",
    shopping: raw.budget?.shopping || "—",
    miscellaneous: raw.budget?.miscellaneous || "—",
    grandTotal: raw.budget?.grandTotal || "—",
  };

  const howToReach = raw.howToReach || {
    mode: legs[0] && legs[0].modes[0] ? legs[0].modes[0].name : "Local transport",
    description: `Start from ${payload.startLocation} and make your way to ${destinations[0]?.name || "your first stop"}.`,
    duration: legs[0] ? legs[0].travelTime : "—",
    estimatedCost: legs[0] && legs[0].modes[0] ? legs[0].modes[0].estimatedCost : "—",
  };

  return {
    tripType: "multi",
    title: raw.title || `${destinations.map((d) => d.name).join(" → ")}`,
    subtitle: raw.subtitle || `A ${totalDays}-day journey through ${destinations.length} destination${destinations.length === 1 ? "" : "s"}`,
    tags: safeList(raw.tags).length ? safeList(raw.tags).slice(0, 4) : ["MULTI-DESTINATION", payload.budgetLevel || "FLEXIBLE"],
    destinations,
    days: globalDays,
    hotels: safeList(raw.hotels),
    restaurants: safeList(raw.restaurants),
    budget,
    perDestinationBudget: raw.perDestinationBudget || {},
    tips: safeList(raw.tips),
    bestTimeToVisit: raw.bestTimeToVisit || "October – March for most of India",
    emergencyNumbers: raw.emergencyNumbers || { police: "100", ambulance: "108", touristHelpline: "1363" },
    howToReach,
    travelLegs: legs,
    totalDistanceKm: legs.reduce((s, l) => s + (l.distanceKm || 0), 0),
    startLocation: payload.startLocation,
    endLocation: payload.endLocation || payload.startLocation,
  };
}

// ── route optimisation (nearest neighbour) ──────────────────────────────────
function optimizeOrder(dests, geoMap, startKey) {
  if (dests.length < 3) return dests;
  const pts = dests.slice();
  const startGeo = geoMap[startKey];
  const dist = (a, b) => {
    const ga = geoMap[a.name] || {};
    const gb = geoMap[b.name] || {};
    if (startGeo && !ga.latitude && !ga.longitude) {
      // treat unknown as distance from start
    }
    return haversineKm(ga, gb) ?? 0;
  };
  let current = startGeo || {};
  const out = [];
  while (pts.length) {
    let best = null;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const gp = geoMap[p.name] || {};
      const d = haversineKm(current, gp) ?? Infinity;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best == null) break;
    out.push(pts.splice(best, 1)[0]);
    current = geoMap[out[out.length - 1].name] || current;
  }
  return out;
}

// ── route ───────────────────────────────────────────────────────────────────
router.post("/api/plan-multi-trip", async (req, res) => {
  try {
    const body = req.body || {};
    const destinations = Array.isArray(body.destinations) ? body.destinations : [];

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
      return res.status(500).json({ error: "Add your Gemini API key to backend/.env and restart the server." });
    }
    if (destinations.length === 0) {
      return res.status(400).json({ error: "Add at least one destination." });
    }
    if (!body.startDate || !body.endDate || !daysBetween(body.startDate, body.endDate)) {
      return res.status(400).json({ error: "Please choose a valid start and end date." });
    }
    if (!body.startLocation || !String(body.startLocation).trim()) {
      return res.status(400).json({ error: "Starting location is required." });
    }

    // Geocode every destination + start/end.
    const allPlaces = [
      body.startLocation,
      ...(body.endLocation && body.endLocation !== body.startLocation ? [body.endLocation] : []),
      ...destinations.map((d) => d.name),
    ];
    const geoMap = {};
    await Promise.all(
      [...new Set(allPlaces)].map(async (place) => {
        geoMap[place] = await geocode(place);
      })
    );

    // Weather for each destination.
    const weatherMap = {};
    await Promise.all(
      destinations.map(async (d) => {
        weatherMap[d.name] = await weatherFor(d.name);
      })
    );

    // Build route: start -> d0 -> d1 -> ... -> end.
    const routePoints = [
      { label: body.startLocation, geo: geoMap[body.startLocation] || {} },
      ...destinations.map((d) => ({ label: d.name, geo: geoMap[d.name] || {} })),
      ...(body.endLocation && body.endLocation !== body.startLocation ? [{ label: body.endLocation, geo: geoMap[body.endLocation] || {} }] : []),
    ];

    const legs = [];
    for (let i = 0; i < routePoints.length - 1; i += 1) {
      const from = routePoints[i];
      const to = routePoints[i + 1];
      const osm = await osrmRoute(from.geo, to.geo);
      let km = osm ? osm.distanceKm : haversineKm(from.geo, to.geo);
      let travelTime = osm ? formatTravelTime(osm.driveMinutes) : null;
      const modes = travelModesFor(km || 0);
      // Attach chosen transport to the matching destination leg.
      const destIdx = i - 1;
      const chosen = destIdx >= 0 ? destinations[destIdx].transport : null;
      const primary = (chosen && modes.find((m) => m.mode === chosen)) || modes[0] || travelModesFor(0)[0];
      legs.push({
        from: from.label,
        to: to.label,
        distanceKm: km ? Math.round(km) : null,
        travelTime,
        modes,
        transport: chosen || (primary ? primary.mode : null),
        selected: primary ? primary : null,
        id: destIdx >= 0 ? destinations[destIdx].id : null,
      });
      if (destIdx >= 0) {
        destinations[destIdx].leg = {
          from: from.label,
          km: km ? Math.round(km) : null,
          transport: chosen || (primary ? primary.mode : null),
        };
      }
    }

    // Travel budget estimate across all legs (per person, cheapest-of-modes).
    const travelBudget = legs
      .reduce((s, l) => {
        if (!l.modes || !l.modes.length) return s;
        const costs = l.modes.map((m) => parseInt(String(m.estimatedCost).replace(/[^0-9]/g, ""), 10) || 0);
        return s + Math.min(...costs);
      }, 0);
    const travelBudgetText = travelBudget ? `₹${travelBudget.toLocaleString("en-IN")}-style estimate across all legs` : "—";

    const totalNights = Math.max(1, (daysBetween(body.startDate, body.endDate) || 1) - 1);
    const prompt = buildMultiTripPrompt({ ...body, destinations, totalNights }, totalNights);
    let raw;
    try {
      raw = await callGemini(prompt);
    } catch (firstErr) {
      raw = await callGemini(prompt);
    }

    const itinerary = normalizeItinerary(raw, { ...body, totalNights }, geoMap, weatherMap, legs, travelBudgetText);
    return res.json(itinerary);
  } catch (error) {
    console.error("Multi-trip generation failed:", error);
    return res.status(500).json({ error: "Could not generate multi-destination itinerary. Please try again." });
  }
});

// on-demand weather for a destination (used by the weather cards)
router.get("/api/weather/:place", async (req, res) => {
  try {
    const result = await weatherFor(req.params.place);
    return res.json(result);
  } catch (err) {
    console.error("Weather fetch failed:", err.message);
    return res.status(500).json({ available: false, reason: "Weather service unavailable" });
  }
});

// route optimisation helper (returns a suggested order + savings estimate)
router.post("/api/route-optimize", async (req, res) => {
  try {
    const { startLocation, destinations } = req.body || {};
    const dests = Array.isArray(destinations) ? destinations : [];
    if (dests.length < 3) {
      return res.json({ suggested: dests, currentDistance: 0, suggestedDistance: 0, savingsKm: 0, reason: "Not enough destinations to optimise." });
    }
    const allPlaceKeys = [startLocation, ...dests.map((d) => d.name)];
    const geoMap = {};
    await Promise.all(
      [...new Set(allPlaceKeys)].map(async (place) => {
        geoMap[place] = await geocode(place);
      })
    );
    const currentDist = routeDistance(dests, geoMap, startLocation);
    const suggested = optimizeOrder(dests.map((d) => ({ ...d })), geoMap, startLocation);
    const suggDist = suggested.length === dests.length ? routeDistance(suggested, geoMap, startLocation) : currentDist;
    const savingsKm = Math.max(0, Math.round(currentDist - suggDist));
    const reason =
      suggested.length === dests.length && savingsKm > 20
        ? `Reordering the route reduces roughly ${savingsKm} km of unnecessary travel.`
        : "The route order is already fairly efficient.";
    return res.json({ suggested, currentDistance: Math.round(currentDist), suggestedDistance: Math.round(suggDist), savingsKm, reason });
  } catch (err) {
    console.error("Route optimisation failed:", err.message);
    return res.status(500).json({ error: "Could not optimise the route." });
  }
});

function routeDistance(dests, geoMap, startLocation) {
  let total = 0;
  let prev = geoMap[startLocation] || {};
  dests.forEach((d) => {
    const cur = geoMap[d.name] || {};
    total += haversineKm(prev, cur) || 0;
    prev = cur;
  });
  return total;
}

function formatTravelTime(minutes) {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

module.exports = router;