// src/features/users/constants/permissions.ts
// Permisos del sistema Farmacia POS (Dynamic RBAC)
// 100% Ortogonales y correspondientes a elementos y flujos reales de la UI

export const PERMISSIONS = {
    // 1. Dashboard (2)
    'dashboard:view': {
        label: 'Ver Dashboard Operativo (Stock y Alertas)',
        category: 'Dashboard',
        description: 'Permite acceder al dashboard para ver quiebres de inventario, stock crítico y alertas sanitarias FEFO',
    },
    'dashboard:financial': {
        label: 'Ver Finanzas y Ventas en Dashboard',
        category: 'Dashboard',
        description: 'Visualización de ingresos en Bs, ticket promedio, ventas recientes y arqueo de turnos',
    },

    // 2. Punto de Venta / POS (4)
    'pos:access': {
        label: 'Acceso al Punto de Venta',
        category: 'Punto de Venta (POS)',
        description: 'Permite abrir e interactuar con la terminal de ventas (/pos)',
    },
    'pos:sell': {
        label: 'Cobrar y Procesar Ventas',
        category: 'Punto de Venta (POS)',
        description: 'Permite agregar medicamentos al ticket y ejecutar el cobro final',
    },
    'pos:shifts': {
        label: 'Apertura y Cierre de Caja',
        category: 'Punto de Venta (POS)',
        description: 'Permite abrir turno con fondo inicial y realizar arqueo/cierre de turno',
    },
    'pos:history': {
        label: 'Historial y Reimpresión de Tickets',
        category: 'Punto de Venta (POS)',
        description: 'Permite consultar las ventas del turno y reimprimir tickets térmicos',
    },
    'pos:discount': {
        label: 'Aplicar Descuentos en POS',
        category: 'Punto de Venta (POS)',
        description: 'Permite aplicar descuentos por porcentaje o monto fijo en bolivianos al ticket de venta',
    },

    // 3. Inventario y Medicamentos (7)
    'inventory:view': {
        label: 'Consultar Inventario y Medicamentos',
        category: 'Inventario',
        description: 'Visualizar catálogo de medicamentos, stock disponible y alertas de lote/vencimiento',
    },
    'inventory:create': {
        label: 'Registrar Nuevo Medicamento',
        category: 'Inventario',
        description: 'Permite registrar nuevos fármacos en el catálogo del sistema',
    },
    'inventory:edit': {
        label: 'Editar Información de Medicamento',
        category: 'Inventario',
        description: 'Permite modificar precios, descripción, presentación y datos terapéuticos',
    },
    'inventory:adjust_stock': {
        label: 'Reabastecer y Ajustar Stock/Lotes',
        category: 'Inventario',
        description: 'Permite añadir existencias de lotes y reabastecimiento directo en almacén',
    },
    'inventory:kardex': {
        label: 'Consultar Kardex de Movimientos',
        category: 'Inventario',
        description: 'Auditoría detallada de entradas, salidas y trazabilidad de cada medicamento',
    },
    'inventory:delete': {
        label: 'Eliminar Medicamentos',
        category: 'Inventario',
        description: 'Dar de baja definitiva medicamentos del catálogo del sistema',
    },
    'inventory:export': {
        label: 'Exportar Inventario a CSV',
        category: 'Inventario',
        description: 'Descargar el catálogo completo y existencias en formato CSV',
    },

    // 4. Categorías Terapéuticas (4)
    'categories:view': {
        label: 'Consultar Categorías',
        category: 'Categorías',
        description: 'Ver clasificación terapéutica y distribución de productos',
    },
    'categories:create': {
        label: 'Crear Nueva Categoría',
        category: 'Categorías',
        description: 'Registrar nuevas líneas y clasificaciones farmacéuticas',
    },
    'categories:edit': {
        label: 'Editar Categorías',
        category: 'Categorías',
        description: 'Modificar nombre, icono y descripción de categorías existentes',
    },
    'categories:delete': {
        label: 'Eliminar Categorías',
        category: 'Categorías',
        description: 'Remover categorías del sistema que no posean medicamentos asignados',
    },

    // 5. Proveedores y Laboratorios (4)
    'suppliers:view': {
        label: 'Consultar Proveedores',
        category: 'Proveedores',
        description: 'Ver directorio de laboratorios y distribuidores farmacéuticos',
    },
    'suppliers:create': {
        label: 'Registrar Nuevo Proveedor',
        category: 'Proveedores',
        description: 'Dar de alta nuevos distribuidores, laboratorios y contactos',
    },
    'suppliers:edit': {
        label: 'Editar Proveedor',
        category: 'Proveedores',
        description: 'Modificar datos de contacto, NIT y teléfonos de proveedores',
    },
    'suppliers:delete': {
        label: 'Eliminar Proveedor',
        category: 'Proveedores',
        description: 'Eliminar registros de proveedores sin dependencias comerciales',
    },

    // 6. Reportes y Finanzas (4)
    'reports:view': {
        label: 'Consultar Reportes y Analítica',
        category: 'Reportes',
        description: 'Ver métricas de ventas por fecha, productos más vendidos y márgenes',
    },
    'reports:cash_close': {
        label: 'Ver Cierres Consolidados de Caja',
        category: 'Reportes',
        description: 'Auditar balances de caja, turnos y diferencias de arqueo consolidado',
    },
    'reports:void_sale': {
        label: 'Anular Ventas y Restaurar Stock',
        category: 'Reportes',
        description: 'Anulación administrativa de transacciones con restitución automática de existencias',
    },
    'reports:export': {
        label: 'Exportar Reportes a CSV',
        category: 'Reportes',
        description: 'Descargar datos analíticos y reportes en formato CSV',
    },

    // 7. Seguridad y Usuarios (5)
    'users:view': {
        label: 'Consultar Personal y Usuarios',
        category: 'Seguridad y Usuarios',
        description: 'Ver listado de colaboradores, cuentas y estados de acceso',
    },
    'users:create': {
        label: 'Registrar Nuevo Personal',
        category: 'Seguridad y Usuarios',
        description: 'Crear cuentas para nuevos empleados con usuario y contraseña',
    },
    'users:edit': {
        label: 'Editar Perfil y Rol de Usuario',
        category: 'Seguridad y Usuarios',
        description: 'Modificar nombres y reasignar roles de seguridad a colaboradores',
    },
    'users:toggle_status': {
        label: 'Suspender y Activar Acceso',
        category: 'Seguridad y Usuarios',
        description: 'Bloquear o restaurar acceso a empleados al sistema',
    },
    'users:manage_roles': {
        label: 'Administrar Roles y Matriz RBAC',
        category: 'Seguridad y Usuarios',
        description: 'Crear roles personalizados y modificar asignación dinámica de permisos',
    },

    // 8. Configuración de la Farmacia (2)
    'settings:view': {
        label: 'Ver Configuración de la Farmacia',
        category: 'Configuración',
        description: 'Consultar datos de razón social, NIT, dirección y parámetros de tickets',
    },
    'settings:edit': {
        label: 'Editar Parámetros de la Farmacia',
        category: 'Configuración',
        description: 'Modificar nombre comercial, NIT, teléfono, dirección y pie de ticket',
    },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_CATEGORIES = [
    'Dashboard',
    'Punto de Venta (POS)',
    'Inventario',
    'Categorías',
    'Proveedores',
    'Reportes',
    'Seguridad y Usuarios',
    'Configuración',
] as const;

export type PermissionCategory = typeof PERMISSION_CATEGORIES[number];

export function getPermissionsByCategory(category: PermissionCategory) {
    return Object.entries(PERMISSIONS)
        .filter(([, meta]) => meta.category === category)
        .map(([key, meta]) => ({ key: key as PermissionKey, ...meta }));
}

export function getAllPermissions() {
    return Object.entries(PERMISSIONS).map(([key, meta]) => ({
        key: key as PermissionKey,
        ...meta,
    }));
}

export function getPermissionLabel(key: PermissionKey): string {
    return PERMISSIONS[key]?.label || key;
}

export function getPermissionCategory(key: PermissionKey): PermissionCategory {
    return PERMISSIONS[key]?.category || 'Seguridad y Usuarios';
}

// 3 Roles por defecto del sistema
export const DEFAULT_ROLES = {
    admin: {
        name: 'admin',
        description: 'Administrador con control total del sistema y configuración',
        permissions: Object.keys(PERMISSIONS) as PermissionKey[],
    },
    cajero: {
        name: 'cajero',
        description: 'Personal de atención: Punto de venta, cobros, turnos de caja y consulta de inventario',
        permissions: [
            'pos:access',
            'pos:sell',
            'pos:shifts',
            'pos:history',
            'inventory:view',
        ] as PermissionKey[],
    },
    personalizado: {
        name: 'personalizado',
        description: 'Rol flexible con permisos configurables individualmente por el administrador',
        permissions: [
            'pos:access',
            'inventory:view',
            'dashboard:view',
        ] as PermissionKey[],
    },
} as const;

export type DefaultRoleKey = keyof typeof DEFAULT_ROLES;