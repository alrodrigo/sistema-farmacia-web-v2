import { useToastStore, type ToastType } from '@/stores/toastStore';

const TOAST_ICONS: Record<ToastType, string> = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info',
};

const TOAST_STYLES: Record<ToastType, { border: string; bg: string; iconColor: string; titleColor: string }> = {
    success: {
        border: 'border-emerald-500/40',
        bg: 'bg-slate-900/95 text-emerald-100',
        iconColor: 'text-emerald-400',
        titleColor: 'text-emerald-300',
    },
    error: {
        border: 'border-rose-500/40',
        bg: 'bg-slate-900/95 text-rose-100',
        iconColor: 'text-rose-400',
        titleColor: 'text-rose-300',
    },
    warning: {
        border: 'border-amber-500/40',
        bg: 'bg-slate-900/95 text-amber-100',
        iconColor: 'text-amber-400',
        titleColor: 'text-amber-300',
    },
    info: {
        border: 'border-sky-500/40',
        bg: 'bg-slate-900/95 text-sky-100',
        iconColor: 'text-sky-400',
        titleColor: 'text-sky-300',
    },
};

export default function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    if (toasts.length === 0) return null;

    return (
        <div
            className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
            aria-live="polite"
        >
            {toasts.map((t) => {
                const style = TOAST_STYLES[t.type];
                return (
                    <div
                        key={t.id}
                        role="alert"
                        className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-2xl backdrop-blur-xl border ${style.border} ${style.bg} animate-toast transition-all duration-200`}
                    >
                        <span className={`material-symbols-outlined text-2xl shrink-0 ${style.iconColor}`}>
                            {TOAST_ICONS[t.type]}
                        </span>
                        <div className="flex-1 min-w-0 pt-0.5">
                            {t.title && (
                                <h4 className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${style.titleColor}`}>
                                    {t.title}
                                </h4>
                            )}
                            <p className="text-xs text-slate-200 font-medium leading-relaxed break-words">
                                {t.message}
                            </p>
                        </div>
                        <button
                            onClick={() => removeToast(t.id)}
                            className="text-slate-400 hover:text-white transition-colors p-1 -mr-1 -mt-1 rounded-lg hover:bg-white/10 shrink-0"
                            aria-label="Cerrar notificación"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
