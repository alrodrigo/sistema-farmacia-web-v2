import { supabase } from '@/lib/supabase';
import type { StoreSettings, UpdateStoreSettingsDto } from '../types/settings.types';

export async function fetchStoreSettings(): Promise<StoreSettings | null> {
    const { data, error } = await supabase
        .from('store_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error al obtener la configuración de la farmacia:', error);
        throw error;
    }

    return data as StoreSettings | null;
}

export async function updateStoreSettings(
    id: string,
    updates: UpdateStoreSettingsDto
): Promise<StoreSettings> {
    const { data, error } = await supabase
        .from('store_settings')
        .update({
            ...updates,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error al actualizar la configuración de la farmacia:', error);
        throw error;
    }

    return data as StoreSettings;
}
