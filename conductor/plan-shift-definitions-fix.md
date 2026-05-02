# Shift Definitions Fix & Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gracefully handle missing shift definitions during schedule generation and provide a dedicated UI for managers to create and manage them.

**Architecture:** 
The backend already has a `ShiftDefinition` Mongoose model and CRUD routes (`/api/v1/shift-definitions`). We will enhance the error handling during schedule initialization to return a specific `ERR_NO_SHIFT_TEMPLATES` code. On the frontend, we will build a new page at `/admin/shift-definitions` to consume these existing APIs, allowing managers to view, create, edit, and delete shift types. *Note: We will omit `organizationId` from the schema as the app is currently single-tenant, but the rest of the requested fields (`name`, `startTime`, `endTime`) are already present.*

**Tech Stack:** Node.js, Express, Mongoose, React, TypeScript, Tailwind CSS

---

### Task 1: Backend Error Handling Infrastructure

**Files:**
- Modify: `backend/src/utils/AppError.ts`
- Modify: `backend/src/middleware/errorMiddleware.ts`

- [ ] **Step 1: Extend AppError to support custom error codes**

```typescript
// backend/src/utils/AppError.ts
class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    if (code) this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
```

- [ ] **Step 2: Update error middleware to return the code**

```typescript
// backend/src/middleware/errorMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import AppError from '../utils/AppError';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/AppError.ts backend/src/middleware/errorMiddleware.ts
git commit -m "feat(backend): add custom error code support to AppError"
```

### Task 2: Throw Specific Error on Missing Definitions

**Files:**
- Modify: `backend/src/services/shiftGenerationService.ts`

- [ ] **Step 1: Update generateWeekShifts to throw specific error code**

```typescript
// In backend/src/services/shiftGenerationService.ts, locate generateWeekShifts:
// Replace the existing throw with the specific code

  const definitions = await ShiftDefinition.find({ isActive: true })
    .session(session || null)
    .sort({ orderNumber: 1 })
    .lean();
  if (definitions.length === 0) {
    throw new AppError('No active shift definitions found', 422, 'ERR_NO_SHIFT_TEMPLATES');
  }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/shiftGenerationService.ts
git commit -m "fix(backend): throw ERR_NO_SHIFT_TEMPLATES when shift definitions are missing"
```

### Task 3: Frontend API Error Handling

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Create ApiError and update request utility**

```typescript
// At the top of frontend/src/lib/api.ts, below the imports:
export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

// Locate the request function and update it:
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new ApiError(data.message ?? 'Request failed', data.code);
  return data as T;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): support custom API error codes"
```

### Task 4: Friendly Error State in Schedules Page

**Files:**
- Modify: `frontend/src/pages/SchedulesPage.tsx`

- [ ] **Step 1: Handle ERR_NO_SHIFT_TEMPLATES in handleCreate**

```typescript
// In frontend/src/pages/SchedulesPage.tsx, update the handleCreate catch block:
// Make sure to import ApiError from '../lib/api' if necessary, or just check the code property.
import { ApiError } from '../lib/api'; // Add this to imports at the top

// Inside handleCreate:
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'ERR_NO_SHIFT_TEMPLATES') {
        showToast('It looks like you haven\'t defined your shifts yet. Please go to Settings > Shift Definitions to get started.', 'error');
        navigate('/admin/shift-definitions');
        return;
      }
      if ((err instanceof Error && err.message.includes('409')) || (err.message && err.message.includes('already exists'))) {
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/SchedulesPage.tsx
git commit -m "feat(frontend): redirect to shift definitions on missing templates error"
```

### Task 5: Enhance API Client for Shift Definitions

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add CRUD methods to shiftDefinitionApi**

```typescript
// In frontend/src/lib/api.ts, update shiftDefinitionApi:
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
  
  update(id: string, body: Partial<ShiftDefinition>): Promise<{ success: boolean; definition: ShiftDefinition }> {
    return request(`/shift-definitions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  
  delete(id: string): Promise<{ success: boolean }> {
    return request(`/shift-definitions/${id}`, {
      method: 'DELETE',
    });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): add CRUD API methods for shift definitions"
