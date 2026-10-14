-- ==============================================================================
-- MIGRACIÓN 007: APERTURA, CIERRE Y ARQUEO DE CAJA CHICA (CASH SHIFTS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS cash_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    opening_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (opening_amount_cents >= 0),
    closing_amount_cents INTEGER,
    expected_amount_cents INTEGER,
    difference_cents INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_user_status ON cash_shifts (user_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_opened_at ON cash_shifts (opened_at);
