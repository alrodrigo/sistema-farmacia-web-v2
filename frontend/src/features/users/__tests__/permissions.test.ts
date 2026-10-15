import { describe, it, expect } from 'vitest';

export function evaluatePermission(
    role: string | null | undefined,
    permission: string,
    rolePermissionsMap: Record<string, string[]> = {}
): boolean {
    if (!role) return false;
    const normalizedRole = role.toLowerCase().trim();

    // El Administrador tiene acceso irrestricto
    if (normalizedRole === 'admin') return true;

    // Buscar permisos asignados al rol en la matriz dinámica
    const foundKey = Object.keys(rolePermissionsMap).find(
        (k) => k.toLowerCase().trim() === normalizedRole
    );
    const permissions = foundKey ? rolePermissionsMap[foundKey] : rolePermissionsMap[role] || [];

    return permissions.includes(permission);
}

describe('Control de Acceso: Matriz de Permisos RBAC', () => {
    const mockPermissionsMap: Record<string, string[]> = {
        cajero: [
            'pos:access',
            'pos:sell',
            'inventory:view',
        ],
        farmaceutico: [
            'pos:access',
            'pos:sell',
            'inventory:view',
            'inventory:create',
            'inventory:edit',
            'categories:view',
        ],
    };

    it('el Administrador (Admin) siempre debe tener autorización a cualquier módulo', () => {
        expect(evaluatePermission('admin', 'settings:view', mockPermissionsMap)).toBe(true);
        expect(evaluatePermission('Admin', 'users:delete', mockPermissionsMap)).toBe(true);
        expect(evaluatePermission('ADMIN', 'reports:export', mockPermissionsMap)).toBe(true);
    });

    it('el Cajero debe tener acceso permitido únicamente a sus módulos autorizados', () => {
        expect(evaluatePermission('cajero', 'pos:access', mockPermissionsMap)).toBe(true);
        expect(evaluatePermission('cajero', 'inventory:view', mockPermissionsMap)).toBe(true);
    });

    it('el Cajero debe tener denegado el acceso a configuración o reportes confidenciales', () => {
        expect(evaluatePermission('cajero', 'settings:view', mockPermissionsMap)).toBe(false);
        expect(evaluatePermission('cajero', 'reports:view', mockPermissionsMap)).toBe(false);
        expect(evaluatePermission('cajero', 'users:view', mockPermissionsMap)).toBe(false);
    });

    it('un usuario sin rol asignado no debe tener ningún permiso', () => {
        expect(evaluatePermission(null, 'pos:access', mockPermissionsMap)).toBe(false);
        expect(evaluatePermission(undefined, 'pos:access', mockPermissionsMap)).toBe(false);
        expect(evaluatePermission('', 'pos:access', mockPermissionsMap)).toBe(false);
    });
});
