# AI Trip Planner

A full-stack AI-powered Trip Planner web application built with React, Vite, Node.js, Express, and the Google Gemini API. It collects trip preferences, generates a detailed itinerary, and supports follow-up questions about the generated plan.

## Features

- Mobile-first trip planning form with validation
- Gemini-powered itinerary generation
- Day-by-day travel plan with local tips and budget estimates
- Day-wise Google Maps route links with activity stops, no Maps API key required
- Hotel, restaurant, transport, safety, and timing recommendations
- Animated loading experience while the itinerary is generated
- Inline follow-up chat for questions about the trip
- Responsive layout for mobile and desktop

## Setup

1. Clone the repo.
2. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Add your key to `backend/.env`:

   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-2.5-flash-lite
   PORT=3001
   ```

4. Add the frontend API URL to `frontend/.env`:

   ```env
   VITE_API_URL=http://localhost:3001
   ```

   The maps feature uses Google Maps URLs and opens routes in a new tab. No Google Maps JavaScript API key is required.

5. Set up Firebase for the Travel Photo Journal feature:
   - Create a Firebase project at the [Firebase Console](https://console.firebase.google.com/).
   - Enable **Firestore Database** in your Firebase project.
   - Enable **Firebase Storage** in your Firebase project.
   - Add your Firebase app credentials to `frontend/.env`:
     ```env
     VITE_FIREBASE_API_KEY=your_firebase_api_key
     VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your_project_id
     VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
     VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
     VITE_FIREBASE_APP_ID=your_firebase_app_id
     ```
6. Set up OpenWeatherMap for the Crowd Prediction feature (Optional):
   - Get a free API key at [OpenWeatherMap Portal](https://openweathermap.org/api).
   - Add it to `backend/.env`:
     ```env
     OPENWEATHER_API_KEY=your_free_key_here
     ```
   - If not set, the Crowd Prediction feature automatically falls back to utilizing Date/Time, Holiday/Festival calendar, and Place Knowledge signals only.

8. Set up the Smart Environmental Alert System (Optional):
   - **Twilio SMS Alerts**: Get Twilio account credentials and a phone number, then add them to `backend/.env`:
     ```env
     TWILIO_ACCOUNT_SID=your_twilio_sid
     TWILIO_AUTH_TOKEN=your_twilio_auth_token
     TWILIO_PHONE_NUMBER=your_twilio_phone_number
     ```
     If omitted, Twilio will run in **Mock Mode** and print sent SMS contents to the backend console.
   - **Air Quality Warnings**: Get a free API key from [IQAir AirVisual API](https://api.iqair.com/) and add it to `backend/.env`:
     ```env
     IQAIR_API_KEY=your_iqair_api_key
     ```
     If omitted, AQI checks will be gracefully skipped.
   - **Push Notifications (Firebase Cloud Messaging)**: Generate a private service account key JSON from your Firebase Project settings -> Service Accounts, save it to `backend/serviceAccountKey.json`, and set your FCM VAPID key in `frontend/.env`:
     ```env
     VITE_FIREBASE_VAPID_KEY=your_fcm_vapid_key
     ```
     If `serviceAccountKey.json` is missing or firebase credentials are placeholders, the alert system automatically falls back to **Mock Fallback Mode** (polls alerts using a local JSON database in `backend/data/mockDb.json` every 10 seconds).

9. Install dependencies:

   ```bash
   npm install
   npm install --prefix frontend
   npm install --prefix backend
   ```

10. Start the app:

   ```bash
   npm run dev
   ```

The frontend runs at `http://localhost:5173` and the backend runs at `http://localhost:3001`.

## How To Use

Fill in your destination, dates, departure city, traveller details, budget, interests, and preferences. Select **Plan My Trip** to generate an itinerary. Once the trip plan appears, use the inline chat to ask follow-up questions about timing, restaurants, costs, or alternate plans.

## Tech Stack

- React + Vite
- Node.js + Express
- Google Gemini API Flash model
- Axios
- Framer Motion
- Tabler Icons
