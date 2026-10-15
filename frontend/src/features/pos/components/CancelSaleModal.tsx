import React, { useState, useEffect } from 'react';
import type { RecentSaleItem } from '../services/sales';

interface CancelSaleModalProps {
    isOpen: boolean;
    sale: RecentSaleItem | null;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
    isCancelling: boolean;
}

const PRESET_REASONS = [
    { label: 'Devolución de cliente', icon: 'undo' },
    { label: 'Error de digitación o cobro', icon: 'keyboard' },
    { label: 'Cambio de método de pago', icon: 'payments' },
    { label: 'Producto defectuoso / dañado', icon: 'broken_image' },
    { label: 'Cancelación solicitada por cliente', icon: 'person_cancel' },
];

export const CancelSaleModal: React.FC<CancelSaleModalProps> = ({
    isOpen,
    sale,
    onClose,
    onConfirm,
    isCancelling,
}) => {
    const [reason, setReason] = useState('Devolución de cliente');
    const [customNote, setCustomNote] = useState('');

    useEffect(() => {
        if (isOpen) {
            setReason('Devolución de cliente');
            setCustomNote('');
        }
    }, [isOpen]);

    if (!isOpen || !sale) return null;

    const handleSelectPreset = (preset: string) => {
        setReason(preset);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const finalReason = customNote.trim()
            ? `${reason}: ${customNote.trim()}`
            : reason.trim();
        await onConfirm(finalReason);
    };

    const getPaymentBadge = (method: 'cash' | 'card' | 'qr') => {
        switch (method) {
            case 'card':
                return {
                    label: 'Tarjeta',
                    color: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-700',
                };
            case 'qr':
                return {
                    label: 'QR',
                    color: 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-700',
                };
            default:
                return {
                    label: 'Efectivo',
                    color: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700',
                };
        }
    };

    const badge = getPaymentBadge(sale.payment_method);

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
                {/* Cabecera de Alerta */}
                <div className="p-5 border-b border-red-100 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/30 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 flex items-center justify-center shrink-0 border border-red-200 dark:border-red-800 shadow-xs">
                            <span className="material-symbols-outlined text-[26px]">remove_shopping_cart</span>
                        </div>
                        <div>
                            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight">
                                Anular Venta y Restaurar Stock
                            </h3>
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
                                Ticket #{sale.id.slice(0, 8)} • Emitido {new Date(sale.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isCancelling}
                        className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
                        title="Cerrar ventana"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
                    {/* Tarjeta Resumen de la Venta a Anular */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between shadow-xs">
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                                Total a Devolver
                            </span>
                            <span className="font-mono text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                                Bs {(sale.total_cents / 100).toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-300 truncate mt-1">
                                Cliente: <strong className="text-slate-900 dark:text-white font-bold">{sale.client_name || 'Sin Nombre'}</strong>
                            </span>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${badge.color}`}>
                                {badge.label}
                            </span>
                            {sale.details && sale.details.length > 0 && (
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 font-mono">
                                    {sale.details.reduce((acc, d) => acc + d.quantity, 0)} unidades
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Selector de Motivos Rápidos */}
                    <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 mb-2">
                            Selecciona el motivo de anulación:
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {PRESET_REASONS.map((p) => {
                                const isSelected = reason === p.label;
                                return (
                                    <button
                                        key={p.label}
                                        type="button"
                                        onClick={() => handleSelectPreset(p.label)}
                                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                                            isSelected
                                                ? 'bg-slate-900 text-white border-slate-900 dark:bg-primary dark:text-white dark:border-primary shadow-xs ring-2 ring-primary/30'
                                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[17px]">{p.icon}</span>
                                        <span>{p.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Justificación o Nota Adicional */}
                    <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-slate-100 mb-1.5">
                            Detalle o justificación para auditoría (opcional):
                        </label>
                        <textarea
                            rows={2}
                            value={customNote}
                            onChange={(e) => setCustomNote(e.target.value)}
                            placeholder="Ej. El cliente devolvió el jarabe sellado porque el médico le cambió la receta..."
                            className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                        />
                    </div>

                    {/* Aviso de Impacto Operativo (Alto Contraste y Legibilidad) */}
                    <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-[20px] text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
                            warning
                        </span>
                        <div className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed font-medium">
                            <strong className="font-extrabold text-amber-900 dark:text-amber-100">Impacto en el sistema:</strong> Los medicamentos se restituirán de inmediato al stock del lote correspondiente y el importe se descontará del arqueo del turno de caja activo.
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isCancelling}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            Conservar Venta
                        </button>
                        <button
                            type="submit"
                            disabled={isCancelling}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-lg shadow-red-600/30 transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                        >
                            {isCancelling ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-[17px]">
                                        progress_activity
                                    </span>
                                    <span>Anulando...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[17px]">
                                        remove_shopping_cart
                                    </span>
                                    <span>Confirmar Anulación</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
