import { useState, useEffect, useCallback } from 'react';
import { adminApi, scheduleApi } from '../../../lib/api';
import type { AdminDashboardDTO } from '../types';

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'שגיאה לא צפויה';
}

export function useAdminDashboard(weekId: string) {
  const [dashboard, setDashboard] = useState<AdminDashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(
    async (opts?: { silent?: boolean }) => {
      try {
        if (opts?.silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const data = await adminApi.getDashboard(weekId);
        setDashboard(data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [weekId]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekId]);

  const refresh = useCallback(
    () => loadDashboard({ silent: true }),
    [loadDashboard]
  );

  const initializeWeek = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      await adminApi.initialize(weekId);
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [weekId, loadDashboard]);

  const generateSchedule = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      await scheduleApi.generate(weekId);
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [weekId, loadDashboard]);

  const regenerateSchedule = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      await scheduleApi.generate(weekId);
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [weekId, loadDashboard]);

  const publishSchedule = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      if (!dashboard?.scheduleId) throw new Error('לא נמצא לו"ז לשבוע זה');
      await scheduleApi.update(dashboard.scheduleId, 'published');
      await loadDashboard({ silent: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [dashboard, loadDashboard]);

  return {
    dashboard,
    loading,
    error,
    refreshing,
    refresh,
    actions: {
      initializeWeek,
      generateSchedule,
      regenerateSchedule,
      publishSchedule,
    },
  };
}
