import { useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAllRolePermissions } from './useUsers';
import type { PermissionKey } from '../constants/permissions';

export function useHasPermission(permission: PermissionKey | string): boolean;
export function useHasPermission(): {
    hasPermission: (permission: PermissionKey | string) => boolean;
    hasAnyPermission: (permissions: (PermissionKey | string)[]) => boolean;
    hasAllPermissions: (permissions: (PermissionKey | string)[]) => boolean;
    userRolePermissions: Set<string>;
    isAdmin: boolean;
};
export function useHasPermission(permission?: PermissionKey | string) {
    const { role } = useAuthStore();
    const { data: allRolePermissions = {} } = useAllRolePermissions();

    const userRolePermissions = useMemo(() => {
        if (!role) return new Set<string>();
        const roleKey = role.trim().toLowerCase();
        // Buscar coincidencia exacta o insensible a mayúsculas
        const foundKey = Object.keys(allRolePermissions).find(k => k.trim().toLowerCase() === roleKey);
        const perms = (foundKey ? allRolePermissions[foundKey] : allRolePermissions[role]) || [];
        return new Set(perms);
    }, [role, allRolePermissions]);

    const isAdmin = (role || '').toLowerCase().trim() === 'admin';

    const check = (p: PermissionKey | string): boolean => {
        if (isAdmin) return true;
        return userRolePermissions.has(p);
    };

    const hasAnyPermission = (permissions: (PermissionKey | string)[]): boolean => {
        if (isAdmin) return true;
        return permissions.some(p => userRolePermissions.has(p));
    };

    const hasAllPermissions = (permissions: (PermissionKey | string)[]): boolean => {
        if (isAdmin) return true;
        return permissions.every(p => userRolePermissions.has(p));
    };

    if (permission !== undefined) {
        return check(permission);
    }

    return {
        hasPermission: check,
        hasAnyPermission,
        hasAllPermissions,
        userRolePermissions,
        isAdmin,
    };
}

export function usePermissionGuard(
    requiredPermissions: PermissionKey | PermissionKey[]
) {
    const { hasPermission, hasAllPermissions, isAdmin } = useHasPermission();
    const perms = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

    const hasAccess = isAdmin || (perms.length === 1
        ? hasPermission(perms[0])
        : hasAllPermissions(perms));

    return { hasAccess, hasPermission };
}