-- 003: Agregar fecha de vencimiento a products
-- Seguro, idempotente, sin romper lo existente

-- 1. Columna nullable (no todos los productos tienen vencimiento)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- 2. Índice parcial para consultas rápidas "próximos a vencer"
-- Solo indexa filas donde expiration_date NO es null
CREATE INDEX IF NOT EXISTS idx_products_expiration_date
ON products (expiration_date)
WHERE expiration_date IS NOT NULL;

-- 3. Comentario para documentación en DB
COMMENT ON COLUMN products.expiration_date
IS 'Fecha de caducidad del lote (nullable). Usada para alertas de stock próximo a vencer.';