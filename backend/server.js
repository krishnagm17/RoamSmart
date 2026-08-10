require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const requiredFields = [
  "destination",
  "startDate",
  "endDate",
  "departureCity",
  "numTravellers",
  "travellerType",
  "budgetLevel",
  "interests"
];

function calculateDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((end - start) / msPerDay) + 1;
}

function cleanAndParseJson(text) {
  let cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Gemini response did not include a JSON object.");
  }

  cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(cleaned);
}

function buildTripPrompt(data, days) {
  const {
    destination,
    startDate,
    endDate,
    departureCity,
    numTravellers,
    travellerType,
    budgetLevel,
    interests,
    dietaryPreference,
    accommodationType,
    specialRequests
  } = data;

  const interestsText = Array.isArray(interests) ? interests.join(", ") : interests;

  return `You are an expert Indian travel planner with 20 years of experience planning 
trips across every state in India.

Plan a complete trip to ${destination} for ${numTravellers} ${travellerType} 
travelling from ${departureCity}.

Trip duration: ${startDate} to ${endDate} (${days} days)
Budget level: ${budgetLevel}
Interests: ${interestsText}
Dietary preference: ${dietaryPreference || "No preference specified"}
Accommodation preference: ${accommodationType || "No preference specified"}
Special requests: ${specialRequests || "None"}

STRICT RULES — you must follow every one of these:
1. Every hotel, restaurant, and attraction must be REAL and actually exist at the destination. Do not invent names.
2. Food and restaurant recommendations must strictly match the dietary preference — if vegetarian, recommend NO non-veg dishes.
3. Hotels must match the budget level — budget means guesthouses/hostels, luxury means 5-star resorts.
4. Activity intensity must suit the traveller type — senior citizens get easy, accessible activities only.
5. Each day must have a logical geographic flow — group nearby places together, avoid sending travellers back and forth across the city.
6. Travel time between places must be realistic — do not schedule two places 1 hour apart back to back with no buffer.
7. Include specific local dishes, street food spots, local markets, and hidden gems — not just famous tourist traps.
8. All budget estimates must be realistic, current, and in Indian Rupees (INR).
9. Include how to travel from ${departureCity} to ${destination} with realistic options and costs.
10. For each day include one "local secret" — something most tourists miss that locals love.
11. Limit to ${days} days exactly — do not add extra days.
12. For family with kids, include child-friendly activities and avoid late-night plans.

You MUST respond ONLY with a valid JSON object. 
No markdown. No code fences. No explanation. No extra text before or after.
Start your response with { and end with }

Use this exact JSON structure:

{
  "title": "Creative and evocative trip title specific to this destination",
  "subtitle": "One memorable line capturing the spirit of this trip",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "howToReach": {
    "mode": "Flight / Train / Bus / Road",
    "description": "Specific trains or flights or routes from departure city",
    "duration": "Approximate travel time",
    "estimatedCost": "₹X–Y per person"
  },
  "days": [
    {
      "day": 1,
      "theme": "Descriptive theme name for this day",
      "localSecret": "One specific tip that most tourists miss — be concrete",
      "activities": [
        {
          "time": "9:00 AM",
          "name": "Exact name of place or activity",
          "description": "2–3 sentences — what to see, what to do, one practical tip",
          "type": "visit | food | travel | hotel | activity",
          "estimatedCost": "₹X per person or Free"
        }
      ]
    }
  ],
  "hotels": [
    {
      "name": "Exact real hotel name",
      "area": "Specific locality or area",
      "stars": 3,
      "pricePerNight": "₹2,500–3,500",
      "whyRecommended": "One specific reason matching this traveller type and budget"
    }
  ],
  "restaurants": [
    {
      "name": "Exact real restaurant name",
      "area": "Area or locality",
      "cuisine": "Cuisine type",
      "mustTry": "Specific dish name",
      "priceForTwo": "₹X–Y"
    }
  ],
  "budget": {
    "accommodation": "₹X–Y total for all nights",
    "food": "₹X–Y per day per person",
    "localTransport": "₹X–Y total for the trip",
    "activities": "₹X–Y total",
    "travelToDestination": "₹X–Y per person one way",
    "grandTotal": "₹X–Y for the entire trip for all travellers"
  },
  "tips": [
    "Practical tip 1 — specific to this destination, not generic",
    "Practical tip 2",
    "Practical tip 3",
    "Practical tip 4",
    "Practical tip 5"
  ],
  "bestTimeToVisit": "Specific months and the reason why",
  "emergencyNumbers": {
    "police": "100",
    "ambulance": "108",
    "touristHelpline": "1363"
  }
}`;
}

async function generateTripPlan(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  return cleanAndParseJson(text);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/plan-trip", async (req, res) => {
  try {
    const missingField = requiredFields.find((field) => {
      const value = req.body[field];
      return Array.isArray(value) ? value.length === 0 : !value;
    });

    if (missingField) {
      return res.status(400).json({ error: `Missing required field: ${missingField}` });
    }

    const days = calculateDays(req.body.startDate, req.body.endDate);
    if (!days) {
      return res.status(400).json({ error: "Please choose a valid start and end date." });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
      return res.status(500).json({ error: "Add your Gemini API key to backend/.env and restart the server." });
    }

    const prompt = buildTripPrompt(req.body, days);

    try {
      const itinerary = await generateTripPlan(prompt);
      return res.json(itinerary);
    } catch (_firstError) {
      const itinerary = await generateTripPlan(prompt);
      return res.json(itinerary);
    }
  } catch (error) {
    console.error("Trip generation failed:", error);
    return res.status(500).json({ error: "Could not generate itinerary. Please try again." });
  }
});

