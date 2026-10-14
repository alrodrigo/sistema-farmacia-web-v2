import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useBrandingStore, applyThemeVariables } from '@/stores/brandingStore';
import { useStoreSettings } from '@/features/settings/hooks/useStoreSettings';
import { supabase } from '@/lib/supabase';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useHasPermission } from '@/features/users/hooks/usePermissions';

const ROUTE_TITLES: Record<string, { title: string; subtitle: string; icon: string }> = {
    '/dashboard': { title: 'Dashboard General', subtitle: 'Panel de control y rendimiento financiero', icon: 'grid_view' },
    '/pos': { title: 'Punto de Venta (POS)', subtitle: 'Atención al cliente y facturación de turno', icon: 'point_of_sale' },
    '/inventory': { title: 'Inventario Farmacéutico', subtitle: 'Catálogo de medicamentos, lotes y existencias', icon: 'inventory_2' },
    '/categories': { title: 'Categorías', subtitle: 'Clasificación terapéutica y comercial', icon: 'category' },
    '/suppliers': { title: 'Proveedores', subtitle: 'Laboratorios y distribuidores autorizados', icon: 'local_shipping' },
    '/reports': { title: 'Reportes y Analítica', subtitle: 'Auditoría de ventas, cierres y vencimientos', icon: 'insights' },
    '/users': { title: 'Control de Acceso', subtitle: 'Gobierno de personal, roles y seguridad', icon: 'manage_accounts' },
    '/settings': { title: 'Configuración de la Farmacia', subtitle: 'Identidad comercial, NIT, ubicación y comprobantes térmicos', icon: 'store' },
};

