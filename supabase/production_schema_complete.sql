-- ==============================================================================
-- FARMACIA POS v2 - ESQUEMA DE PRODUCCIÓN COMPLETO Y CONSOLIDADO
-- Despliegue 100% optimizado para Supabase Cloud (PostgreSQL 15+)
-- Incluye: Tablas, Relaciones, Triggers, Funciones RPC Atómicas (FEFO),
-- Índices de Alto Rendimiento y Semillero Inicial de Permisos y Roles.
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. CONTROL DE ACCESO (PBAC / RBAC DINÁMICO)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(150),
    category VARCHAR(50),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
    full_name VARCHAR(150) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para crear perfil automáticamente al registrar usuario en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_cajero_role_id UUID;
BEGIN
    SELECT id INTO v_cajero_role_id FROM public.roles WHERE name = 'cajero' LIMIT 1;

    INSERT INTO public.user_profiles (id, full_name, role_id, is_active)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        v_cajero_role_id,
        true
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 3. CATÁLOGO, MEDICAMENTOS Y PROVEEDORES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(50) DEFAULT 'category',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL UNIQUE,
    contact_phone VARCHAR(50),
    contact_name VARCHAR(100),
    nit VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    sku VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    box_price_cents INTEGER DEFAULT 0 CHECK (box_price_cents >= 0),
    cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER DEFAULT 3 CHECK (min_stock >= 0),
    expiration_date DATE,
    active_substance VARCHAR(200),
    pharmaceutical_form VARCHAR(50),
    is_priority BOOLEAN DEFAULT false,
    requires_prescription BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector de búsqueda en español para búsqueda instantánea en mostrador
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;
ALTER TABLE products
ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('spanish', 
        name || ' ' || 
        COALESCE(sku, '') || ' ' || 
        COALESCE(active_substance, '') || ' ' || 
        COALESCE(description, '')
    )
) STORED;

CREATE TABLE IF NOT EXISTS product_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    lot_number VARCHAR(50),
    expiration_date DATE,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. CAJA Y ARQUEO DE TURNOS (CASH SHIFTS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS cash_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    opening_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (opening_amount_cents >= 0),
    closing_amount_cents INTEGER,
    expected_amount_cents INTEGER,
    difference_cents INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- ==============================================================================
-- 5. TRANSACCIONES DE VENTA Y DETALLES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    payment_method VARCHAR(20) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'qr')),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    cash_shift_id UUID REFERENCES cash_shifts(id) ON DELETE SET NULL,
    client_name VARCHAR(150) DEFAULT 'Sin Nombre',
    client_nit VARCHAR(50) DEFAULT '0',
    received_amount_cents INTEGER DEFAULT 0,
    change_amount_cents INTEGER DEFAULT 0,
    discount_cents INTEGER DEFAULT 0,
    discount_type VARCHAR(20) DEFAULT 'none',
    discount_percent NUMERIC(5,2) DEFAULT 0,
    discount_reason VARCHAR(150) DEFAULT '',
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES user_profiles(id),
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    unit_cost_cents INTEGER DEFAULT 0,
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUSTMENT')),
    quantity INTEGER NOT NULL,
    reference_id UUID,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(150) NOT NULL DEFAULT 'Farmacia PharmaCore',
    nit VARCHAR(50) DEFAULT '1234567018',
    address VARCHAR(255) DEFAULT 'Av. Principal #123, Zona Central',
    phone VARCHAR(50) DEFAULT '+591 70000000',
    ticket_footer TEXT DEFAULT '¡Gracias por su preferencia! Conserve su comprobante para cualquier reclamo.',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 6. ÍNDICES DE RENDIMIENTO (PREVENCIÓN DE TABLE SCANS Y OPTIMIZACIÓN DE MEMORIA)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_is_priority ON products(is_priority) WHERE is_priority = true;
