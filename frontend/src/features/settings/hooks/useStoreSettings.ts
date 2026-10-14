import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchStoreSettings, updateStoreSettings } from '../services/settingsApi';
import type { UpdateStoreSettingsDto } from '../types/settings.types';

export const STORE_SETTINGS_QUERY_KEY = ['store-settings'];

export function useStoreSettings() {
    return useQuery({
        queryKey: STORE_SETTINGS_QUERY_KEY,
        queryFn: fetchStoreSettings,
        staleTime: 1000 * 60 * 5, // 5 minutos de cache
    });
}

export function useUpdateStoreSettings() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: UpdateStoreSettingsDto }) =>
            updateStoreSettings(id, updates),
        onSuccess: (updated) => {
            queryClient.setQueryData(STORE_SETTINGS_QUERY_KEY, updated);
            queryClient.invalidateQueries({ queryKey: STORE_SETTINGS_QUERY_KEY });
        },
    });
}
