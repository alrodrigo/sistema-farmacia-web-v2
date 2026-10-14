import React from 'react';

interface PageLoaderProps {
    title?: string;
}

export const PageLoader: React.FC<PageLoaderProps> = ({ title = 'Cargando módulo...' }) => {
    return (
        <div className="min-h-[70vh] w-full flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200">
            <div className="relative flex items-center justify-center">
                {/* Glow ambiental */}
                <div className="absolute w-20 h-20 bg-primary/20 rounded-full blur-xl animate-pulse"></div>

                {/* Spinner exterior con gradiente */}
                <div className="w-14 h-14 rounded-full border-3 border-surface-container border-t-primary animate-spin"></div>

                {/* Icono central de farmacia */}
                <div className="absolute flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px] animate-pulse">
                        local_pharmacy
                    </span>
                </div>
            </div>

            <div className="mt-4 flex flex-col items-center gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
                    {title}
                </span>
                <span className="text-[11px] text-secondary font-medium">
                    Optimizando recursos del sistema...
                </span>
            </div>
        </div>
    );
};
