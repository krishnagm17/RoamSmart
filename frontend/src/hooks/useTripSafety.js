import { useState, useCallback } from 'react';
import api from '../api.js';

export function useTripSafety() {
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const assess = useCallback(async (trip) => {
    if (!trip) return null;
    setLoading(true);
    setError('');
    try {
      // Prefer the backend trip-safety endpoint when the trip has an id.
      if (trip.id) {
        try {
          const res = await api.get(`/api/trip-safety/${trip.id}`);
          setAssessment(res.data);
          return res.data;
        } catch (err) {
          if (err.response?.status !== 404) throw err;
          // fall through to local assessment
        }
      }
      // Local assessment when there is no saved trip (offline / unsaved).
      const { destinations = [] } = trip;
      const dayAssessments = [];
      for (const dest of destinations) {
        const name = dest.name || dest.destination;
        if (!name) continue;
        try {
          const res = await api.post('/api/travel-conditions', {
            destination: name,
            latitude: dest.latitude,
            longitude: dest.longitude,
            date: trip.startDate || new Date().toISOString().split('T')[0],
          });
          dayAssessments.push({ destination: name, ...res.data });
        } catch {
          // keep going; individual failures don't block the dashboard
        }
      }
      const result = {
        tripId: trip.id || null,
        tripTitle: trip.title || '',
        days: dayAssessments,
        overallLevel: '—',
        overallScore: 0,
      };
      setAssessment(result);
      return result;
    } catch (err) {
      console.error('Trip safety error:', err);
      setError('Could not assess trip safety.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { assessment, loading, error, assess };
}
