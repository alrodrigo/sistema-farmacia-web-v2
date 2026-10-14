import { supabase } from "@/lib/supabase";

export async function getSuppliers() {
    const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export interface SupplierPayload {
    name: string;
    contactPhone?: string | null;
    contactName?: string | null;
    nit?: string | null;
    isActive?: boolean | null;
}

export async function createSupplier(input: string | SupplierPayload, fallbackPhone?: string) {
    const payload = typeof input === 'string'
        ? { name: input, contact_phone: fallbackPhone || null }
        : {
            name: input.name,
            contact_phone: input.contactPhone || null,
            contact_name: input.contactName || null,
            nit: input.nit || null,
            is_active: input.isActive ?? true,
        };

    const { data, error } = await supabase
        .from('suppliers')
        .insert([payload])
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateSupplier(id: string, input: string | SupplierPayload, fallbackPhone?: string) {
    const payload = typeof input === 'string'
        ? { name: input, contact_phone: fallbackPhone || null }
        : {
            name: input.name,
            contact_phone: input.contactPhone || null,
            contact_name: input.contactName || null,
            nit: input.nit || null,
            is_active: input.isActive ?? true,
        };

    const { data, error } = await supabase
        .from('suppliers')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteSupplier(id: string) {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;
}