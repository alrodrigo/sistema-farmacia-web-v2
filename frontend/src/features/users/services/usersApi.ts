import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

const authSignupClient = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    }
);

export type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];
export type UserProfileInsert = Database['public']['Tables']['user_profiles']['Insert'];
export type UserProfileUpdate = Database['public']['Tables']['user_profiles']['Update'];

export type RoleRow = Database['public']['Tables']['roles']['Row'];
export type RoleInsert = Database['public']['Tables']['roles']['Insert'];
export type RoleUpdate = Database['public']['Tables']['roles']['Update'];

export type PermissionRow = Database['public']['Tables']['permissions']['Row'];
export type PermissionInsert = Database['public']['Tables']['permissions']['Insert'];

export type RolePermissionRow = Database['public']['Tables']['role_permissions']['Row'];
export type RolePermissionInsert = Database['public']['Tables']['role_permissions']['Insert'];

export interface UserWithRole extends UserProfileRow {
    roles: RoleRow | null;
}

export interface RoleWithPermissions extends RoleRow {
    permissions: PermissionRow[];
}

export interface PermissionWithRoles extends PermissionRow {
    roles: RoleRow[];
}

// ==================== USERS ====================

export async function getUsers(): Promise<UserWithRole[]> {
    const { data, error } = await supabase
        .from('user_profiles')
        .select(`
            id,
            full_name,
            is_active,
            created_at,
            role_id,
            roles (id, name, description)
        `)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as unknown as UserWithRole[]) || [];
}