function buildVerificationPrompt(itinerary, userInputs) {
  const {
    destination,
    dietaryPreference,
    budgetLevel,
    travellerType,
    numTravellers,
    interests,
    accommodationType,
    startDate,
    endDate,
    departureCity,
    tripType,
    startLocation,
    destinations
  } = userInputs;

  const isMulti = tripType === "multi" || (Array.isArray(destinations) && destinations.length > 0);
  const interestsText = Array.isArray(interests) ? interests.join(", ") : interests;

  const destinationText = isMulti
    ? (Array.isArray(destinations) ? destinations.map((d) => d.name).join(" → ") : "Multi-city route")
    : destination;
  const departureText = isMulti ? startLocation || departureCity : departureCity;

  return `You are a senior Indian travel expert and quality auditor with 25 years 
of experience. You have been given an AI-generated travel itinerary to review.

ITINERARY TO REVIEW:
${JSON.stringify(itinerary, null, 2)}

USER REQUIREMENTS:
- Destination: ${destinationText}
- Dietary preference: ${dietaryPreference}
- Budget level: ${budgetLevel}
- Traveller type: ${travellerType}
- Number of travellers: ${numTravellers}
- Interests: ${interestsText}
- Accommodation type: ${accommodationType || "No preference specified"}
- Travel dates: ${startDate} to ${endDate}
- Departing from: ${departureText}

${isMulti ? `- This is a MULTI-DESTINATION trip. Verify that:
   1. Every day's activities belong to the correct destination for that leg.
   2. The route order and travel legs between stops are geographically logical.
   3. Budget figures account for travel between destinations, not just within one city.
` : ""}

YOUR JOB:
Carefully analyse this itinerary and score it across exactly these 
8 dimensions. Be strict and honest — do not give high scores unless 
the itinerary genuinely deserves them.

SCORING DIMENSIONS (each out of 100):

1. PLACE ACCURACY (0–100)
   Are the hotels, restaurants, and attractions real and accurate?
   Do they actually exist at this destination?
   Deduct heavily for any made-up or unverifiable names.

2. DIETARY COMPLIANCE (0–100)
   Do all food and restaurant recommendations strictly match 
   the user's dietary preference?
   Deduct 30 points for every violation found.

3. BUDGET MATCH (0–100)
   Do the hotel tier, restaurants, and activities match the 
   stated budget level?
   Are the INR estimates realistic for current prices?

4. GEOGRAPHIC LOGIC (0–100)
   Does each day group nearby places together?
   Is the geographic flow logical and time-efficient?
   Are travel times between places realistic?

5. TRAVELLER SUITABILITY (0–100)
   Are activities appropriate for the traveller type?
   (e.g. senior citizens should not have strenuous hikes,
   families with kids need child-friendly options,
   solo travellers need safety considerations)

6. INTEREST ALIGNMENT (0–100)
   Does the itinerary reflect the user's stated interests?
   If user selected "Food & Street Food" does the plan 
   include enough food experiences?

7. PRACTICAL COMPLETENESS (0–100)
   Does the plan include:
   - How to reach the destination?
   - Local transport between places?
   - Realistic time buffers between activities?
   - Opening hours awareness?
   - Emergency contacts?

8. LOCAL AUTHENTICITY (0–100)
   Does the plan go beyond obvious tourist traps?
   Does it include local hidden gems, authentic experiences,
   specific dish names, local markets?
   Or is it just a generic tourist checklist?

RESPONSE FORMAT:
Respond ONLY with a valid JSON object.
No markdown. No code fences. No extra text.
Start with { and end with }

{
  "overallScore": 87,
  "grade": "A",
  "verdict": "One sentence overall verdict about this itinerary",
  "dimensions": [
    {
      "id": "place_accuracy",
      "label": "Place Accuracy",
      "score": 90,
      "maxScore": 100,
      "status": "pass | warn | fail",
      "comment": "Specific observation — what is good or what is wrong",
      "icon": "ti-map-pin"
    },
    {
      "id": "dietary_compliance",
      "label": "Dietary Compliance",
      "score": 100,
      "maxScore": 100,
      "status": "pass | warn | fail",
      "comment": "Specific observation",
      "icon": "ti-salad"
    },
    {
      "id": "budget_match",
      "label": "Budget Match",
      "score": 80,
      "maxScore": 100,
      "status": "pass | warn | fail",
      "comment": "Specific observation",
      "icon": "ti-coin"
    },
    {
      "id": "geographic_logic",
      "label": "Geographic Logic",
      "score": 75,
      "maxScore": 100,
      "status": "pass | warn | fail",
      "comment": "Specific observation",
      "icon": "ti-route"
    },
    {
      "id": "traveller_suitability",
      "label": "Traveller Suitability",
      "score": 95,
      "maxScore": 100,
      "status": "pass | warn | fail",
      "comment": "Specific observation",
      "icon": "ti-users"
    },
    {
      "id": "interest_alignment",
      "label": "Interest Alignment",
      "score": 85,
      "maxScore": 100,
      "status": "pass | warn | fail",
      "comment": "Specific observation",
      "icon": "ti-heart"
    },
    {
      "id": "practical_completeness",
      "score": 70,
      "maxScore": 100,
      "status": "pass | warn | fail",
      "comment": "Specific observation",
      "icon": "ti-checklist"
    },
    {
      "id": "local_authenticity",
      "label": "Local Authenticity",
      "score": 88,
      "maxScore": 100,
      "status": "pass | warn | fail",
      "comment": "Specific observation",
      "icon": "ti-sparkles"
    }
  ],
  "flags": [
    {
      "severity": "error | warning | info",
      "message": "Specific problem found in the itinerary",
      "fix": "Specific suggestion to fix this problem"
    }
  ],
  "strengths": [
    "Specific strength 1 of this itinerary",
    "Specific strength 2",
    "Specific strength 3"
  ],
  "improvements": [
    "Specific improvement 1 that would make this itinerary better",
    "Specific improvement 2",
    "Specific improvement 3"
  ]
}

Grade scale:
90–100 = A (Excellent)
80–89  = B (Good)
70–79  = C (Average)
60–69  = D (Below Average)
below 60 = F (Poor — major issues found)

Status scale per dimension:
90–100 = pass (green)
70–89  = warn (amber)
below 70 = fail (red)
`;
}

async function verifyItineraryPlan(prompt) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  return cleanAndParseJson(text);
}

app.post("/api/verify-itinerary", async (req, res) => {
  try {
    const { itinerary, userInputs } = req.body;
    if (!itinerary || !userInputs) {
      return res.status(400).json({ error: "Itinerary and userInputs are required." });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
      return res.status(500).json({ error: "Add your Gemini API key to backend/.env and restart the server." });
    }

    const prompt = buildVerificationPrompt(itinerary, userInputs);

    try {
      const verificationResult = await verifyItineraryPlan(prompt);
      return res.json(verificationResult);
    } catch (_firstError) {
      const verificationResult = await verifyItineraryPlan(prompt);
      return res.json(verificationResult);
    }
  } catch (error) {
    console.error("Itinerary verification failed:", error);
    return res.status(500).json({ error: "Could not verify itinerary. Please try again." });
  }
});


// ── Landmark Identification ──────────────────────────────────────────────────

app.post("/api/identify-landmark", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded." });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
      return res.status(500).json({ error: "Add your Gemini API key to backend/.env and restart the server." });
    }

    const base64Image = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const prompt = `You are an expert travel guide and landmark identification system.
Look at this image carefully and identify the landmark, monument, building, 
or tourist place shown.

If you can identify it, respond with a JSON object containing:
{
  "identified": true,
  "name": "Exact name of the landmark",
  "location": "City, State, Country",
  "type": "Monument | Temple | Fort | Palace | Church | Mosque | Natural Wonder | Museum | Heritage Site | Other",
  "description": "2-3 sentences describing what this place is",
  "history": "Brief history in 2-3 sentences",
  "architecture": "Architectural style and notable features (if applicable, else null)",
  "significance": "Cultural or historical significance in 1-2 sentences",
  "visiting_tips": "Practical tips for visitors in 1-2 sentences",
  "best_time_to_visit": "Best months or season to visit",
  "entry_fee": "Entry fee information or 'Free'",
  "timings": "Opening hours or 'Open 24 hours'",
  "fun_facts": ["Interesting fact 1", "Interesting fact 2", "Interesting fact 3"],
  "nearby_attractions": ["Nearby place 1", "Nearby place 2", "Nearby place 3"]
}

If you CANNOT identify the landmark, respond with:
{
  "identified": false,
  "error": "Brief explanation of why identification failed"
}

Respond ONLY with a valid JSON object. No markdown. No code fences.
Start with { and end with }`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      }
    ]);

    const text = result.response.text();
    const parsed = cleanAndParseJson(text);
    return res.json(parsed);
  } catch (error) {
    console.error("Landmark identification failed:", error);
    return res.status(500).json({ identified: false, error: "Could not identify landmark. Please try again." });
  }
});


