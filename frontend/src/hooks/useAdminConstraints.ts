import { useCallback, useEffect, useMemo, useState } from 'react';
import { constraintApi, shiftDefinitionApi, userApi } from '../lib/api';
import type { AvailabilityType, ConstraintEntry, ShiftDefinition } from '../types/constraint';
import type { User } from '../types/auth';
import {
  getCurrentWeekId,
  getNextWeekId,
  getPrevWeekId,
  getWeekDates,
  normalizeConstraintDate,
  toDateKey,
} from '../utils/weekUtils';
import { validatePartialRange } from '../utils/availabilityPreview';
import type { PartialValue } from '../components/constraints/PartialAvailabilityPopover';

type EntryMap = Record<string, ConstraintEntry[]>;
type SourceMap = Record<string, 'self' | 'manager_override' | undefined>;

function cloneEntries(entries: ConstraintEntry[]): ConstraintEntry[] {
  return entries.map((e) => ({ ...e, date: normalizeConstraintDate(e.date) }));
}

function entriesEqual(a?: ConstraintEntry, b?: ConstraintEntry): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.canWork === b.canWork &&
    a.availabilityType === b.availabilityType &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    (a.note ?? '') === (b.note ?? '')
  );
}

function findEntry(
  entries: ConstraintEntry[] | undefined,
  dateKey: string,
  definitionId: string
): ConstraintEntry | undefined {
  return entries?.find(
    (e) => normalizeConstraintDate(e.date) === dateKey && e.definitionId === definitionId
  );
}

