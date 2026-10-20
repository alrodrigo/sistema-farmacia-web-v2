import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/stores/toastStore';
import {
    getUsers,
    getRoles,
    getPermissions,
    getRoleById,
    getRolePermissions,
    getAllRolePermissions,
    getUserEffectivePermissions,
    createUserWithProfile,
    updateUserProfile,
    toggleUserStatus,
    deleteUser,
    adminResetUserPassword,
    createRole,
    updateRole,
    deleteRole,
    setRolePermissions,
    seedPermissions,
    initializeDefaultRolesAndPermissions,
    type UserWithRole,
    type RoleRow,
    type PermissionRow,
    type RoleWithPermissions,
} from '../services/usersApi';
import { useAuthStore } from '@/stores/authStore';

// ==================== QUERIES ====================

export function useUsers() {
    return useQuery<UserWithRole[]>({
        queryKey: ['users'],
        queryFn: getUsers,
        staleTime: 1000 * 30,
        refetchOnMount: true,
    });
}

export function useRoles() {
    return useQuery<RoleRow[]>({
        queryKey: ['roles'],
        queryFn: getRoles,
        staleTime: 1000 * 60 * 5,
        refetchOnMount: true,
    });
}

export function usePermissions() {
    return useQuery<PermissionRow[]>({
        queryKey: ['permissions'],
        queryFn: getPermissions,
        staleTime: 1000 * 60 * 10,
        refetchOnMount: true,
    });
}

export function useRole(roleId: string | null) {
    return useQuery<RoleWithPermissions | null>({
        queryKey: ['role', roleId],
        queryFn: () => roleId ? getRoleById(roleId) : null,
        enabled: !!roleId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useRolePermissions(roleId: string | null) {
    return useQuery<string[]>({
        queryKey: ['role-permissions', roleId],
        queryFn: () => roleId ? getRolePermissions(roleId) : [],
        enabled: !!roleId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useAllRolePermissions() {
    return useQuery<Record<string, string[]>>({
        queryKey: ['all-role-permissions'],
        queryFn: getAllRolePermissions,
        staleTime: 1000 * 60 * 2,
    });
}

export function useUserEffectivePermissions(userId: string | null) {
    const { user } = useAuthStore();
    const effectiveUserId = userId || user?.id;

    return useQuery<string[]>({
        queryKey: ['user-effective-permissions', effectiveUserId],
        queryFn: () => effectiveUserId ? getUserEffectivePermissions(effectiveUserId) : [],
        enabled: !!effectiveUserId,
        staleTime: 1000 * 60 * 5,
    });
}

// ==================== MUTATIONS ====================

export function useUserMutations() {
    const qc = useQueryClient();

    const createUserMut = useMutation({
        mutationFn: (variables: { email: string; password: string; fullName: string; roleId: string }) =>
            createUserWithProfile(variables),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    });

    const updateProfileMut = useMutation({
        mutationFn: ({ userId, fullName, roleId, is_active }: { userId: string; fullName?: string; roleId?: string; is_active?: boolean }) =>
            updateUserProfile(userId, {
                full_name: fullName,
                role_id: roleId,
                is_active,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (err: any) => toast.error(err.message, 'Error al actualizar usuario'),
    });

    const toggleStatusMut = useMutation({
        mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
            toggleUserStatus(userId, isActive),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    });

    const deleteUserMut = useMutation({
        mutationFn: (userId: string) => deleteUser(userId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    });

    const resetPasswordMut = useMutation({
        mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) =>
            adminResetUserPassword(userId, newPassword),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    });

    return { createUserMut, updateProfileMut, toggleStatusMut, deleteUserMut, resetPasswordMut };
}

export function useRoleMutations() {
    const qc = useQueryClient();

    const createRoleMut = useMutation({
        mutationFn: (role: { name: string; description?: string }) => createRole(role),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    });

    const updateRoleMut = useMutation({
        mutationFn: ({ roleId, updates }: { roleId: string; updates: Partial<RoleRow> }) =>
            updateRole(roleId, updates),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    });

    const deleteRoleMut = useMutation({
        mutationFn: (roleId: string) => deleteRole(roleId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    });

    const setPermissionsMut = useMutation({
        mutationFn: ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) =>
            setRolePermissions(roleId, permissionIds),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['roles'] });
            qc.invalidateQueries({ queryKey: ['all-role-permissions'] });
            qc.invalidateQueries({ queryKey: ['role-permissions'] });
        },
    });

    return { createRoleMut, updateRoleMut, deleteRoleMut, setPermissionsMut };
}

export function useRbacSetup() {
    const qc = useQueryClient();

    const seedPermissionsMut = useMutation({
        mutationFn: (permissions: { id: string; name: string }[]) => seedPermissions(permissions),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['permissions'] }),
    });

    const initializeDefaultsMut = useMutation({
        mutationFn: () => initializeDefaultRolesAndPermissions(),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['roles'] });
            qc.invalidateQueries({ queryKey: ['permissions'] });
            qc.invalidateQueries({ queryKey: ['all-role-permissions'] });
        },
    });

    return { seedPermissionsMut, initializeDefaultsMut };
}