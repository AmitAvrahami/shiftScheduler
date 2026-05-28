import { useState, useEffect, useCallback } from 'react';
import { adminApi, assignmentApi, scheduleApi } from '../../../lib/api';
import type { AdminDashboardDTO } from '../types';

type GenerateResult = Awaited<ReturnType<typeof scheduleApi.generate>>;

type ActionLoading = {
  initializing: boolean;
  generating: boolean;
  generatingDemo: boolean;
  regenerating: boolean;
  publishing: boolean;
};

const idleActionLoading: ActionLoading = {
  initializing: false,
  generating: false,
  generatingDemo: false,
  regenerating: false,
  publishing: false,
};

const unexpectedErrorMessage = 'שגיאה לא צפויה';

export function useAdminDashboard(weekId: string) {
  const [dashboard, setDashboard] = useState<AdminDashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionLoading>(idleActionLoading);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
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
      } catch {
        setError(unexpectedErrorMessage);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [weekId]
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setGenerateResult(null);
    setError(null);
    loadDashboard();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadDashboard]);

  const refresh = useCallback(() => loadDashboard({ silent: true }), [loadDashboard]);

  const clearGenerateResult = useCallback(() => {
    setGenerateResult(null);
  }, []);

  const initializeWeek = useCallback(async () => {
    try {
      setActionLoading((current) => ({ ...current, initializing: true }));
      setRefreshing(true);
      setError(null);
      await adminApi.initialize(weekId);
      await refresh();
    } catch {
      setError(unexpectedErrorMessage);
    } finally {
      setActionLoading((current) => ({ ...current, initializing: false }));
      setRefreshing(false);
    }
  }, [weekId, refresh]);

  const generateSchedule = useCallback(async () => {
    try {
      setActionLoading((current) => ({ ...current, generating: true }));
      setRefreshing(true);
      setError(null);
      const result = await scheduleApi.generate(weekId);
      setGenerateResult(result);
      await refresh();
      return result;
    } catch {
      setError(unexpectedErrorMessage);
    } finally {
      setActionLoading((current) => ({ ...current, generating: false }));
      setRefreshing(false);
    }
  }, [weekId, refresh]);

  const generateDemoSchedule = useCallback(async () => {
    try {
      setActionLoading((current) => ({ ...current, generatingDemo: true }));
      setRefreshing(true);
      setError(null);
      const result = await scheduleApi.generateDemo(weekId);
      setGenerateResult(result);
      await refresh();
      return result;
    } catch {
      setError(unexpectedErrorMessage);
    } finally {
      setActionLoading((current) => ({ ...current, generatingDemo: false }));
      setRefreshing(false);
    }
  }, [weekId, refresh]);

  const regenerateSchedule = useCallback(async () => {
    try {
      setActionLoading((current) => ({ ...current, regenerating: true }));
      setRefreshing(true);
      setError(null);
      const result = await scheduleApi.generate(weekId);
      setGenerateResult(result);
      await refresh();
      return result;
    } catch {
      setError(unexpectedErrorMessage);
    } finally {
      setActionLoading((current) => ({ ...current, regenerating: false }));
      setRefreshing(false);
    }
  }, [weekId, refresh]);

  const scheduleId = dashboard?.scheduleId;

  const publishSchedule = useCallback(
    async (approvedWarnings?: unknown[]) => {
      if (!scheduleId) {
        setError('הסידור לא נמצא לשבוע זה');
        return false;
      }

      try {
        setActionLoading((current) => ({ ...current, publishing: true }));
        setRefreshing(true);
        setError(null);
        await scheduleApi.update(scheduleId, 'published', approvedWarnings);
        await refresh();
        return true;
      } catch {
        setError('שגיאה בפרסום הסידור');
        return false;
      } finally {
        setActionLoading((current) => ({ ...current, publishing: false }));
        setRefreshing(false);
      }
    },
    [scheduleId, refresh]
  );

  const assignEmployee = useCallback(
    async (shiftId: string, userId: string): Promise<string | null> => {
      if (!scheduleId) {
        setError('הסידור לא נמצא לשבוע זה');
        return null;
      }
      try {
        setRefreshing(true);
        setError(null);
        const res = await assignmentApi.create({
          shiftId,
          userId,
          scheduleId,
          assignedBy: 'manager',
        });
        await refresh();
        return res?.assignment?._id ?? null;
      } catch {
        setError(unexpectedErrorMessage);
        return null;
      } finally {
        setRefreshing(false);
      }
    },
    [scheduleId, refresh]
  );

  const removeEmployee = useCallback(
    async (assignmentId: string): Promise<boolean> => {
      try {
        setRefreshing(true);
        setError(null);
        await assignmentApi.delete(assignmentId);
        await refresh();
        return true;
      } catch {
        setError(unexpectedErrorMessage);
        return false;
      } finally {
        setRefreshing(false);
      }
    },
    [refresh]
  );

  return {
    dashboard,
    loading,
    error,
    refreshing,
    actionLoading,
    generateResult,
    clearGenerateResult,
    refresh,
    actions: {
      initializeWeek,
      generateSchedule,
      generateDemoSchedule,
      regenerateSchedule,
      publishSchedule,
      assignEmployee,
      removeEmployee,
    },
  };
}