app.post("/api/chat", async (req, res) => {
  try {
    const { itinerary, question, history = [] } = req.body;

    if (!itinerary || !question) {
      return res.status(400).json({ error: "Itinerary and question are required." });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
      return res.status(500).json({ error: "Add your Gemini API key to backend/.env and restart the server." });
    }

    const priorMessages = Array.isArray(history) && history.length
      ? `\n\nRecent conversation:\n${history.map((item) => `${item.role}: ${item.text}`).join("\n")}`
      : "";

    const prompt = `You are a helpful travel assistant. The user has the following trip itinerary:
${JSON.stringify(itinerary, null, 2)}
${priorMessages}

Answer this question about their trip in a friendly, helpful, and concise way:
${question}`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    return res.json({ answer });
  } catch (error) {
    console.error("Chat failed:", error);
    return res.status(500).json({ error: "Could not answer that question. Please try again." });
  }
});

// ── Caption Generation ───────────────────────────────────────────────────────

app.post("/api/generate-caption", async (req, res) => {
  try {
    const { placeName, placeLocation } = req.body;
    if (!placeName) {
      return res.status(400).json({ error: "placeName is required." });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
      return res.status(500).json({ error: "Add your Gemini API key to backend/.env and restart the server." });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `Write a short, vivid, engaging 2-sentence travel caption for a photo taken at ${placeName}${placeLocation ? `, ${placeLocation}` : ""}.
Make it personal, inspiring, and evocative — like something a passionate traveller would write.
Respond with ONLY the caption text. No quotes. No extra text.`;

    const result = await model.generateContent(prompt);
    const caption = result.response.text().trim();
    return res.json({ caption });
  } catch (error) {
    console.error("Caption generation failed:", error);
    return res.status(500).json({ error: "Could not generate caption. Please try again." });
  }
});


// ── Crowd Prediction Caching & Context ───────────────────────────────────────

const predictionCache = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getIndianHolidayContext(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = date.getDay();

  const holidays = [
    { month: 1,  day: 26, name: "Republic Day — extremely high crowds at monuments" },
    { month: 8,  day: 15, name: "Independence Day — very high crowds at national sites" },
    { month: 10, day: 2,  name: "Gandhi Jayanti — moderate crowds" },
    { month: 11, day: 1,  name: "Diwali period — high crowds at markets and temples" },
    { month: 3,  day: 25, name: "Holi period — high crowds, some places closed" },
    { month: 4,  day: 14, name: "Baisakhi and Tamil New Year — regional high crowds" },
    { month: 10, day: 24, name: "Dussehra period — high crowds at open grounds" },
    { month: 12, day: 25, name: "Christmas — high crowds at tourist areas" },
    { month: 1,  day: 1,  name: "New Year — very high crowds everywhere" }
  ];

  const festivals = [
    { months: [10, 11], name: "Navratri-Diwali season — peak tourist season across India" },
    { months: [12, 1],  name: "Winter peak season — highest tourist footfall of the year" },
    { months: [3, 4],   name: "Spring festival season — moderate to high crowds" },
    { months: [6, 7, 8], name: "Monsoon season — lower crowds at outdoor sites" },
    { months: [5],       name: "Summer holidays — high crowds at hill stations" }
  ];

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isFriday  = dayOfWeek === 5;
  const isLongWeekend = isFriday && holidays.some(h => h.month === month && (h.day === day + 3 || h.day === day + 2));

  const todayHoliday   = holidays.find(h => h.month === month && h.day === day);
  const tomorrowHoliday = holidays.find(h => h.month === month && h.day === day + 1);
  const currentFestival = festivals.find(f => f.months.includes(month));

  const schoolHolidays = [5, 6].includes(month);

  return {
    isWeekend,
    isLongWeekend,
    isFriday,
    todayHoliday:    todayHoliday    ? todayHoliday.name    : null,
    tomorrowHoliday: tomorrowHoliday ? tomorrowHoliday.name : null,
    festivalSeason:  currentFestival ? currentFestival.name : null,
    schoolHolidays,
    month,
    day,
    dayOfWeek: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek]
  };
}

