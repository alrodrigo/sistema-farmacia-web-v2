import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import Login from '../features/auth/components/Login';
import PosPage from '@/features/pos/components/PosPage';
import { useAuthStore } from '@/stores/authStore';
import SuppliersPage from '@/features/suppliers/components/SuppliersPage';
import CategoriesPage from '@/features/categories/components/CategoriesPage';
import ProductsPage from '@/features/products/components/ProductsPage';
import DashboardPage from '@/features/dashboard/components/DashboardPage';
import UsersPage from '@/features/users/components/UsersPage';
import ReportsPage from '@/features/reports/components/ReportsPage';
import SettingsPage from '@/features/settings/components/SettingsPage';
import { useHasPermission } from '@/features/users/hooks/usePermissions';
import { useAllRolePermissions } from '@/features/users/hooks/useUsers';
import { RouterErrorBoundary } from '@/components/common/GlobalErrorBoundary';

// Componente para la ruta raíz ("/") que redirige inteligentemente al primer módulo autorizado
function IndexRedirect() {
    const { role } = useAuthStore();
    const { isLoading } = useAllRolePermissions();
    const canViewDashboard = useHasPermission('dashboard:view');
    const canAccessPos = useHasPermission('pos:access');
    const canViewInventory = useHasPermission('inventory:view');
    const canViewCategories = useHasPermission('categories:view');
    const canViewSuppliers = useHasPermission('suppliers:view');
    const canViewReports = useHasPermission('reports:view');
    const canViewUsers = useHasPermission('users:view');
    const canViewSettings = useHasPermission('settings:view') || (role || '').toLowerCase() === 'admin';

    if (isLoading) {
        return (
            <div className="h-full w-full flex items-center justify-center p-12 text-on-surface">
                <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
            </div>
        );
    }

    if (canViewDashboard) return <Navigate to="/dashboard" replace />;
    if (canAccessPos) return <Navigate to="/pos" replace />;
    if (canViewInventory) return <Navigate to="/inventory" replace />;
    if (canViewCategories) return <Navigate to="/categories" replace />;
    if (canViewSuppliers) return <Navigate to="/suppliers" replace />;
    if (canViewReports) return <Navigate to="/reports" replace />;
    if (canViewUsers) return <Navigate to="/users" replace />;
    if (canViewSettings) return <Navigate to="/settings" replace />;

    return (
        <div className="p-8 max-w-md mx-auto text-center mt-12">
            <h2 className="text-lg font-bold text-on-surface">Sin módulos autorizados</h2>
            <p className="text-xs text-secondary mt-1">
                Tu rol ({role || 'sin rol'}) no tiene permisos asignados para visualizar módulos del sistema. Consulta con el Administrador.
            </p>
        </div>
    );
}

// ProtectedRoute con verificación de autenticación y permisos RBAC dinámicos
type ProtectedRouteProps = {
    children: React.ReactNode;
    requiredPermission?: string;
    allowedRoles?: string[];
};

function ProtectedRoute({ children, requiredPermission, allowedRoles }: ProtectedRouteProps) {
    const { user, role, isLoading } = useAuthStore();
    const { isLoading: isLoadingPerms } = useAllRolePermissions();
    const hasPerm = useHasPermission(requiredPermission || '');

    if (isLoading || (requiredPermission && isLoadingPerms)) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-background text-on-surface">
                <div className="flex flex-col items-center gap-3">
                    <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                    <span className="text-sm text-secondary font-medium">Verificando credenciales...</span>
                </div>
            </div>
        );
    }

    if (!user) return <Navigate to="/login" replace />;

    // Si tiene un permiso requerido específico (RBAC Dinámico)
    if (requiredPermission && !hasPerm) {
        return <Navigate to="/" replace />;
    }

    // Compatibilidad retroactiva si aún se definen allowedRoles
    if (allowedRoles && allowedRoles.length > 0) {
        const userRole = (role || '').toLowerCase().trim();
        const matchesRole = allowedRoles.some((allowed) => {
            const normalized = allowed.toLowerCase().trim();
            return userRole === normalized || userRole.includes(normalized);
        });

        if (!matchesRole) {
            return <Navigate to="/" replace />;
        }
    }

    return <>{children}</>;
}

export const router = createBrowserRouter([
    {
        path: '/login',
        element: <Login />,
        errorElement: <RouterErrorBoundary />,
    },
    {
        path: '/',
        element: (
            <ProtectedRoute>
                <MainLayout />
            </ProtectedRoute>
        ),
        errorElement: <RouterErrorBoundary />,
        children: [
            { index: true, element: <IndexRedirect /> },
            {
                path: 'dashboard',
                element: (
                    <ProtectedRoute requiredPermission="dashboard:view">
                        <DashboardPage />
                    </ProtectedRoute>
                ),
            },
            {
                path: 'pos',
                element: (
                    <ProtectedRoute requiredPermission="pos:access">
                        <PosPage />
                    </ProtectedRoute>
                ),
            },
            {
                path: 'inventory',
                element: (
                    <ProtectedRoute requiredPermission="inventory:view">
                        <ProductsPage />
                    </ProtectedRoute>
                ),
            },
            {
                path: 'products',
                element: (
                    <ProtectedRoute requiredPermission="inventory:view">
                        <ProductsPage />
                    </ProtectedRoute>
                ),
            },
            {
                path: 'categories',
                element: (
                    <ProtectedRoute requiredPermission="categories:view">
                        <CategoriesPage />
                    </ProtectedRoute>
                ),
            },
            {
                path: 'suppliers',
                element: (
                    <ProtectedRoute requiredPermission="suppliers:view">
                        <SuppliersPage />
                    </ProtectedRoute>
                ),
            },
            {
                path: 'reports',
                element: (
                    <ProtectedRoute requiredPermission="reports:view">
                        <ReportsPage />
                    </ProtectedRoute>
                ),
            },
            {
                path: 'users',
                element: (
                    <ProtectedRoute requiredPermission="users:view">
                        <UsersPage />
                    </ProtectedRoute>
                ),
            },
            {
                path: 'settings',
                element: (
                    <ProtectedRoute requiredPermission="settings:view">
                        <SettingsPage />
                    </ProtectedRoute>
                ),
            },
        ],
    },
]);