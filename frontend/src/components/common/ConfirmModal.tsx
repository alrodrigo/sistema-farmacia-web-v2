import { useEffect } from 'react';
import { useConfirmModalStore } from '@/stores/confirmModalStore';

export default function ConfirmModal() {
    const { isOpen, options, handleConfirm, handleCancel } = useConfirmModalStore();

    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, handleCancel, handleConfirm]);

    if (!isOpen) return null;

    const isDanger = options.type === 'danger';
    const isWarning = options.type === 'warning';

    const iconStyle = isDanger
        ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
        : isWarning
        ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
        : 'bg-primary/15 border-primary/30 text-primary-fixed';

    const confirmBtnStyle = isDanger
        ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 shadow-rose-950/40 text-white'
        : isWarning
        ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 shadow-amber-950/40 text-white'
        : 'bg-gradient-to-r from-primary to-primary-container hover:opacity-95 shadow-primary/30 text-white';

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-modal-backdrop"
            role="dialog"
            aria-modal="true"
        >
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative text-left animate-modal-pop">
                {/* Botón cerrar */}
                <button
                    onClick={handleCancel}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                    aria-label="Cerrar modal"
                >
                    <span className="material-symbols-outlined text-lg">close</span>
                </button>

                {/* Icono temático */}
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-4 ${iconStyle}`}>
                    <span className="material-symbols-outlined text-2xl">
                        {options.icon || (isDanger ? 'delete_forever' : isWarning ? 'warning' : 'info')}
                    </span>
                </div>

                {/* Título y Mensaje */}
                <h3 className="text-lg font-bold text-white tracking-tight mb-2">
                    {options.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6 font-normal">
                    {options.message}
                </p>

                {/* Botones de acción */}
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        {options.cancelText || 'Cancelar'}
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all cursor-pointer active:scale-98 flex items-center gap-1.5 ${confirmBtnStyle}`}
                        autoFocus
                    >
                        <span>{options.confirmText || 'Confirmar'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
