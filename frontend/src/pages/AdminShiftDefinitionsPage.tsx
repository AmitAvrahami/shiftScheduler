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
    name: '',
    startTime: '08:00',
    endTime: '16:00',
    durationMinutes: 480,
    crossesMidnight: false,
    color: '#101B79',
    orderNumber: 1,
    isActive: true,
    requiredStaffCount: 1,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  });

  useEffect(() => {
    loadDefinitions();
  }, []);

  async function loadDefinitions() {
    try {
      const res = await shiftDefinitionApi.getActive();
      setDefinitions(res.definitions.filter((definition) => definition.isActive));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load definitions');
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
      setForm({
        name: '',
        startTime: '08:00',
        endTime: '16:00',
        durationMinutes: 480,
        crossesMidnight: false,
        color: '#101B79',
        orderNumber: 1,
        isActive: true,
        requiredStaffCount: 1,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      });
      loadDefinitions();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save definition');
    }
  }

  async function handleDelete(id: string) {
    if (!id) {
      alert('Cannot delete definition: missing definition id');
      return;
    }
    if (!confirm('Are you sure you want to deactivate this shift type?')) return;
    try {
      await shiftDefinitionApi.delete(id);
      setDefinitions((prev) => prev.filter((definition) => definition._id !== id));
      await loadDefinitions();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete definition');
    }
  }

  return (
    <MainLayout title="Shift Definitions">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Shift Definitions</h1>
          <button
            onClick={() => {
              setEditingId(null);
              setForm({
                name: '',
                startTime: '08:00',
                endTime: '16:00',
                durationMinutes: 480,
                crossesMidnight: false,
                color: '#101B79',
                orderNumber: definitions.length + 1,
                isActive: true,
                requiredStaffCount: 1,
                daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
              });
              setShowForm(true);
            }}
            className="bg-[#101B79] text-white px-4 py-2 rounded shadow hover:bg-opacity-90 flex items-center gap-2"
          >
            <MaterialIcon name="add" /> New Shift
          </button>
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}
        {loading && <p className="text-gray-500">Loading definitions...</p>}

        {!loading && definitions.length === 0 && (
          <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200 text-yellow-800 text-center">
            <MaterialIcon name="warning" className="text-4xl mb-2" />
            <p className="font-medium">No active shift definitions found.</p>
            <p className="text-sm mt-1">Shifts are needed to initialize new weekly schedules.</p>
          </div>
        )}

        <div className="grid gap-4">
          {definitions.map((def) => (
            <div
              key={def._id}
              className="bg-white p-4 rounded-lg shadow-sm border border-outline-variant flex justify-between items-center border-l-8"
              style={{ borderLeftColor: def.color }}
            >
              <div>
                <h3 className="font-bold text-lg text-on-surface">{def.name}</h3>
                <div className="flex items-center gap-4 text-sm text-on-surface-variant mt-1">
                  <span className="flex items-center gap-1">
                    <MaterialIcon name="schedule" className="text-xs" />
                    {def.startTime} - {def.endTime}
                  </span>
                  <span className="flex items-center gap-1">
                    <MaterialIcon name="timer" className="text-xs" />
                    {def.durationMinutes} min
                  </span>
                  <span className="flex items-center gap-1">
                    <MaterialIcon name="sort" className="text-xs" />
                    Order: {def.orderNumber}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setForm(def);
                    setEditingId(def._id);
                    setShowForm(true);
                  }}
                  className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
                  title="Edit"
                >
                  <MaterialIcon name="edit" />
                </button>
                <button
                  onClick={() => handleDelete(def._id)}
                  className="p-2 text-error hover:bg-error/10 rounded-full transition-colors"
                  title="Delete"
                >
                  <MaterialIcon name="delete" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md border border-outline-variant">
              <h2 className="text-xl font-bold mb-6 text-on-surface">
                {editingId ? 'Edit Shift Definition' : 'New Shift Definition'}
              </h2>
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
                  Name
                  <input
                    className="border border-outline p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    required
                    placeholder="e.g., Morning Shift"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
                    Start Time
                    <input
                      type="time"
                      className="border border-outline p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                      required
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
                    End Time
                    <input
                      type="time"
                      className="border border-outline p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                      required
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
                    Duration (mins)
                    <input
                      type="number"
                      className="border border-outline p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                      required
                      value={form.durationMinutes}
                      onChange={(e) => setForm({ ...form, durationMinutes: parseInt(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
                    Order Number
                    <input
                      type="number"
                      className="border border-outline p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                      required
                      value={form.orderNumber}
                      onChange={(e) => setForm({ ...form, orderNumber: parseInt(e.target.value) })}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
                    Required Staff
                    <input
                      type="number"
                      className="border border-outline p-2.5 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                      required
                      min="1"
                      value={form.requiredStaffCount}
                      onChange={(e) => setForm({ ...form, requiredStaffCount: parseInt(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
                    Crosses Midnight
                    <div className="flex items-center h-full">
                      <input
                        type="checkbox"
                        className="w-5 h-5 accent-primary"
                        checked={form.crossesMidnight}
                        onChange={(e) => setForm({ ...form, crossesMidnight: e.target.checked })}
                      />
                    </div>
                  </label>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-on-surface-variant">Days of Week</span>
                  <div className="flex flex-wrap gap-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                      <label
                        key={i}
                        className={`flex items-center justify-center w-8 h-8 rounded-full border cursor-pointer transition-colors ${
                          form.daysOfWeek?.includes(i)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-on-surface-variant border-outline hover:bg-surface-container-low'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={form.daysOfWeek?.includes(i)}
                          onChange={(e) => {
                            const days = form.daysOfWeek || [];
                            const nextDays = e.target.checked
                              ? [...days, i].sort()
                              : days.filter((d) => d !== i);
                            setForm({ ...form, daysOfWeek: nextDays });
                          }}
                        />
                        <span className="text-xs font-bold">{day}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
                  Color
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      className="h-10 w-20 p-0 border-none cursor-pointer"
                      required
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                    />
                    <span className="text-xs font-mono">{form.color}</span>
                  </div>
                </label>
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-5 py-2.5 border border-outline rounded-lg text-sm font-semibold hover:bg-surface-container-low transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#101B79] text-white rounded-lg text-sm font-semibold hover:bg-opacity-90 transition-all shadow-md"
                  >
                    Save Definition
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
