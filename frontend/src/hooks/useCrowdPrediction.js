import { useState, useCallback } from 'react';
import api from '../api.js';

const cache = {};

export function useCrowdPrediction() {
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

  const predict = useCallback(async ({
    placeName,
    placeType,
    destination,
    visitDate,
    visitTime,
    cacheKey
  }) => {
    const key = cacheKey || `${placeName}-${visitDate}-${visitTime}`;

    if (cache[key]) {
      setPredictions(prev => ({ ...prev, [key]: cache[key] }));
      return;
    }

    setLoading(prev => ({ ...prev, [key]: true }));
    setErrors(prev => ({ ...prev, [key]: null }));

    try {
      const response = await api.post(
        "/api/crowd-prediction",
        { placeName, placeType, destination, visitDate, visitTime }
      );
      cache[key] = response.data;
      setPredictions(prev => ({ ...prev, [key]: response.data }));
    } catch (err) {
      console.error("Prediction fetch failed:", err);
      setErrors(prev => ({
        ...prev,
        [key]: 'Could not load crowd prediction'
      }));
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  const predictBatch = useCallback(async (activities) => {
    if (!activities || activities.length === 0) return;

    // Check cache first for all activities
    const toFetch = [];
    const cachedResults = {};
    
    activities.forEach(act => {
      if (cache[act.cacheKey]) {
        cachedResults[act.cacheKey] = cache[act.cacheKey];
      } else {
        toFetch.push(act);
      }
    });

    if (Object.keys(cachedResults).length > 0) {
      setPredictions(prev => ({ ...prev, ...cachedResults }));
    }

    if (toFetch.length === 0) return;

    // Set non-cached to loading
    const newLoadingStates = {};
    const newErrorStates = {};
    toFetch.forEach(act => {
      newLoadingStates[act.cacheKey] = true;
      newErrorStates[act.cacheKey] = null;
    });
    setLoading(prev => ({ ...prev, ...newLoadingStates }));
    setErrors(prev => ({ ...prev, ...newErrorStates }));

    try {
      const response = await api.post(
        "/api/batch-crowd-prediction",
        { activities: toFetch }
      );
      
      const batchPredictions = response.data.predictions || {};
      
      // Update cache
      Object.keys(batchPredictions).forEach(key => {
        cache[key] = batchPredictions[key];
      });

      setPredictions(prev => ({ ...prev, ...batchPredictions }));
    } catch (err) {
      console.error("Batch prediction fetch failed:", err);
      const batchErrors = {};
      toFetch.forEach(act => {
        batchErrors[act.cacheKey] = 'Could not load crowd prediction';
      });
      setErrors(prev => ({ ...prev, ...batchErrors }));
    } finally {
      const finishedLoadingStates = {};
      toFetch.forEach(act => {
        finishedLoadingStates[act.cacheKey] = false;
      });
      setLoading(prev => ({ ...prev, ...finishedLoadingStates }));
    }
  }, []);

  return { predictions, loading, errors, predict, predictBatch };
}
