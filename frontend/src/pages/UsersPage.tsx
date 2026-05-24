import { Fragment, useEffect, useState } from 'react';
import { userApi } from '../lib/api';
import type { User } from '../types/auth';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { PageLoader } from '../components/ui/PageLoader';
import { useAuth } from '../hooks/useAuth';

interface CreateForm {
  name: string;
  email: string;
  password: string;
  role: 'employee' | 'manager';
  isFixedMorningEmployee: boolean;
}

interface EditForm {
  name: string;
  email: string;
  role: User['role'];
}

const ROLE_LABELS: Record<string, string> = {
  employee: 'עובד',
  manager: 'מנהל',
  admin: 'מנהל מערכת',
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);
  const [togglingMorningId, setTogglingMorningId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    isFixedMorningEmployee: false,
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    email: '',
    role: 'employee',
  });
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    userApi
      .getUsers()
      .then((res) => setUsers(res.users))
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'שגיאה בטעינת משתמשים'))
      .finally(() => setPageLoading(false));
  }, []);

  function setField<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      const res = await userApi.createUser(form);
      setUsers((prev) => [...prev, res.user]);
      setShowForm(false);
      setForm({
        name: '',
        email: '',
        password: '',
        role: 'employee',
        isFixedMorningEmployee: false,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'שגיאה ביצירת משתמש');
    } finally {
      setFormLoading(false);
    }
  }

  async function toggleStatus(user: User) {
    setTogglingStatusId(user._id);
    try {
      const res = await userApi.setStatus(user._id, !user.isActive);
      setUsers((prev) => prev.map((u) => (u._id === user._id ? res.user : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'שגיאה בעדכון סטטוס');
    } finally {
      setTogglingStatusId(null);
    }
  }

  function startEdit(user: User) {
    setEditingId(user._id);
    setEditError('');
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  function setEditField<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditError('');
    setEditLoading(true);
    try {
      const res = await userApi.updateUser(editingId, {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
      });
      setUsers((prev) => prev.map((u) => (u._id === editingId ? res.user : u)));
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'שגיאה בעדכון משתמש');
    } finally {
      setEditLoading(false);
    }
  }

  async function toggleFixedMorning(user: User) {
    setTogglingMorningId(user._id);
    try {
      const res = await userApi.setFixedMorning(user._id, !user.isFixedMorningEmployee);
      setUsers((prev) => prev.map((u) => (u._id === user._id ? res.user : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'שגיאה בעדכון הגדרת בוקר');
    } finally {
      setTogglingMorningId(null);
    }
  }

  if (pageLoading) {
    return (
      <MainLayout title="ניהול משתמשים" subtitle="הגדרות צוות">
        <PageLoader text="טוען משתמשים..." />
      </MainLayout>
    );
  }

  return (
    <MainLayout title="ניהול משתמשים" subtitle="הגדרות צוות">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-blue-700">משתמשי המערכת</h1>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <MaterialIcon name={showForm ? 'close' : 'add'} />
            {showForm ? 'ביטול' : 'צור משתמש חדש'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl shadow-bezeq-card border border-outline-variant p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">יצירת משתמש חדש</h2>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ישראל ישראלי"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  required
                  minLength={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="לפחות 8 תווים"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד</label>
                <select
                  value={form.role}
                  onChange={(e) => setField('role', e.target.value as 'employee' | 'manager')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="employee">עובד</option>
                  <option value="manager">מנהל</option>
                </select>
              </div>

              <div className="sm:col-span-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="fixedMorning"
                  checked={form.isFixedMorningEmployee}
                  onChange={(e) => setField('isFixedMorningEmployee', e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="fixedMorning" className="text-sm font-medium text-gray-700">
                  עובד בוקר קבוע (מוקצה אוטומטית למשמרות בוקר א׳–ה׳)
                </label>
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={formLoading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg transition-colors"
                >
                  {formLoading ? 'יוצר...' : 'צור משתמש'}
                </button>
              </div>
            </form>
          </div>
        )}

        {loadError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
            {loadError}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-bezeq-card border border-outline-variant overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-right">שם</th>
                <th className="px-4 py-3 text-right">אימייל</th>
                <th className="px-4 py-3 text-right">תפקיד</th>
                <th className="px-4 py-3 text-center">עובד בוקר קבוע</th>
                <th className="px-4 py-3 text-center">סטטוס</th>
                <th className="px-4 py-3 text-center">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    אין משתמשים
                  </td>
                </tr>
              )}
              {users.map((user) => (
                <Fragment key={user._id}>
                  <tr className={user.isActive ? '' : 'opacity-50'}>
                    <td className="px-4 py-3 font-medium text-gray-800">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleFixedMorning(user)}
                        disabled={togglingMorningId === user._id}
                        className={`w-10 h-5 rounded-full transition-colors relative disabled:opacity-50 disabled:cursor-wait ${
                          user.isFixedMorningEmployee ? 'bg-blue-500' : 'bg-gray-300'
                        }`}
                        title={
                          user.isFixedMorningEmployee ? 'הסר עובד בוקר קבוע' : 'הגדר עובד בוקר קבוע'
                        }
                      >
                        {togglingMorningId === user._id ? (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </span>
                        ) : (
                          <span
                            className={`block w-4 h-4 rounded-full bg-white shadow mx-0.5 transition-transform absolute top-0.5 ${
                              user.isFixedMorningEmployee ? 'right-0.5' : 'left-0.5'
                            }`}
                          />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleStatus(user)}
                        disabled={togglingStatusId === user._id}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-wait inline-flex items-center gap-1 ${
                          user.isActive
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {togglingStatusId === user._id ? (
                          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          user.isActive ? 'פעיל' : 'מושהה'
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => (editingId === user._id ? cancelEdit() : startEdit(user))}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        title="ערוך משתמש"
                      >
                        <MaterialIcon name={editingId === user._id ? 'close' : 'edit'} />
                        {editingId === user._id ? 'ביטול' : 'ערוך'}
                      </button>
                    </td>
                  </tr>
                  {editingId === user._id && (
                    <tr className="bg-blue-50/40">
                      <td colSpan={6} className="px-4 py-4">
                        {editError && (
                          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {editError}
                          </div>
                        )}
                        <form
                          onSubmit={handleEditSave}
                          className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
                        >
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              שם מלא
                            </label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditField('name', e.target.value)}
                              required
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              אימייל
                            </label>
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(e) => setEditField('email', e.target.value)}
                              required
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              תפקיד
                            </label>
                            <select
                              value={editForm.role}
                              onChange={(e) =>
                                setEditField('role', e.target.value as EditForm['role'])
                              }
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="employee">עובד</option>
                              <option value="manager">מנהל</option>
                              {currentUser?.role === 'admin' && (
                                <option value="admin">מנהל מערכת</option>
                              )}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={editLoading}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                            >
                              {editLoading ? 'שומר...' : 'שמור'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors"
                            >
                              ביטול
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
