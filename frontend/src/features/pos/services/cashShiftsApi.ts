import { supabase } from '@/lib/supabase';

export interface CashShift {
    id: string;
    user_id: string;
    opening_amount_cents: number;
    closing_amount_cents: number | null;
    expected_amount_cents: number | null;
    difference_cents: number | null;
    status: 'open' | 'closed';
    notes: string | null;
    opened_at: string;
    closed_at: string | null;
    user_profiles?: {
        full_name: string;
    };
}

/**
 * Consulta si el cajero tiene un turno de caja abierto actualmente
 */
export async function getActiveCashShift(userId: string): Promise<CashShift | null> {
    const { data, error } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error buscando turno de caja activo:', error);
        return null;
    }

    return data;
}

/**
 * Registra la apertura de caja con el fondo inicial para cambio
 */
export async function openCashShift(
    userId: string,
    openingAmountCents: number,
    notes?: string
): Promise<CashShift> {
    const { data, error } = await supabase
        .from('cash_shifts')
        .insert({
            user_id: userId,
            opening_amount_cents: openingAmountCents,
            status: 'open',
            notes: notes || null,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Registra el cierre de turno con el arqueo físico y calcula la diferencia (sobrante/faltante)
 */
export async function closeCashShift(
    shiftId: string,
    closingAmountCents: number,
    expectedAmountCents: number,
    notes?: string
): Promise<CashShift> {
    const differenceCents = closingAmountCents - expectedAmountCents;

    const { data, error } = await supabase
        .from('cash_shifts')
        .update({
            closing_amount_cents: closingAmountCents,
            expected_amount_cents: expectedAmountCents,
            difference_cents: differenceCents,
            status: 'closed',
            closed_at: new Date().toISOString(),
            notes: notes || null,
        })
        .eq('id', shiftId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Obtiene el historial de turnos y arqueos para auditoría administrativa
 */
export async function getShiftsAudit(from: string, to: string, filterUserId?: string): Promise<CashShift[]> {
    const [fy, fm, fd] = from.split('-').map(Number);
    const startIso = new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString();

    const [ty, tm, td] = to.split('-').map(Number);
    const endIso = new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString();

    let query = supabase
        .from('cash_shifts')
        .select(`
            *,
            user_profiles (full_name)
        `)
        .gte('opened_at', startIso)
        .lte('opened_at', endIso)
        .order('opened_at', { ascending: false });

    if (filterUserId && filterUserId !== 'ALL') {
        query = query.eq('user_id', filterUserId);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error obteniendo auditoría de turnos:', error);
        return [];
    }

    return data || [];
}
