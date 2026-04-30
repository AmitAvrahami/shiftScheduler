import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const roleLabel: Record<string, string> = {
  employee: 'עובד',
  manager: 'מנהל',
  admin: 'מנהל מערכת',
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'manager')) {
      navigate('/admin');
    }
  }, [user, navigate]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-md p-10 text-center">
        <h1 className="text-3xl font-bold text-blue-700 mb-4">שלום, {user?.name}</h1>
        <p className="text-gray-600 mb-2">
          תפקיד: <span className="font-medium">{roleLabel[user?.role ?? ''] ?? user?.role}</span>
        </p>
        <p className="text-gray-400 text-sm mb-8">{user?.email}</p>
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 text-white font-medium px-6 py-2 rounded-lg transition-colors"
        >
          התנתק
        </button>
      </div>
    </main>
  );
}