export function useAdminConstraints() {
  const [currentViewWeek, setCurrentViewWeek] = useState(getCurrentWeekId());
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [original, setOriginal] = useState<EntryMap>({});
  const [staged, setStaged] = useState<EntryMap>({});
  const [originalSource, setOriginalSource] = useState<SourceMap>({});
  const [isLocked, setIsLocked] = useState(false);
  const [weekStatus, setWeekStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const weekDates = useMemo(() => getWeekDates(currentViewWeek), [currentViewWeek]);
  const selectedDateKey = useMemo(
    () => (weekDates[selectedDayIndex] ? toDateKey(weekDates[selectedDayIndex]) : ''),
    [weekDates, selectedDayIndex]
  );

  const isScheduleFinalized =
    weekStatus === 'generating' || weekStatus === 'published' || weekStatus === 'archived';

  const dayDefs = useMemo(
    () =>
      definitions
        .filter((d) => d.isActive && d.daysOfWeek.includes(selectedDayIndex))
        .sort((a, b) => a.orderNumber - b.orderNumber),
    [definitions, selectedDayIndex]
  );

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, searchQuery]);

  const loadData = useCallback(async () => {
    setError('');
    try {
      const [defsRes, constraintsRes, usersRes] = await Promise.all([
        shiftDefinitionApi.getActive(),
        constraintApi.getAllConstraints(currentViewWeek),
        userApi.getUsers(),
      ]);

      const orig: EntryMap = {};
      const source: SourceMap = {};
      constraintsRes.constraints.forEach((c) => {
        // Skip orphaned constraints whose referenced user was deleted — populate
        // returns null for the dangling ref, and typeof null === 'object'.
        if (!c.userId) return;
        const uid = typeof c.userId === 'object' ? c.userId._id : c.userId;
        if (!uid) return;
        orig[uid] = cloneEntries(c.entries);
        source[uid] = c.submittedVia;
      });

      setDefinitions(defsRes.definitions);
      setEmployees(
        usersRes.users.filter((u) => (u.role === 'employee' || u.role === 'manager') && u.isActive)
      );
      setOriginal(orig);
      setStaged(structuredClone(orig));
      setOriginalSource(source);
      setIsLocked(constraintsRes.isLocked);
      setWeekStatus(constraintsRes.weekStatus ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים');
    }
  }, [currentViewWeek]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    loadData();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadData]);

  const getEntry = useCallback(
    (userId: string, definitionId: string) =>
      findEntry(staged[userId], selectedDateKey, definitionId),
    [staged, selectedDateKey]
  );

  const isOverrideCell = useCallback(
    (userId: string, definitionId: string) => {
      if (originalSource[userId] !== 'self') return false;
      const origEntry = findEntry(original[userId], selectedDateKey, definitionId);
      const stagedEntry = findEntry(staged[userId], selectedDateKey, definitionId);
      return !entriesEqual(origEntry, stagedEntry);
    },
    [original, staged, originalSource, selectedDateKey]
  );

  const setStatus = useCallback(
    (userId: string, def: ShiftDefinition, status: AvailabilityType, partial?: PartialValue) => {
      setStaged((prev) => {
        const existing = prev[userId] ?? [];
        const withoutCell = existing.filter(
          (e) =>
            !(normalizeConstraintDate(e.date) === selectedDateKey && e.definitionId === def._id)
        );

        let next = withoutCell;
        if (status === 'unavailable') {
          next = [
            ...withoutCell,
            {
              date: selectedDateKey,
              definitionId: def._id,
              canWork: false,
              availabilityType: 'unavailable',
            },
          ];
        } else if (status === 'partial' && partial) {
          next = [
            ...withoutCell,
            {
              date: selectedDateKey,
              definitionId: def._id,
              canWork: true,
              availabilityType: 'partial',
              startTime: partial.startTime,
              endTime: partial.endTime,
              note: partial.note,
            },
          ];
        }
        // status === 'available' leaves the cell with no entry (absence = available).

        return { ...prev, [userId]: next };
      });
    },
    [selectedDateKey]
  );

  const dirtyUserIds = useMemo(() => {
    const ids = new Set<string>();
    const allIds = new Set([...Object.keys(original), ...Object.keys(staged)]);
    allIds.forEach((uid) => {
      const o = original[uid] ?? [];
      const s = staged[uid] ?? [];
      const keys = new Set([
        ...o.map((e) => `${normalizeConstraintDate(e.date)}|${e.definitionId}`),
        ...s.map((e) => `${normalizeConstraintDate(e.date)}|${e.definitionId}`),
      ]);
      for (const key of keys) {
        const [dateKey, defId] = key.split('|');
        if (!entriesEqual(findEntry(o, dateKey, defId), findEntry(s, dateKey, defId))) {
          ids.add(uid);
          break;
        }
      }
    });
    return ids;
  }, [original, staged]);

  const blockingErrorCount = useMemo(() => {
    let count = 0;
    Object.values(staged).forEach((entries) => {
      entries.forEach((e) => {
        if (e.availabilityType !== 'partial') return;
        const def = definitions.find((d) => d._id === e.definitionId);
        if (!def) return;
        if (validatePartialRange(e.startTime, e.endTime, def).error) count += 1;
      });
    });
    return count;
  }, [staged, definitions]);

  const isDirty = dirtyUserIds.size > 0;
  const canSave = isDirty && blockingErrorCount === 0 && !saving;

  const save = useCallback(async () => {
    if (blockingErrorCount > 0) {
      setError('יש זמינות חלקית לא תקינה — לא ניתן לשמור');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await Promise.all(
        Array.from(dirtyUserIds).map((uid) =>
          constraintApi.upsertForUser(currentViewWeek, uid, staged[uid] ?? [])
        )
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת השינויים');
    } finally {
      setSaving(false);
    }
  }, [blockingErrorCount, dirtyUserIds, staged, currentViewWeek, loadData]);

  const revert = useCallback(() => {
    setStaged(structuredClone(original));
    setError('');
  }, [original]);

  const confirmDiscardIfDirty = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('יש שינויים שלא נשמרו. לעבור ולאבד אותם?');
  }, [isDirty]);

  const goPrevWeek = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    setCurrentViewWeek((w) => getPrevWeekId(w));
  }, [confirmDiscardIfDirty]);

  const goNextWeek = useCallback(() => {
    if (!confirmDiscardIfDirty()) return;
    setCurrentViewWeek((w) => getNextWeekId(w));
  }, [confirmDiscardIfDirty]);

  const toggleLock = useCallback(async () => {
    try {
      await constraintApi.setLockState(
        currentViewWeek,
        isLocked ? 'force_unlocked' : 'force_locked'
      );
      await loadData();
    } catch {
      setError('שגיאה בשינוי מצב הנעילה');
    }
  }, [currentViewWeek, isLocked, loadData]);

  return {
    currentViewWeek,
    weekDates,
    selectedDayIndex,
    setSelectedDayIndex,
    dayDefs,
    filteredEmployees,
    searchQuery,
    setSearchQuery,
    isLocked,
    weekStatus,
    isScheduleFinalized,
    error,
    saving,
    isDirty,
    canSave,
    getEntry,
    isOverrideCell,
    setStatus,
    save,
    revert,
    goPrevWeek,
    goNextWeek,
    toggleLock,
  };
}
