-- ==============================================================================
-- MIGRACIÓN: AGREGAR PRECIO POR CAJA A PRODUCTOS
-- Solicitado para consulta y referencia de venta en mostrador (POS) e inventario
-- ==============================================================================

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS box_price_cents INTEGER DEFAULT 0 CHECK (box_price_cents >= 0);

COMMENT ON COLUMN products.box_price_cents IS 'Precio referencial de venta por caja completa en centavos (ej. 35.00 Bs = 3500)';
