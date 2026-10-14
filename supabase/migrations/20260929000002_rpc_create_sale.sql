-- ==============================================================================
-- MIGRATION 002: CREATE_SALE RPC (Transactional, Atomic, Secure)
-- ==============================================================================

CREATE OR REPLACE FUNCTION create_sale(
    p_user_id UUID,
    p_items JSONB  -- Cart from React: [{"product_id": "uuid", "quantity": 2}]
)
RETURNS JSONB  -- Full ticket for printing without extra round-trip
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- Security: fixed search_path
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
BEGIN
    -- 0. Validate basic input
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cart empty or invalid format';
    END IF;

    -- 1. Verify user is active (FOR SHARE = shared lock, not exclusive)
    SELECT is_active INTO v_is_active
    FROM user_profiles
    WHERE id = p_user_id
    FOR SHARE;

    IF NOT FOUND OR NOT v_is_active THEN
        RAISE EXCEPTION 'User not authorized or inactive';
    END IF;

    -- 2. Create sale header (total = 0 temporary)
    INSERT INTO sales (user_id, total_cents)
    VALUES (p_user_id, 0)
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
        FOR UPDATE;  -- Exclusive lock here!

        -- 5. Verify existence
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not exist', v_product_id;
        END IF;

        -- 6. Verify stock
        IF v_current_stock < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for "%" (available: %, requested: %)',
                v_product_name, v_current_stock, v_quantity;
        END IF;

        -- 7. Calculate subtotal with DATABASE PRICE (not from client)
        v_subtotal_cents := v_quantity * v_unit_price_cents;

        -- 8. Decrease stock
        UPDATE products
        SET stock = stock - v_quantity
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

    -- 12. Return full ticket (avoids extra round-trip)
    RETURN jsonb_build_object(
        'sale_id', v_sale_id,
        'total_cents', v_total_cents,
        'items', v_ticket_items,
        'created_at', NOW()
    );
END;
$$;