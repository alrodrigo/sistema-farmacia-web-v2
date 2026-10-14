-- ==============================================================================
-- MIGRACIÓN 001: ESQUEMA BASE DEL ERP/POS FARMACÉUTICO
-- Todo el dinero se maneja en CENTAVOS (integer) para evitar errores de coma flotante.
-- ==============================================================================

-- 1. EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- Para generar IDs únicos
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- Para encriptación futura si se requiere

-- ==============================================================================
-- 1.5. SEGURIDAD Y CONTROL DE ACCESO (PBAC)
-- Conectado a la tabla oculta auth.users de Supabase
-- ==============================================================================

-- Tabla de Roles (ej. 'Administrador', 'Cajero')
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT
);

-- Tabla de Permisos (ej. 'cobrar_ventas', 'editar_productos')
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE
);

-- Relación: Qué permisos tiene cada rol (Muchos a Muchos)
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Tabla Perfil de Usuario (Espejo de auth.users)
CREATE TABLE user_profiles (
    -- El ID debe ser exactamente el mismo ID de Supabase Auth
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, 
    role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
    full_name VARCHAR(150) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLAS DE CATÁLOGO E INVENTARIO
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL UNIQUE,
    contact_phone VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    sku VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0), -- 15.40 Bs = 1540
    cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    stock INTEGER NOT NULL DEFAULT 0,
    -- Búsqueda ultra rápida de Postgres:
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('spanish', name || ' ' || COALESCE(sku, '') || ' ' || COALESCE(description, ''))
    ) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ÍNDICES DE RENDIMIENTO (La clave para <50ms)
CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_category ON products(category_id);

-- 4. TABLAS TRANSACCIONALES (VENTAS)
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id), -- Quien registró la venta (referencia a auth.users de Supabase)
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sale_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0)
);

CREATE INDEX idx_sale_details_sale_id ON sale_details(sale_id);

-- 5. TABLA SIAT (FACTURACIÓN GUBERNAMENTAL) - Aislada de las ventas internas
CREATE TABLE fiscal_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    idempotency_key UUID NOT NULL DEFAULT uuid_generate_v4(), -- Evita doble facturación
    cliente_nit VARCHAR(50),
    cliente_razon_social VARCHAR(150),
    cuf VARCHAR(100),                            -- Código Único SIAT
    xml_firmado TEXT,                            -- El Payload XML
    qr_code TEXT,                                -- URL o Data del QR
    estado_siat VARCHAR(30) NOT NULL DEFAULT 'pendiente', -- pendiente|enviado|autorizado|rechazado|contingencia
    respuesta_siat JSONB,                        -- Log de lo que diga el gobierno
    intentos INTEGER NOT NULL DEFAULT 0,
    ultimo_intento TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(sale_id, idempotency_key)             -- Restricción estricta de duplicidad
);