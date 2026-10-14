import { useVersionStore } from '@/stores/versionStore';

export default function VersionUpdateBanner() {
    const { hasUpdate, isReloading, serverVersion, applyUpdate } = useVersionStore();

    if (!hasUpdate) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[10001] max-w-md w-full animate-toast pointer-events-auto">
            <div className="bg-slate-900/95 border border-primary/50 text-white rounded-2xl p-4 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-4 ring-1 ring-primary/30">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary-fixed border border-primary/30 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-2xl animate-spin">
                            {isReloading ? 'sync' : 'cloud_download'}
                        </span>
                    </div>
                    <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 truncate">
                            <span>Nueva versión del sistema</span>
                            {serverVersion && (
                                <span className="text-[10px] bg-primary/30 text-primary-fixed px-1.5 py-0.2 rounded font-mono">
                                    v{serverVersion}
                                </span>
                            )}
                        </h4>
                        <p className="text-[11px] text-slate-300 font-medium leading-tight mt-0.5 truncate">
                            {isReloading
                                ? 'Actualizando archivos y memoria limpia...'
                                : 'Mejoras listas. Se aplicará al finalizar tu venta.'}
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => applyUpdate()}
                    disabled={isReloading}
                    className="shrink-0 px-3.5 py-2 bg-gradient-to-r from-primary to-primary-container hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                    <span className="material-symbols-outlined text-[16px]">
                        {isReloading ? 'progress_activity' : 'refresh'}
                    </span>
                    <span>{isReloading ? 'Cargando' : 'Actualizar'}</span>
                </button>
            </div>
        </div>
    );
}
