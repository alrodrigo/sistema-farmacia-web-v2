-- ==============================================================================
-- MIGRACIÓN: AGREGAR COLUMNA DESCRIPTION A CATEGORIES Y NORMALIZAR ICONOS
-- Resuelve: "Could not find the 'description' column of 'categories' in the schema cache"
-- y normaliza los iconos heredados de FontAwesome hacia Google Material Symbols
-- ==============================================================================

-- 1. Agregar columna description si no existe
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN categories.description IS 'Descripción terapéutica o comercial de la categoría de productos';

-- 2. Normalizar iconos heredados de FontAwesome hacia Material Symbols
UPDATE categories SET icon = 'child_care' WHERE icon ILIKE '%baby%' OR icon ILIKE '%child%';
UPDATE categories SET icon = 'science' WHERE icon ILIKE '%eye-dropper%' OR icon ILIKE '%dropper%' OR icon ILIKE '%flask%';
UPDATE categories SET icon = 'medication' WHERE icon ILIKE '%pill%' OR icon ILIKE '%capsule%' OR icon ILIKE '%med%';
UPDATE categories SET icon = 'vaccines' WHERE icon ILIKE '%syringe%' OR icon ILIKE '%needle%';
UPDATE categories SET icon = 'health_and_safety' WHERE icon ILIKE '%shield%' OR icon ILIKE '%care%' OR icon ILIKE '%protect%';
UPDATE categories SET icon = 'cardiology' WHERE icon ILIKE '%heart%';
UPDATE categories SET icon = 'sanitizer' WHERE icon ILIKE '%bandage%' OR icon ILIKE '%aid%' OR icon ILIKE '%clean%';
UPDATE categories SET icon = 'nutrition' WHERE icon ILIKE '%apple%' OR icon ILIKE '%vitamin%';
UPDATE categories SET icon = 'spa' WHERE icon ILIKE '%soap%' OR icon ILIKE '%skin%';
UPDATE categories SET icon = 'local_cafe' WHERE icon ILIKE '%drink%' OR icon ILIKE '%beverage%' OR icon ILIKE '%bebida%';
UPDATE categories SET icon = 'favorite' WHERE icon ILIKE '%preservativo%' OR icon ILIKE '%condom%';
UPDATE categories SET icon = 'biotech' WHERE icon ILIKE '%laboratorio%' OR icon ILIKE '%lab%';
UPDATE categories SET icon = 'category' WHERE icon LIKE 'fa-%' OR icon LIKE '#%' OR icon IS NULL;
