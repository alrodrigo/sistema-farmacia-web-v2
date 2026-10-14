-- ==============================================================================
-- MIGRACIÓN 006: RESOLVER AMBIGÜEDAD DE FOREIGN KEYS EN SALES -> USER_PROFILES
-- Elimina la FK secundaria en cancelled_by para que PostgREST pueda resolver
-- 'user_profiles' directamente a través del autor de la venta (user_id).
-- ==============================================================================

ALTER TABLE sales
DROP CONSTRAINT IF EXISTS sales_cancelled_by_fkey;
