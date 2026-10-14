-- ==============================================================================
-- MIGRATION: FEFO AUTO-DEDUCT ON POS SALES & MULTI-BATCH TRACKING
-- Actualiza create_sale para que cuando se venda en POS sin especificar lote,
-- descuente automáticamente del lote más próximo a vencer (First Expired, First Out)
-- y actualice la fecha de vencimiento mínima activa en el producto.
-- ==============================================================================

CREATE OR REPLACE FUNCTION create_sale(
    p_user_id UUID,
    p_items JSONB,
    p_payment_method VARCHAR(20) DEFAULT 'cash',
    p_cash_shift_id UUID DEFAULT NULL,
    p_client_name VARCHAR(150) DEFAULT 'Sin Nombre',
    p_client_nit VARCHAR(30) DEFAULT '0',
    p_received_amount_cents INTEGER DEFAULT 0,
    p_change_amount_cents INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sale_id UUID;
    v_total_cents INTEGER := 0;
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
BEGIN
    v_payment_method := LOWER(TRIM(p_payment_method));
    IF v_payment_method NOT IN ('cash', 'card', 'qr') THEN
        v_payment_method := 'cash';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Sale must contain at least one item';
    END IF;

    -- 1. Crear cabecera de venta
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
        -- Si viene un batch_id específico, descontar ese
        IF v_batch_id IS NOT NULL THEN
            UPDATE product_batches
            SET stock = GREATEST(0, stock - v_quantity)
            WHERE id = v_batch_id AND product_id = v_product_id;
        ELSE
            -- FEFO automático: Descontar primero los lotes que vencen antes
            v_rem_qty := v_quantity;
            FOR v_b_rec IN
                SELECT id, stock
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

                IF v_batch_id IS NULL THEN
                    v_batch_id := v_b_rec.id;
                END IF;
                v_rem_qty := v_rem_qty - v_deduct;
            END LOOP;
        END IF;

        -- Actualizar en products la fecha de caducidad más temprana que aún tenga stock
        UPDATE products
        SET expiration_date = (
            SELECT MIN(expiration_date)
            FROM product_batches
            WHERE product_id = v_product_id AND stock > 0 AND expiration_date IS NOT NULL
        )
        WHERE id = v_product_id;

        -- Insertar detalle de venta
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

        -- Registrar movimiento en Kardex
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
            'Venta en POS (FEFO)'
        );

        -- Acumular ítem para el ticket
        v_ticket_items := v_ticket_items || jsonb_build_object(
            'product_id', v_product_id,
            'name', v_product_name,
            'quantity', v_quantity,
            'unit_price_cents', v_unit_price_cents,
            'subtotal_cents', v_subtotal_cents,
            'batch_id', v_batch_id
        );

        v_total_cents := v_total_cents + v_subtotal_cents;
    END LOOP;

    -- 3. Actualizar total final de la venta
    UPDATE sales
    SET total_cents = v_total_cents
    WHERE id = v_sale_id;

    -- Notificar recarga de schema postgrest
    NOTIFY pgrst, 'reload schema';

    -- 4. Devolver ticket para impresión o confirmación
    RETURN jsonb_build_object(
        'sale_id', v_sale_id,
        'total_cents', v_total_cents,
        'payment_method', v_payment_method,
        'items', v_ticket_items,
        'client_name', COALESCE(p_client_name, 'Sin Nombre'),
        'client_nit', COALESCE(p_client_nit, '0'),
        'change_amount_cents', COALESCE(p_change_amount_cents, 0)
    );
END;
$$;