CREATE INDEX IF NOT EXISTS idx_products_expiration_date ON products(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_min_stock ON products(min_stock) WHERE stock <= min_stock;

CREATE INDEX IF NOT EXISTS idx_product_batches_product_id ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiration ON product_batches(expiration_date);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_user_status ON cash_shifts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_opened_at ON cash_shifts(opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_created_at_desc ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_cash_shift_id ON sales(cash_shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_composite_audit ON sales(created_at DESC, status, user_id);

CREATE INDEX IF NOT EXISTS idx_sale_details_sale_id ON sale_details(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_details_product_id ON sale_details(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_details_batch_id ON sale_details(batch_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch ON inventory_movements(batch_id);

-- ==============================================================================
-- 7. PROCEDIMIENTO ALMACENADO ATÓMICO: CREATE_SALE (FEFO + MULTI-LOTE + DESCUENTOS)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_sale(
    p_user_id UUID,
    p_items JSONB,
    p_payment_method VARCHAR(20) DEFAULT 'cash',
    p_cash_shift_id UUID DEFAULT NULL,
    p_client_name VARCHAR(150) DEFAULT 'Sin Nombre',
    p_client_nit VARCHAR(30) DEFAULT '0',
    p_received_amount_cents INTEGER DEFAULT 0,
    p_change_amount_cents INTEGER DEFAULT 0,
    p_discount_cents INTEGER DEFAULT 0,
    p_discount_type VARCHAR(20) DEFAULT 'none',
    p_discount_percent NUMERIC(5,2) DEFAULT 0,
    p_discount_reason VARCHAR(150) DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale_id UUID;
    v_subtotal_raw_cents INTEGER := 0;
    v_applied_discount_cents INTEGER := 0;
    v_final_total_cents INTEGER := 0;
    v_payment_method VARCHAR(20);
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_batch_id UUID;
    v_current_stock INTEGER;
    v_unit_price_cents INTEGER;
    v_cost_cents INTEGER;
    v_product_name VARCHAR;
    v_subtotal_cents INTEGER;
    v_ticket_items JSONB := '[]'::JSONB;
    v_rem_qty INTEGER;
    v_b_rec RECORD;
    v_deduct INTEGER;
    v_has_batches BOOLEAN;
BEGIN
    v_payment_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    IF v_payment_method NOT IN ('cash', 'card', 'qr') THEN
        v_payment_method := 'cash';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La venta debe contener al menos un medicamento';
    END IF;

    -- 1. Crear cabecera inicial de venta
    INSERT INTO sales (
        user_id,
        total_cents,
        payment_method,
        status,
        cash_shift_id,
        client_name,
        client_nit,
        received_amount_cents,
        change_amount_cents,
        discount_cents,
        discount_type,
        discount_percent,
        discount_reason
    )
    VALUES (
        p_user_id,
        0,
        v_payment_method,
        'completed',
        p_cash_shift_id,
        COALESCE(NULLIF(TRIM(p_client_name), ''), 'Sin Nombre'),
        COALESCE(NULLIF(TRIM(p_client_nit), ''), '0'),
        COALESCE(p_received_amount_cents, 0),
        COALESCE(p_change_amount_cents, 0),
        0,
        COALESCE(p_discount_type, 'none'),
        COALESCE(p_discount_percent, 0),
        COALESCE(NULLIF(TRIM(p_discount_reason), ''), '')
    )
    RETURNING id INTO v_sale_id;

    -- 2. Procesar ítems ordenados por ID para evitar deadlocks en ventas simultáneas
    FOR v_item IN
        SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'product_id')::UUID
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_batch_id := NULL;
        IF (v_item->>'batch_id') IS NOT NULL AND (v_item->>'batch_id') <> '' THEN
            v_batch_id := (v_item->>'batch_id')::UUID;
        END IF;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida para el producto %', v_product_id;
        END IF;

        -- Bloquear fila del producto y obtener datos reales
        SELECT stock, price_cents, cost_cents, name
        INTO v_current_stock, v_unit_price_cents, v_cost_cents, v_product_name
        FROM products
        WHERE id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto % no existe', v_product_id;
        END IF;

        IF v_current_stock < v_quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para "%" (disponible: %, solicitado: %)',
                v_product_name, v_current_stock, v_quantity;
        END IF;

        v_subtotal_cents := v_quantity * v_unit_price_cents;
        v_subtotal_raw_cents := v_subtotal_raw_cents + v_subtotal_cents;

        -- Descontar stock general del producto
        UPDATE products
        SET stock = stock - v_quantity,
            updated_at = NOW()
        WHERE id = v_product_id;

        -- Comprobar si tiene lotes registrados
        SELECT EXISTS(
            SELECT 1 FROM product_batches WHERE product_id = v_product_id AND stock > 0
        ) INTO v_has_batches;

        IF v_has_batches THEN
            v_rem_qty := v_quantity;

            -- Si el cajero forzó un lote específico
            IF v_batch_id IS NOT NULL THEN
                SELECT stock, cost_cents INTO v_b_rec
                FROM product_batches
                WHERE id = v_batch_id AND product_id = v_product_id
                FOR UPDATE;

                IF FOUND AND v_b_rec.stock >= v_rem_qty THEN
                    UPDATE product_batches
                    SET stock = stock - v_rem_qty
                    WHERE id = v_batch_id;

                    INSERT INTO sale_details (sale_id, product_id, batch_id, quantity, unit_price_cents, unit_cost_cents, subtotal_cents)
                    VALUES (v_sale_id, v_product_id, v_batch_id, v_rem_qty, v_unit_price_cents, COALESCE(v_b_rec.cost_cents, v_cost_cents), v_rem_qty * v_unit_price_cents);

                    INSERT INTO inventory_movements (product_id, batch_id, user_id, movement_type, quantity, reference_id, reason)
                    VALUES (v_product_id, v_batch_id, p_user_id, 'OUT', -v_rem_qty, v_sale_id, 'Venta POS (Lote seleccionado)');

                    v_rem_qty := 0;
                END IF;
            END IF;

            -- FEFO Automático: consumir del lote con fecha de caducidad más cercana
            IF v_rem_qty > 0 THEN
                FOR v_b_rec IN
                    SELECT id, stock, cost_cents, expiration_date
                    FROM product_batches
                    WHERE product_id = v_product_id AND stock > 0
                    ORDER BY expiration_date ASC NULLS LAST, created_at ASC
                    FOR UPDATE
                LOOP
                    EXIT WHEN v_rem_qty <= 0;
                    v_deduct := LEAST(v_b_rec.stock, v_rem_qty);

                    UPDATE product_batches
                    SET stock = stock - v_deduct
                    WHERE id = v_b_rec.id;

                    INSERT INTO sale_details (sale_id, product_id, batch_id, quantity, unit_price_cents, unit_cost_cents, subtotal_cents)
                    VALUES (v_sale_id, v_product_id, v_b_rec.id, v_deduct, v_unit_price_cents, COALESCE(v_b_rec.cost_cents, v_cost_cents), v_deduct * v_unit_price_cents);

                    INSERT INTO inventory_movements (product_id, batch_id, user_id, movement_type, quantity, reference_id, reason)
                    VALUES (v_product_id, v_b_rec.id, p_user_id, 'OUT', -v_deduct, v_sale_id, 'Venta POS (FEFO)');

                    v_rem_qty := v_rem_qty - v_deduct;
                END LOOP;
            END IF;

            -- Si queda remanente no cubierto por lotes
            IF v_rem_qty > 0 THEN
                INSERT INTO sale_details (sale_id, product_id, batch_id, quantity, unit_price_cents, unit_cost_cents, subtotal_cents)
                VALUES (v_sale_id, v_product_id, NULL, v_rem_qty, v_unit_price_cents, COALESCE(v_cost_cents, 0), v_rem_qty * v_unit_price_cents);

                INSERT INTO inventory_movements (product_id, batch_id, user_id, movement_type, quantity, reference_id, reason)
                VALUES (v_product_id, NULL, p_user_id, 'OUT', -v_rem_qty, v_sale_id, 'Venta POS (Remanente sin lote)');
            END IF;
        ELSE
            -- Sin lotes: registro directo
            INSERT INTO sale_details (sale_id, product_id, batch_id, quantity, unit_price_cents, unit_cost_cents, subtotal_cents)
            VALUES (v_sale_id, v_product_id, NULL, v_quantity, v_unit_price_cents, COALESCE(v_cost_cents, 0), v_subtotal_cents);

            INSERT INTO inventory_movements (product_id, batch_id, user_id, movement_type, quantity, reference_id, reason)
            VALUES (v_product_id, NULL, p_user_id, 'OUT', -v_quantity, v_sale_id, 'Venta POS');
        END IF;

        -- Actualizar la fecha de expiración visible en el producto
        UPDATE products
        SET expiration_date = (
            SELECT MIN(expiration_date)
            FROM product_batches
            WHERE product_id = v_product_id AND stock > 0 AND expiration_date IS NOT NULL
        )
        WHERE id = v_product_id;

        -- Agregar al ticket
        v_ticket_items := v_ticket_items || jsonb_build_object(
            'product_id', v_product_id,
            'name', v_product_name,
            'quantity', v_quantity,
            'unit_price_cents', v_unit_price_cents,
            'subtotal_cents', v_subtotal_cents
        );
    END LOOP;

    -- 3. Calcular descuentos finales
    IF COALESCE(p_discount_cents, 0) > 0 THEN
        v_applied_discount_cents := LEAST(p_discount_cents, v_subtotal_raw_cents);
    ELSIF COALESCE(p_discount_percent, 0) > 0 THEN
        v_applied_discount_cents := ROUND((v_subtotal_raw_cents * p_discount_percent) / 100.0);
        v_applied_discount_cents := LEAST(v_applied_discount_cents, v_subtotal_raw_cents);
    ELSE
        v_applied_discount_cents := 0;
    END IF;

    v_final_total_cents := GREATEST(0, v_subtotal_raw_cents - v_applied_discount_cents);

    -- 4. Actualizar total final y descuento en la cabecera
    UPDATE sales
    SET total_cents = v_final_total_cents,
        discount_cents = v_applied_discount_cents
    WHERE id = v_sale_id;

    RETURN jsonb_build_object(
        'sale_id', v_sale_id,
        'subtotal_cents', v_subtotal_raw_cents,
        'discount_cents', v_applied_discount_cents,
        'total_cents', v_final_total_cents,
        'payment_method', v_payment_method,
        'items', v_ticket_items,
        'client_name', COALESCE(p_client_name, 'Sin Nombre'),
        'client_nit', COALESCE(p_client_nit, '0'),
        'change_amount_cents', COALESCE(p_change_amount_cents, 0)
    );
END;
$$;

-- ==============================================================================
-- 8. PROCEDIMIENTO ALMACENADO: CANCEL_SALE (ANULACIÓN Y RESTITUCIÓN DE STOCK)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.cancel_sale(
    p_sale_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Anulación administrativa'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale RECORD;
    v_detail RECORD;
    v_restored_count INTEGER := 0;
BEGIN
    SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta % no encontrada', p_sale_id;
    END IF;

    IF v_sale.status = 'cancelled' THEN
        RAISE EXCEPTION 'La venta % ya fue anulada previamente', p_sale_id;
    END IF;

    -- Revertir stock de cada detalle
    FOR v_detail IN SELECT * FROM sale_details WHERE sale_id = p_sale_id LOOP
        UPDATE products
        SET stock = stock + v_detail.quantity,
            updated_at = NOW()
        WHERE id = v_detail.product_id;

        IF v_detail.batch_id IS NOT NULL THEN
            UPDATE product_batches
            SET stock = stock + v_detail.quantity
            WHERE id = v_detail.batch_id;
        END IF;

        INSERT INTO inventory_movements (
            product_id, batch_id, user_id, movement_type, quantity, reference_id, reason
        )
        VALUES (
            v_detail.product_id,
            v_detail.batch_id,
            p_user_id,
            'IN',
            v_detail.quantity,
            p_sale_id,
            'Restitución por anulación de venta'
        );

        v_restored_count := v_restored_count + 1;
    END LOOP;

    UPDATE sales
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = p_user_id,
        cancellation_reason = COALESCE(p_reason, 'Anulación administrativa')
    WHERE id = p_sale_id;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'restored_items_count', v_restored_count,
        'cancelled_at', NOW()
    );
END;
$$;

-- ==============================================================================
-- 8.5. PROCEDIMIENTO ADMINISTRATIVO: RESETEAR CONTRASEÑA DE USUARIO (EXCLUSIVO ADMIN)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_target_user_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_caller_role VARCHAR;
    v_target_user RECORD;
BEGIN
    IF LENGTH(TRIM(p_new_password)) < 6 THEN
        RAISE EXCEPTION 'La contraseña debe contener al menos 6 caracteres';
    END IF;

    SELECT r.name INTO v_caller_role
    FROM public.user_profiles up
    JOIN public.roles r ON up.role_id = r.id
    WHERE up.id = auth.uid() AND up.is_active = true;

    IF v_caller_role IS NULL OR LOWER(v_caller_role) <> 'admin' THEN
        RAISE EXCEPTION 'Operación denegada: Solo un Administrador activo tiene autorización para cambiar contraseñas';
    END IF;

    SELECT * INTO v_target_user FROM auth.users WHERE id = p_target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El usuario objetivo no existe en el sistema de autenticación';
    END IF;

    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = NOW()
    WHERE id = p_target_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Contraseña actualizada exitosamente por el administrador'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reset_user_password FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password TO authenticated;

-- ==============================================================================
-- 9. SEMILLERO INICIAL: ROLES, PERMISOS ORTOGONALES Y CONFIGURACIÓN BASE
-- ==============================================================================

-- Roles base
INSERT INTO roles (name, description) VALUES
('admin', 'Administrador con control total del sistema, seguridad y parámetros'),
('cajero', 'Personal de atención: Punto de venta, cobros, turnos de caja y consulta de inventario'),
('personalizado', 'Rol con permisos configurables a medida por el administrador')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 33 Permisos ortogonales
INSERT INTO permissions (name, label, category, description) VALUES
('dashboard:view', 'Ver Dashboard Operativo (Stock y Alertas)', 'Dashboard', 'Visualización de quiebres de inventario, stock crítico y lotes por vencer FEFO'),
('dashboard:financial', 'Ver Finanzas y Ventas en Dashboard', 'Dashboard', 'Visualización de ingresos en Bs, ticket promedio, ventas recientes y arqueo de turnos'),
('pos:access', 'Acceso al Punto de Venta', 'Punto de Venta (POS)', 'Permite abrir e interactuar con la pantalla de ventas'),
('pos:sell', 'Cobrar y Procesar Ventas', 'Punto de Venta (POS)', 'Permite agregar medicamentos al ticket y finalizar transacciones'),
('pos:shifts', 'Apertura y Cierre de Caja', 'Punto de Venta (POS)', 'Permite iniciar turno de caja con fondo inicial y realizar arqueo/cierre'),
('pos:history', 'Historial y Reimpresión de Tickets', 'Punto de Venta (POS)', 'Permite consultar ventas anteriores del turno y reimprimir tickets'),
('pos:discount', 'Aplicar Descuentos en POS', 'Punto de Venta (POS)', 'Permite aplicar descuentos por porcentaje o monto fijo en bolivianos'),
('inventory:view', 'Consultar Inventario y Medicamentos', 'Inventario', 'Visualizar catálogo, stock disponible, precios y alertas de vencimiento'),
('inventory:create', 'Registrar Nuevo Medicamento', 'Inventario', 'Permite dar de alta nuevos productos y medicamentos en el catálogo'),
('inventory:edit', 'Editar Información de Medicamento', 'Inventario', 'Modificar precios, descripciones, presentación y datos terapéuticos'),
('inventory:adjust_stock', 'Reabastecer y Ajustar Stock/Lotes', 'Inventario', 'Ingresar existencias, nuevos lotes y reabastecimiento directo'),
('inventory:kardex', 'Consultar Kardex de Movimientos', 'Inventario', 'Auditoría detallada de entradas, salidas y trazabilidad por producto'),
('inventory:delete', 'Eliminar Medicamentos', 'Inventario', 'Dar de baja definitiva medicamentos del catálogo del sistema'),
('inventory:export', 'Exportar Inventario a CSV', 'Inventario', 'Descargar el catálogo completo y existencias en archivo CSV'),
('categories:view', 'Consultar Categorías', 'Categorías', 'Ver clasificación terapéutica y distribución de productos por categoría'),
('categories:create', 'Crear Nueva Categoría', 'Categorías', 'Registrar nuevas líneas y clasificaciones farmacéuticas'),
('categories:edit', 'Editar Categorías', 'Categorías', 'Modificar nombre, icono y descripción de categorías existentes'),
('categories:delete', 'Eliminar Categorías', 'Categorías', 'Remover categorías del sistema que no posean productos asociados'),
('suppliers:view', 'Consultar Proveedores', 'Proveedores', 'Ver directorio de laboratorios y distribuidores autorizados'),
('suppliers:create', 'Registrar Nuevo Proveedor', 'Proveedores', 'Dar de alta nuevos distribuidores, laboratorios y contactos'),
('suppliers:edit', 'Editar Proveedor', 'Proveedores', 'Modificar datos de contacto, NIT y teléfonos de proveedores'),
('suppliers:delete', 'Eliminar Proveedor', 'Proveedores', 'Eliminar registros de proveedores sin dependencias'),
('reports:view', 'Consultar Reportes y Analítica', 'Reportes', 'Ver métricas de ventas por fecha, productos top y márgenes brutos'),
('reports:cash_close', 'Ver Cierres Consolidados de Caja', 'Reportes', 'Auditar balances de caja, turnos y diferencias de arqueo'),
('reports:void_sale', 'Anular Ventas y Restaurar Stock', 'Reportes', 'Anulación administrativa de transacciones con restitución de existencias'),
('reports:export', 'Exportar Reportes a CSV', 'Reportes', 'Descargar datos analíticos y reportes en formato CSV'),
('users:view', 'Consultar Personal y Usuarios', 'Seguridad y Usuarios', 'Ver listado de colaboradores, cuentas y estados de acceso'),
('users:create', 'Registrar Nuevo Personal', 'Seguridad y Usuarios', 'Crear cuentas para nuevos empleados con usuario y contraseña'),
('users:edit', 'Editar Perfil y Rol de Usuario', 'Seguridad y Usuarios', 'Modificar nombres y reasignar roles de seguridad a colaboradores'),
('users:toggle_status', 'Suspender y Activar Acceso', 'Seguridad y Usuarios', 'Bloquear o restaurar acceso a empleados al sistema'),
('users:manage_roles', 'Administrar Roles y Matriz RBAC', 'Seguridad y Usuarios', 'Crear roles personalizados y modificar asignación de permisos'),
('settings:view', 'Ver Configuración de la Farmacia', 'Configuración', 'Consultar datos de razón social, NIT, dirección y parámetros de tickets'),
('settings:edit', 'Editar Parámetros de la Farmacia', 'Configuración', 'Modificar nombre comercial, NIT, teléfono, dirección, logotipo y colores del sistema')
ON CONFLICT (name) DO UPDATE SET
    label = EXCLUDED.label,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

-- Asignar los 33 permisos al rol 'admin'
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Asignar permisos esenciales al rol 'cajero'
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'cajero' AND p.name IN (
    'pos:access', 'pos:sell', 'pos:shifts', 'pos:history', 'inventory:view'
)
ON CONFLICT DO NOTHING;

-- Asignar permisos iniciales al rol 'personalizado'
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'personalizado' AND p.name IN (
    'pos:access', 'inventory:view', 'dashboard:view'
)
ON CONFLICT DO NOTHING;

-- Configuración inicial institucional
INSERT INTO store_settings (business_name, nit, address, phone, ticket_footer)
SELECT 'Farmacia PharmaCore', '1028374019', 'Av. Principal #450, Esq. Calle 8, Zona Central', '+591 70000000', '¡Gracias por su preferencia! Conserve su comprobante. Medicamentos no sujetos a cambio según normativa sanitaria.'
WHERE NOT EXISTS (SELECT 1 FROM store_settings);

-- Categorías terapéuticas iniciales
INSERT INTO categories (name, icon) VALUES
('Analgésicos y Antiinflamatorios', 'medication'),
('Antibióticos y Antimicrobianos', 'vaccines'),
('Antihistamínicos y Respiratorios', 'healing'),
('Gastroenterología', 'health_and_safety'),
('Cardiovascular y Metabólico', 'ecg_heart'),
('Dermocosmética y Cuidado de la Piel', 'spa'),
('Material de Curación y Desinfección', 'sanitizer'),
('Vitaminas y Suplementos', 'vital_signs')
ON CONFLICT (name) DO NOTHING;

-- Proveedores iniciales
INSERT INTO suppliers (name, contact_name, contact_phone, nit) VALUES
('Droguería INTI S.A.', 'Lic. Marcelo Terán', '+591 2 2456000', '1028374019'),
('Laboratorios BAGO de Bolivia', 'Dra. Patricia Morales', '+591 2 2223344', '1015243022'),
('Laboratorios IFA S.A.', 'Ing. Carlos Mendoza', '+591 3 3445566', '1020304050'),
('Laboratorios COFAR', 'Lic. Andrea Suárez', '+591 2 2778899', '1004567088')
ON CONFLICT (name) DO NOTHING;
