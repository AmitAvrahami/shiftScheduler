import type { AuthResponse, User } from '../types/auth';
import type { Constraint, ConstraintEntry, LockMode, ShiftDefinition } from '../types/constraint';
import type { AdminDashboardDTO } from '../pages/admin/types';

// ─── Shared response types ────────────────────────────────────────────────────

export interface Schedule {
  _id: string;
  weekId: string;
  status: 'open' | 'locked' | 'generating' | 'draft' | 'published' | 'archived';
  generatedBy: string;
  startDate: string;
  endDate: string;
  generationScore?: GenerationScore | null;
}

export interface Shift {
  _id: string;
  scheduleId: string;
  definitionId: string;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  requiredCount: number;
  status: 'filled' | 'partial' | 'empty';
  templateStatus?: 'matching_template' | 'manually_modified';
  notes?: string;
}

export interface SaveShiftPayload {
  scheduleId?: string;
  definitionId?: string;
  shiftDefinitionId?: string;
  date?: string;
  requiredCount?: number;
  requiredStaffCount?: number;
  startTime?: string;
  endTime?: string;
  status?: Shift['status'];
  notes?: string;
}

export interface Assignment {
  _id: string;
  shiftId: string;
  userId: string;
  scheduleId: string;
  assignedBy: string;
  status: string;
}

export interface PublishedScheduleView {
  schedule: {
    id: string;
    weekId: string;
    startDate: string;
    endDate: string;
    status: 'published';
    publishedAt?: string;
  };
  shifts: AdminDashboardDTO['shifts'];
  assignments: AdminDashboardDTO['assignments'];
  employees: Array<{
    id: string;
    name: string;
  }>;
}

export interface AuditLogEntry {
  _id: string;
  action: string;
  performedBy: string | { _id: string; name: string };
  createdAt: string;
  ip?: string;
}

export interface BroadcastRecipient {
  userId: string;
  name: string;
  isRead: boolean;
}

// Structured soft-constraint warning (PR09). All fields beyond `message` are
// optional so an older solver response shape does not break the UI.
export interface GenerateWarning {
  message: string;
  type?: string;
  severity?: 'info' | 'warning';
  constraint_id?: string;
  worker_id?: string | null;
  shift_ids?: string[];
}

export interface GenerationScore {
  totalPenalty: number;
  qualityScore?: number;
  breakdown: Record<string, number>;
  generatedAt: string;
}

export interface GenerateResult {
  success: boolean;
  status: string;
  assignmentCount: number;
  solveTimeMs: number;
  warnings: GenerateWarning[];
  violations: Array<{ message: string }>;
  generationScore?: GenerationScore | null;
}

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

// ─── Base request helper ──────────────────────────────────────────────────────

const BASE = '/api/v1';

const logApi = import.meta.env.DEV
  ? {
      request: (method: string, url: string, body?: BodyInit | null) => {
        const parsed = typeof body === 'string' ? JSON.parse(body) : body;
        console.log(`🚀 Sending ${method} to ${url}`, parsed != null ? { data: parsed } : '');
      },
      response: (url: string, status: number, data: unknown) =>
        console.log(`✅ Received from ${url} with status ${status}`, { data }),
      error: (url: string, code: string | undefined, message: string) =>
        console.error(`❌ API Error at ${url}: ${code ?? 'UNKNOWN'} - ${message}`),
    }
  : null;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE}${path}`;
  const method = options.method ?? 'GET';

  logApi?.request(method, url, options.body);

  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    const err = new ApiError(data.message ?? 'Request failed', data.code);
    logApi?.error(url, data.code, err.message);
    throw err;
  }

  logApi?.response(url, res.status, data);
  return data as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login(body: { email: string; password: string }): Promise<AuthResponse> {
    return request('/auth/login', { method: 'POST', body: JSON.stringify(body) });
  },

  me(): Promise<{ success: boolean; user: User }> {
    return request('/auth/me');
  },
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const userApi = {
  createUser(body: {
    name: string;
    email: string;
    password: string;
    role?: string;
    isFixedMorningEmployee?: boolean;
  }): Promise<{ success: boolean; user: User }> {
    return request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
  },

  getUsers(): Promise<{ success: boolean; users: User[] }> {
    return request('/users');
  },

  setStatus(id: string, isActive: boolean): Promise<{ success: boolean; user: User }> {
    return request(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
  },

  setFixedMorning(
    id: string,
    isFixedMorningEmployee: boolean
  ): Promise<{ success: boolean; user: User }> {
    return request(`/users/${id}/fixed-morning`, {
      method: 'PATCH',
      body: JSON.stringify({ isFixedMorningEmployee }),
    });
  },

  updateUser(
    id: string,
    body: { name?: string; email?: string; role?: User['role'] }
  ): Promise<{ success: boolean; user: User }> {
    return request(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
};

// ─── Shift definitions ────────────────────────────────────────────────────────

export const shiftDefinitionApi = {
  getActive(): Promise<{ success: boolean; definitions: ShiftDefinition[] }> {
    return request('/shift-definitions');
  },

  create(
    body: Partial<ShiftDefinition>
  ): Promise<{ success: boolean; definition: ShiftDefinition }> {
    return request('/shift-definitions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  update(
    id: string,
    body: Partial<ShiftDefinition>
  ): Promise<{ success: boolean; definition: ShiftDefinition }> {
    return request(`/shift-definitions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete(id: string): Promise<{ success: boolean; definition: ShiftDefinition }> {
    return request(`/shift-definitions/${id}`, {
      method: 'DELETE',
    });
  },
};

