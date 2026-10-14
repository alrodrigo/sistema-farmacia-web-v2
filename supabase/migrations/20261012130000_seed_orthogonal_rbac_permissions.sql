-- Asegurar columna description si no existe
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS description text;

-- 1. Limpiar asignaciones previas
DELETE FROM role_permissions;
DELETE FROM permissions;

-- 2. Insertar los 29 permisos reales y ortogonales
INSERT INTO permissions (name, label, category, description) VALUES
-- Dashboard (2)
('dashboard:view', 'Ver Dashboard Operativo (Stock y Alertas)', 'Dashboard', 'Visualización de quiebres de inventario, stock crítico y lotes por vencer FEFO'),
('dashboard:financial', 'Ver Finanzas y Ventas en Dashboard', 'Dashboard', 'Visualización de ingresos en Bs, ticket promedio, ventas recientes y arqueo de turnos'),

-- Punto de Venta / POS (4)
('pos:access', 'Acceso al Punto de Venta', 'Punto de Venta (POS)', 'Permite abrir e interactuar con la pantalla de ventas'),
('pos:sell', 'Cobrar y Procesar Ventas', 'Punto de Venta (POS)', 'Permite agregar medicamentos al ticket y finalizar transacciones'),
('pos:shifts', 'Apertura y Cierre de Caja', 'Punto de Venta (POS)', 'Permite iniciar turno de caja con fondo inicial y realizar arqueo/cierre'),
('pos:history', 'Historial y Reimpresión de Tickets', 'Punto de Venta (POS)', 'Permite consultar ventas anteriores del turno y reimprimir tickets'),

-- Inventario de Medicamentos (7)
('inventory:view', 'Consultar Inventario y Medicamentos', 'Inventario', 'Visualizar catálogo, stock disponible, precios y alertas de vencimiento'),
('inventory:create', 'Registrar Nuevo Medicamento', 'Inventario', 'Permite dar de alta nuevos productos y medicamentos en el catálogo'),
('inventory:edit', 'Editar Información de Medicamento', 'Inventario', 'Modificar precios, descripciones, presentación y datos terapéuticos'),
('inventory:adjust_stock', 'Reabastecer y Ajustar Stock/Lotes', 'Inventario', 'Ingresar existencias, nuevos lotes y reabastecimiento directo'),
('inventory:kardex', 'Consultar Kardex de Movimientos', 'Inventario', 'Auditoría detallada de entradas, salidas y trazabilidad por producto'),
('inventory:delete', 'Eliminar Medicamentos', 'Inventario', 'Dar de baja definitiva medicamentos del catálogo del sistema'),
('inventory:export', 'Exportar Inventario a CSV', 'Inventario', 'Descargar el catálogo completo y existencias en archivo CSV'),

-- Categorías Terapéuticas (4)
('categories:view', 'Consultar Categorías', 'Categorías', 'Ver clasificación terapéutica y distribución de productos por categoría'),
('categories:create', 'Crear Nueva Categoría', 'Categorías', 'Registrar nuevas líneas y clasificaciones farmacéuticas'),
('categories:edit', 'Editar Categorías', 'Categorías', 'Modificar nombre, icono y descripción de categorías existentes'),
('categories:delete', 'Eliminar Categorías', 'Categorías', 'Remover categorías del sistema que no posean productos asociados'),

-- Proveedores y Laboratorios (4)
('suppliers:view', 'Consultar Proveedores', 'Proveedores', 'Ver directorio de laboratorios y distribuidores autorizados'),
('suppliers:create', 'Registrar Nuevo Proveedor', 'Proveedores', 'Dar de alta nuevos distribuidores, laboratorios y contactos'),
('suppliers:edit', 'Editar Proveedor', 'Proveedores', 'Modificar datos de contacto, NIT y teléfonos de proveedores'),
('suppliers:delete', 'Eliminar Proveedor', 'Proveedores', 'Eliminar registros de proveedores sin dependencias'),

-- Reportes y Finanzas (4)
('reports:view', 'Consultar Reportes y Analítica', 'Reportes', 'Ver métricas de ventas por fecha, productos top y márgenes brutos'),
('reports:cash_close', 'Ver Cierres Consolidados de Caja', 'Reportes', 'Auditar balances de caja, turnos y diferencias de arqueo'),
('reports:void_sale', 'Anular Ventas y Restaurar Stock', 'Reportes', 'Anulación administrativa de transacciones con restitución de existencias'),
('reports:export', 'Exportar Reportes a CSV', 'Reportes', 'Descargar datos analíticos y reportes en formato CSV'),

-- Control de Acceso y Seguridad (5)
('users:view', 'Consultar Personal y Usuarios', 'Seguridad y Usuarios', 'Ver listado de colaboradores, cuentas y estados de acceso'),
('users:create', 'Registrar Nuevo Personal', 'Seguridad y Usuarios', 'Crear cuentas para nuevos empleados con usuario y contraseña'),
('users:edit', 'Editar Perfil y Rol de Usuario', 'Seguridad y Usuarios', 'Modificar nombres y reasignar roles de seguridad a colaboradores'),
('users:toggle_status', 'Suspender y Activar Acceso', 'Seguridad y Usuarios', 'Bloquear o restaurar acceso a empleados al sistema'),
('users:manage_roles', 'Administrar Roles y Matriz RBAC', 'Seguridad y Usuarios', 'Crear roles personalizados y modificar asignación de permisos');

-- 3. Asegurar los 3 roles por defecto: admin, cajero, personalizado
INSERT INTO roles (name, description) VALUES
('admin', 'Administrador con control total del sistema y seguridad')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO roles (name, description) VALUES
('cajero', 'Personal de atención: Punto de venta, cobros, turnos de caja y consulta de inventario')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO roles (name, description) VALUES
('personalizado', 'Rol flexible con permisos configurables individualmente por el administrador')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 4. Asignar los 29 permisos al rol 'admin'
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin';

-- 5. Asignar los permisos operativos al rol 'cajero'
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
    'pos:access',
    'pos:sell',
    'pos:shifts',
    'pos:history',
    'inventory:view'
)
WHERE r.name = 'cajero';

-- 6. Asignar permisos iniciales al rol 'personalizado' (punto de partida configurable)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
    'pos:access',
    'inventory:view',
    'dashboard:view'
)
WHERE r.name = 'personalizado';
