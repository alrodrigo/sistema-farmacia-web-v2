import { describe, it, expect } from 'vitest';

// Funciones puras que reflejan la lógica exacta del POS
export function calculateDiscountCents(
    subtotalCents: number,
    discountType: 'none' | 'percentage' | 'amount',
    discountValue: string
): number {
    const val = parseFloat(discountValue) || 0;
    if (val <= 0 || discountType === 'none') return 0;

    if (discountType === 'percentage') {
        const pct = Math.min(100, Math.max(0, val));
        return Math.round((subtotalCents * pct) / 100);
    }

    if (discountType === 'amount') {
        const amountCents = Math.round(val * 100);
        return Math.min(subtotalCents, amountCents);
    }

    return 0;
}

export function calculateChangeCents(
    receivedAmountCents: number,
    finalTotalCents: number,
    paymentMethod: 'cash' | 'card' | 'qr'
): number {
    if (paymentMethod !== 'cash' || receivedAmountCents <= 0) return 0;
    return Math.max(0, receivedAmountCents - finalTotalCents);
}

export function checkExpirationStatus(
    expirationDateStr: string | null | undefined,
    currentDate: Date = new Date()
): 'expired' | 'expiring_soon' | 'valid' {
    if (!expirationDateStr) return 'valid';
    const exp = new Date(expirationDateStr);
    const today = new Date(currentDate);
    today.setHours(0, 0, 0, 0);

    if (exp < today) return 'expired';

    const threshold30Days = new Date(today.getTime() + 30 * 864e5);
    if (exp <= threshold30Days) return 'expiring_soon';

    return 'valid';
}

describe('POS: Cálculos Financieros y Descuentos', () => {
    it('debe calcular subtotal exacto en centavos sin perder precisión', () => {
        const items = [
            { price_cents: 1250, quantity: 2 }, // Bs 12.50 x 2 = Bs 25.00
            { price_cents: 330, quantity: 3 },  // Bs 3.30 x 3 = Bs 9.90
        ];
        const subtotal = items.reduce((acc, i) => acc + i.price_cents * i.quantity, 0);
        expect(subtotal).toBe(3490); // Bs 34.90
        expect((subtotal / 100).toFixed(2)).toBe('34.90');
    });

    it('debe aplicar descuento por porcentaje correctamente', () => {
        const subtotalCents = 10000; // Bs 100.00
        const discountCents = calculateDiscountCents(subtotalCents, 'percentage', '15'); // 15%
        expect(discountCents).toBe(1500); // Bs 15.00
        expect(subtotalCents - discountCents).toBe(8500); // Bs 85.00
    });

    it('no debe permitir un porcentaje de descuento mayor al 100%', () => {
        const subtotalCents = 5000; // Bs 50.00
        const discountCents = calculateDiscountCents(subtotalCents, 'percentage', '150');
        expect(discountCents).toBe(5000); // Tope de Bs 50.00
    });

    it('debe aplicar descuento por monto fijo sin exceder el subtotal', () => {
        const subtotalCents = 5000; // Bs 50.00
        const discountCents = calculateDiscountCents(subtotalCents, 'amount', '20.50');
        expect(discountCents).toBe(2050); // Bs 20.50

        // Si el descuento ingresado es mayor al subtotal, el tope es el subtotal
        const overDiscount = calculateDiscountCents(subtotalCents, 'amount', '80.00');
        expect(overDiscount).toBe(5000); // No puede dar total negativo
    });
});

describe('POS: Cálculo de Cambio / Vuelto en Efectivo', () => {
    it('debe calcular el cambio correcto cuando el cliente paga con un billete mayor', () => {
        const totalCents = 4350; // Bs 43.50
        const receivedCents = 5000; // Bs 50.00
        const change = calculateChangeCents(receivedCents, totalCents, 'cash');
        expect(change).toBe(650); // Bs 6.50
        expect((change / 100).toFixed(2)).toBe('6.50');
    });

    it('debe devolver 0 de cambio si el pago es con tarjeta o QR', () => {
        const totalCents = 4350;
        const changeCard = calculateChangeCents(5000, totalCents, 'card');
        const changeQr = calculateChangeCents(5000, totalCents, 'qr');
        expect(changeCard).toBe(0);
        expect(changeQr).toBe(0);
    });

    it('debe devolver 0 de cambio si el monto recibido es menor al total', () => {
        const totalCents = 5000;
        const receivedCents = 4000; // Paga menos
        const change = calculateChangeCents(receivedCents, totalCents, 'cash');
        expect(change).toBe(0);
    });
});

describe('POS: Detección y Reglas FEFO de Caducidad', () => {
    const today = new Date('2026-10-15T00:00:00Z');

    it('debe detectar un medicamento vencido en fecha pasada', () => {
        const status = checkExpirationStatus('2026-10-01', today);
        expect(status).toBe('expired');
    });

    it('debe detectar un medicamento próximo a vencer (menos de 30 días)', () => {
        // Vence el 25 de Octubre (a 10 días de hoy 15 de Octubre)
        const status = checkExpirationStatus('2026-10-25', today);
        expect(status).toBe('expiring_soon');
    });

    it('debe clasificar como válido un medicamento con vigencia holgada', () => {
        // Vence en 6 meses (Abril 2027)
        const status = checkExpirationStatus('2027-04-15', today);
        expect(status).toBe('valid');
    });
});
