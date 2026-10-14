-- ==============================================================================
-- MIGRACIÓN 009: EXPANSIÓN CONSOLIDADA DEL ESQUEMA FARMACÉUTICO
-- 1. store_settings: Datos de la farmacia para tickets y reportes
-- 2. categories & suppliers: Estados activos y contacto
-- 3. products: active_substance, pharmaceutical_form, is_priority (favoritos), requires_prescription
-- 4. product_batches: Soporte para múltiples vencimientos y lotes
-- 5. inventory_movements: Kardex automático de entradas/salidas/ajustes
-- 6. sales: Vinculación con caja (cash_shift_id), datos de cliente y vuelto
-- 7. sale_details: Costo unitario histórico y enlace a lote
-- 8. Actualización de RPC create_sale y cancel_sale con registro en Kardex
-- ==============================================================================

-- 1. STORE SETTINGS (CONFIGURACIÓN DE EMPRESA / TICKET TÉRMICO)
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

-- Insertar configuración inicial por defecto si la tabla está vacía
INSERT INTO store_settings (business_name, nit, address, phone, ticket_footer)
SELECT 'Farmacia PharmaCore', '1234567018', 'Av. Principal #123, Zona Central', '+591 70000000', '¡Gracias por su preferencia! Conserve su comprobante.'
WHERE NOT EXISTS (SELECT 1 FROM store_settings);

-- 2. CATEGORIES & SUPPLIERS (ESTADO ACTIVO Y CONTACTO)
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS contact_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS nit VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 3. PRODUCTS (CAMPOS CLÍNICOS Y FAVORITOS PARA POS)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS active_substance VARCHAR(200),
ADD COLUMN IF NOT EXISTS pharmaceutical_form VARCHAR(50),
ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN DEFAULT false;

-- Sincronizar is_priority si existían datos con priority_flag alta o crítica
UPDATE products
SET is_priority = true
WHERE priority_flag IN ('high', 'critical');

-- Recrear vector de búsqueda con principio activo
DROP INDEX IF EXISTS idx_products_search;
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

CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_products_priority ON products (is_priority) WHERE is_priority = true;

-- 4. PRODUCT BATCHES (LOTES Y CADUCIDADES MÚLTIPLES)
CREATE TABLE IF NOT EXISTS product_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    lot_number VARCHAR(50),
    expiration_date DATE,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_batches_product_id ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_expiration ON product_batches(expiration_date);

-- 5. INVENTORY MOVEMENTS (KARDEX INMUTABLE / AUDITORÍA DE STOCK)
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

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at DESC);

-- 6. SALES (CABECERA DE TICKET AMPLIADA)
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS cash_shift_id UUID REFERENCES cash_shifts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS client_name VARCHAR(150) DEFAULT 'Sin Nombre',
ADD COLUMN IF NOT EXISTS client_nit VARCHAR(50) DEFAULT '0',
ADD COLUMN IF NOT EXISTS received_amount_cents INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS change_amount_cents INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sales_cash_shift_id ON sales(cash_shift_id);

-- 7. SALE DETAILS (COSTO HISTÓRICO Y LOTE)
ALTER TABLE sale_details
ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS unit_cost_cents INTEGER DEFAULT 0;