async function getWeatherContext(destination) {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey || apiKey === "your_free_key_here" || apiKey === "") {
      return { available: false, reason: "No weather API key configured" };
    }

    const cleanDest = destination.split(',')[0].trim();
    const geoUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cleanDest)}&limit=1&appid=${apiKey}`;
    const geoResponse = await axios.get(geoUrl, { timeout: 5000 });

    if (!geoResponse.data || geoResponse.data.length === 0) {
      return { available: false, reason: "Location not found" };
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
      isRaining: ['Rain','Drizzle','Thunderstorm'].includes(w.weather[0].main),
      isExtreme: ['Thunderstorm','Tornado','Squall'].includes(w.weather[0].main),
      isClear: w.weather[0].main === 'Clear',
      visibility: w.visibility > 5000 ? 'good' : 'poor'
    };
  } catch (err) {
    console.error("Weather geocoding/lookup error:", err.message);
    return { available: false, reason: "Weather service unavailable" };
  }
}

function generateFallbackPrediction(placeName, destination, visitDate, holidayContext, weatherContext, visitTime) {
  let score = 40;
  if (holidayContext.isWeekend) score += 20;
  if (holidayContext.isLongWeekend) score += 15;
  if (holidayContext.todayHoliday) score += 20;
  if (holidayContext.schoolHolidays) score += 10;
  if (weatherContext && weatherContext.isRaining) score -= 15;
  if (weatherContext && weatherContext.isExtreme) score -= 25;
  if (weatherContext && weatherContext.isClear) score += 10;
  
  // Place specific heuristics
  const nameLower = placeName.toLowerCase();
  if (nameLower.includes('temple') || nameLower.includes('mosque') || nameLower.includes('church') || nameLower.includes('gurudwara')) {
    score += 15;
  }
  if (nameLower.includes('market') || nameLower.includes('bazaar') || nameLower.includes('mall')) {
    score += 10;
  }
  
  score = Math.max(10, Math.min(95, score));
  
  let level = 'Moderate';
  if (score <= 25) level = 'Low';
  else if (score <= 50) level = 'Moderate';
  else if (score <= 75) level = 'High';
  else level = 'Very High';

  const timeAssessment = 
    score > 75 ? 'Avoid if possible' :
    score > 50 ? 'Moderate crowds expected' :
                 'Good time to visit';

  const hourlyForecast = [
    { hour: "6 AM",  score: Math.round(score * 0.25) },
    { hour: "7 AM",  score: Math.round(score * 0.35) },
    { hour: "8 AM",  score: Math.round(score * 0.50) },
    { hour: "9 AM",  score: Math.round(score * 0.75) },
    { hour: "10 AM", score: Math.round(score * 0.90) },
    { hour: "11 AM", score: Math.round(score * 1.0) },
    { hour: "12 PM", score: Math.round(score * 1.1) },
    { hour: "1 PM",  score: Math.round(score * 1.1) },
    { hour: "2 PM",  score: Math.round(score * 1.0) },
    { hour: "3 PM",  score: Math.round(score * 0.85) },
    { hour: "4 PM",  score: Math.round(score * 0.80) },
    { hour: "5 PM",  score: Math.round(score * 0.85) },
    { hour: "6 PM",  score: Math.round(score * 0.70) },
    { hour: "7 PM",  score: Math.round(score * 0.50) },
    { hour: "8 PM",  score: Math.round(score * 0.35) },
    { hour: "9 PM",  score: Math.round(score * 0.20) }
  ].map(item => {
    const s = Math.max(5, Math.min(100, item.score));
    let lvl = 'Moderate';
    if (s <= 25) lvl = 'Low';
    else if (s <= 50) lvl = 'Moderate';
    else if (s <= 75) lvl = 'High';
    else lvl = 'Very High';
    return { hour: item.hour, level: lvl, score: s };
  });

  const weatherAlertText = weatherContext && weatherContext.available && weatherContext.isRaining 
    ? "Rainy weather may reduce outdoor visitor numbers today." 
    : null;

  const holidayAlertText = holidayContext.todayHoliday 
    ? `Expect holiday crowds today due to ${holidayContext.todayHoliday}.`
    : holidayContext.isWeekend 
    ? "Weekend crowds are expected to be higher." 
    : null;

  return {
    placeName,
    destination,
    visitDate,
    visitDay: holidayContext.dayOfWeek,
    overallLevel: level,
    overallScore: score,
    confidence: "Medium",
    bestTimeWindow: "7:00 AM – 9:00 AM",
    avoidTimeWindow: "11:00 AM – 2:00 PM",
    currentTimeAssessment: timeAssessment,
    reason: `Estimated crowd level of ${score}/100 based on local calendar and weekday/weekend patterns. ${
      holidayContext.isWeekend ? 'Weekend scaling factors are applied.' : 'Weekday scheduling applies.'
    } ${weatherContext && weatherContext.available ? `Local weather is ${weatherContext.condition}.` : ''} (Fallback Mode)`,
    crowdTip: "Arrive before 8:30 AM to explore during the lowest crowd density.",
    specialAlert: holidayContext.todayHoliday || (weatherContext && weatherContext.isExtreme) ? (holidayContext.todayHoliday || "Extreme weather warning") : null,
    hourlyForecast,
    weatherImpact: weatherAlertText,
    holidayImpact: holidayAlertText
  };
}

app.post('/api/crowd-prediction', async (req, res) => {
  try {
    const {
      placeName,
      placeType,
      destination,
      visitDate,
      visitTime
    } = req.body;

    if (!placeName || !destination || !visitDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const cacheKey = `${placeName}-${destination}-${visitDate}`;
    const cached = predictionCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    const [holidayContext, weatherContext] = await Promise.all([
      getIndianHolidayContext(visitDate),
      getWeatherContext(destination)
    ]);

    const visitHour = visitTime
      ? parseInt(visitTime.split(':')[0])
      : 10;

    const timeOfDay =
      visitHour < 9  ? 'early morning (before 9 AM)' :
      visitHour < 12 ? 'late morning (9 AM–12 PM)'   :
      visitHour < 15 ? 'afternoon (12–3 PM)'          :
      visitHour < 18 ? 'late afternoon (3–6 PM)'      :
                       'evening (after 6 PM)';

    const weatherSummary = weatherContext.available
      ? `Weather: ${weatherContext.condition}, ${weatherContext.temperature}°C, ${
          weatherContext.isRaining ? 'RAINING — outdoor crowds will be lower' :
          weatherContext.isClear   ? 'clear sunny weather — outdoor crowds will be higher' :
                                     'overcast conditions'
        }`
      : 'Weather data unavailable — assume typical conditions for this season';

    const holidaySummary = [
      holidayContext.todayHoliday    ? `TODAY IS: ${holidayContext.todayHoliday}`          : null,
      holidayContext.tomorrowHoliday ? `Tomorrow is: ${holidayContext.tomorrowHoliday}`     : null,
      holidayContext.festivalSeason  ? `Festival season: ${holidayContext.festivalSeason}`  : null,
      holidayContext.isLongWeekend   ? 'Long weekend — expect very high tourist crowds'     : null,
      holidayContext.isWeekend       ? 'Weekend — significantly higher crowds than weekday' : null,
      holidayContext.schoolHolidays  ? 'School holiday period — family crowds expected'     : null,
    ].filter(Boolean).join('\n') || 'Regular weekday — normal crowd levels expected';

    const prompt = `You are an expert Indian tourism analyst with 20 years of experience
predicting crowd patterns at tourist destinations across India.

Predict the crowd levels for this place based on these 4 signals:

PLACE INFORMATION:
- Name: ${placeName}
- Type: ${placeType || 'tourist attraction'}
- City/destination: ${destination}
- Planned visit: ${holidayContext.dayOfWeek}, ${visitDate}
- Time of visit: ${timeOfDay}

SIGNAL 1 — DATE AND TIME CONTEXT:
- Day: ${holidayContext.dayOfWeek}
- Month: ${holidayContext.month} (${
      [,'January','February','March','April','May','June',
       'July','August','September','October','November','December'][holidayContext.month]
    })
- Time of visit: ${timeOfDay}
- Season context: ${
      [1,2].includes(holidayContext.month)   ? 'Peak winter tourist season' :
      [3,4].includes(holidayContext.month)   ? 'Spring season, moderate tourists' :
      [5].includes(holidayContext.month)     ? 'Summer, school holidays' :
      [6,7,8,9].includes(holidayContext.month) ? 'Monsoon season' :
                                                'Peak festive and tourist season'
    }

SIGNAL 2 — WEATHER:
${weatherSummary}

SIGNAL 3 — HOLIDAYS AND FESTIVALS:
${holidaySummary}

SIGNAL 4 — YOUR KNOWLEDGE ABOUT THIS PLACE:
Use your training knowledge about ${placeName} in ${destination}:
- Typical daily visitor numbers
- Peak hours based on historical patterns
- Whether this is a photography hotspot (more crowds for sunrise/sunset)
- Whether it has entry time slots or ticketed entry
- Local vs tourist visitor ratio
- Whether it gets crowded on specific days (e.g. temples on Tuesdays)

RULES FOR YOUR PREDICTION:
1. Be specific to THIS place — generic answers are wrong.
   Amber Fort gets different crowds than a local temple.
2. Account for the combined effect of all 4 signals.
   A rainy day on a holiday = lower than expected crowds.
3. Indian tourist patterns: weekends are 2–3x more crowded than weekdays.
   Early morning (7–9 AM) is always 40–60% less crowded than midday.
4. Religious sites (temples, mosques, churches) get extra crowds on
   their holy days (Tuesday for Hanuman temples, Friday for mosques etc.)
