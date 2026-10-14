import { supabase } from '@/lib/supabase';
import { useCartStore } from '@/stores/cartStore';
import { get, set } from 'idb-keyval';
import type { CartItem } from '@/stores/cartStore';

const PENDING_KEY = 'pending-sales';

type PendingSale = {
    id: string;
    user_id: string;
    items: CartItem[];
    payment_method: 'cash' | 'card' | 'qr';
    client_name?: string;
    client_nit?: string;
    received_amount_cents?: number;
    change_amount_cents?: number;
    cash_shift_id?: string | null;
    created_at: number;
};

export interface CheckoutOptions {
    cashShiftId?: string | null;
    clientName?: string;
    clientNit?: string;
    receivedAmountCents?: number;
    changeAmountCents?: number;
    discountCents?: number;
    discountType?: 'percentage' | 'amount' | 'none';
    discountPercent?: number;
    discountReason?: string;
}

export interface RecentSaleItem {
    id: string;
    user_id: string;
    total_cents: number;
    discount_cents?: number;
    discount_type?: string;
    discount_percent?: number;
    discount_reason?: string;
    payment_method: 'cash' | 'card' | 'qr';
    status: 'completed' | 'cancelled';
    created_at: string;
    cancelled_at?: string | null;
    cancellation_reason?: string | null;
    cashier_name?: string;
    items_count?: number;
    client_name?: string;
    client_nit?: string;
    details?: Array<{
        product_name: string;
        quantity: number;
        subtotal_cents: number;
    }>;
}

// ---------- Helpers IndexedDB ----------
async function getPending(): Promise<PendingSale[]> {
    return (await get(PENDING_KEY)) ?? [];
}

async function savePending(list: PendingSale[]) {
    await set(PENDING_KEY, list);
}

async function addPending(sale: PendingSale) {
    const list = await getPending();
    await savePending([...list, sale]);
}

async function removePending(id: string) {
    const list = await getPending();
    await savePending(list.filter((s) => s.id !== id));
}

// ---------- Checkout principal ----------
export async function checkout(
    userId: string,
    paymentMethod: 'cash' | 'card' | 'qr' = 'cash',
    options?: CheckoutOptions
): Promise<{ success: boolean; ticket?: any; error?: string }> {
    const items = useCartStore.getState().items;
    if (items.length === 0) return { success: false, error: 'Carrito vacío' };

    const payload = {
        p_user_id: userId,
        p_items: items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
        })),
        p_payment_method: paymentMethod,
        p_cash_shift_id: options?.cashShiftId || null,
        p_client_name: options?.clientName?.trim() || 'Sin Nombre',
        p_client_nit: options?.clientNit?.trim() || '0',
        p_received_amount_cents: options?.receivedAmountCents || 0,
        p_change_amount_cents: options?.changeAmountCents || 0,
        p_discount_cents: options?.discountCents || 0,
        p_discount_type: options?.discountType || 'none',
        p_discount_percent: options?.discountPercent || 0,
        p_discount_reason: options?.discountReason || '',
    };

    try {
        const { data, error } = await supabase.rpc('create_sale', payload);

        if (error) throw error;

        return { success: true, ticket: data };
    } catch (err: any) {
        // Solo encolar si es error de RED (offline)
        const isNetworkError =
            err?.message?.includes('fetch') ||
            err?.code === 'PGRST301' ||
            err?.name === 'TypeError';

        if (isNetworkError) {
            const pending: PendingSale = {
                id: crypto.randomUUID(),
                user_id: userId,
                items,
                payment_method: paymentMethod,
                client_name: options?.clientName?.trim() || 'Sin Nombre',
                client_nit: options?.clientNit?.trim() || '0',
                received_amount_cents: options?.receivedAmountCents || 0,
                change_amount_cents: options?.changeAmountCents || 0,
                cash_shift_id: options?.cashShiftId || null,
                created_at: Date.now(),
            };
            await addPending(pending);
            return { success: false, error: 'Offline: venta encolada en memoria local' };
        }
        return { success: false, error: err?.message ?? 'Error desconocido' };
    }
}

