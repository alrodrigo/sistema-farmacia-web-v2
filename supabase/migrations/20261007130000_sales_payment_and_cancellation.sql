-- ==============================================================================
-- MIGRACIÓN 005: MÉTODO DE PAGO, ESTADO DE VENTA Y ANULACIÓN CON REVERSIÓN DE STOCK
-- ==============================================================================

-- 1. AGREGAR COLUMNAS A SALES
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'qr')),
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales (payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);

-- 2. ACTUALIZAR RPC create_sale PARA GUARDAR payment_method
CREATE OR REPLACE FUNCTION create_sale(
    p_user_id UUID,
    p_items JSONB,
    p_payment_method VARCHAR DEFAULT 'cash'
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
    v_quantity INTEGER;
    v_unit_price_cents INTEGER;
    v_subtotal_cents INTEGER;
    v_current_stock INTEGER;
    v_product_name VARCHAR(200);
    v_is_active BOOLEAN;
    v_ticket_items JSONB := '[]'::JSONB;
    v_payment_method VARCHAR(20) := COALESCE(p_payment_method, 'cash');
BEGIN
    -- 0. Validate basic input
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cart empty or invalid format';
    END IF;

    IF v_payment_method NOT IN ('cash', 'card', 'qr') THEN
        v_payment_method := 'cash';
    END IF;

    -- 1. Verify user is active
    SELECT is_active INTO v_is_active
    FROM user_profiles
    WHERE id = p_user_id
    FOR SHARE;

    IF NOT FOUND OR NOT v_is_active THEN
        RAISE EXCEPTION 'User not authorized or inactive';
    END IF;

    -- 2. Create sale header with payment_method
    INSERT INTO sales (user_id, total_cents, payment_method, status)
    VALUES (p_user_id, 0, v_payment_method, 'completed')
    RETURNING id INTO v_sale_id;

    -- 3. Process items IN ID ORDER (prevents deadlocks)
    FOR v_item IN
        SELECT value FROM jsonb_array_elements(p_items) ORDER BY (value->>'product_id')::UUID
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;

        -- Validate positive quantity
        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity for product %', v_product_id;
        END IF;

        -- 4. Lock product row + fetch real price and name
        SELECT stock, price_cents, name
        INTO v_current_stock, v_unit_price_cents, v_product_name
        FROM products
        WHERE id = v_product_id
        FOR UPDATE;

        -- 5. Verify existence
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not exist', v_product_id;
        END IF;

        -- 6. Verify stock
        IF v_current_stock < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for "%" (available: %, requested: %)',
                v_product_name, v_current_stock, v_quantity;
        END IF;

        -- 7. Calculate subtotal with DATABASE PRICE
        v_subtotal_cents := v_quantity * v_unit_price_cents;

        -- 8. Decrease stock
        UPDATE products
        SET stock = stock - v_quantity,
            updated_at = NOW()
        WHERE id = v_product_id;

        -- 9. Insert sale detail
        INSERT INTO sale_details (sale_id, product_id, quantity, unit_price_cents, subtotal_cents)
        VALUES (v_sale_id, v_product_id, v_quantity, v_unit_price_cents, v_subtotal_cents);

        -- 10. Accumulate for ticket response
        v_ticket_items := v_ticket_items || jsonb_build_object(
            'product_id', v_product_id,
            'name', v_product_name,
            'quantity', v_quantity,
            'unit_price_cents', v_unit_price_cents,
            'subtotal_cents', v_subtotal_cents
        );

        v_total_cents := v_total_cents + v_subtotal_cents;
    END LOOP;

    -- 11. Update real total
    UPDATE sales SET total_cents = v_total_cents WHERE id = v_sale_id;

    -- 12. Return full ticket
    RETURN jsonb_build_object(
        'sale_id', v_sale_id,
        'total_cents', v_total_cents,
        'payment_method', v_payment_method,
        'items', v_ticket_items,
        'created_at', NOW()
    );
END;
$$;

-- 3. RPC PARA ANULACIÓN DE VENTA (CANCEL_SALE) CON REVERSIÓN DE STOCK ATÓMICA
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
    v_sale RECORD;
    v_detail RECORD;
    v_restored_count INTEGER := 0;
BEGIN
    -- 1. Bloquear y verificar la venta
    SELECT * INTO v_sale
    FROM sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta no encontrada con ID %', p_sale_id;
    END IF;

    IF v_sale.status = 'cancelled' THEN
        RAISE EXCEPTION 'La venta % ya fue anulada previamente', p_sale_id;
    END IF;

    -- 2. Revertir el stock de cada producto vendido
    FOR v_detail IN
        SELECT product_id, quantity
        FROM sale_details
        WHERE sale_id = p_sale_id
    LOOP
        UPDATE products
        SET stock = stock + v_detail.quantity,
            updated_at = NOW()
        WHERE id = v_detail.product_id;

        v_restored_count := v_restored_count + 1;
    END LOOP;

    -- 3. Marcar la venta como anulada
    UPDATE sales
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = p_user_id,
        cancellation_reason = COALESCE(p_reason, 'Anulación solicitada')
    WHERE id = p_sale_id;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'restored_items_count', v_restored_count,
        'cancelled_at', NOW()
    );
END;
$$;