5. Markets get crowded in evenings, monuments in mornings.
6. Monsoon reduces outdoor site crowds by 30–50%.
7. Republic Day (Jan 26) and Independence Day (Aug 15) cause
   extreme crowds at national monuments.

Respond ONLY with valid JSON. No markdown. No code fences.
Start with { and end with }

{
  "placeName": "${placeName}",
  "destination": "${destination}",
  "visitDate": "${visitDate}",
  "visitDay": "${holidayContext.dayOfWeek}",
  "overallLevel": "Low | Moderate | High | Very High",
  "overallScore": 65,
  "confidence": "High | Medium | Low",
  "bestTimeWindow": "7:00 AM – 9:00 AM",
  "avoidTimeWindow": "11:00 AM – 2:00 PM",
  "currentTimeAssessment": "Good time to visit | Moderate crowds expected | Avoid if possible",
  "reason": "2-3 sentences explaining the prediction — specific to this place and these signals. Mention which signals most influenced the prediction.",
  "crowdTip": "One specific actionable tip to beat the crowd at THIS place",
  "specialAlert": "Any special alert like holiday, festival, or extreme weather — null if none",
  "hourlyForecast": [
    { "hour": "6 AM",  "level": "Low",      "score": 15 },
    { "hour": "7 AM",  "level": "Low",      "score": 20 },
    { "hour": "8 AM",  "level": "Low",      "score": 30 },
    { "hour": "9 AM",  "level": "Moderate", "score": 50 },
    { "hour": "10 AM", "level": "Moderate", "score": 60 },
    { "hour": "11 AM", "level": "High",     "score": 80 },
    { "hour": "12 PM", "level": "High",     "score": 85 },
    { "hour": "1 PM",  "level": "High",     "score": 82 },
    { "hour": "2 PM",  "level": "High",     "score": 78 },
    { "hour": "3 PM",  "level": "Moderate", "score": 65 },
    { "hour": "4 PM",  "level": "Moderate", "score": 60 },
    { "hour": "5 PM",  "level": "Moderate", "score": 55 },
    { "hour": "6 PM",  "level": "Low",      "score": 35 },
    { "hour": "7 PM",  "level": "Low",      "score": 25 },
    { "hour": "8 PM",  "level": "Low",      "score": 20 },
    { "hour": "9 PM",  "level": "Low",      "score": 15 }
  ],
  "weatherImpact": "How weather affects crowd today — null if no impact",
  "holidayImpact": "How holiday or festival affects crowd today — null if none"
}

