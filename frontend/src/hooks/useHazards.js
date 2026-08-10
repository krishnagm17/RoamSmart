import { useState, useEffect, useCallback } from 'react';
import api from '../api.js';

export function useHazards(userId) {
  const [hazards, setHazards] = useState([]);
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHazards = useCallback(async () => {
    if (!supabaseReady()) return;
    try {
      const res = await api.get('/api/hazards');
      setHazards(res.data.hazards || []);
      setFeed(res.data.feed || null);
      setError('');
    } catch (err) {
      console.error('Hazard fetch error:', err);
      setError('Hazard feed temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHazards();
    const t = setInterval(fetchHazards, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchHazards]);

  return { hazards, feed, loading, error, refresh: fetchHazards };
}

function supabaseReady() {
  return true;
}