export default function MainLayout() {
    const { user, role, clearUser } = useAuthStore();
    const { systemTitle, systemSubtitle, logoType, logoIcon, logoImage, themeColor } = useBrandingStore();
    const { data: storeSettings } = useStoreSettings();
    const navigate = useNavigate();
    const location = useLocation();
    const isOnline = useOnlineStatus();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Cerrar menú móvil automáticamente al navegar
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // Sincronizar tema de colores global
    useEffect(() => {
        applyThemeVariables(themeColor);
    }, [themeColor]);

    // Nombre efectivo de la farmacia: primero el configurado en Supabase, luego el branding personalizado, luego PharmaCore
    const effectiveStoreName = (systemTitle && systemTitle !== 'PharmaCore' ? systemTitle : '') || storeSettings?.business_name || systemTitle || 'PharmaCore';

    // Permisos dinámicos vía RBAC
    const canViewDashboard = useHasPermission('dashboard:view');
    const canAccessPos = useHasPermission('pos:access');
    const canViewInventory = useHasPermission('inventory:view');
    const canViewCategories = useHasPermission('categories:view');
    const canViewSuppliers = useHasPermission('suppliers:view');
    const canViewReports = useHasPermission('reports:view');
    const canViewUsers = useHasPermission('users:view');
    const canViewSettings = useHasPermission('settings:view') || (role || '').toLowerCase() === 'admin';

    const currentRoute = ROUTE_TITLES[location.pathname] || {
        title: effectiveStoreName,
        subtitle: 'Sistema de Gestión Farmacéutica',
        icon: 'local_pharmacy',
    };

    // Sincronizar título de la pestaña del navegador
    useEffect(() => {
        document.title = `${effectiveStoreName} - ${currentRoute.title}`;
    }, [effectiveStoreName, currentRoute.title]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        clearUser();
        navigate('/login');
    };

    const navClass = ({ isActive }: { isActive: boolean }) =>
        `group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-150 font-semibold text-xs tracking-wide cursor-pointer select-none ${isActive
            ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-lg shadow-primary/30 font-bold border-l-4 border-white'
            : 'text-slate-300 hover:text-white hover:bg-white/[0.08] hover:translate-x-0.5'
        }`;

    const formattedRoleName = () => {
        const r = (role || '').toLowerCase();
        if (r === 'admin') return 'Administrador';
        if (r === 'cajero') return 'Cajero';
        if (r === 'personalizado') return 'Personalizado';
        return role || 'Personal';
    };

    return (
        <div className="min-h-screen bg-background font-sans text-on-surface flex">
            {/* Backdrop oscuro para móvil / tablet cuando el menú está abierto */}
            {isMobileMenuOpen && (
                <div
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-50 animate-modal-backdrop"
                    aria-hidden="true"
                />
            )}

            {/* Sidebar - deslizante en móvil y tablet, fijo en desktop */}
            <aside className={`print:hidden fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800/80 z-50 flex flex-col justify-between select-none shadow-2xl transition-transform duration-300 ease-in-out ${
                isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
            }`}>
                <div className="flex flex-col">
                    {/* Brand Header */}
                    <div className="h-[74px] px-5 flex items-center justify-between border-b border-white/[0.08] bg-white/[0.02]">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-2xl bg-white p-1.5 flex items-center justify-center overflow-hidden shrink-0 shadow-lg shadow-black/20 ring-1 ring-white/20 border border-slate-100">
                                {logoType === 'image' && logoImage ? (
                                    <img src={logoImage} alt="Logo de la farmacia" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="w-full h-full rounded-xl bg-primary flex items-center justify-center text-white">
                                        <span className="material-symbols-outlined text-[22px]">
                                            {logoIcon || 'local_pharmacy'}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-black text-white tracking-tight truncate leading-tight uppercase">
                                    {effectiveStoreName}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary-fixed truncate">
                                        {systemSubtitle || 'ERP Clinical'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Botón cerrar Drawer en móvil */}
                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="lg:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                            aria-label="Cerrar menú"
                        >
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>

                    {/* SECCIÓN OPERACIONES */}
                    <div className="px-4 pt-4 pb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400/80">
                            Operaciones
                        </span>
                        <span className="w-8 h-px bg-white/10"></span>
                    </div>

                    <nav className="flex flex-col gap-1 px-3">
                        {canViewDashboard && (
                            <NavLink to="/dashboard" className={navClass}>
                                <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">grid_view</span>
                                <span>Dashboard</span>
                            </NavLink>
                        )}
                        {canAccessPos && (
                            <NavLink to="/pos" className={navClass}>
                                <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">point_of_sale</span>
                                <span>Punto de Venta / POS</span>
                            </NavLink>
                        )}
                        {canViewInventory && (
                            <NavLink to="/inventory" className={navClass}>
                                <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">inventory_2</span>
                                <span>Inventario</span>
                            </NavLink>
                        )}
                        {canViewCategories && (
                            <NavLink to="/categories" className={navClass}>
                                <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">category</span>
                                <span>Categorías</span>
                            </NavLink>
                        )}
                        {canViewSuppliers && (
                            <NavLink to="/suppliers" className={navClass}>
                                <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">local_shipping</span>
                                <span>Proveedores</span>
                            </NavLink>
                        )}
                        {canViewReports && (
                            <NavLink to="/reports" className={navClass}>
                                <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">insights</span>
                                <span>Reportes</span>
                            </NavLink>
                        )}
                    </nav>

                    {/* SECCIÓN CONFIGURACIÓN (Parámetros y Control de Acceso) */}
                    {(canViewUsers || canViewSettings) && (
                        <>
                            <div className="px-4 pt-5 pb-1.5 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400/80">
                                    Configuración
                                </span>
                                <span className="w-8 h-px bg-white/10"></span>
                            </div>

                            <nav className="flex flex-col gap-1 px-3">
                                {canViewSettings && (
                                    <NavLink to="/settings" className={navClass}>
                                        <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">store</span>
                                        <span>Datos de la Farmacia</span>
                                    </NavLink>
                                )}
                                {canViewUsers && (
                                    <NavLink to="/users" className={navClass}>
                                        <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">manage_accounts</span>
                                        <span>Control de Acceso</span>
                                    </NavLink>
                                )}
                            </nav>
                        </>
                    )}
                </div>

                {/* Perfil del Usuario en la parte inferior */}
                <div className="p-3 m-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between backdrop-blur-md shadow-sm">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="relative shrink-0">
                            <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary-fixed">
                                <span className="material-symbols-outlined text-[20px]">person</span>
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-white truncate">
                                {user?.email?.split('@')[0] || 'Usuario'}
                            </span>
                            <span className="text-[10px] font-semibold text-primary-fixed uppercase tracking-wider truncate">
                                {formattedRoleName()}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors p-2 rounded-xl cursor-pointer"
                        title="Cerrar sesión"
                    >
                        <span className="material-symbols-outlined text-[19px]">logout</span>
                    </button>
                </div>
            </aside>

            {/* Header + Main content - responsivo (pl-0 en móvil/tablet, pl-64 en desktop) */}
            <div className="pl-0 lg:pl-64 print:pl-0 w-full flex flex-col min-h-screen">
                <header className="print:hidden fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface-container-lowest z-40 px-3.5 sm:px-6 flex items-center justify-between gap-2.5 sm:gap-4 border-b border-surface-container shadow-xs">
                    {/* Botón hamburguesa + Título de la sección actual */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {/* Botón menú hamburguesa móvil/tablet */}
                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="lg:hidden w-9 h-9 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface cursor-pointer shrink-0 transition-colors"
                            aria-label="Abrir menú de navegación"
                        >
                            <span className="material-symbols-outlined text-[22px]">menu</span>
                        </button>

                        <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary shrink-0 hidden xs:flex">
                            <span className="material-symbols-outlined text-[20px]">{currentRoute.icon}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                            <h2 className="text-xs sm:text-sm font-bold text-on-surface leading-tight truncate">{currentRoute.title}</h2>
                            <span className="text-[11px] sm:text-xs text-secondary hidden md:inline leading-tight truncate">{currentRoute.subtitle}</span>
                        </div>
                    </div>

                    {/* Estado del sistema, badge de farmacia y fecha */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        {/* Chip de la farmacia en el header */}
                        <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-xl bg-surface-container-low border border-surface-container text-xs">
                            <div className="w-5 h-5 rounded-md bg-white p-0.5 flex items-center justify-center shrink-0 overflow-hidden shadow-xs border border-slate-200">
                                {logoType === 'image' && logoImage ? (
                                    <img src={logoImage} alt="Logo" className="w-full h-full object-contain" />
                                ) : (
                                    <span className="material-symbols-outlined text-primary text-[14px]">
                                        {logoIcon || 'local_pharmacy'}
                                    </span>
                                )}
                            </div>
                            <span className="font-bold text-on-surface max-w-[150px] truncate">{effectiveStoreName}</span>
                        </div>

                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container-low text-secondary text-xs font-mono">
                            <span className="material-symbols-outlined text-[15px]">calendar_today</span>
                            <span className="capitalize">{new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full bg-surface-container-low border border-surface-container">
                            <span className="relative flex h-2 w-2">
                                {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>}
                                <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-primary' : 'bg-error'}`}></span>
                            </span>
                            <span className={`text-[11px] sm:text-xs font-semibold uppercase ${isOnline ? 'text-on-surface-variant' : 'text-error'}`}>
                                {isOnline ? 'Online' : 'Offline'}
                            </span>
                        </div>
                    </div>
                </header>

                <main className="w-full pt-16 print:pt-0 bg-background min-h-screen">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}