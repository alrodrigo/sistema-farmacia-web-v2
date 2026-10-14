-- Migration: Seed RBAC permissions and default roles
ALTER TABLE permissions 
ADD COLUMN IF NOT EXISTS label text,
ADD COLUMN IF NOT EXISTS category text;

-- Insert or update permissions
INSERT INTO permissions (name, label, category) VALUES
  ('dashboard:view', 'Ver Dashboard', 'Dashboard'),
  ('dashboard:kpis', 'Ver KPIs de Ventas', 'Dashboard'),
  ('dashboard:alerts', 'Ver Alertas de Stock/Caducidad', 'Dashboard'),
  ('pos:access', 'Acceso al POS', 'Punto de Venta'),
  ('pos:sell', 'Realizar Ventas', 'Punto de Venta'),
  ('pos:cart:manage', 'Gestionar Carrito', 'Punto de Venta'),
  ('pos:payment:cash', 'Cobrar en Efectivo', 'Punto de Venta'),
  ('pos:payment:card', 'Cobrar con Tarjeta', 'Punto de Venta'),
  ('pos:payment:qr', 'Cobrar con QR', 'Punto de Venta'),
  ('pos:client:manage', 'Gestionar Datos de Cliente', 'Punto de Venta'),
  ('pos:discount:apply', 'Aplicar Descuentos', 'Punto de Venta'),
  ('pos:return:process', 'Procesar Devoluciones', 'Punto de Venta'),
  ('pos:favorites:manage', 'Gestionar Favoritos', 'Punto de Venta'),
  ('cash:shift:open', 'Abrir Turno de Caja', 'Caja'),
  ('cash:shift:close', 'Cerrar Turno de Caja', 'Caja'),
  ('cash:reconciliation:view', 'Ver Arqueo de Caja', 'Caja'),
  ('cash:reconciliation:manage', 'Gestionar Arqueo', 'Caja'),
  ('cash:history:view', 'Ver Historial de Ventas', 'Caja'),
  ('cash:history:reprint', 'Reimprimir Tickets', 'Caja'),
  ('cash:history:cancel', 'Anular Ventas', 'Caja'),
  ('inventory:view', 'Ver Inventario', 'Inventario'),
  ('inventory:create', 'Crear Productos', 'Inventario'),
  ('inventory:edit', 'Editar Productos', 'Inventario'),
  ('inventory:delete', 'Eliminar Productos', 'Inventario'),
  ('inventory:stock:adjust', 'Ajustar Stock', 'Inventario'),
  ('inventory:stock:view', 'Ver Stock', 'Inventario'),
  ('inventory:batches:manage', 'Gestionar Lotes/Vencimientos', 'Inventario'),
  ('inventory:movements:view', 'Ver Kardex/Movimientos', 'Inventario'),
  ('inventory:import', 'Importar Catálogo', 'Inventario'),
  ('inventory:export', 'Exportar Catálogo', 'Inventario'),
  ('inventory:price:bulk', 'Ajuste Masivo de Precios', 'Inventario'),
  ('categories:view', 'Ver Categorías', 'Catálogos'),
  ('categories:create', 'Crear Categorías', 'Catálogos'),
  ('categories:edit', 'Editar Categorías', 'Catálogos'),
  ('categories:delete', 'Eliminar Categorías', 'Catálogos'),
  ('suppliers:view', 'Ver Proveedores', 'Catálogos'),
  ('suppliers:create', 'Crear Proveedores', 'Catálogos'),
  ('suppliers:edit', 'Editar Proveedores', 'Catálogos'),
  ('suppliers:delete', 'Eliminar Proveedores', 'Catálogos'),
  ('reports:view', 'Ver Reportes', 'Reportes'),
  ('reports:sales:view', 'Ver Ventas', 'Reportes'),
  ('reports:products:view', 'Ver Productos Vendidos', 'Reportes'),
  ('reports:cashiers:view', 'Ver Ventas por Cajero', 'Reportes'),
  ('reports:margins:view', 'Ver Márgenes de Ganancia', 'Reportes'),
  ('reports:stock:alerts', 'Ver Alertas de Stock', 'Reportes'),
  ('reports:export', 'Exportar Reportes (CSV/Excel)', 'Reportes'),
  ('reports:cash_close:view', 'Ver Cierres de Caja', 'Reportes'),
  ('reports:cash_close:export', 'Exportar Cuadres de Caja', 'Reportes'),
  ('users:view', 'Ver Usuarios', 'Seguridad'),
  ('users:create', 'Crear Usuarios', 'Seguridad'),
  ('users:edit', 'Editar Usuarios', 'Seguridad'),
  ('users:delete', 'Eliminar Usuarios', 'Seguridad'),
  ('users:status:toggle', 'Activar/Suspender Usuarios', 'Seguridad'),
  ('roles:view', 'Ver Roles', 'Seguridad'),
  ('roles:create', 'Crear Roles', 'Seguridad'),
  ('roles:edit', 'Editar Roles', 'Seguridad'),
  ('roles:delete', 'Eliminar Roles', 'Seguridad'),
  ('permissions:view', 'Ver Permisos', 'Seguridad'),
  ('permissions:assign', 'Asignar Permisos a Roles', 'Seguridad'),
  ('settings:store:view', 'Ver Configuración de Farmacia', 'Configuración'),
  ('settings:store:edit', 'Editar Configuración de Farmacia', 'Configuración'),
  ('settings:printer:manage', 'Gestionar Impresoras', 'Configuración'),
  ('fiscal:invoice:issue', 'Emitir Facturas SIAT', 'Fiscal'),
  ('fiscal:invoice:view', 'Ver Documentos Fiscales', 'Fiscal'),
  ('fiscal:config:manage', 'Configurar SIAT', 'Fiscal')
ON CONFLICT (name) DO UPDATE SET 
  label = EXCLUDED.label,
  category = EXCLUDED.category;

-- Ensure default roles exist: admin, cajero, personalizado
INSERT INTO roles (name, description) VALUES
  ('admin', 'Administrador con control total del sistema y configuración'),
  ('cajero', 'Personal de atención: Punto de venta, caja e inventario'),
  ('personalizado', 'Rol flexible con permisos configurables por el administrador')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- Assign ALL permissions to admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Assign standard cashier permissions to cajero
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'cajero'
  AND p.name IN (
    'pos:access', 'pos:sell', 'pos:cart:manage', 'pos:payment:cash', 
    'pos:payment:card', 'pos:payment:qr', 'pos:client:manage', 'pos:favorites:manage',
    'cash:shift:open', 'cash:shift:close', 'cash:reconciliation:view', 
    'cash:history:view', 'cash:history:reprint',
    'inventory:view', 'inventory:stock:view'
  )
ON CONFLICT DO NOTHING;

-- Assign basic sample permissions to personalizado
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'personalizado'
  AND p.name IN (
    'dashboard:view', 'pos:access', 'pos:sell', 'inventory:view', 'inventory:stock:view'
  )
ON CONFLICT DO NOTHING;