-- 8. RPC: CREATE_SALE ACTUALIZADO CON KARDEX Y METADATOS
CREATE OR REPLACE FUNCTION create_sale(
    p_user_id UUID,
    p_items JSONB,
    p_payment_method VARCHAR DEFAULT 'cash',
    p_client_name VARCHAR DEFAULT 'Sin Nombre',
    p_client_nit VARCHAR DEFAULT '0',
    p_cash_shift_id UUID DEFAULT NULL,
    p_received_amount_cents INTEGER DEFAULT 0,
    p_change_amount_cents INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale_id UUID;
    v_total_cents INTEGER := 0;
    v_item JSONB;
    v_product_id UUID;
    v_batch_id UUID;
    v_quantity INTEGER;
    v_unit_price_cents INTEGER;
    v_cost_cents INTEGER;
    v_subtotal_cents INTEGER;
    v_current_stock INTEGER;
    v_product_name VARCHAR(200);
    v_is_active BOOLEAN;
    v_ticket_items JSONB := '[]'::JSONB;
    v_payment_method VARCHAR(20) := COALESCE(p_payment_method, 'cash');
BEGIN
    -- Validar array de ítems
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cart empty or invalid format';
    END IF;

    IF v_payment_method NOT IN ('cash', 'card', 'qr') THEN
        v_payment_method := 'cash';
    END IF;

    -- Validar usuario activo
    SELECT is_active INTO v_is_active
    FROM user_profiles
    WHERE id = p_user_id
    FOR SHARE;

    IF NOT FOUND OR NOT v_is_active THEN
        RAISE EXCEPTION 'User not authorized or inactive';
    END IF;

    -- Crear cabecera de venta
    INSERT INTO sales (
        user_id,
        total_cents,
        payment_method,
        status,
        cash_shift_id,
        client_name,
        client_nit,
        received_amount_cents,
        change_amount_cents
    )
    VALUES (
        p_user_id,
        0,
        v_payment_method,
        'completed',
        p_cash_shift_id,
        COALESCE(p_client_name, 'Sin Nombre'),
        COALESCE(p_client_nit, '0'),
        COALESCE(p_received_amount_cents, 0),
        COALESCE(p_change_amount_cents, 0)
    )
    RETURNING id INTO v_sale_id;

    -- Procesar ítems ordenados por ID para evitar deadlocks
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
            RAISE EXCEPTION 'Invalid quantity for product %', v_product_id;
        END IF;

        -- Bloquear producto y obtener datos reales
        SELECT stock, price_cents, cost_cents, name
        INTO v_current_stock, v_unit_price_cents, v_cost_cents, v_product_name
        FROM products
        WHERE id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not exist', v_product_id;
        END IF;

        IF v_current_stock < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for "%" (available: %, requested: %)',
                v_product_name, v_current_stock, v_quantity;
        END IF;

        v_subtotal_cents := v_quantity * v_unit_price_cents;

        -- Descontar stock consolidado
        UPDATE products
        SET stock = stock - v_quantity,
            updated_at = NOW()
        WHERE id = v_product_id;

        -- Descontar lote si se especificó
        IF v_batch_id IS NOT NULL THEN
            UPDATE product_batches
            SET stock = GREATEST(0, stock - v_quantity)
            WHERE id = v_batch_id AND product_id = v_product_id;
        END IF;

        -- Insertar detalle de venta con costo histórico
        INSERT INTO sale_details (
            sale_id,
            product_id,
            batch_id,
            quantity,
            unit_price_cents,
            unit_cost_cents,
            subtotal_cents
        )
        VALUES (
            v_sale_id,
            v_product_id,
            v_batch_id,
            v_quantity,
            v_unit_price_cents,
            COALESCE(v_cost_cents, 0),
            v_subtotal_cents
        );

        -- Registrar movimiento automático en Kardex
        INSERT INTO inventory_movements (
            product_id,
            batch_id,
            user_id,
            movement_type,
            quantity,
            reference_id,
            reason
        )
        VALUES (
            v_product_id,
            v_batch_id,
            p_user_id,
            'OUT',
            -v_quantity,
            v_sale_id,
            'Venta en POS'
        );

        -- Acumular ítem para el ticket
        v_ticket_items := v_ticket_items || jsonb_build_object(
            'product_id', v_product_id,
            'name', v_product_name,
            'quantity', v_quantity,
            'unit_price_cents', v_unit_price_cents,
            'subtotal_cents', v_subtotal_cents
        );

        v_total_cents := v_total_cents + v_subtotal_cents;
    END LOOP;

    -- Actualizar total real de la venta
    UPDATE sales SET total_cents = v_total_cents WHERE id = v_sale_id;

    RETURN jsonb_build_object(
        'sale_id', v_sale_id,
        'total_cents', v_total_cents,
        'payment_method', v_payment_method,
        'client_name', COALESCE(p_client_name, 'Sin Nombre'),
        'client_nit', COALESCE(p_client_nit, '0'),
        'received_amount_cents', COALESCE(p_received_amount_cents, 0),
        'change_amount_cents', COALESCE(p_change_amount_cents, 0),
        'items', v_ticket_items,
        'created_at', NOW()
    );
END;
$$;

-- 9. RPC: CANCEL_SALE ACTUALIZADO CON KARDEX REVERSO
CREATE OR REPLACE FUNCTION cancel_sale(
    p_sale_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Anulación solicitada por operador'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale_status VARCHAR(20);
    v_detail RECORD;
    v_is_active BOOLEAN;
BEGIN
    SELECT is_active INTO v_is_active
    FROM user_profiles
    WHERE id = p_user_id;

    IF NOT FOUND OR NOT v_is_active THEN
        RAISE EXCEPTION 'Usuario no autorizado o inactivo';
    END IF;

    SELECT status INTO v_sale_status
    FROM sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta % no encontrada', p_sale_id;
    END IF;

    IF v_sale_status = 'cancelled' THEN
        RAISE EXCEPTION 'La venta ya fue anulada previamente';
    END IF;

    -- Revertir stock y registrar en Kardex
    FOR v_detail IN
        SELECT product_id, batch_id, quantity
        FROM sale_details
        WHERE sale_id = p_sale_id
    LOOP
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
            product_id,
            batch_id,
            user_id,
            movement_type,
            quantity,
            reference_id,
            reason
        )
        VALUES (
            v_detail.product_id,
            v_detail.batch_id,
            p_user_id,
            'IN',
            v_detail.quantity,
            p_sale_id,
            'Anulación de venta: ' || COALESCE(p_reason, 'Sin motivo especificado')
        );
    END LOOP;

    -- Marcar venta como anulada
    UPDATE sales
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = p_user_id,
        cancellation_reason = COALESCE(p_reason, 'Sin motivo especificado')
    WHERE id = p_sale_id;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'status', 'cancelled',
        'cancelled_at', NOW()
    );
END;
$$;