// ─── Constraints ──────────────────────────────────────────────────────────────

export const constraintApi = {
  getConstraints(weekId: string): Promise<{
    success: boolean;
    constraint: Constraint | null;
    deadline: string;
    isLocked: boolean;
    isExplicitlyLocked?: boolean;
    lockMode?: LockMode;
    weekStatus: Schedule['status'] | null;
  }> {
    return request(`/constraints/${weekId}`);
  },

  getAllConstraints(weekId: string): Promise<{
    success: boolean;
    constraints: Constraint[];
    deadline: string;
    isLocked: boolean;
    isExplicitlyLocked: boolean;
    lockMode?: LockMode;
    weekStatus: Schedule['status'] | null;
  }> {
    return request(`/constraints/${weekId}/all`);
  },

  toggleWeekLock(
    weekId: string,
    isLocked: boolean
  ): Promise<{ success: boolean; isLocked: boolean; lockMode?: LockMode }> {
    return request(`/constraints/${weekId}/toggle-lock`, {
      method: 'POST',
      body: JSON.stringify({ isLocked }),
    });
  },

  setLockState(
    weekId: string,
    lockMode: LockMode
  ): Promise<{ success: boolean; lockMode: LockMode; isLocked: boolean }> {
    return request(`/constraints/${weekId}/lock-state`, {
      method: 'POST',
      body: JSON.stringify({ lockMode }),
    });
  },

  getForUser(
    weekId: string,
    userId: string
  ): Promise<{
    success: boolean;
    constraint: Constraint | null;
    deadline: string;
    isLocked: boolean;
  }> {
    return request(`/constraints/${weekId}/users/${userId}`);
  },

  upsertConstraints(
    weekId: string,
    entries: ConstraintEntry[]
  ): Promise<{ success: boolean; constraint: Constraint }> {
    return request(`/constraints/${weekId}`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    });
  },

  upsertForUser(
    weekId: string,
    userId: string,
    entries: ConstraintEntry[]
  ): Promise<{ success: boolean; constraint: Constraint }> {
    return request(`/constraints/${weekId}/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    });
  },
};

// ─── Schedules ────────────────────────────────────────────────────────────────

export const scheduleApi = {
  generate(weekId: string): Promise<GenerateResult> {
    return request(`/schedules/${weekId}/generate`, { method: 'POST' });
  },

  generateDemo(weekId: string): Promise<GenerateResult> {
    return request(`/schedules/${weekId}/generate-demo`, { method: 'POST' });
  },

  getAll(): Promise<{ success: boolean; schedules: Schedule[] }> {
    return request('/schedules');
  },

  getPublishedView(scheduleId: string): Promise<{ success: boolean; data: PublishedScheduleView }> {
    return request(`/schedules/${scheduleId}/published-view`);
  },

  create(weekId: string): Promise<{ success: boolean; schedule: Schedule }> {
    return request('/schedules', {
      method: 'POST',
      body: JSON.stringify({ weekId, generatedBy: 'auto' }),
    });
  },

  update(
    id: string,
    status: 'open' | 'locked' | 'draft' | 'published' | 'archived',
    approvedWarnings?: unknown[]
  ): Promise<{ success: boolean; schedule: Schedule }> {
    return request(`/schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, approvedWarnings }),
    });
  },

  deleteSchedule(id: string): Promise<{ success: boolean }> {
    return request(`/schedules/${id}`, { method: 'DELETE' });
  },

  clone(id: string, targetWeekId: string): Promise<{ success: boolean; schedule: Schedule }> {
    return request(`/schedules/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify({ targetWeekId }),
    });
  },
};

// ─── Shifts ───────────────────────────────────────────────────────────────────

export const shiftApi = {
  getBySchedule(scheduleId: string): Promise<{ success: boolean; shifts: Shift[] }> {
    return request(`/shifts?scheduleId=${scheduleId}`);
  },

  create(body: SaveShiftPayload): Promise<{ success: boolean; shift: Shift }> {
    const payload = normalizeShiftPayload(body);
    return request('/shifts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update(id: string, body: SaveShiftPayload): Promise<{ success: boolean; shift: Shift }> {
    const payload = normalizeShiftPayload(body);
    return request(`/shifts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
};

function normalizeShiftPayload(body: SaveShiftPayload): SaveShiftPayload {
  const { shiftDefinitionId, ...payload } = body;
  return {
    ...payload,
    ...(payload.definitionId || shiftDefinitionId
      ? { definitionId: payload.definitionId ?? shiftDefinitionId }
      : {}),
  };
}

// ─── Weekly Staffing ─────────────────────────────────────────────────────────

export const weeklyStaffingApi = {
  initializeWeekShifts(
    weekId: string
  ): Promise<{ success: boolean; created: number; skipped: number }> {
    return request(`/schedules/${encodeURIComponent(weekId)}/shifts/initialize`, {
      method: 'POST',
    });
  },

  getWeekShifts(weekId: string): Promise<{ success: boolean; shifts: Shift[] }> {
    return request(`/schedules/${encodeURIComponent(weekId)}/shifts`);
  },

  updateShiftRequirement(
    shiftId: string,
    requiredCount: number
  ): Promise<{ success: boolean; shift: Shift }> {
    return request(`/shifts/${shiftId}/requirement`, {
      method: 'PATCH',
      body: JSON.stringify({ requiredCount }),
    });
  },
};

// ─── Assignments ──────────────────────────────────────────────────────────────

export const assignmentApi = {
  getBySchedule(scheduleId: string): Promise<{ success: boolean; assignments: Assignment[] }> {
    return request(`/assignments?scheduleId=${scheduleId}`);
  },

  create(body: {
    shiftId: string;
    userId: string;
    scheduleId: string;
    assignedBy: 'manager' | 'algorithm';
  }): Promise<{ success: boolean; assignment: Assignment }> {
    return request('/assignments', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  delete(id: string): Promise<{ success: boolean; message?: string }> {
    return request(`/assignments/${id}`, { method: 'DELETE' });
  },
};

// ─── Audit logs ───────────────────────────────────────────────────────────────

export const auditLogApi = {
  getLogs(limit = 10): Promise<{ success: boolean; logs: AuditLogEntry[]; total: number }> {
    return request(`/audit-logs?limit=${limit}`);
  },
};

// ─── Admin BFF ───────────────────────────────────────────────────────────────

export interface AdminDashboardData {
  users: {
    all: User[];
    stats: {
      total: number;
      active: number;
      byRole: { employee: number; manager: number; admin: number };
    };
  };
  shiftDefinitions: ShiftDefinition[];
  currentWeek: {
    weekId: string;
    schedule: Schedule | null;
    shifts: Shift[];
    assignments: Assignment[];
    stats: {
      total: number;
      filled: number;
      partial: number;
      empty: number;
      scheduleStatus: string | null;
    };
  };
  nextWeek: {
    weekId: string;
    missingConstraintUserIds: string[];
  };
  recentAuditLogs: AuditLogEntry[];
  meta: { queryTimeMs: number };
}

export const adminApi = {
  getDashboard(weekId: string): Promise<AdminDashboardDTO> {
    return request<{ success: boolean; data: AdminDashboardDTO }>(
      `/admin/dashboard/${encodeURIComponent(weekId)}`
    ).then((res) => res.data);
  },

  initialize(
    weekId: string
  ): Promise<{ success: boolean; schedule: Schedule; shiftCount: number }> {
    return request('/admin/weeks/initialize', {
      method: 'POST',
      body: JSON.stringify({ weekId, generatedBy: 'manual' }),
    });
  },

  initializeFromTemplates(
    startOfWeek: string
  ): Promise<{ success: boolean; schedule: Schedule; shiftCount: number }> {
    return request('/admin/weeks/initialize', {
      method: 'POST',
      body: JSON.stringify({ weekId: weekIdFromStartOfWeek(startOfWeek), generatedBy: 'manual' }),
    });
  },
};

function weekIdFromStartOfWeek(startOfWeek: string): string {
  const [year, month, day] = startOfWeek.split('-').map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day + 1));
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);

  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationApi = {
  broadcast(
    title: string,
    body: string,
    userIds?: string[]
  ): Promise<{ success: boolean; broadcastId: string; recipientCount: number }> {
    return request('/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify({ title, body, userIds }),
    });
  },

  getBroadcastStatus(
    broadcastId: string
  ): Promise<{ success: boolean; recipients: BroadcastRecipient[] }> {
    return request(`/notifications/broadcast/${broadcastId}/status`);
  },
};
