import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import api from '../api.js';

export function useAlerts(userId) {
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId || !supabase) return;

    // Initial fetch
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('userId', userId)
        .eq('dismissed', false)
        .order('sentAt', { ascending: false })
        .limit(20);

      if (!error && data) {
        setAlerts(data);
        setUnreadCount(data.filter(a => !a.read).length);
      } else {
        console.error("Alerts initial fetch error:", error);
      }
    };

    fetchAlerts();

    // Supabase Realtime Subscription
    const channel = supabase.channel(`alerts_user_${userId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'alerts', 
        filter: `userId=eq.'${userId}'` 
      }, (payload) => {
        // Simple strategy: just re-fetch to keep sorting/limiting robust, 
        // or we could optimistically update. Re-fetching is safer for limits.
        fetchAlerts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function dismissAlert(alertId) {
    try {
      await api.post(`/api/alerts/${alertId}/dismiss`);
      // Optimistic update for immediate UI refresh
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to dismiss alert:", err);
    }
  }

  return { alerts, unreadCount, dismissAlert };
}
