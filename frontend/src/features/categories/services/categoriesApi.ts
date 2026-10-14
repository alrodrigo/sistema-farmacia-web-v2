import { supabase } from '@/lib/supabase';

export async function getCategories() {
    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });

    if (error) throw error;
    return data;
}

export interface CategoryPayload {
    name: string;
    icon?: string | null;
    description?: string | null;
}

export async function createCategory(input: string | CategoryPayload) {
    const payload = typeof input === 'string'
        ? { name: input }
        : {
            name: input.name,
            icon: input.icon || 'medication',
            description: input.description || null,
        };

    const { data, error } = await supabase
        .from('categories')
        .insert([payload])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateCategory(id: string, input: string | CategoryPayload) {
    const payload = typeof input === 'string'
        ? { name: input }
        : {
            name: input.name,
            icon: input.icon || 'medication',
            description: input.description || null,
        };

    const { data, error } = await supabase
        .from('categories')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}
export async function deleteCategory(id: string) {
    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

    if (error) throw error;
}