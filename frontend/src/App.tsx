import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ConstraintPage from './pages/ConstraintPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminConstraintsPage from './pages/AdminConstraintsPage';
import AdminShiftDefinitionsPage from './pages/AdminShiftDefinitionsPage';
import SchedulesPage from './pages/SchedulesPage';
import ScheduleBoardPage from './pages/ScheduleBoardPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute requiredRole="manager">
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/constraints"
            element={
              <ProtectedRoute>
                <ConstraintPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/constraints"
            element={
              <ProtectedRoute requiredRole="manager">
                <AdminConstraintsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/shift-definitions"
            element={
              <ProtectedRoute requiredRole="manager">
                <AdminShiftDefinitionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="manager">
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedules"
            element={
              <ProtectedRoute requiredRole="manager">
                <SchedulesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedules/:weekId"
            element={
              <ProtectedRoute requiredRole="manager">
                <ScheduleBoardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedules/:weekId/edit"
            element={
              <ProtectedRoute requiredRole="manager">
                <ScheduleBoardPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
