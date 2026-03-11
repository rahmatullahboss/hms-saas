import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  /** If provided, only users with one of these roles can access the route */
  allowedRoles?: string[];
  /** Where to redirect if not authenticated */
  redirectTo?: string;
}

/**
 * ProtectedRoute — wraps routes that require authentication.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 *
 *   <Route element={<ProtectedRoute allowedRoles={['hospital_admin']} />}>
 *     <Route path="/settings" element={<Settings />} />
 *   </Route>
 */
export function ProtectedRoute({ allowedRoles, redirectTo = '/login' }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
