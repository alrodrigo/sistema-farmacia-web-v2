import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 1000 * 60 * 60 * 24, //24 horas: tiempo que vive la cache en IndexedDb
            staleTime: Infinity, //Infinito: mientras la app este abierta, lee de la ram.
            retry: 1, //si no hay internet, falla rapido. No queremos que reintente infinitamente
            refetchOnWindowFocus: false, //evita peticiones a supabase cada vez que cambias de pestania

        },
    },
});

//2. Adaptador asincrono para indexEDDB 
const idbValidStorage = {
    getItem: async (key: string) => {
        const val = await get(key);
        return val === undefined ? null : val;
    },
    setItem: async (key: string, value: string) => {
        await set(key, value);
    },
    removeItem: async (key: string) => {
        await del(key);
    },
};

//3. Exportamos el persister
export const asyncPersister = createAsyncStoragePersister({
    storage: idbValidStorage,
});