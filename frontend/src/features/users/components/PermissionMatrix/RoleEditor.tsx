import { useState, useMemo, useEffect } from 'react';
import { useRoles, usePermissions, useRolePermissions, useRoleMutations } from '../../hooks/useUsers';
import { PERMISSIONS, PERMISSION_CATEGORIES } from '../../constants/permissions';
import { toast } from '@/stores/toastStore';

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

interface RoleEditorProps {
    roleId?: string | null;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function RoleEditor({ roleId, onClose, onSuccess }: RoleEditorProps) {
    const { data: roles = [] } = useRoles();
    const { data: permissions = [] } = usePermissions();
    const { data: currentRolePerms = [] } = useRolePermissions(roleId ?? null);
    const { createRoleMut, updateRoleMut, setPermissionsMut } = useRoleMutations();

    const isEditing = !!roleId;
    const existingRole = useMemo(() => roles.find(r => r.id === roleId), [roles, roleId]);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (existingRole) {
            setName(existingRole.name);
            setDescription(existingRole.description || '');
        } else {
            setName('');
            setDescription('');
        }
    }, [existingRole]);

    useEffect(() => {
        if (isEditing && currentRolePerms.length > 0) {
            setSelectedPermissions(new Set(currentRolePerms));
        } else if (!isEditing) {
            setSelectedPermissions(new Set());
        }
    }, [isEditing, currentRolePerms]);

    const categories = useMemo(() => {
        const catMap: Record<string, { key: string; label: string; description: string }[]> = {};
        PERMISSION_CATEGORIES.forEach(c => { catMap[c] = []; });

        permissions.forEach(p => {
            const cat = p.category || (PERMISSIONS as any)[p.name]?.category || 'General';
            const label = p.label || (PERMISSIONS as any)[p.name]?.label || p.name;
            const description = (p as any).description || (PERMISSIONS as any)[p.name]?.description || '';
            if (!catMap[cat]) catMap[cat] = [];
            catMap[cat].push({ key: p.name, label, description });
        });

        return Object.entries(catMap).filter(([, perms]) => perms.length > 0);
    }, [permissions]);

    const handleTogglePermission = (permissionKey: string) => {
        setSelectedPermissions(prev => {
            const next = new Set(prev);
            if (next.has(permissionKey)) next.delete(permissionKey);
            else next.add(permissionKey);
            return next;
        });
    };

    const handleSelectAllCategory = (catPerms: { key: string }[], check: boolean) => {
        setSelectedPermissions(prev => {
            const next = new Set(prev);
            catPerms.forEach(p => {
                if (check) next.add(p.key);
                else next.delete(p.key);
            });
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim().toLowerCase();
        if (!trimmedName) {
            toast.warning('El nombre del rol es obligatorio', 'Campo requerido');
            return;
        }

        try {
            let finalRoleId = roleId;

            if (isEditing && roleId) {
                await updateRoleMut.mutateAsync({ roleId, updates: { name: trimmedName, description } });
            } else {
                const newRole = await createRoleMut.mutateAsync({ name: trimmedName, description });
                finalRoleId = newRole.id;
            }

            if (finalRoleId) {
                await setPermissionsMut.mutateAsync({
                    roleId: finalRoleId,
                    permissionIds: Array.from(selectedPermissions),
                });
            }

            toast.success(
                `Rol "${trimmedName}" y sus permisos guardados correctamente`,
                'Seguridad RBAC'
            );
            onSuccess?.();
            onClose();
        } catch (err: any) {
            toast.error(err.message, 'Error al guardar rol');
        }
    };

    const isSubmitting = createRoleMut.isPending || updateRoleMut.isPending || setPermissionsMut.isPending;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-surface-container-high">
                {/* Cabecera */}
                <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
                    <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                        </span>
                        <div>
                            <h2 className="text-base font-bold text-on-surface">
                                {isEditing ? `Editar Rol: ${existingRole?.name}` : 'Crear Nuevo Rol'}
                            </h2>
                            <p className="text-xs text-secondary">Definición de nombre y asignación dinámica de permisos</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-secondary hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-secondary uppercase tracking-wider">
                                    Identificador del Rol *
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="ej. farmaceutico, supervisor_caja..."
                                    className="w-full h-10 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container font-mono lowercase"
                                    required
                                    disabled={existingRole?.name === 'admin'}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-secondary uppercase tracking-wider">
                                    Descripción Funcional
                                </label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="ej. Atención en mostrador y gestión de turnos..."
                                    className="w-full h-10 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                                />
                            </div>
                        </div>

                        {/* Matriz de Selección por Categoría */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-secondary uppercase tracking-wider">
                                    Permisos Asignados ({selectedPermissions.size} de {permissions.length})
                                </label>
                                <div className="flex items-center gap-2 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedPermissions(new Set(permissions.map(p => p.name)))}
                                        className="text-primary hover:underline font-semibold"
                                    >
                                        Marcar todos
                                    </button>
                                    <span className="text-outline">•</span>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedPermissions(new Set())}
                                        className="text-secondary hover:underline font-semibold"
                                    >
                                        Desmarcar todos
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-80 overflow-y-auto space-y-3 p-3 bg-surface-container-low rounded-xl border border-surface-container">
                                {categories.map(([category, catPerms]) => {
                                    const allChecked = catPerms.every(p => selectedPermissions.has(p.key));

                                    return (
                                        <div key={category} className="bg-surface-container-lowest p-3 rounded-lg border border-surface-container">
                                            <div className="flex items-center justify-between border-b border-surface-container pb-2 mb-2">
                                                <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[16px]">{CATEGORY_ICONS[category] || 'folder'}</span>
                                                    <span>{category}</span>
                                                    <span className="text-[10px] text-secondary font-mono">({catPerms.length})</span>
                                                </h4>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectAllCategory(catPerms, !allChecked)}
                                                    className="text-[11px] text-secondary hover:text-primary font-mono cursor-pointer"
                                                >
                                                    {allChecked ? 'Desmarcar sección' : 'Marcar sección'}
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                {catPerms.map(p => {
                                                    const checked = selectedPermissions.has(p.key);
                                                    return (
                                                        <label
                                                            key={p.key}
                                                            title={p.description ? `${p.key}: ${p.description}` : p.key}
                                                            className={`flex items-center gap-2 p-1.5 rounded transition-colors cursor-pointer text-xs ${
                                                                checked ? 'bg-primary/10 text-on-surface font-medium' : 'text-secondary hover:text-on-surface hover:bg-surface-container'
                                                            }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => handleTogglePermission(p.key)}
                                                                className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                                                            />
                                                            <div className="flex flex-col truncate">
                                                                <span className="truncate">{p.label}</span>
                                                                <span className="font-mono text-[9px] text-secondary/70 truncate">{p.key}</span>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="p-4 border-t border-surface-container flex justify-end gap-2 bg-surface-container-low">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 rounded-lg font-semibold text-sm text-secondary hover:bg-surface-container transition-colors cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !name.trim()}
                            className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-semibold text-sm transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                    <span>Guardando...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[16px]">check</span>
                                    <span>{isEditing ? 'Actualizar Rol' : 'Crear Rol'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}