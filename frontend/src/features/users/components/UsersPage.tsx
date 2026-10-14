import { useState, useMemo } from 'react';
import { useUsers, useRoles, useUserMutations } from '../hooks/useUsers';
import { useAuthStore } from '@/stores/authStore';
import { useHasPermission } from '../hooks/usePermissions';
import { PermissionMatrix, RoleEditor } from './PermissionMatrix';
import { toast } from '@/stores/toastStore';
import { confirmDialog } from '@/stores/confirmModalStore';

export default function UsersPage() {
    const { user: currentUser, setUser } = useAuthStore();
    const { data: users = [], isLoading } = useUsers();
    const { data: roles = [], isLoading: isLoadingRoles } = useRoles();
    const { toggleStatusMut, updateProfileMut, createUserMut } = useUserMutations();

    // Permisos dinámicos granulares RBAC
    const canViewUsers = useHasPermission('users:view');
    const canCreateUser = useHasPermission('users:create');
    const canEditUser = useHasPermission('users:edit');
    const canToggleStatus = useHasPermission('users:toggle_status');
    const canManageRoles = useHasPermission('users:manage_roles');

    // Pestaña activa: 'users' (personal), 'roles' (matriz), 'roles:edit' (editor de rol)
    const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'roles:edit'>('users');
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

    // Filtros de búsqueda para usuarios
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [onlyActive, setOnlyActive] = useState(false);

    // Estado del Modal de Edición de Usuario
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editRoleId, setEditRoleId] = useState('');

    // Estado del Modal de Creación de Usuario
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newName, setNewName] = useState('');
    const [newRoleId, setNewRoleId] = useState('');

    // Métricas calculadas para los KPIs
    const totalUsers = users.length;
    const activeUsers = users.filter((u: any) => u.is_active).length;
    const suspendedUsers = users.filter((u: any) => !u.is_active).length;
    const totalRoles = roles.length;

    // Filtrado reactivo en memoria
    const filteredUsers = useMemo(() => {
        return users.filter((user: any) => {
            const matchesSearch = !searchTerm || user.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = roleFilter === 'ALL' || user.role_id === roleFilter;
            const matchesActive = !onlyActive || user.is_active;
            return matchesSearch && matchesRole && matchesActive;
        });
    }, [users, searchTerm, roleFilter, onlyActive]);

    const openEditModal = (user: any) => {
        if (!canEditUser) return;
        setEditingId(user.id);
        setEditName(user.full_name || '');

        let roleIdToSet = user.role_id || '';
        if (!roleIdToSet && user.roles?.name && roles.length > 0) {
            const found = roles.find((r: any) => r.name.toLowerCase() === user.roles.name.toLowerCase());
            if (found) roleIdToSet = found.id;
        }
        if (!roleIdToSet && roles.length > 0) {
            roleIdToSet = roles[0].id;
        }
        setEditRoleId(roleIdToSet);
        setIsModalOpen(true);
    };

    const handleUpdate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEditUser || !editingId) return;

        updateProfileMut.mutate(
            { userId: editingId, fullName: editName, roleId: editRoleId },
            {
                onSuccess: () => {
                    setIsModalOpen(false);
                    toast.success('Perfil de usuario actualizado con éxito', 'Usuario Modificado');
                    if (currentUser && editingId === currentUser.id) {
                        const selectedRole = roles.find((r: any) => r.id === editRoleId);
                        setUser(currentUser, selectedRole?.name ?? null);
                    }
                },
                onError: (err: any) => toast.error(err.message, 'Error al actualizar usuario'),
            }
        );
    };

    const openCreateModal = () => {
        if (!canCreateUser) return;
        setNewEmail('');
        setNewPassword('');
        setNewName('');
        const defaultRole = roles.find((r: any) => r.name.toLowerCase() === 'cajero') || roles[0];
        setNewRoleId(defaultRole?.id || '');
        setIsCreateModalOpen(true);
    };

    const handleCreateUser = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canCreateUser) return;
        if (!newRoleId) {
            toast.warning('Por favor selecciona un rol para el usuario.', 'Rol Requerido');
            return;
        }

        createUserMut.mutate(
            {
                email: newEmail,
                password: newPassword,
                fullName: newName,
                roleId: newRoleId,
            },
            {
                onSuccess: () => {
                    setIsCreateModalOpen(false);
                    toast.success(`Cuenta para ${newName} creada exitosamente`, 'Usuario Registrado');
                },
                onError: (err: any) => toast.error(err.message, 'Error al crear usuario'),
            }
        );
    };

    const handleToggleStatus = async (userId: string, currentStatus: boolean, userName?: string) => {
        if (!canToggleStatus) return;
        if (currentStatus) {
            const confirmed = await confirmDialog({
                title: '¿Suspender Acceso de Usuario?',
                message: `El usuario "${userName || 'seleccionado'}" no podrá iniciar sesión en el POS ni en ningún módulo hasta que sea reactivado. ¿Deseas suspenderlo?`,
                confirmText: 'Sí, suspender',
                cancelText: 'Cancelar',
                type: 'warning',
                icon: 'person_off',
            });
            if (!confirmed) return;
        }

        toggleStatusMut.mutate(
            { userId, isActive: !currentStatus },
            {
                onSuccess: () => {
                    toast.success(
                        currentStatus ? 'Acceso del colaborador suspendido' : 'Acceso restaurado con éxito',
                        'Estado de Seguridad'
                    );
                },
                onError: (err: any) => toast.error(err.message, 'Error al cambiar estado'),
            }
        );
    };

    const getRoleBadgeStyle = (roleName?: string) => {
        const name = (roleName || '').toLowerCase();
        if (name.includes('admin')) {
            return 'bg-purple-100 text-purple-800 border-purple-200';
        }
        if (name.includes('cajer') || name.includes('pos')) {
            return 'bg-primary/10 text-primary border-primary/20';
        }
        if (name.includes('personaliz')) {
            return 'bg-amber-100 text-amber-800 border-amber-200';
        }
        return 'bg-surface-container-high text-on-surface border-surface-container';
    };

    const getRoleDisplayName = (name: string) => {
        const lower = name.toLowerCase();
        if (lower === 'admin') return '🛡️ Administrador (Control Total)';
        if (lower === 'cajero') return '👤 Cajero (Punto de Venta e Inventario)';
        if (lower === 'personalizado') return '⚙️ Personalizado (Permisos a Medida)';
        return name.toUpperCase();
    };

    if (!canViewUsers) {
        return (
            <div className="p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="w-16 h-16 rounded-2xl bg-error-container text-error flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-[32px]">lock</span>
                </div>
                <h2 className="text-xl font-bold text-on-surface">Acceso Restringido</h2>
                <p className="text-sm text-secondary max-w-md mt-1">
                    No dispones del permiso de visualización (<span className="font-mono text-xs font-semibold text-primary">users:view</span>) para acceder al módulo de Control de Personal y Roles. Contacte al Administrador.
                </p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 font-sans">
            {/* 1. CABECERA & NAVEGACIÓN DE CONTEXTO */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-secondary text-xs">
                    <span>Seguridad y Cumplimiento</span>
                    <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                    <span className="text-primary font-medium">Control de Acceso (RBAC Dinámico)</span>
                    <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                    <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[10px] font-semibold">
                        {activeTab === 'users' ? 'Personal y Usuarios' : activeTab === 'roles' ? 'Roles y Permisos' : 'Editor de Rol'}
                    </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-on-surface tracking-tight">Control de Acceso y Gestión de Personal</h1>
                        <p className="text-secondary text-sm mt-1 max-w-3xl">
                            Administración centralizada de usuarios del sistema, configuración dinámica de roles (Admin, Cajero, Personalizado) y gobierno de permisos granulares.
                        </p>
                    </div>
                    {activeTab === 'users' && canCreateUser && (
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-2 bg-primary hover:bg-primary-container text-on-primary px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm active:scale-95 flex-shrink-0 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[20px]">person_add</span>
                            <span>Nuevo Personal</span>
                        </button>
                    )}
                </div>
            </div>

            {/* 2. FILA DE KPIs / MÉTRICAS RESUMIDAS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Metric 1: Personal Registrado */}
                <div className="p-5 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-high flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase text-secondary tracking-wider">Personal Total</span>
                        <span className="p-1.5 rounded-lg bg-surface-container text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]">group</span>
                        </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="font-mono text-3xl font-bold text-on-surface">{totalUsers}</span>
                        <span className="text-xs text-secondary font-medium">usuarios</span>
                    </div>
                    <div className="mt-3 pt-2 border-t border-surface-container text-xs text-secondary flex items-center justify-between">
                        <span>En plantilla</span>
                        <span className="text-primary font-semibold">100% Sincronizado</span>
                    </div>
                </div>

                {/* Metric 2: Usuarios Activos */}
                <div className="p-5 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-high flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase text-secondary tracking-wider">Usuarios Activos</span>
                        <span className="p-1.5 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]">verified_user</span>
                        </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="font-mono text-3xl font-bold text-primary">{activeUsers}</span>
                        <span className="text-xs text-primary font-medium">con acceso</span>
                    </div>
                    <div className="mt-3 pt-2 border-t border-surface-container text-xs text-secondary flex items-center justify-between">
                        <span>Terminales autorizadas</span>
                        <span className="font-mono font-bold text-on-surface">
                            {totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0}%
                        </span>
                    </div>
                </div>

                {/* Metric 3: Roles Definidos */}
                <div className="p-5 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-high flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase text-secondary tracking-wider">Roles de Seguridad</span>
                        <span className="p-1.5 rounded-lg bg-surface-container text-secondary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]">shield</span>
                        </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="font-mono text-3xl font-bold text-on-surface">{totalRoles}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-bold">
                            RBAC Dinámico
                        </span>
                    </div>
                    <div className="mt-3 pt-2 border-t border-surface-container text-xs text-secondary flex items-center justify-between">
                        <span>Predeterminados</span>
                        <span className="font-medium text-on-surface">Admin, Cajero, Personalizado</span>
                    </div>
                </div>

                {/* Metric 4: Accesos Suspendidos */}
                <div className={`p-5 rounded-xl bg-surface-container-lowest shadow-sm border flex flex-col justify-between ${
                    suspendedUsers > 0 ? 'border-l-4 border-l-error border-surface-container-high' : 'border-surface-container-high'
                }`}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase text-secondary tracking-wider">Accesos Suspendidos</span>
                        <span className={`p-1.5 rounded-lg flex items-center justify-center ${
                            suspendedUsers > 0 ? 'bg-error-container text-error' : 'bg-surface-container text-secondary'
                        }`}>
                            <span className="material-symbols-outlined text-[18px]">gpp_bad</span>
                        </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className={`font-mono text-3xl font-bold ${suspendedUsers > 0 ? 'text-error' : 'text-on-surface'}`}>
                            {suspendedUsers}
                        </span>
                        <span className="text-xs text-secondary font-medium">bloqueados</span>
                    </div>
                    <div className="mt-3 pt-2 border-t border-surface-container text-xs text-secondary flex items-center justify-between">
                        <span>Credenciales retenidas</span>
                        <span className={suspendedUsers > 0 ? 'text-error font-semibold' : 'text-secondary'}>
                            {suspendedUsers > 0 ? 'Requiere revisión' : 'Ninguno'}
                        </span>
                    </div>
                </div>
            </div>

            {/* 3. SWITCHER DE PESTAÑAS (Solo si cuenta con permiso para gestionar roles) */}
            {canManageRoles && (
                <div className="flex items-center gap-2 bg-surface-container-low p-1.5 rounded-2xl max-w-fit border border-surface-container shadow-xs">
                    <button
                        type="button"
                        onClick={() => { setActiveTab('users'); setEditingRoleId(null); }}
                        className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
                            activeTab === 'users'
                                ? 'bg-surface-container-lowest text-primary shadow-xs'
                                : 'text-secondary hover:text-on-surface'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">group</span>
                        <span>Personal y Usuarios</span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-bold">
                            {users.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => { setActiveTab('roles'); setEditingRoleId(null); }}
                        className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
                            activeTab === 'roles' || activeTab === 'roles:edit'
                                ? 'bg-surface-container-lowest text-primary shadow-xs'
                                : 'text-secondary hover:text-on-surface'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">shield</span>
                        <span>Roles y Permisos</span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-bold">
                            {roles.length}
                        </span>
                    </button>
                </div>
            )}

            {/* 4. CONTENIDO CONDICIONAL POR PESTAÑA */}
            {activeTab === 'roles:edit' && canManageRoles ? (
                <RoleEditor
                    roleId={editingRoleId}
                    onClose={() => setActiveTab('roles')}
                    onSuccess={() => setActiveTab('roles')}
                />
            ) : activeTab === 'roles' && canManageRoles ? (
                <PermissionMatrix
                    onEditRole={roleId => { setEditingRoleId(roleId); setActiveTab('roles:edit'); }}
                />
            ) : (
                <>
                    {/* BARRA DE BÚSQUEDA Y FILTROS */}
                    <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container-high flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                        <div className="relative flex-1">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                                search
                            </span>
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Buscar por nombre de empleado..."
                                className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Filtro por Rol */}
                            <div className="relative inline-block">
                                <select
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    className="appearance-none bg-surface-container-low text-on-surface text-sm px-4 py-2 pr-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium border border-surface-container"
                                >
                                    <option value="ALL">Rol: Todos ({users.length})</option>
                                    {roles.map((r: any) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name.toUpperCase()}
                                        </option>
                                    ))}
                                </select>
                                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-secondary text-[18px]">
                                    expand_more
                                </span>
                            </div>

                            {/* Checkbox: Solo Activos */}
                            <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg bg-surface hover:bg-surface-container transition-colors border border-surface-container">
                                <input
                                    type="checkbox"
                                    checked={onlyActive}
                                    onChange={(e) => setOnlyActive(e.target.checked)}
                                    className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                                />
                                <span className="text-xs text-on-surface font-semibold">Solo Activos</span>
                            </label>
                        </div>
                    </div>

                    {/* TABLA DE USUARIOS CON TOGGLE DIRECTO */}
                    <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-surface-container-high">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                                <tr className="bg-surface-container-low text-secondary font-bold text-xs uppercase tracking-wider h-11 border-b border-surface-container">
                                    <th className="px-6 w-24 text-center">Estado</th>
                                    <th className="px-6 font-semibold">Empleado / Nombre</th>
                                    <th className="px-6 font-semibold">Rol Asignado</th>
                                    <th className="px-6 font-semibold">Fecha de Alta</th>
                                    <th className="px-6 font-semibold text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container text-sm">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-10 text-secondary">
                                            Cargando catálogo de personal...
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-10 text-secondary">
                                            No se encontraron usuarios con los filtros seleccionados.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((user: any) => (
                                        <tr
                                            key={user.id}
                                            className={`h-16 transition-colors group ${
                                                user.is_active ? 'hover:bg-surface-bright' : 'bg-surface-container-low/50 opacity-75'
                                            }`}
                                        >
                                            {/* Toggle Switch Directo o Indicador de Estado */}
                                            <td className="px-6 text-center">
                                                {canToggleStatus ? (
                                                    <div className="flex flex-col items-center justify-center gap-1">
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={user.is_active}
                                                                disabled={toggleStatusMut.isPending}
                                                                onChange={() => handleToggleStatus(user.id, user.is_active, user.full_name)}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                                        </label>
                                                        <span
                                                            className={`font-mono text-[9px] font-bold uppercase ${
                                                                user.is_active ? 'text-primary' : 'text-error'
                                                            }`}
                                                        >
                                                            {user.is_active ? 'ACTIVO' : 'SUSP.'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span
                                                        className={`font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-full inline-block ${
                                                            user.is_active
                                                                ? 'bg-primary/10 text-primary'
                                                                : 'bg-error-container text-error'
                                                        }`}
                                                    >
                                                        {user.is_active ? 'ACTIVO' : 'SUSP.'}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Empleado / Nombre */}
                                            <td className="px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center font-bold text-sm">
                                                        <span className="material-symbols-outlined text-[20px]">person</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-on-surface group-hover:text-primary transition-colors">
                                                            {user.full_name}
                                                        </span>
                                                        <span className="font-mono text-[11px] text-secondary">
                                                            ID: #{user.id.slice(0, 8)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Rol Asignado con Badge */}
                                            <td className="px-6">
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border ${getRoleBadgeStyle(
                                                        user.roles?.name
                                                    )}`}
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">shield</span>
                                                    <span>{user.roles?.name ? user.roles.name.toUpperCase() : 'SIN ROL'}</span>
                                                </span>
                                            </td>

                                            {/* Fecha de Creación */}
                                            <td className="px-6 text-secondary font-mono text-xs">
                                                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                                            </td>

                                            {/* Botón de Editar */}
                                            <td className="px-6 text-right">
                                                {canEditUser ? (
                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        className="inline-flex items-center gap-1 text-secondary hover:text-primary hover:bg-surface-container px-3 py-1.5 rounded-lg transition-colors font-semibold text-xs border border-surface-container cursor-pointer"
                                                        title="Editar Nombre y Rol"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">edit</span>
                                                        <span>Editar</span>
                                                    </button>
                                                ) : (
                                                    <span className="text-secondary/50 text-xs">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* MODAL DE EDICIÓN DE USUARIO */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-sm">
                    <div className="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border border-surface-container">
                        <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[22px]">manage_accounts</span>
                                <h2 className="text-lg font-bold text-on-surface">Editar Credenciales de Personal</h2>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-secondary hover:text-error transition-colors p-1"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleUpdate} className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-secondary font-semibold text-sm mb-1">Nombre Completo *</label>
                                <input
                                    type="text"
                                    required
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-surface-container-low px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary border border-surface-container text-sm text-on-surface"
                                    placeholder="Ej. Álvaro Delgado"
                                />
                            </div>

                            <div>
                                <label className="block text-secondary font-semibold text-sm mb-1">Rol de Acceso Asignado *</label>
                                <select
                                    required
                                    value={editRoleId}
                                    onChange={(e) => setEditRoleId(e.target.value)}
                                    className="w-full bg-surface-container-low px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary font-semibold border border-surface-container text-sm text-on-surface"
                                >
                                    {isLoadingRoles ? (
                                        <option value="" disabled>Cargando roles del sistema...</option>
                                    ) : roles.length === 0 ? (
                                        <option value="" disabled>No hay roles definidos en la base de datos</option>
                                    ) : (
                                        roles.map((r: any) => (
                                            <option key={r.id} value={r.id}>
                                                {getRoleDisplayName(r.name)}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <span className="text-xs text-secondary mt-1.5 block">
                                    {roles.find((r: any) => r.id === editRoleId)?.description ||
                                        'Determina los módulos y permisos autorizados.'}
                                </span>
                            </div>

                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-surface-container">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 rounded-lg font-semibold text-sm text-secondary hover:bg-surface-container transition-colors cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={updateProfileMut.isPending}
                                    className="bg-primary hover:bg-primary-container text-on-primary px-5 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                                >
                                    {updateProfileMut.isPending ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL DE CREACIÓN DE NUEVO PERSONAL */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-sm">
                    <div className="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border border-surface-container">
                        <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[22px]">person_add</span>
                                <h2 className="text-lg font-bold text-on-surface">Registrar Nuevo Personal</h2>
                            </div>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="text-secondary hover:text-error transition-colors p-1"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-secondary font-semibold text-sm mb-1">Nombre Completo *</label>
                                <input
                                    type="text"
                                    required
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="w-full bg-surface-container-low px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary border border-surface-container text-sm text-on-surface"
                                    placeholder="Ej. Juan Pérez"
                                />
                            </div>

                            <div>
                                <label className="block text-secondary font-semibold text-sm mb-1">Correo Electrónico (Login) *</label>
                                <input
                                    type="email"
                                    required
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="w-full bg-surface-container-low px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary border border-surface-container text-sm text-on-surface"
                                    placeholder="ejemplo@farmacia.com"
                                />
                            </div>

                            <div>
                                <label className="block text-secondary font-semibold text-sm mb-1">Contraseña Inicial *</label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full bg-surface-container-low px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary border border-surface-container text-sm text-on-surface"
                                    placeholder="Mínimo 6 caracteres"
                                />
                            </div>

                            <div>
                                <label className="block text-secondary font-semibold text-sm mb-1">Rol de Acceso Asignado *</label>
                                <select
                                    required
                                    value={newRoleId}
                                    onChange={(e) => setNewRoleId(e.target.value)}
                                    className="w-full bg-surface-container-low px-3 py-2 rounded-lg focus:ring-2 focus:ring-primary font-semibold border border-surface-container text-sm text-on-surface"
                                >
                                    {isLoadingRoles ? (
                                        <option value="" disabled>Cargando roles del sistema...</option>
                                    ) : roles.length === 0 ? (
                                        <option value="" disabled>No hay roles definidos en la base de datos</option>
                                    ) : (
                                        roles.map((r: any) => (
                                            <option key={r.id} value={r.id}>
                                                {getRoleDisplayName(r.name)}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <span className="text-xs text-secondary mt-1.5 block">
                                    {roles.find((r: any) => r.id === newRoleId)?.description ||
                                        'Determina los módulos autorizados.'}
                                </span>
                            </div>

                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-surface-container">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-4 py-2 rounded-lg font-semibold text-sm text-secondary hover:bg-surface-container transition-colors cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={createUserMut.isPending}
                                    className="bg-primary hover:bg-primary-container text-on-primary px-5 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                                >
                                    {createUserMut.isPending ? 'Registrando...' : 'Registrar Personal'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}