```

### Task 6: Build Shift Definitions Management UI

**Files:**
- Create: `frontend/src/pages/AdminShiftDefinitionsPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create AdminShiftDefinitionsPage.tsx**

```tsx
import { useEffect, useState } from 'react';
import { shiftDefinitionApi } from '../lib/api';
import type { ShiftDefinition } from '../types/constraint';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';

export default function AdminShiftDefinitionsPage() {
  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ShiftDefinition>>({
    name: '', startTime: '08:00', endTime: '16:00', durationMinutes: 480, color: '#101B79', orderNumber: 1
  });

  useEffect(() => {
    loadDefinitions();
  }, []);

  async function loadDefinitions() {
    try {
      const res = await shiftDefinitionApi.getActive();
      setDefinitions(res.definitions);
    } catch (err) {
      setError('Failed to load definitions');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        await shiftDefinitionApi.update(editingId, form);
      } else {
        await shiftDefinitionApi.create(form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', startTime: '08:00', endTime: '16:00', durationMinutes: 480, color: '#101B79', orderNumber: 1 });
      loadDefinitions();
    } catch (err) {
      alert('Failed to save definition');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to deactivate this shift type?')) return;
    try {
      await shiftDefinitionApi.delete(id);
      loadDefinitions();
    } catch (err) {
      alert('Failed to delete definition');
    }
  }

  return (
    <MainLayout title="Shift Definitions">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Shift Definitions</h1>
          <button 
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 flex items-center gap-2"
          >
            <MaterialIcon name="add" /> New Shift
          </button>
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {loading && <p>Loading...</p>}

        {!loading && definitions.length === 0 && (
          <div className="bg-yellow-50 p-4 rounded text-yellow-800">
            No active shift definitions found. Please create one.
          </div>
        )}

        <div className="grid gap-4">
          {definitions.map(def => (
            <div key={def._id} className="bg-white p-4 rounded shadow flex justify-between items-center border-l-4" style={{ borderColor: def.color }}>
              <div>
                <h3 className="font-bold text-lg">{def.name}</h3>
                <p className="text-gray-600">{def.startTime} - {def.endTime} ({def.durationMinutes} mins)</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setForm(def); setEditingId(def._id); setShowForm(true); }}
                  className="text-blue-600 hover:bg-blue-50 p-2 rounded"
                >
                  <MaterialIcon name="edit" />
                </button>
                <button 
                  onClick={() => handleDelete(def._id)}
                  className="text-red-600 hover:bg-red-50 p-2 rounded"
                >
                  <MaterialIcon name="delete" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">{editingId ? 'Edit' : 'New'} Shift</h2>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col">Name <input className="border p-2 rounded" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col">Start Time <input type="time" className="border p-2 rounded" required value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} /></label>
                  <label className="flex flex-col">End Time <input type="time" className="border p-2 rounded" required value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} /></label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col">Duration (mins) <input type="number" className="border p-2 rounded" required value={form.durationMinutes} onChange={e => setForm({...form, durationMinutes: parseInt(e.target.value)})} /></label>
                  <label className="flex flex-col">Order Number <input type="number" className="border p-2 rounded" required value={form.orderNumber} onChange={e => setForm({...form, orderNumber: parseInt(e.target.value)})} /></label>
                </div>
                <label className="flex flex-col">Color <input type="color" className="border p-2 rounded h-10 w-full" required value={form.color} onChange={e => setForm({...form, color: e.target.value})} /></label>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

```tsx
// In frontend/src/App.tsx, import the new page:
import AdminShiftDefinitionsPage from './pages/AdminShiftDefinitionsPage';

// Inside the <Routes> block, add:
          <Route
            path="/admin/shift-definitions"
            element={
              <ProtectedRoute requiredRole="manager">
                <AdminShiftDefinitionsPage />
              </ProtectedRoute>
            }
          />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminShiftDefinitionsPage.tsx frontend/src/App.tsx
git commit -m "feat(frontend): create admin shift definitions management UI"
```
