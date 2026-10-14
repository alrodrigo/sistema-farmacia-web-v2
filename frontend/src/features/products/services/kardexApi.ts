import { supabase } from '@/lib/supabase';

export interface KardexMovement {
    id: string;
    product_id: string;
    batch_id: string | null;
    user_id: string | null;
    movement_type: 'IN' | 'OUT' | 'ADJUSTMENT';
    quantity: number;
    reference_id: string | null;
    reason: string | null;
    created_at: string;
    user_profiles?: { full_name: string } | null;
    product_batches?: { lot_number: string; expiration_date: string | null } | null;
}

export async function getProductKardex(productId: string): Promise<KardexMovement[]> {
    const { data, error } = await supabase
        .from('inventory_movements')
        .select(`
            id,
            product_id,
            batch_id,
            user_id,
            movement_type,
            quantity,
            reference_id,
            reason,
            created_at,
            user_profiles (full_name),
            product_batches (lot_number, expiration_date)
        `)
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as unknown as KardexMovement[];
}

export async function addInventoryMovement(params: {
    product_id: string;
    movement_type: 'IN' | 'OUT' | 'ADJUSTMENT';
    quantity: number;
    reason: string;
    batch_id?: string | null;
    user_id?: string | null;
    reference_id?: string | null;
}) {
    const { data, error } = await supabase
        .from('inventory_movements')
        .insert([{
            product_id: params.product_id,
            movement_type: params.movement_type,
            quantity: params.quantity,
            reason: params.reason,
            batch_id: params.batch_id || null,
            user_id: params.user_id || null,
            reference_id: params.reference_id || null,
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
}
