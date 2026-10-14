-- ==============================================================================
-- MIGRACIÓN 010: DEPURACIÓN DE COLUMNAS OBSOLETAS Y CÓDIGO MUERTO
-- Eliminamos columnas descartadas de products:
-- - box_price_cents (descartado por simplificación financiera)
-- - box_priority (descartado)
-- - priority_flag (reemplazado por is_priority BOOLEAN)
-- - fefo_alert (reemplazado por cálculo dinámico de caducidad en tiempo real)
-- ==============================================================================

-- 1. Eliminar índices asociados
DROP INDEX IF EXISTS idx_products_fefo;
DROP INDEX IF EXISTS idx_products_priority;

-- 2. Eliminar columnas obsoletas
ALTER TABLE products
DROP COLUMN IF EXISTS box_price_cents,
DROP COLUMN IF EXISTS box_priority,
DROP COLUMN IF EXISTS priority_flag,
DROP COLUMN IF EXISTS fefo_alert;

-- 3. Crear índice limpio para productos prioritarios / favoritos
CREATE INDEX IF NOT EXISTS idx_products_is_priority ON products (is_priority) WHERE is_priority = true;
