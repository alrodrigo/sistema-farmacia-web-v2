import { supabase } from '@/lib/supabase';

export interface CashierCloseData {
    userId: string;
    cashierName: string;
    date: string;
    totalSalesCents: number;
    totalTickets: number;
    cashSalesCents: number;
    cashTickets: number;
    cardSalesCents: number;
    cardTickets: number;
    qrSalesCents: number;
    qrTickets: number;
    cancelledSalesCents: number;
    cancelledTickets: number;
    firstSaleAt: string | null;
    lastSaleAt: string | null;
    sales: Array<{
        id: string;
        total_cents: number;
        created_at: string;
        payment_method: 'cash' | 'card' | 'qr';
        status: 'completed' | 'cancelled';
    }>;
}

function parseLocalDateRange(from: string, to: string) {
    const [fy, fm, fd] = from.split('-').map(Number);
    const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);

    const [ty, tm, td] = to.split('-').map(Number);
    const end = new Date(ty, tm - 1, td, 23, 59, 59, 999);

    return {
        startIso: start.toISOString(),
        endIso: end.toISOString(),
    };
}

function getTodayLocalDate(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Obtiene el resumen de ventas del día para un cajero específico con desglose por método de pago
 */
export async function getCashierDailyClose(userId: string, dateStr?: string): Promise<CashierCloseData> {
    const targetDate = dateStr || getTodayLocalDate();
    const { startIso, endIso } = parseLocalDateRange(targetDate, targetDate);

    // 1. Obtener nombre del cajero
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('id', userId)
        .single();

    const cashierName = profile?.full_name || 'Cajero de Turno';

    // 2. Obtener ventas del día del usuario
    const { data: sales, error } = await supabase
        .from('sales')
        .select('id, total_cents, created_at, payment_method, status')
        .eq('user_id', userId)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: true });

    if (error) throw error;

    const salesList = (sales || []).map((s: any) => ({
        id: s.id,
        total_cents: s.total_cents,
        created_at: s.created_at,
        payment_method: (s.payment_method || 'cash') as 'cash' | 'card' | 'qr',
        status: (s.status || 'completed') as 'completed' | 'cancelled',
    }));

    // Separar completadas y anuladas
    const completedSales = salesList.filter((s) => s.status !== 'cancelled');
    const cancelledSales = salesList.filter((s) => s.status === 'cancelled');

    const totalSalesCents = completedSales.reduce((sum, s) => sum + s.total_cents, 0);
    const totalTickets = completedSales.length;

    // Desglose por método de pago
    let cashSalesCents = 0;
    let cashTickets = 0;
    let cardSalesCents = 0;
    let cardTickets = 0;
    let qrSalesCents = 0;
    let qrTickets = 0;

    completedSales.forEach((s) => {
        if (s.payment_method === 'card') {
            cardSalesCents += s.total_cents;
            cardTickets += 1;
        } else if (s.payment_method === 'qr') {
            qrSalesCents += s.total_cents;
            qrTickets += 1;
        } else {
            cashSalesCents += s.total_cents;
            cashTickets += 1;
        }
    });

    const cancelledSalesCents = cancelledSales.reduce((sum, s) => sum + s.total_cents, 0);
    const cancelledTickets = cancelledSales.length;

    const firstSaleAt = completedSales.length > 0 ? completedSales[0].created_at : null;
    const lastSaleAt = completedSales.length > 0 ? completedSales[completedSales.length - 1].created_at : null;

    return {
        userId,
        cashierName,
        date: targetDate,
        totalSalesCents,
        totalTickets,
        cashSalesCents,
        cashTickets,
        cardSalesCents,
        cardTickets,
        qrSalesCents,
        qrTickets,
        cancelledSalesCents,
        cancelledTickets,
        firstSaleAt,
        lastSaleAt,
        sales: salesList,
    };
}

/**
 * Obtiene el cierre consolidado de todos los cajeros en un rango de fechas con métodos de pago
 */
export async function getConsolidatedCashClose(from: string, to: string, filterUserId?: string) {
    const { startIso, endIso } = parseLocalDateRange(from, to);

    let query = supabase
        .from('sales')
        .select(`
            id,
            total_cents,
            discount_cents,
            client_name,
            client_nit,
            created_at,
            user_id,
            payment_method,
            status,
            user_profiles!sales_user_id_fkey (full_name)
        `)
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: false });

    if (filterUserId && filterUserId !== 'ALL') {
        query = query.eq('user_id', filterUserId);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error en getConsolidatedCashClose:', error);
        throw error;
    }

    return (data || []).map((s: any) => ({
        ...s,
        payment_method: (s.payment_method || 'cash') as 'cash' | 'card' | 'qr',
        status: (s.status || 'completed') as 'completed' | 'cancelled',
    }));
}