export async function getUserById(userId: string): Promise<UserWithRole | null> {
    const { data, error } = await supabase
        .from('user_profiles')
        .select(`
            id,
            full_name,
            is_active,
            created_at,
            role_id,
            roles (id, name, description)
        `)
        .eq('id', userId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data as unknown as UserWithRole;
}

export async function createUserWithProfile({
    email,
    password,
    fullName,
    roleId,
}: {
    email: string;
    password: string;
    fullName: string;
    roleId: string;
}) {
    const { data: authData, error: authError } = await authSignupClient.auth.signUp({
        email,
        password,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No se pudo registrar la cuenta en Supabase Auth.');

    const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .insert({
            id: authData.user.id,
            full_name: fullName,
            role_id: roleId,
            is_active: true,
        })
        .select()
        .single();

    if (profileError) {
        throw new Error(`Cuenta creada, pero falló la asignación del perfil: ${profileError.message}`);
    }

    return profileData;
}

export async function updateUserProfile(userId: string, updates: UserProfileUpdate) {
    const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
    const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: isActive })
        .eq('id', userId);
    if (error) throw error;
}

export async function deleteUser(userId: string) {
    const { error } = await supabase.from('user_profiles').delete().eq('id', userId);
    if (error) throw error;
}

// ==================== ROLES ====================

export async function getRoles(): Promise<RoleRow[]> {
    const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function getRoleById(roleId: string): Promise<RoleWithPermissions | null> {
    const { data: role, error: roleError } = await supabase
        .from('roles')
        .select('*')
        .eq('id', roleId)
        .single();

    if (roleError) {
        if (roleError.code === 'PGRST116') return null;
        throw roleError;
    }

    const { data: permissions, error: permError } = await supabase
        .from('role_permissions')
        .select(`
            permission_id,
            permissions (id, name)
        `)
        .eq('role_id', roleId);

    if (permError) throw permError;

    return {
        ...role,
        permissions: (permissions as any)?.map((rp: any) => rp.permissions).filter(Boolean) || [],
    };
}

export async function createRole(role: RoleInsert) {
    const { data, error } = await supabase
        .from('roles')
        .insert(role)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateRole(roleId: string, updates: RoleUpdate) {
    const { data, error } = await supabase
        .from('roles')
        .update(updates)
        .eq('id', roleId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteRole(roleId: string) {
    const { error } = await supabase.from('roles').delete().eq('id', roleId);
    if (error) throw error;
}

// ==================== PERMISSIONS ====================

export async function getPermissions(): Promise<PermissionRow[]> {
    const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function createPermission(permission: PermissionInsert) {
    const { data, error } = await supabase
        .from('permissions')
        .insert(permission)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function seedPermissions(permissions: PermissionInsert[]) {
    const { data, error } = await supabase
        .from('permissions')
        .upsert(permissions, { onConflict: 'id' })
        .select();

    if (error) throw error;
    return data;
}

// ==================== ROLE PERMISSIONS (Many-to-Many) ====================

// ==================== ROLE PERMISSIONS (Many-to-Many) ====================

export async function getRolePermissions(roleId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('role_permissions')
        .select(`
            permission_id,
            permissions (name)
        `)
        .eq('role_id', roleId);

    if (error) throw error;
    return (data as any)?.map((rp: any) => rp.permissions?.name).filter(Boolean) || [];
}

export async function getAllRolePermissions(): Promise<Record<string, string[]>> {
    const { data, error } = await supabase
        .from('role_permissions')
        .select(`
            role_id,
            roles (name),
            permissions (name)
        `);

    if (error) throw error;

    const map: Record<string, string[]> = {};
    (data as any)?.forEach((rp: any) => {
        const permName = rp.permissions?.name;
        if (!permName) return;

        // Mapear por role_id (UUID)
        if (!map[rp.role_id]) map[rp.role_id] = [];
        if (!map[rp.role_id].includes(permName)) map[rp.role_id].push(permName);

        // Mapear también por nombre del rol (ej. 'admin', 'cajero')
        const roleName = rp.roles?.name;
        if (roleName) {
            if (!map[roleName]) map[roleName] = [];
            if (!map[roleName].includes(permName)) map[roleName].push(permName);
        }
    });
    return map;
}

export async function setRolePermissions(roleId: string, permissionNamesOrIds: string[]) {
    // Resolver nombres a IDs reales (UUIDs)
    const { data: allPerms } = await supabase.from('permissions').select('id, name');
    const permMap = new Map<string, string>();
    allPerms?.forEach(p => {
        permMap.set(p.name, p.id);
        permMap.set(p.id, p.id);
    });

    const validIds = permissionNamesOrIds
        .map(p => permMap.get(p))
        .filter((id): id is string => !!id);

    await supabase.from('role_permissions').delete().eq('role_id', roleId);

    if (validIds.length > 0) {
        const inserts = validIds.map(permission_id => ({
            role_id: roleId,
            permission_id,
        }));
        const { error } = await supabase.from('role_permissions').insert(inserts);
        if (error) throw error;
    }
}

export async function addPermissionToRole(roleId: string, permissionId: string) {
    const { error } = await supabase
        .from('role_permissions')
        .insert({ role_id: roleId, permission_id: permissionId });
    if (error) throw error;
}

export async function removePermissionFromRole(roleId: string, permissionId: string) {
    const { error } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('permission_id', permissionId);
    if (error) throw error;
}

// ==================== USER PERMISSIONS (Effective) ====================

export async function getUserEffectivePermissions(userId: string): Promise<string[]> {
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role_id')
        .eq('id', userId)
        .single();

    if (!profile?.role_id) return [];

    return getRolePermissions(profile.role_id);
}

export async function userHasPermission(userId: string, permissionName: string): Promise<boolean> {
    const permissions = await getUserEffectivePermissions(userId);
    return permissions.includes(permissionName);
}

// ==================== UTILITIES ====================

export async function initializeDefaultRolesAndPermissions() {
    const { DEFAULT_ROLES, PERMISSIONS } = await import('../constants/permissions');

    await seedPermissions(Object.entries(PERMISSIONS).map(([key, meta]) => ({
        id: key,
        name: meta.label,
    })));

    for (const [, roleDef] of Object.entries(DEFAULT_ROLES)) {
        const { data: existing } = await supabase
            .from('roles')
            .select('id')
            .eq('name', roleDef.name)
            .maybeSingle();

        let roleId: string;
        if (existing) {
            roleId = existing.id;
            await updateRole(roleId, { description: roleDef.description });
        } else {
            const { data: newRole } = await createRole({
                name: roleDef.name,
                description: roleDef.description,
            });
            roleId = newRole!.id;
        }

        await setRolePermissions(roleId, roleDef.permissions);
    }
}