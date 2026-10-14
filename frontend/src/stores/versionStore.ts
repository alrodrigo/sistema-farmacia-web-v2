import { create } from 'zustand';
import { useCartStore } from './cartStore';

interface VersionState {
    hasUpdate: boolean;
    serverVersion: string | null;
    serverBuildTime: number | null;
    isReloading: boolean;
    setHasUpdate: (hasUpdate: boolean, serverVersion?: string, serverBuildTime?: number) => void;
    applyUpdate: () => Promise<void>;
}

export const useVersionStore = create<VersionState>((set) => ({
    hasUpdate: false,
    serverVersion: null,
    serverBuildTime: null,
    isReloading: false,
    setHasUpdate: (hasUpdate, serverVersion, serverBuildTime) =>
        set({
            hasUpdate,
            serverVersion: serverVersion ?? null,
            serverBuildTime: serverBuildTime ?? null,
        }),
    applyUpdate: async () => {
        set({ isReloading: true });
        try {
            // 1. Limpiar caches de Service Worker y CacheStorage
            if (typeof window !== 'undefined' && 'caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
            }
            // 2. Desregistrar Service Workers obsoletos si existen
            if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.update();
                }
            }
        } catch (e) {
            console.warn('Error purgando cache previa:', e);
        } finally {
            // 3. Recarga limpia inmediata sin depender de la memoria del navegador
            window.location.reload();
        }
    },
}));

// Poller periódico inteligente de versión
export function initVersionChecker(intervalMs = 1000 * 60 * 5) { // Cada 5 min
    if (typeof window === 'undefined') return () => {};

    let isChecking = false;

    const checkServerVersion = async () => {
        if (isChecking) return;
        isChecking = true;
        try {
            const currentBuildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : 0;
            // Petición con query param timestamp para eludir 100% cualquier proxy o caché de red
            const res = await fetch(`/version.json?_t=${Date.now()}`, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                },
            });

            if (!res.ok) return;
            const data = await res.json();

            if (data && data.buildTime && data.buildTime > currentBuildTime) {
                console.log(`🚀 [Auto-Update] Nueva versión detectada: Build ${data.buildTime} (Actual: ${currentBuildTime})`);
                useVersionStore.getState().setHasUpdate(true, data.version, data.buildTime);

                // Si el carrito está vacío y no hay venta en curso, actualizar automáticamente de forma suave
                const cartItems = useCartStore.getState().items;
                if (cartItems.length === 0) {
                    console.log('🔄 [Auto-Update] Carrito inactivo. Aplicando actualización sin interrumpir al cajero...');
                    // Pequeña espera de 1.5s antes de recargar
                    setTimeout(() => {
                        useVersionStore.getState().applyUpdate();
                    }, 1500);
                }
            }
        } catch {
            // Silencioso si no hay conexión a internet momentáneamente
        } finally {
            isChecking = false;
        }
    };

    // 1. Chequeo inicial a los 4 segundos del arranque
    const initialTimer = setTimeout(checkServerVersion, 4000);

    // 2. Chequeo periódico cada X minutos
    const intervalTimer = setInterval(checkServerVersion, intervalMs);

    // 3. Chequeo cuando la cajera vuelve a la pestaña (focus)
    const onFocus = () => {
        checkServerVersion();
    };

    // 4. Chequeo cuando vuelve el internet
    const onOnline = () => {
        checkServerVersion();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
        clearTimeout(initialTimer);
        clearInterval(intervalTimer);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onOnline);
    };
}
