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
                return { label: 'Tarjeta', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' };
            case 'qr':
                return { label: 'QR', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' };
            default:
                return { label: 'Efectivo', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' };
        }
    };

    const badge = getPaymentBadge(sale.payment_method);

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-inverse-surface/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg border border-surface-container overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
                {/* Cabecera de Alerta */}
                <div className="p-5 border-b border-surface-container bg-error-container/20 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-error/10 text-error flex items-center justify-center shrink-0 border border-error/20">
                            <span className="material-symbols-outlined text-[24px]">remove_shopping_cart</span>
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-on-surface leading-tight">
                                Anular Venta y Restaurar Stock
                            </h3>
                            <p className="text-xs text-secondary mt-0.5">
                                Ticket #{sale.id.slice(0, 8)} • Registrado el {new Date(sale.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isCancelling}
                        className="text-secondary hover:text-on-surface p-1.5 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-50 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Tarjeta Resumen de la Venta a Anular */}
                    <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container flex items-center justify-between">
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] uppercase font-bold text-secondary tracking-wider">
                                Total a Devolver
                            </span>
                            <span className="font-mono text-xl font-extrabold text-on-surface">
                                Bs {(sale.total_cents / 100).toFixed(2)}
                            </span>
                            <span className="text-[11px] text-secondary truncate mt-0.5">
                                Cliente: <strong className="text-on-surface">{sale.client_name || 'Sin Nombre'}</strong>
                            </span>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-current ${badge.color}`}>
                                {badge.label}
                            </span>
                            {sale.details && sale.details.length > 0 && (
                                <span className="text-[10px] text-secondary font-mono">
                                    {sale.details.reduce((acc, d) => acc + d.quantity, 0)} unidades
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Selector de Motivos Rápidos */}
                    <div>
                        <label className="block text-xs font-bold text-on-surface mb-2">
                            Selecciona el motivo de anulación:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {PRESET_REASONS.map((p) => {
                                const isSelected = reason === p.label;
                                return (
                                    <button
                                        key={p.label}
                                        type="button"
                                        onClick={() => handleSelectPreset(p.label)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                            isSelected
                                                ? 'bg-primary text-white shadow-xs font-bold'
                                                : 'bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[15px]">{p.icon}</span>
                                        <span>{p.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Justificación o Nota Adicional */}
                    <div>
                        <label className="block text-xs font-bold text-on-surface mb-1.5">
                            Detalle o justificación para auditoría (opcional):
                        </label>
                        <textarea
                            rows={2}
                            value={customNote}
                            onChange={(e) => setCustomNote(e.target.value)}
                            placeholder="Ej. El cliente devolvió el jarabe sellado porque el médico le cambió la receta..."
                            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container text-xs text-on-surface placeholder:text-outline focus:outline-hidden focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                        />
                    </div>

                    {/* Aviso de Impacto Operativo */}
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-amber-800 dark:text-amber-200 text-xs">
                        <span className="material-symbols-outlined text-[18px] text-amber-500 shrink-0 mt-0.5">
                            warning
                        </span>
                        <div className="leading-relaxed text-[11px]">
                            <strong>Impacto en el sistema:</strong> Los medicamentos se restituirán de inmediato al stock del lote correspondiente y el importe se descontará del arqueo del turno de caja activo.
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="pt-2 flex items-center justify-end gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isCancelling}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            Conservar Venta
                        </button>
                        <button
                            type="submit"
                            disabled={isCancelling}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-error hover:bg-error/90 text-white font-bold text-xs shadow-md shadow-error/20 transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                        >
                            {isCancelling ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-[16px]">
                                        progress_activity
                                    </span>
                                    <span>Anulando...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[16px]">
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
