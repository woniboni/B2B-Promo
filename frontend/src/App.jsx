import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import PromotionListPage from './pages/PromotionListPage';
import PromotionDetailPage from './pages/PromotionDetailPage';
import MyApplicationsPage from './pages/MyApplicationsPage';
import AdminPromotionListPage from './pages/admin/AdminPromotionListPage';
import AdminPromotionFormPage from './pages/admin/AdminPromotionFormPage';

const queryClient = new QueryClient();

function ProtectedRoute({ children, role }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (role && user?.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <PromotionListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/promotions/:id"
            element={
              <ProtectedRoute>
                <PromotionDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications/me"
            element={
              <ProtectedRoute>
                <MyApplicationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminPromotionListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/promotions/new"
            element={
              <ProtectedRoute role="admin">
                <AdminPromotionFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/promotions/:id/edit"
            element={
              <ProtectedRoute role="admin">
                <AdminPromotionFormPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export { ProtectedRoute };
