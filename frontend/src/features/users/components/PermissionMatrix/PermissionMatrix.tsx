import { useState, useMemo, Fragment } from 'react';
import { useRoles, usePermissions, useAllRolePermissions, useRoleMutations } from '../../hooks/useUsers';
import { PERMISSION_CATEGORIES, PERMISSIONS } from '../../constants/permissions';
import { toast } from '@/stores/toastStore';

interface PermissionMatrixProps {
    onClose?: () => void;
    onEditRole?: (roleId: string | null) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
    'Dashboard': 'grid_view',
    'Punto de Venta (POS)': 'point_of_sale',
    'Inventario': 'inventory_2',
    'Categorías': 'category',
    'Proveedores': 'local_shipping',
    'Reportes': 'insights',
    'Seguridad y Usuarios': 'manage_accounts',
    'Configuración': 'store',
};

export default function PermissionMatrix({ onClose, onEditRole }: PermissionMatrixProps) {
    const { data: roles = [], isLoading: rolesLoading } = useRoles();
    const { data: permissions = [], isLoading: permsLoading } = usePermissions();
    const { data: allRolePermissions = {}, isLoading: permsMapLoading } = useAllRolePermissions();
    const { setPermissionsMut } = useRoleMutations();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

    // Mapeo estructurado de permisos agrupados por categoría
    const categorizedPermissions = useMemo(() => {
        const catMap: Record<string, Array<{ id: string; name: string; label: string; category: string; description: string }>> = {};

        // Inicializar categorías estándar
        PERMISSION_CATEGORIES.forEach(cat => {
            catMap[cat] = [];
        });

        permissions.forEach(p => {
            const cat = p.category || (PERMISSIONS as any)[p.name]?.category || 'General';
            const label = p.label || (PERMISSIONS as any)[p.name]?.label || p.name;
            const description = (p as any).description || (PERMISSIONS as any)[p.name]?.description || '';
            if (!catMap[cat]) catMap[cat] = [];
            catMap[cat].push({
                id: p.id,
                name: p.name,
                label,
                category: cat,
                description,
            });
        });

        // Filtrar según búsqueda y categoría seleccionada
        const result: Record<string, Array<{ id: string; name: string; label: string; category: string; description: string }>> = {};
        Object.entries(catMap).forEach(([cat, perms]) => {
            if (selectedCategory !== 'ALL' && selectedCategory !== cat) return;

            const filtered = perms.filter(p => {
                if (!searchTerm) return true;
                const term = searchTerm.toLowerCase();
                return (
                    p.name.toLowerCase().includes(term) ||
                    p.label.toLowerCase().includes(term) ||
                    p.description.toLowerCase().includes(term)
                );
            });

            if (filtered.length > 0) {
                result[cat] = filtered;
            }
        });

        return result;
    }, [permissions, searchTerm, selectedCategory]);

    const toggleCategoryCollapse = (category: string) => {
        setCollapsedCategories(prev => ({
            ...prev,
            [category]: !prev[category],
        }));
    };

    // Toggle instantáneo de un permiso para un rol específico
    const handleToggleCell = async (roleId: string, roleName: string, permissionName: string, currentHas: boolean) => {
        if (roleName.toLowerCase() === 'admin') {
            return; // Admin siempre tiene todos los permisos
        }

        // Obtener permisos actuales del rol (vienen como array de strings con los names)
        const currentPerms = allRolePermissions[roleId] || allRolePermissions[roleName] || [];
        const nextPerms = currentHas
            ? currentPerms.filter((p: string) => p !== permissionName)
            : [...currentPerms, permissionName];

        try {
            await setPermissionsMut.mutateAsync({
                roleId,
                permissionIds: nextPerms,
            });
            toast.success('Permiso actualizado en la matriz RBAC');
        } catch (err: any) {
            toast.error(err.message, 'Error al actualizar permiso');
        }
    };

    const hasPermission = (roleId: string, roleName: string, permissionName: string) => {
        if (roleName.toLowerCase() === 'admin') return true;
        const rolePerms = allRolePermissions[roleId] || allRolePermissions[roleName] || [];
        return rolePerms.includes(permissionName);
    };

    const isLoading = rolesLoading || permsLoading || permsMapLoading;

    if (isLoading) {
        return (
            <div className="p-12 text-center text-secondary bg-surface-container-lowest rounded-2xl border border-surface-container">
                <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                <p className="mt-3 text-sm font-semibold">Cargando matriz dinámica de permisos...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Encabezado y Acciones de la Matriz */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-surface-container-lowest rounded-2xl border border-surface-container shadow-xs">
                <div>
                    <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[22px]">security</span>
                        <span>Matriz de Roles y Permisos (RBAC Dinámico)</span>
                    </h3>
                    <p className="text-xs text-secondary mt-1">
                        Configurar accesos a módulos y acciones para cada rol. Los cambios se aplican en tiempo real.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onEditRole?.(null)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[18px]">add_moderator</span>
                        <span>Crear Rol Personalizado</span>
                    </button>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Tarjetas informativas de los roles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {roles.map(role => {
                    const rolePerms = allRolePermissions[role.id] || allRolePermissions[role.name] || [];
                    const isSuperAdmin = role.name.toLowerCase() === 'admin';
                    const permCount = isSuperAdmin ? permissions.length : rolePerms.length;

                    return (
                        <div
                            key={role.id}
                            className="p-4 rounded-xl bg-surface-container-lowest border border-surface-container flex flex-col justify-between shadow-xs"
                        >
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                    <span className={`p-1.5 rounded-lg flex items-center justify-center ${
                                        isSuperAdmin ? 'bg-purple-100 text-purple-800' : 'bg-primary/10 text-primary'
                                    }`}>
                                        <span className="material-symbols-outlined text-[18px]">
                                            {isSuperAdmin ? 'shield_person' : 'badge'}
                                        </span>
                                    </span>
                                    <div>
                                        <h4 className="text-sm font-bold text-on-surface uppercase tracking-wide">
                                            {role.name}
                                        </h4>
                                        <span className="text-[10px] text-secondary font-mono">
                                            {isSuperAdmin ? 'Superadministrador' : 'Rol configurable'}
                                        </span>
                                    </div>
                                </div>

                                {!isSuperAdmin && onEditRole && (
                                    <button
                                        type="button"
                                        onClick={() => onEditRole(role.id)}
                                        className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">edit</span>
                                        <span>Editar</span>
                                    </button>
                                )}
                            </div>

                            <p className="text-xs text-secondary mb-3 line-clamp-2">
                                {role.description || 'Sin descripción definida para este rol.'}
                            </p>

                            <div className="pt-2 border-t border-surface-container flex items-center justify-between text-xs font-mono">
                                <span className="text-secondary">Permisos activos:</span>
                                <span className="font-bold text-primary">
                                    {permCount} / {permissions.length}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div className="p-3 bg-surface-container-lowest rounded-xl border border-surface-container flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                <div className="relative w-full sm:w-72">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                        search
                    </span>
                    <input
                        type="search"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Buscar permiso..."
                        className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline text-xs focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs text-secondary font-semibold hidden sm:inline">Categoría:</span>
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="w-full sm:w-auto text-xs px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface border border-surface-container focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
                    >
                        <option value="ALL">Todas las Categorías</option>
                        {PERMISSION_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>
                                {cat}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* TABLA MATRIZ DE PERMISOS */}
            <div className="bg-surface-container-lowest rounded-2xl border border-surface-container shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                            <tr className="bg-surface-container-low text-secondary font-bold text-xs uppercase tracking-wider h-12 border-b border-surface-container">
                                <th className="px-5 py-3 w-1/2 font-semibold">
                                    Módulo / Acción del Sistema
                                </th>
                                {roles.map(role => (
                                    <th
                                        key={role.id}
                                        className="px-4 py-3 text-center font-bold text-on-surface min-w-[120px] border-l border-surface-container"
                                    >
                                        <div className="flex flex-col items-center">
                                            <span className="uppercase text-xs">{role.name}</span>
                                            {role.name.toLowerCase() === 'admin' && (
                                                <span className="text-[9px] text-purple-700 font-mono font-normal">Acceso Total</span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container text-sm">
                            {Object.entries(categorizedPermissions).map(([category, perms]) => {
                                const isCollapsed = !!collapsedCategories[category];

                                return (
                                    <Fragment key={category}>
                                        {/* Fila Encabezado de Categoría */}
                                        <tr className="bg-surface-container-low/60 select-none">
                                            <td
                                                colSpan={1 + roles.length}
                                                className="px-5 py-2.5 cursor-pointer hover:bg-surface-container-low transition-colors"
                                                onClick={() => toggleCategoryCollapse(category)}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="material-symbols-outlined text-primary text-[18px]">
                                                            {isCollapsed ? 'chevron_right' : 'expand_more'}
                                                        </span>
                                                        <span className="material-symbols-outlined text-primary/80 text-[18px]">
                                                            {CATEGORY_ICONS[category] || 'folder'}
                                                        </span>
                                                        <span className="font-bold text-xs text-on-surface uppercase tracking-wider">
                                                            {category}
                                                        </span>
                                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-container text-secondary font-semibold">
                                                            {perms.length} {perms.length === 1 ? 'acción' : 'acciones'}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-secondary font-mono">
                                                        {isCollapsed ? 'Clic para expandir' : 'Clic para contraer'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Filas de Permisos */}
                                        {!isCollapsed &&
                                            perms.map(p => (
                                                <tr key={p.name} className="hover:bg-surface-bright transition-colors">
                                                    <td className="px-5 py-3">
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-xs text-on-surface">
                                                                    {p.label}
                                                                </span>
                                                                <span className="font-mono text-[9px] text-secondary px-1.5 py-0.5 rounded bg-surface-container font-semibold">
                                                                    {p.name}
                                                                </span>
                                                            </div>
                                                            {p.description && (
                                                                <span className="text-[11px] text-secondary leading-tight">
                                                                    {p.description}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {roles.map(role => {
                                                        const active = hasPermission(role.id, role.name, p.name);
                                                        const isAdmin = role.name.toLowerCase() === 'admin';

                                                        return (
                                                            <td
                                                                key={role.id}
                                                                className="px-4 py-3 text-center border-l border-surface-container"
                                                            >
                                                                {isAdmin ? (
                                                                    <div className="flex items-center justify-center">
                                                                        <span
                                                                            title="El Administrador cuenta con acceso irrevocable a todas las funciones"
                                                                            className="w-6 h-6 rounded-md bg-purple-100 text-purple-800 flex items-center justify-center"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[16px]">lock</span>
                                                                        </span>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        disabled={setPermissionsMut.isPending}
                                                                        onClick={() => handleToggleCell(role.id, role.name, p.name, active)}
                                                                        className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-all cursor-pointer ${
                                                                            active
                                                                                ? 'bg-primary/15 text-primary hover:bg-primary/25 active:scale-90'
                                                                                : 'bg-surface-container text-outline hover:bg-surface-container-high active:scale-90'
                                                                        }`}
                                                                        title={active ? 'Permiso concedido (Clic para revocar)' : 'Sin permiso (Clic para conceder)'}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[16px]">
                                                                            {active ? 'check' : 'close'}
                                                                        </span>
                                                                    </button>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}