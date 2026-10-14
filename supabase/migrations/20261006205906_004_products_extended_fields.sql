-- ==============================================================================
-- MIGRACIÓN 004: CAMPOS EXTENDIDOS PARA PRODUCTOS
-- Basado en datos reales del sistema anterior (ej. FEMTEST CASSETE)
-- ==============================================================================

-- 1. AGREGAR COLUMNAS NUEVAS A PRODUCTS
ALTER TABLE products
ADD COLUMN IF NOT EXISTS box_price_cents INTEGER DEFAULT 0 CHECK (box_price_cents >= 0),  -- Precio por Caja (ej. 16.00 Bs = 1600)
ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 3 CHECK (min_stock >= 0),               -- Stock Mínimo (ej. 3)
ADD COLUMN IF NOT EXISTS fefo_alert BOOLEAN DEFAULT false,                                 -- Alerta FEFO automática
ADD COLUMN IF NOT EXISTS priority_flag VARCHAR(20) DEFAULT 'normal' CHECK (priority_flag IN ('normal', 'high', 'critical')),  -- Prioridad: normal|high|critical
ADD COLUMN IF NOT EXISTS box_priority BOOLEAN DEFAULT false;                               -- Prioridad en caja (forzar venta por caja)

-- 2. ACTUALIZAR search_vector PARA INCLUIR NUEVOS CAMPOS
DROP INDEX IF EXISTS idx_products_search;

ALTER TABLE products
DROP COLUMN IF EXISTS search_vector;

ALTER TABLE products
ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('spanish', 
        name || ' ' || 
        COALESCE(sku, '') || ' ' || 
        COALESCE(description, '')
    )
) STORED;

CREATE INDEX idx_products_search ON products USING GIN(search_vector);

-- 3. ÍNDICES PARA CONSULTAS FRECUENTES
CREATE INDEX IF NOT EXISTS idx_products_min_stock ON products (min_stock) WHERE stock <= min_stock;
CREATE INDEX IF NOT EXISTS idx_products_fefo ON products (expiration_date) WHERE fefo_alert = true;
CREATE INDEX IF NOT EXISTS idx_products_priority ON products (priority_flag) WHERE priority_flag != 'normal';

-- 4. COMENTARIOS DE DOCUMENTACIÓN
COMMENT ON COLUMN products.box_price_cents IS 'Precio por caja completa (ej. 16.00 Bs = 1600 centavos)';
COMMENT ON COLUMN products.min_stock IS 'Stock mínimo para alertas de reposición (ej. 3)';
COMMENT ON COLUMN products.fefo_alert IS 'Activa alerta FEFO (First Expired, First Out) para productos con vencimiento próximo';
COMMENT ON COLUMN products.priority_flag IS 'Prioridad visual: normal (verde) | high (amarillo) | critical (rojo)';
COMMENT ON COLUMN products.box_priority IS 'Forzar venta por caja completa en POS';
COMMENT ON COLUMN products.search_vector IS 'Vector de búsqueda full-text actualizado automáticamente';