-- ==============================================================================
-- MIGRACIÓN 008: SEED DE CATEGORÍAS Y PROVEEDORES FARMACÉUTICOS INICIALES
-- Inserta las categorías farmacológicas clínicas y proveedores estándar
-- ==============================================================================

INSERT INTO categories (name) VALUES
    ('Antibióticos'),
    ('Analgésicos / Antipiréticos'),
    ('Cardiología / Antihipertensivos'),
    ('Gastrointestinal'),
    ('Dermatología'),
    ('Material Médico / Curaciones'),
    ('Antidiabético / Endocrinología'),
    ('Respiratorio / Antigripales'),
    ('Vitaminas & Suplementos'),
    ('Venta Libre (OTC)')
ON CONFLICT (name) DO NOTHING;

INSERT INTO suppliers (name, contact_phone) VALUES
    ('Laboratorios Roche', '+591 2 2791000'),
    ('Bayer Farma', '+591 2 2442000'),
    ('Pfizer Meds', '+591 2 2113000'),
    ('Genfar S.A.', '+591 2 2334000'),
    ('Genéricos del Sur', '+591 3 3445000'),
    ('Laboratorios Chile / Bagó', '+591 2 2226000'),
    ('Droguería Inti S.A.', '+591 2 2125000')
ON CONFLICT (name) DO NOTHING;
