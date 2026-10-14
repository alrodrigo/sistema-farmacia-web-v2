-- ==============================================================================
-- MIGRATION: ADD DISCOUNTS TO SALES & DYNAMIC RBAC PERMISSION
-- Permite registrar descuentos globales (porcentaje o monto en Bs) en el POS.
-- Agrega permiso 'pos:discount' ortogonal para control de acceso RBAC.
-- ==============================================================================

-- 1. Ampliar tabla sales con metadatos de descuento
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS discount_cents INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'none',
ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_reason VARCHAR(150) DEFAULT '';

-- 2. Registrar permiso en la tabla permissions
INSERT INTO public.permissions (name, label, category, description)
VALUES (
    'pos:discount',
    'Aplicar Descuentos en POS',
    'Punto de Venta (POS)',
    'Permite aplicar descuentos por porcentaje o monto fijo en bolivianos al ticket de venta'
)
ON CONFLICT (name) DO UPDATE SET
    label = EXCLUDED.label,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

-- 3. Asignar permiso al rol 'admin'
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'admin' AND p.name = 'pos:discount'
ON CONFLICT DO NOTHING;

-- 4. Reemplazar función create_sale con soporte para descuentos
DROP FUNCTION IF EXISTS public.create_sale(UUID, JSONB, VARCHAR, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.create_sale(UUID, JSONB, VARCHAR, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER, INTEGER, VARCHAR, NUMERIC, VARCHAR);

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
        RAISE EXCEPTION 'Sale must contain at least one item';
    END IF;

    -- 1. Crear cabecera inicial de venta (total_cents se actualizará al final)
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

    -- 2. Procesar ítems ordenados por ID para evitar deadlocks
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

        -- Descontar lotes:
        IF v_batch_id IS NOT NULL THEN
            UPDATE product_batches
            SET stock = GREATEST(0, stock - v_quantity)
            WHERE id = v_batch_id AND product_id = v_product_id;

            INSERT INTO sale_details (
                sale_id, product_id, batch_id, quantity, unit_price_cents, unit_cost_cents, subtotal_cents
            ) VALUES (
                v_sale_id, v_product_id, v_batch_id, v_quantity, v_unit_price_cents, COALESCE(v_cost_cents, 0), v_subtotal_cents
            );

            INSERT INTO inventory_movements (
                product_id, batch_id, user_id, movement_type, quantity, reference_id, reason
            ) VALUES (
                v_product_id, v_batch_id, p_user_id, 'OUT', -v_quantity, v_sale_id, 'Venta en POS'
            );
        ELSE
            -- FEFO automático: Descontar primero los lotes que vencen antes
            v_rem_qty := v_quantity;
            v_has_batches := FALSE;

            FOR v_b_rec IN
                SELECT id, stock
                FROM product_batches
                WHERE product_id = v_product_id AND stock > 0
                ORDER BY expiration_date ASC NULLS LAST, created_at ASC
                FOR UPDATE
            LOOP
                EXIT WHEN v_rem_qty <= 0;
                v_has_batches := TRUE;
                v_deduct := LEAST(v_b_rec.stock, v_rem_qty);

                UPDATE product_batches
                SET stock = stock - v_deduct
                WHERE id = v_b_rec.id;

                INSERT INTO sale_details (
                    sale_id, product_id, batch_id, quantity, unit_price_cents, unit_cost_cents, subtotal_cents
                ) VALUES (
                    v_sale_id, v_product_id, v_b_rec.id, v_deduct, v_unit_price_cents, COALESCE(v_cost_cents, 0), v_deduct * v_unit_price_cents
                );

                INSERT INTO inventory_movements (
                    product_id, batch_id, user_id, movement_type, quantity, reference_id, reason
                ) VALUES (
                    v_product_id, v_b_rec.id, p_user_id, 'OUT', -v_deduct, v_sale_id, 'Venta en POS (FEFO)'
                );

                v_rem_qty := v_rem_qty - v_deduct;
            END LOOP;

            -- Fallback si el producto no tenía lotes registrados
            IF NOT v_has_batches THEN
                INSERT INTO sale_details (
                    sale_id, product_id, batch_id, quantity, unit_price_cents, unit_cost_cents, subtotal_cents
                ) VALUES (
                    v_sale_id, v_product_id, NULL, v_quantity, v_unit_price_cents, COALESCE(v_cost_cents, 0), v_subtotal_cents
                );

                INSERT INTO inventory_movements (
                    product_id, batch_id, user_id, movement_type, quantity, reference_id, reason
                ) VALUES (
                    v_product_id, NULL, p_user_id, 'OUT', -v_quantity, v_sale_id, 'Venta en POS'
                );
            END IF;
        END IF;

        -- Actualizar en products la fecha de caducidad más temprana que aún tenga stock
        UPDATE products
        SET expiration_date = (
            SELECT MIN(expiration_date)
            FROM product_batches
            WHERE product_id = v_product_id AND stock > 0 AND expiration_date IS NOT NULL
        )
        WHERE id = v_product_id;

        -- Acumular ítem para el ticket
        v_ticket_items := v_ticket_items || jsonb_build_object(
            'product_id', v_product_id,
            'name', v_product_name,
            'quantity', v_quantity,
            'unit_price_cents', v_unit_price_cents,
            'subtotal_cents', v_subtotal_cents
        );

        v_subtotal_raw_cents := v_subtotal_raw_cents + v_subtotal_cents;
    END LOOP;

    -- 3. Calcular descuento y total final
    v_applied_discount_cents := LEAST(v_subtotal_raw_cents, GREATEST(0, COALESCE(p_discount_cents, 0)));
    v_final_total_cents := v_subtotal_raw_cents - v_applied_discount_cents;

    -- 4. Actualizar total definitivo y descuento de la venta
    UPDATE sales
    SET total_cents = v_final_total_cents,
        discount_cents = v_applied_discount_cents,
        discount_type = COALESCE(p_discount_type, 'none'),
        discount_percent = COALESCE(p_discount_percent, 0),
        discount_reason = COALESCE(NULLIF(TRIM(p_discount_reason), ''), '')
    WHERE id = v_sale_id;

    RETURN jsonb_build_object(
        'sale_id', v_sale_id,
        'subtotal_cents', v_subtotal_raw_cents,
        'discount_cents', v_applied_discount_cents,
        'discount_percent', COALESCE(p_discount_percent, 0),
        'discount_type', COALESCE(p_discount_type, 'none'),
        'discount_reason', COALESCE(p_discount_reason, ''),
        'total_cents', v_final_total_cents,
        'payment_method', v_payment_method,
        'client_name', p_client_name,
        'client_nit', p_client_nit,
        'received_amount_cents', p_received_amount_cents,
        'change_amount_cents', p_change_amount_cents,
        'items', v_ticket_items,
        'created_at', NOW()
    );
END;
$$;
