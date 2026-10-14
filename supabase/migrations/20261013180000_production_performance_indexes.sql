-- ==============================================================================
-- MIGRACIÓN 018: ÍNDICES DE RENDIMIENTO PARA PRODUCCIÓN & PERMISOS DE CONFIGURACIÓN
-- Optimización de consultas de alta concurrencia, prevención de table scans
-- y garantía de cumplimiento de cuota de recursos en Supabase Cloud.
-- ==============================================================================

-- 1. ÍNDICES ESTRATÉGICOS PARA VENTAS (SALES)
-- Permite filtrado instantáneo por fecha, estado y cajero sin escaneo completo
CREATE INDEX IF NOT EXISTS idx_sales_created_at_desc ON sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales (user_id);
CREATE INDEX IF NOT EXISTS idx_sales_composite_audit ON sales (created_at DESC, status, user_id);

-- 2. ÍNDICES PARA DETALLE DE VENTAS (SALE_DETAILS)
-- Permite agregaciones rápidas de productos más vendidos y márgenes
CREATE INDEX IF NOT EXISTS idx_sale_details_product_id ON sale_details (product_id);
CREATE INDEX IF NOT EXISTS idx_sale_details_batch_id ON sale_details (batch_id);

-- 3. ÍNDICES PARA PRODUCTOS (PRODUCTS)
-- Relación rápida con proveedores para catálogos y reabastecimiento
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products (supplier_id);

-- 4. ÍNDICES PARA KARDEX DE MOVIMIENTOS (INVENTORY_MOVEMENTS)
-- Acelera auditoría de trazabilidad por tipo de movimiento
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements (movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch ON inventory_movements (batch_id);

-- 5. PERMISOS FORMALES PARA EL MÓDULO DE CONFIGURACIÓN DE LA FARMACIA
INSERT INTO permissions (name, label, category, description)
VALUES
('settings:view', 'Ver Configuración de la Farmacia', 'Configuración', 'Consultar datos de razón social, NIT, dirección y parámetros de tickets'),
('settings:edit', 'Editar Parámetros de la Farmacia', 'Configuración', 'Modificar nombre comercial, NIT, teléfono, dirección, logotipo y colores del sistema')
ON CONFLICT (name) DO UPDATE SET
    label = EXCLUDED.label,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

-- Asignar permisos de configuración al rol 'admin'
DO $$
DECLARE
    v_admin_role_id UUID;
    v_perm_view_id UUID;
    v_perm_edit_id UUID;
BEGIN
    SELECT id INTO v_admin_role_id FROM roles WHERE name = 'admin' LIMIT 1;
    SELECT id INTO v_perm_view_id FROM permissions WHERE name = 'settings:view' LIMIT 1;
    SELECT id INTO v_perm_edit_id FROM permissions WHERE name = 'settings:edit' LIMIT 1;

    IF v_admin_role_id IS NOT NULL THEN
        IF v_perm_view_id IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_admin_role_id, v_perm_view_id)
            ON CONFLICT DO NOTHING;
        END IF;

        IF v_perm_edit_id IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_admin_role_id, v_perm_edit_id)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END $$;