// ---------- Anular Venta (Cancel Sale RPC) ----------
export async function cancelSale(
    saleId: string,
    userId: string,
    reason: string = 'Anulación solicitada por el cajero'
): Promise<{ success: boolean; error?: string }> {
    try {
        const { data, error } = await supabase.rpc('cancel_sale', {
            p_sale_id: saleId,
            p_user_id: userId,
            p_reason: reason,
        });

        if (error) throw error;

        return { success: true, ...data };
    } catch (err: any) {
        console.error('Error al anular venta:', err);
        return { success: false, error: err?.message || 'Error al anular la venta' };
    }
}

// ---------- Obtener Historial Reciente de Ventas ----------
export async function getRecentSales(options?: {
    limit?: number;
    userId?: string;
}): Promise<RecentSaleItem[]> {
    const limit = options?.limit || 40;

    let query = supabase
        .from('sales')
        .select(`
            id,
            user_id,
            total_cents,
            discount_cents,
            discount_percent,
            discount_type,
            discount_reason,
            payment_method,
            status,
            created_at,
            cancelled_at,
            cancellation_reason,
            client_name,
            client_nit,
            user_profiles!sales_user_id_fkey (full_name),
            sale_details (
                quantity,
                unit_price_cents,
                subtotal_cents,
                products (name)
            )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (options?.userId && options.userId !== 'ALL') {
        query = query.eq('user_id', options.userId);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error al consultar historial de ventas:', error);
        return [];
    }

    return (data || []).map((s: any) => {
        const details = (s.sale_details || []).map((d: any) => ({
            product_name: d.products?.name || 'Medicamento',
            quantity: d.quantity,
            subtotal_cents: d.subtotal_cents,
        }));

        const totalItemsCount = details.reduce((sum: number, d: any) => sum + d.quantity, 0);

        return {
            id: s.id,
            user_id: s.user_id,
            total_cents: s.total_cents,
            discount_cents: s.discount_cents || 0,
            discount_percent: Number(s.discount_percent || 0),
            discount_type: s.discount_type || 'none',
            discount_reason: s.discount_reason || '',
            payment_method: (s.payment_method || 'cash') as 'cash' | 'card' | 'qr',
            status: (s.status || 'completed') as 'completed' | 'cancelled',
            created_at: s.created_at,
            cancelled_at: s.cancelled_at,
            cancellation_reason: s.cancellation_reason,
            client_name: s.client_name || 'Sin Nombre',
            client_nit: s.client_nit || '0',
            cashier_name: s.user_profiles?.full_name || 'Cajero',
            items_count: totalItemsCount,
            details,
        };
    });
}

// ---------- Flush cola al volver online ----------
export async function flushPendingSales() {
    const pending = await getPending();
    if (pending.length === 0) return;

    for (const sale of pending) {
        const payload = {
            p_user_id: sale.user_id,
            p_items: sale.items.map((i) => ({
                product_id: i.product_id,
                quantity: i.quantity,
            })),
            p_payment_method: sale.payment_method || 'cash',
            p_cash_shift_id: sale.cash_shift_id || null,
            p_client_name: sale.client_name || 'Sin Nombre',
            p_client_nit: sale.client_nit || '0',
            p_received_amount_cents: sale.received_amount_cents || 0,
            p_change_amount_cents: sale.change_amount_cents || 0,
        };

        const { error } = await supabase.rpc('create_sale', payload);
        if (!error) {
            await removePending(sale.id);
        } else {
            console.warn('Pending sale failed:', sale.id, error.message);
        }
    }
}

// ---------- Listener de reconexión ----------
let isOnline = navigator.onLine;
let flushCallback: (() => Promise<void>) | null = null;

export function registerOnlineListener(cb: () => Promise<void>) {
    flushCallback = cb;
}

window.addEventListener('online', async () => {
    if (!isOnline && flushCallback) {
        isOnline = true;
        await flushCallback();
    }
});
window.addEventListener('offline', () => {
    isOnline = false;
});