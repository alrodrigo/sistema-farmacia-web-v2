import { describe, it, expect } from 'vitest';

export interface ShiftSummaryData {
    initial_cash_cents: number;
    cash_sales_cents: number;
    cash_inputs_cents: number;
    cash_outputs_cents: number;
    card_sales_cents: number;
    qr_sales_cents: number;
}

export function calculateExpectedCashCents(data: ShiftSummaryData): number {
    return (
        data.initial_cash_cents +
        data.cash_sales_cents +
        data.cash_inputs_cents -
        data.cash_outputs_cents
    );
}

export function calculateCashReconciliation(
    expectedCents: number,
    countedCents: number
): {
    differenceCents: number;
    status: 'balanced' | 'surplus' | 'shortage';
    differenceBs: string;
} {
    const differenceCents = countedCents - expectedCents;
    let status: 'balanced' | 'surplus' | 'shortage' = 'balanced';

    if (differenceCents > 0) status = 'surplus';
    else if (differenceCents < 0) status = 'shortage';

    return {
        differenceCents,
        status,
        differenceBs: (Math.abs(differenceCents) / 100).toFixed(2),
    };
}

describe('Caja: Conciliación y Arqueo de Turno', () => {
    it('debe calcular el monto en efectivo esperado correctamente con ventas y movimientos', () => {
        const shift: ShiftSummaryData = {
            initial_cash_cents: 20000, // Bs 200.00 base inicial
            cash_sales_cents: 85000,   // Bs 850.00 ventas en efectivo
            cash_inputs_cents: 5000,   // Bs 50.00 cambio extra ingresado
            cash_outputs_cents: 10000, // Bs 100.00 pago a mensajero/insumos
            card_sales_cents: 30000,   // Bs 300.00 tarjeta (no va al cajón)
            qr_sales_cents: 15000,     // Bs 150.00 QR (no va al cajón)
        };

        const expected = calculateExpectedCashCents(shift);
        // 200 + 850 + 50 - 100 = 1000 Bs (100000 centavos)
        expect(expected).toBe(100000);
        expect((expected / 100).toFixed(2)).toBe('1000.00');
    });

    it('debe reportar cuadre balanceado cuando el conteo físico coincide exactamente', () => {
        const expected = 100000; // Bs 1000.00
        const counted = 100000;  // Bs 1000.00 contado
        const result = calculateCashReconciliation(expected, counted);

        expect(result.status).toBe('balanced');
        expect(result.differenceCents).toBe(0);
        expect(result.differenceBs).toBe('0.00');
    });

    it('debe reportar faltante de dinero cuando el cajero tiene menos efectivo en mano', () => {
        const expected = 100000; // Bs 1000.00
        const counted = 98000;   // Bs 980.00 (faltan 20 Bs)
        const result = calculateCashReconciliation(expected, counted);

        expect(result.status).toBe('shortage');
        expect(result.differenceCents).toBe(-2000);
        expect(result.differenceBs).toBe('20.00');
    });

    it('debe reportar sobrante de dinero cuando hay más efectivo del esperado', () => {
        const expected = 100000; // Bs 1000.00
        const counted = 101550;  // Bs 1015.50 (sobran 15.50 Bs)
        const result = calculateCashReconciliation(expected, counted);

        expect(result.status).toBe('surplus');
        expect(result.differenceCents).toBe(1550);
        expect(result.differenceBs).toBe('15.50');
    });
});
