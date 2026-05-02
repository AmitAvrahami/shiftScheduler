import type { AuthResponse, User } from '../types/auth';
import type { Constraint, ConstraintEntry, ShiftDefinition } from '../types/constraint';

// ─── Shared response types ────────────────────────────────────────────────────

export interface Schedule {
  _id: string;
  weekId: string;
  status: 'open' | 'locked' | 'generating' | 'draft' | 'published' | 'archived';
  generatedBy: string;
  startDate: string;
  endDate: string;
}

export interface Shift {
  _id: string;
  scheduleId: string;
  definitionId: string;
  date: string;
  requiredCount: number;
  status: 'filled' | 'partial' | 'empty';
  notes?: string;
}

export interface SaveShiftPayload {
  scheduleId?: string;
  definitionId?: string;
  shiftDefinitionId?: string;
  date?: string;
  requiredCount?: number;
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

export interface GenerateResult {
  success: boolean;
  status: string;
  assignmentCount: number;
  solveTimeMs: number;
  warnings: Array<{ message: string }>;
  violations: Array<{ message: string }>;
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
};

// ─── Shift definitions ────────────────────────────────────────────────────────

export const shiftDefinitionApi = {
  getActive(): Promise<{ success: boolean; definitions: ShiftDefinition[] }> {
    return request('/shift-definitions');
  },

  create(body: Partial<ShiftDefinition>): Promise<{ success: boolean; definition: ShiftDefinition }> {
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
    weekStatus: Schedule['status'] | null;
  }> {
    return request(`/constraints/${weekId}/all`);
  },

  toggleWeekLock(
    weekId: string,
    isLocked: boolean
  ): Promise<{ success: boolean; isLocked: boolean }> {
    return request(`/constraints/${weekId}/toggle-lock`, {
      method: 'POST',
      body: JSON.stringify({ isLocked }),
    });
  },

  getForUser(
    weekId: string,
    userId: string
  ): Promise<{ success: boolean; constraint: Constraint | null; deadline: string; isLocked: boolean }> {
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

  getAll(): Promise<{ success: boolean; schedules: Schedule[] }> {
    return request('/schedules');
  },

  create(weekId: string): Promise<{ success: boolean; schedule: Schedule }> {
    return request('/schedules', {
      method: 'POST',
      body: JSON.stringify({ weekId, generatedBy: 'auto' }),
    });
  },

  update(id: string, status: 'open' | 'locked' | 'draft' | 'published' | 'archived'): Promise<{ success: boolean; schedule: Schedule }> {
    return request(`/schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
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

// ─── Assignments ──────────────────────────────────────────────────────────────

export const assignmentApi = {
  getBySchedule(scheduleId: string): Promise<{ success: boolean; assignments: Assignment[] }> {
    return request(`/assignments?scheduleId=${scheduleId}`);
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
    stats: { total: number; active: number; byRole: { employee: number; manager: number; admin: number } };
  };
  shiftDefinitions: ShiftDefinition[];
  currentWeek: {
    weekId: string;
    schedule: Schedule | null;
    shifts: Shift[];
    assignments: Assignment[];
    stats: { total: number; filled: number; partial: number; empty: number; scheduleStatus: string | null };
  };
  nextWeek: {
    weekId: string;
    missingConstraintUserIds: string[];
  };
  recentAuditLogs: AuditLogEntry[];
  meta: { queryTimeMs: number };
}

export const adminApi = {
  getDashboard(weekId?: string): Promise<{ success: boolean; data: AdminDashboardData }> {
    const qs = weekId ? `?weekId=${encodeURIComponent(weekId)}` : '';
    return request(`/admin/dashboard${qs}`);
  },

  initialize(weekId: string): Promise<{ success: boolean; schedule: Schedule; shiftCount: number }> {
    return request('/admin/weeks/initialize', {
      method: 'POST',
      body: JSON.stringify({ weekId, generatedBy: 'manual' }),
    });
  },
};

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