Score scale: 0-25 = Low, 26-50 = Moderate, 51-75 = High, 76-100 = Very High`;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
      return res.status(500).json({ error: "Add your Gemini API key to backend/.env and restart the server." });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL || 'gemini-2.5-flash-lite' });
    const result = await model.generateContent(prompt);

    let text = result.response.text();
    text = text.replace(/```json/g,'').replace(/```/g,'').trim();
    const firstBrace = text.indexOf('{');
    const lastBrace  = text.lastIndexOf('}');
    const parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));

    predictionCache[cacheKey] = {
      data: parsed,
      timestamp: Date.now()
    };

    res.json(parsed);
  } catch (err) {
    console.warn('Gemini crowd prediction failed (falling back to heuristic):', err.message);
    try {
      const [holidayContext, weatherContext] = await Promise.all([
        getIndianHolidayContext(req.body.visitDate),
        getWeatherContext(req.body.destination)
      ]);
      const fallbackData = generateFallbackPrediction(
        req.body.placeName,
        req.body.destination,
        req.body.visitDate,
        holidayContext,
        weatherContext,
        req.body.visitTime
      );
      const cacheKey = `${req.body.placeName}-${req.body.destination}-${req.body.visitDate}`;
      predictionCache[cacheKey] = {
        data: fallbackData,
        timestamp: Date.now()
      };
      return res.json(fallbackData);
    } catch (fallbackErr) {
      console.error('Fallback crowd prediction failed:', fallbackErr);
      res.status(500).json({ error: 'Could not generate crowd prediction' });
    }
  }
});

app.post('/api/batch-crowd-prediction', async (req, res) => {
  const { activities } = req.body;
  if (!Array.isArray(activities) || activities.length === 0) {
    return res.status(400).json({ error: 'activities array is required' });
  }

  const results = {};
  const toPredict = [];

  try {

    // 1. Check cache first
    for (const act of activities) {
      const { placeName, destination, visitDate, cacheKey } = act;
      const key = `${placeName}-${destination}-${visitDate}`;
      const cached = predictionCache[key];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        results[cacheKey] = cached.data;
      } else {
        toPredict.push(act);
      }
    }

    // 2. If nothing needs prediction, return cached results immediately!
    if (toPredict.length === 0) {
      return res.json({ predictions: results });
    }

    // 3. Gather contexts for activities that need prediction
    // Group weather lookups by destination to avoid duplicate API calls
    const destinations = [...new Set(toPredict.map(a => a.destination))];
    const weatherCache = {};
    await Promise.all(destinations.map(async dest => {
      weatherCache[dest] = await getWeatherContext(dest);
    }));

    // Gather holiday contexts by date
    const dates = [...new Set(toPredict.map(a => a.visitDate))];
    const holidayCache = {};
    for (const d of dates) {
      holidayCache[d] = await getIndianHolidayContext(d);
    }

    // Build activities details for the prompt
    const activitiesDetails = toPredict.map((act, index) => {
      const holidayContext = holidayCache[act.visitDate];
      const weatherContext = weatherCache[act.destination];
      const visitHour = act.visitTime ? parseInt(act.visitTime.split(':')[0]) : 10;
      const timeOfDay =
        visitHour < 9  ? 'early morning (before 9 AM)' :
        visitHour < 12 ? 'late morning (9 AM–12 PM)'   :
        visitHour < 15 ? 'afternoon (12–3 PM)'          :
        visitHour < 18 ? 'late afternoon (3–6 PM)'      :
                         'evening (after 6 PM)';

      const weatherSummary = weatherContext.available
        ? `Weather: ${weatherContext.condition}, ${weatherContext.temperature}°C, ${
            weatherContext.isRaining ? 'RAINING — outdoor crowds will be lower' :
            weatherContext.isClear   ? 'clear sunny weather — outdoor crowds will be higher' :
                                       'overcast conditions'
          }`
        : 'Weather data unavailable — assume typical conditions for this season';

      const holidaySummary = [
        holidayContext.todayHoliday    ? `TODAY IS: ${holidayContext.todayHoliday}`          : null,
        holidayContext.tomorrowHoliday ? `Tomorrow is: ${holidayContext.tomorrowHoliday}`     : null,
        holidayContext.festivalSeason  ? `Festival season: ${holidayContext.festivalSeason}`  : null,
        holidayContext.isLongWeekend   ? 'Long weekend — expect very high tourist crowds'     : null,
        holidayContext.isWeekend       ? 'Weekend — significantly higher crowds than weekday' : null,
        holidayContext.schoolHolidays  ? 'School holiday period — family crowds expected'     : null,
      ].filter(Boolean).join('\n') || 'Regular weekday — normal crowd levels expected';

      return `ACTIVITY INDEX: ${index}
- Cache Key: ${act.cacheKey}
- Place Name: ${act.placeName}
- Place Type: ${act.placeType || 'tourist attraction'}
- Destination: ${act.destination}
- Planned Visit Date: ${act.visitDate} (${holidayContext.dayOfWeek})
- Visit Time Context: ${timeOfDay} (planned at ${act.visitTime || '10:00'})
- Weather Context: ${weatherSummary}
- Holiday Context: ${holidaySummary}
- Month: ${holidayContext.month} (${
        [,'January','February','March','April','May','June',
         'July','August','September','October','November','December'][holidayContext.month]
      })
`;
    }).join('\n---\n');

    const prompt = `You are an expert Indian tourism analyst with 20 years of experience
predicting crowd patterns at tourist destinations across India.

Predict the crowd levels for each of the following ${toPredict.length} activities based on the provided signals:

${activitiesDetails}

RULES FOR YOUR PREDICTION:
1. Be specific to each activity and place name — generic answers are wrong.
2. Account for the combined effect of all signals: weather, holiday, weekend status, month/season, and time of day.
3. Indian tourist patterns: weekends are 2–3x more crowded than weekdays. Early morning (7–9 AM) is always 40–60% less crowded than midday.
4. Religious sites (temples, mosques, churches) get extra crowds on their holy days. Markets get crowded in evenings, monuments in mornings.
5. Monsoon reduces outdoor site crowds by 30–50%.
6. National holidays (Jan 26, Aug 15) cause extreme crowds at national monuments.

Respond ONLY with valid JSON. No markdown. No code fences.
Start with { and end with }

Output format:
{
  "predictions": {
    "${toPredict[0].cacheKey}": {
      "placeName": "${toPredict[0].placeName}",
      "destination": "${toPredict[0].destination}",
      "visitDate": "${toPredict[0].visitDate}",
      "visitDay": "Monday",
      "overallLevel": "Low | Moderate | High | Very High",
      "overallScore": 65,
      "confidence": "High | Medium | Low",
      "bestTimeWindow": "7:00 AM – 9:00 AM",
      "avoidTimeWindow": "11:00 AM – 2:00 PM",
      "currentTimeAssessment": "Good time to visit | Moderate crowds expected | Avoid if possible",
      "reason": "2-3 sentences explaining the prediction — specific to this place and these signals. Mention which signals most influenced the prediction.",
      "crowdTip": "One specific actionable tip to beat the crowd at THIS place",
      "specialAlert": "Any special alert like holiday, festival, or extreme weather — null if none",
      "hourlyForecast": [
        { "hour": "6 AM",  "level": "Low",      "score": 15 },
        { "hour": "7 AM",  "level": "Low",      "score": 20 },
        { "hour": "8 AM",  "level": "Low",      "score": 30 },
        { "hour": "9 AM",  "level": "Moderate", "score": 50 },
        { "hour": "10 AM", "level": "Moderate", "score": 60 },
        { "hour": "11 AM", "level": "High",     "score": 80 },
        { "hour": "12 PM", "level": "High",     "score": 85 },
        { "hour": "1 PM",  "level": "High",     "score": 82 },
        { "hour": "2 PM",  "level": "High",     "score": 78 },
        { "hour": "3 PM",  "level": "Moderate", "score": 65 },
        { "hour": "4 PM",  "level": "Moderate", "score": 60 },
        { "hour": "5 PM",  "level": "Moderate", "score": 55 },
        { "hour": "6 PM",  "level": "Low",      "score": 35 },
        { "hour": "7 PM",  "level": "Low",      "score": 25 },
        { "hour": "8 PM",  "level": "Low",      "score": 20 },
        { "hour": "9 PM",  "level": "Low",      "score": 15 }
      ],
      "weatherImpact": "How weather affects crowd today — null if no impact",
      "holidayImpact": "How holiday or festival affects crowd today — null if none"
    }
    // Repeat for every other cacheKey in the input list
  }
}`;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
      return res.status(500).json({ error: "Add your Gemini API key to backend/.env and restart the server." });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL || 'gemini-2.5-flash-lite' });
    const result = await model.generateContent(prompt);

    let text = result.response.text();
    text = text.replace(/```json/g,'').replace(/```/g,'').trim();
    const firstBrace = text.indexOf('{');
    const lastBrace  = text.lastIndexOf('}');
    const parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));

    // Cache the new predictions
    if (parsed.predictions) {
      Object.keys(parsed.predictions).forEach(cacheKey => {
        const pred = parsed.predictions[cacheKey];
        const matchingInput = toPredict.find(a => a.cacheKey === cacheKey);
        if (matchingInput) {
          const key = `${matchingInput.placeName}-${matchingInput.destination}-${matchingInput.visitDate}`;
          predictionCache[key] = {
            data: pred,
            timestamp: Date.now()
          };
        }
        results[cacheKey] = pred;
      });
    }

    res.json({ predictions: results });
  } catch (err) {
    console.warn('Batch Gemini crowd prediction failed (falling back to heuristic):', err.message);
    try {
      const destinations = [...new Set(toPredict.map(a => a.destination))];
      const weatherCache = {};
      await Promise.all(destinations.map(async dest => {
        try {
          weatherCache[dest] = await getWeatherContext(dest);
        } catch {
          weatherCache[dest] = { available: false };
        }
      }));

      const dates = [...new Set(toPredict.map(a => a.visitDate))];
      const holidayCache = {};
      for (const d of dates) {
        try {
          holidayCache[d] = await getIndianHolidayContext(d);
        } catch {
          holidayCache[d] = { isWeekend: false, isLongWeekend: false, todayHoliday: null, schoolHolidays: false, dayOfWeek: 'Monday' };
        }
      }

      toPredict.forEach(act => {
        const holidayContext = holidayCache[act.visitDate];
        const weatherContext = weatherCache[act.destination];
        const fallbackData = generateFallbackPrediction(
          act.placeName,
          act.destination,
          act.visitDate,
          holidayContext,
          weatherContext,
          act.visitTime
        );
        const key = `${act.placeName}-${act.destination}-${act.visitDate}`;
        predictionCache[key] = {
          data: fallbackData,
          timestamp: Date.now()
        };
        results[act.cacheKey] = fallbackData;
      });

      return res.json({ predictions: results });
    } catch (fallbackErr) {
      console.error('Fallback batch crowd prediction failed:', fallbackErr);
      res.status(500).json({ error: 'Could not generate batch crowd prediction' });
    }
  }
});


// ─── ENVIRONMENTAL ALERTS ENDPOINTS ───────────────────────────────────

const { supabase } = require('./supabaseClient');
const { markAlertDismissed } = require('./alertHelpers');

// Register user profile (called on app first launch)
app.post('/api/user/register', async (req, res) => {
  try {
    const { userId, phoneNumber, fcmToken, telegramChatId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const updates = {
      userId,
      updatedAt: new Date().toISOString()
    };

    if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber || null;
    if (fcmToken !== undefined) updates.fcmToken = fcmToken || null;
    if (telegramChatId !== undefined) updates.telegramChatId = telegramChatId || null;

    // Get existing doc to verify if we need default preferences
    const { data: userProfile } = await supabase.from('userProfiles').select('*').eq('userId', userId).maybeSingle();
    
    if (!userProfile) {
      updates.alertPreferences = {
        pushEnabled:       true,
        smsEnabled:        true,
        telegramEnabled:   true,
        nightBeforeAlert:  true,
        realtimeAlert:     true
      };
      updates.activeItineraries = [];
    } else {
      updates.alertPreferences = userProfile.alertPreferences;
      updates.activeItineraries = userProfile.activeItineraries;
    }

    const { error: upsertError } = await supabase.from('userProfiles').upsert({ id: userId, ...updates }, { onConflict: 'id' });
    if (upsertError) throw upsertError;

    res.json({ success: true });
  } catch (err) {
    console.error('Registration API error:', err);
    res.status(500).json({ error: 'Could not register user' });
  }
});

// Get user profile (preferences & phone)
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: profile, error } = await supabase.from('userProfiles').select('*').eq('userId', userId).maybeSingle();
    if (error || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(profile);
  } catch (err) {
    console.error('Get user profile API error:', err);
    res.status(500).json({ error: 'Could not fetch user profile' });
  }
});

// Update FCM token (called when token refreshes)
app.post('/api/user/update-token', async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { error } = await supabase.from('userProfiles').update({
      fcmToken: fcmToken || null,
      updatedAt: new Date().toISOString()
    }).eq('userId', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Update token API error:', err);
    res.status(500).json({ error: 'Could not update token' });
  }
});

// Save itinerary to Supabase (call this when trip is generated)
app.post('/api/itinerary/save', async (req, res) => {
  try {
    const { userId, itinerary } = req.body;
    if (!userId || !itinerary) {
      return res.status(400).json({ error: 'userId and itinerary are required' });
    }

    const { data: doc, error: insertError } = await supabase.from('itineraries').insert({
      ...itinerary,
      userId,
      createdAt: new Date().toISOString()
    }).select('id').single();

    if (insertError) throw insertError;

    // Update user active itineraries
    const { data: userProfile } = await supabase.from('userProfiles').select('activeItineraries').eq('userId', userId).maybeSingle();
    if (userProfile) {
      const activeItineraries = userProfile.activeItineraries || [];
      activeItineraries.push(doc.id);
      await supabase.from('userProfiles').update({ activeItineraries }).eq('userId', userId);
    }

    res.json({ itineraryId: doc.id });
  } catch (err) {
    console.error('Save itinerary API error:', err);
    res.status(500).json({ error: 'Could not save itinerary' });
  }
});

// Get all alerts for a user
app.get('/api/alerts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: alerts, error } = await supabase.from('alerts')
      .select('*')
      .eq('userId', userId)
      .eq('dismissed', false)
      .order('sentAt', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ alerts: alerts || [] });
  } catch (err) {
    console.error('Get alerts API error:', err);
    res.status(500).json({ error: 'Could not fetch alerts' });
  }
});

// Dismiss an alert
app.post('/api/alerts/:alertId/dismiss', async (req, res) => {
  try {
    const { alertId } = req.params;
    const success = await markAlertDismissed(alertId);
    res.json({ success });
  } catch (err) {
    console.error('Dismiss alert API error:', err);
    res.status(500).json({ error: 'Could not dismiss alert' });
  }
});

// Update alert preferences
app.post('/api/user/alert-preferences', async (req, res) => {
  try {
    const { userId, preferences } = req.body;
    if (!userId || !preferences) {
      return res.status(400).json({ error: 'userId and preferences are required' });
    }

    const { error } = await supabase.from('userProfiles').update({
      alertPreferences: preferences,
      updatedAt: new Date().toISOString()
    }).eq('userId', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Update preferences API error:', err);
    res.status(500).json({ error: 'Could not update preferences' });
  }
});

// Demo endpoint to test SMS connection and log simulated SMS message
app.post('/api/test/send-demo-sms', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }

    const { sendSMS } = require('./notificationEngine');
    const demoMsg = "🚨 Flood / Landslide Risk — Munnar tomorrow (Day 2). Heavy landslide risk expected due to 48mm accumulated rainfall. Reschedule your mountain tour.";
    
    await sendSMS(phoneNumber, demoMsg);

    res.json({
      success: true,
      message: "Test SMS sent successfully!",
      mode: process.env.TWILIO_ACCOUNT_SID ? "Production (Real Twilio SMS)" : "Mock (Printed to Terminal Console)",
      previewText: `🧭 TripPlanner Alert:\n${demoMsg}\n\nOpen app for details & alternatives.`
    });
  } catch (err) {
    console.error('Demo SMS failed:', err);
    res.status(500).json({ error: 'Demo SMS failed: ' + err.message });
  }
});

// Demo endpoint to test Telegram connection and log simulated Telegram message
app.post('/api/test/send-demo-telegram', async (req, res) => {
  try {
    const { telegramChatId } = req.body;
    if (!telegramChatId) {
      return res.status(400).json({ error: 'telegramChatId is required' });
    }

    const { sendTelegramMessage } = require('./notificationEngine');
    const demoMsg = "🚨 Flood / Landslide Risk — Munnar tomorrow (Day 2). Heavy landslide risk expected due to 48mm accumulated rainfall. Reschedule your mountain tour.";
    
    const result = await sendTelegramMessage(telegramChatId, demoMsg);

    res.json({
      success: true,
      message: "Telegram test message dispatched successfully!",
      mode: result.mode === 'production' ? "Production (Real Telegram Bot)" : "Mock (Printed to Terminal Console)",
      previewText: `🧭 TripPlanner Alert:\n${demoMsg}\n\nOpen app for details & alternatives.`
    });
  } catch (err) {
    console.error('Demo Telegram failed:', err);
    res.status(500).json({ error: 'Demo Telegram failed: ' + err.message });
  }
});

// Test endpoint to trigger hazard checks and alerts immediately
app.post('/api/test/trigger-alerts', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`\n[Test Alert Trigger] Manually triggering alert checks for userId: ${userId}...`);

    // Fetch user profile
    const { data: userProfile, error: userError } = await supabase.from('userProfiles').select('*').eq('userId', userId).maybeSingle();
    if (!userProfile) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    // Fetch user's itineraries
    const { data: itineraries, error: itError } = await supabase.from('itineraries').select('*').eq('userId', userId);

    if (!itineraries || itineraries.length === 0) {
      return res.json({ success: true, message: 'No itineraries found for this user.' });
    }

    const testLogs = [];
    const { checkAllConditions } = require('./conditionChecker');
    const { notifyUser } = require('./notificationEngine');
    const { saveAlertToFirestore } = require('./alertHelpers');

    for (const itinerary of itineraries) {
      const days = itinerary.days || [];

      for (const day of days) {
        const dayNumber = day.day;
        
        // Mock a future date corresponding to this itinerary day
        const checkDate = new Date();
        checkDate.setDate(checkDate.getDate() + (dayNumber - 1));
        const checkDateStr = checkDate.toISOString().split('T')[0];

        for (const activity of (day.activities || [])) {
          if (activity.type === 'hotel' || activity.type === 'travel') continue;

          const destForDay = day.destination || itinerary.destination || 'India';

          console.log(`[Test Alert Trigger] Evaluating conditions for: ${activity.name} in ${destForDay} on date: ${checkDateStr}...`);
          const alerts = await checkAllConditions(activity, destForDay, checkDateStr);

          if (alerts && alerts.length > 0) {
            console.log(`[Test Alert Trigger] Found ${alerts.length} alerts for activity: ${activity.name}`);
            for (const alert of alerts) {
              await saveAlertToFirestore({
                ...alert,
                itineraryId:  itinerary.id,
                userId:       userId,
                dayNumber:    dayNumber,
                activityName: activity.name,
                triggerType:  'realtime',
                destination:  destForDay
              });
            }

            await notifyUser(
              userProfile,
              alerts,
              activity,
              dayNumber,
              destForDay,
              'realtime'
            );

            testLogs.push({
              activityName: activity.name,
              dayNumber,
              alerts: alerts.map(a => ({
                alertType: a.alertType,
                severity: a.severity,
                condition: a.condition
              }))
            });
          }
        }
      }
    }

    res.json({
      success: true,
      message: `Trigger check complete. Simulated alert scan found ${testLogs.length} alerts.`,
      alertsTriggered: testLogs
    });
  } catch (err) {
    console.error('Manual alert trigger failed:', err);
    res.status(500).json({ error: 'Manual alert trigger failed: ' + err.message });
  }
});

// Multi-destination trip planning routes (see multiTripPlanner.js)
app.use(require('./multiTripPlanner'));

// ─────────────────────────────────────────────────────────────────────────────
// SMART TRAVEL CONDITION, HAZARD MONITORING & ALERT SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

// Active official NDMA SACHET hazards (optionally filtered near a point).
app.get('/api/hazards', async (req, res) => {
  try {
    const { lat, lon, radiusKm } = req.query;
    const { data: hazards, error } = await supabase
      .from('hazard_alerts')
      .select('*')
      .in('status', ['DETECTED', 'ACTIVE', 'UPDATED', 'ESCALATED'])
      .order('issued_at', { ascending: false });

    if (error) throw error;

    let list = hazards || [];
    if (lat && lon) {
      const { alertHitsPoint } = require('./geoUtils');
      list = list.filter((h) => {
        const r = alertHitsPoint(
          { latitude: h.latitude, longitude: h.longitude, radiusKm: Number(radiusKm) || h.radius_km, polygon: h.polygon },
          Number(lat), Number(lon)
        );
        return r && r.hit;
      });
    }

    const { getFeedHealth } = require('./sachetClient');
    res.json({
      hazards: list,
      source: 'NDMA SACHET',
      feed: getFeedHealth(),
    });
  } catch (err) {
    console.error('Get hazards API error:', err);
    res.status(500).json({ error: 'Could not fetch hazards' });
  }
});

// Travel-condition assessment for a destination.
app.post('/api/travel-conditions', async (req, res) => {
  try {
    const { destination, latitude, longitude, date } = req.body || {};
    if (!destination) return res.status(400).json({ error: 'destination is required' });

    const { assessDestination } = require('./travelRiskEngine');
    const assessment = await assessDestination(
      { name: destination, latitude, longitude },
      {},
      date || new Date().toISOString().split('T')[0]
    );
    res.json({ destination, ...assessment });
  } catch (err) {
    console.error('Travel conditions API error:', err);
    res.status(500).json({ error: 'Could not assess conditions' });
  }
});

// Full trip safety dashboard (uses the trip's destinations).
app.get('/api/trip-safety/:tripId', async (req, res) => {
  try {
    const { tripId } = req.params;
    const { data: trip, error } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();
    if (error) throw error;
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const { assessTrip } = require('./travelRiskEngine');
    const assessment = await assessTrip(trip);
    res.json(assessment);
  } catch (err) {
    console.error('Trip safety API error:', err);
    res.status(500).json({ error: 'Could not assess trip safety' });
  }
});

// SACHET feed status.
app.get('/api/sachet/status', async (req, res) => {
  const { getFeedHealth } = require('./sachetClient');
  res.json({ ok: true, ...getFeedHealth() });
});

// Manually trigger a hazard scan (admin/test).
app.post('/api/sachet/scan', async (req, res) => {
  try {
    const { runHazardScan } = require('./hazardEngine');
    const summary = await runHazardScan({ sendTelegram: true });
    res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('Manual hazard scan failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Condition snapshots for a user's destination (dashboard).
app.get('/api/conditions/:destination', async (req, res) => {
  try {
    const { destination } = req.params;
    const { data: snapshots, error } = await supabase
      .from('condition_snapshots')
      .select('*')
      .eq('destination', destination)
      .order('capturedAt', { ascending: false })
      .limit(14);
    if (error) throw error;
    res.json({ destination, snapshots: snapshots || [] });
  } catch (err) {
    console.error('Get conditions API error:', err);
    res.status(500).json({ error: 'Could not fetch conditions' });
  }
});

// ── Telegram connect / status / disconnect / preferences ────────────────────
const { createConnectLink } = require('./telegramService');

app.post('/api/telegram/connect', async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const result = await createConnectLink(userId);
    if (!result.ok) return res.status(500).json({ error: result.reason });
    res.json(result);
  } catch (err) {
    console.error('Telegram connect error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/telegram/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data: profile, error } = await supabase
      .from('userProfiles')
      .select('telegramChatId')
      .eq('userId', userId)
      .maybeSingle();
    if (error) throw error;
    res.json({
      connected: !!(profile && profile.telegramChatId),
      botUsername: (process.env.TELEGRAM_BOT_USERNAME || 'RoamSmartBot').replace('@', ''),
    });
  } catch (err) {
    console.error('Telegram status error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/disconnect', async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const { error } = await supabase
      .from('userProfiles')
      .update({ telegramChatId: null })
      .eq('userId', userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Telegram disconnect error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark a notification read.
app.post('/api/alerts/:alertId/read', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { error } = await supabase
      .from('alerts')
      .update({ read: true })
      .eq('id', alertId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Mark alert read error:', err);
    res.status(500).json({ error: 'Could not mark alert read' });
  }
});

// Mark all notifications read for a user.
app.post('/api/alerts/:userId/read-all', async (req, res) => {
  try {
    const { userId } = req.params;
    const { error } = await supabase
      .from('alerts')
      .update({ read: true })
      .eq('userId', userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Could not mark alerts read' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

// Initialize schedulers (existing + NDMA SACHET + condition monitor)
require('./alertScheduler');
require('./sachetScheduler');

app.listen(PORT, () => {
  console.log(`Trip Planner API running on http://localhost:${PORT}`);
  // Load persisted SACHET feed state so ETags survive restarts.
  require('./sachetClient').loadState()
    .then(() => console.log('[SACHET] Feed state loaded.'))
    .catch(() => {});
});
