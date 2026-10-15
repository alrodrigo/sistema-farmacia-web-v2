import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getRecentSales, cancelSale, type RecentSaleItem } from '../services/sales';
import { toast } from '@/stores/toastStore';
import { CancelSaleModal } from './CancelSaleModal';

interface SalesHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onReprint: (saleId: string) => void;
}

export default function SalesHistoryModal({ isOpen, onClose, onReprint }: SalesHistoryModalProps) {
    const { user } = useAuthStore();
    const qc = useQueryClient();
    const [sales, setSales] = useState<RecentSaleItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterMethod, setFilterMethod] = useState<'ALL' | 'cash' | 'card' | 'qr'>('ALL');
    const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [saleToCancel, setSaleToCancel] = useState<RecentSaleItem | null>(null);

    const loadSales = async () => {
        setIsLoading(true);
        try {
            const data = await getRecentSales({ limit: 50 });
            setSales(data);
        } catch (err) {
            console.error('Error cargando historial de ventas:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadSales();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const filteredSales = sales.filter((s) => {
        if (filterMethod === 'ALL') return true;
        return s.payment_method === filterMethod;
    });

    const handleConfirmCancel = async (reason: string) => {
        if (!user || !saleToCancel) return;
        setCancellingId(saleToCancel.id);
        try {
            const res = await cancelSale(saleToCancel.id, user.id, reason);
            if (res.success) {
                toast.success('Venta anulada exitosamente. El stock fue restaurado.', 'Venta Anulada');
                setSaleToCancel(null);
                // Recargar historial y refrescar catálogo de productos en tiempo real
                await qc.invalidateQueries({ queryKey: ['products-catalog'] });
                qc.invalidateQueries({ queryKey: ['sales-summary'] });
                qc.invalidateQueries({ queryKey: ['consolidated-cash-close'] });
                qc.invalidateQueries({ queryKey: ['cashier-daily-close'] });
                await loadSales();
            } else {
                toast.error(res.error || 'No se pudo anular la venta', 'Error al Anular');
            }
        } finally {
            setCancellingId(null);
        }
    };

    const getPaymentBadge = (method: 'cash' | 'card' | 'qr') => {
        switch (method) {
            case 'card':
                return { label: 'Tarjeta', color: 'bg-blue-100 text-blue-800 border-blue-200' };
            case 'qr':
                return { label: 'QR', color: 'bg-purple-100 text-purple-800 border-purple-200' };
            default:
                return { label: 'Efectivo', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-sm">
            <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden border border-surface-container max-h-[85vh]">
                {/* Cabecera */}
                <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
                    <div className="flex items-center gap-3">
                        <span className="p-2.5 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[24px]">history</span>
                        </span>
                        <div>
                            <h2 className="text-lg font-bold text-on-surface">Historial de Ventas y Reimpresión</h2>
                            <p className="text-xs text-secondary">
                                Consulta de tickets emitidos, reimpresión de comprobantes y anulación con reversión de stock
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-secondary hover:text-error transition-colors p-1.5 rounded-lg hover:bg-surface-container"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                {/* Filtros Rápidos */}
                <div className="p-4 border-b border-surface-container flex flex-wrap items-center justify-between gap-3 bg-surface-container-lowest">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-secondary uppercase tracking-wider">Filtrar por pago:</span>
                        <div className="flex gap-1 bg-surface-container-low p-1 rounded-lg">
                            {(['ALL', 'cash', 'card', 'qr'] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setFilterMethod(m)}
                                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                                        filterMethod === m
                                            ? 'bg-surface-container-lowest text-primary shadow-sm font-bold'
                                            : 'text-secondary hover:text-on-surface'
                                    }`}
                                >
                                    {m === 'ALL' ? 'Todos' : m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : 'QR'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={loadSales}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-secondary hover:text-on-surface transition-colors"
                    >
                        <span className="material-symbols-outlined text-[16px]">refresh</span>
                        <span>Actualizar</span>
                    </button>
                </div>

                {/* Listado de Ventas */}
                <div className="overflow-y-auto flex-1 p-4 divide-y divide-surface-container">
                    {isLoading ? (
                        <div className="py-16 text-center text-secondary text-xs animate-pulse">
                            Cargando historial de ventas...
                        </div>
                    ) : filteredSales.length === 0 ? (
                        <div className="py-16 text-center text-secondary text-xs">
                            No se encontraron ventas para el filtro seleccionado.
                        </div>
                    ) : (
                        filteredSales.map((s) => {
                            const badge = getPaymentBadge(s.payment_method);
                            const isCancelled = s.status === 'cancelled';
                            const isExpanded = expandedSaleId === s.id;

                            return (
                                <div
                                    key={s.id}
                                    className={`py-3 px-2 flex flex-col gap-2 rounded-xl transition-colors ${
                                        isCancelled ? 'bg-error-container/10' : 'hover:bg-surface-container-low/50'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        {/* Info Ticket */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <button
                                                onClick={() => setExpandedSaleId(isExpanded ? null : s.id)}
                                                className="p-1 rounded hover:bg-surface-container text-secondary"
                                                title="Ver detalle de medicamentos"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">
                                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                                </span>
                                            </button>

                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sm text-primary">
                                                        #{s.id.slice(0, 8)}
                                                    </span>
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.color}`}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                    {isCancelled ? (
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-error-container text-on-error-container">
                                                            ANULADA
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                                            COMPLETADA
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-3 text-xs text-secondary mt-0.5">
                                                    <span>
                                                        {new Date(s.created_at).toLocaleString('es-ES', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </span>
                                                    <span>•</span>
                                                    <span>Cajero: <strong>{s.cashier_name}</strong></span>
                                                    <span>•</span>
                                                    <span>{s.items_count} producto(s)</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Total y Acciones */}
                                        <div className="flex items-center gap-4 shrink-0">
                                            <div className="text-right">
                                                <span
                                                    className={`font-mono text-base font-bold ${
                                                        isCancelled ? 'line-through text-secondary' : 'text-on-surface'
                                                    }`}
                                                >
                                                    Bs {(s.total_cents / 100).toFixed(2)}
                                                </span>
                                                {s.discount_cents && s.discount_cents > 0 ? (
                                                    <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 mt-0.5 inline-block" title={s.discount_reason || 'Descuento aplicado'}>
                                                        Desc: -Bs {(s.discount_cents / 100).toFixed(2)}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                {/* Botón Reimprimir Ticket */}
                                                <button
                                                    onClick={() => onReprint(s.id)}
                                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary font-bold text-xs transition-colors border border-surface-container"
                                                    title="Reimprimir ticket de venta"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">print</span>
                                                    <span>Reimprimir</span>
                                                </button>

                                                {/* Botón Anular Venta */}
                                                {!isCancelled && (
                                                    <button
                                                        disabled={cancellingId === s.id}
                                                        onClick={() => setSaleToCancel(s)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-error-container/40 hover:bg-error-container text-error font-bold text-xs transition-colors cursor-pointer"
                                                        title="Anular venta y reponer stock"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">cancel</span>
                                                        <span>{cancellingId === s.id ? 'Anulando...' : 'Anular'}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Detalle Desplegable de Medicamentos */}
                                    {isExpanded && (
                                        <div className="mt-2 ml-9 p-3 rounded-xl bg-surface-container-low/70 border border-surface-container text-xs">
                                            <span className="font-bold text-secondary uppercase tracking-wider block mb-2 text-[11px]">
                                                Medicamentos Vendidos:
                                            </span>
                                            <div className="space-y-1.5">
                                                {s.details && s.details.length > 0 ? (
                                                    s.details.map((d, i) => (
                                                        <div key={i} className="flex justify-between items-center text-xs">
                                                            <span className="text-on-surface">
                                                                <strong>{d.quantity}x</strong> {d.product_name}
                                                            </span>
                                                            <span className="font-mono text-secondary">
                                                                Bs {(d.subtotal_cents / 100).toFixed(2)}
                                                            </span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span className="text-secondary italic">Sin detalles disponibles</span>
                                                )}
                                            </div>

                                            {isCancelled && s.cancellation_reason && (
                                                <div className="mt-2 pt-2 border-t border-surface-container text-[11px] text-error font-semibold">
                                                    Motivo de anulación: {s.cancellation_reason}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Pie */}
                <div className="p-4 border-t border-surface-container flex justify-between items-center bg-surface-container-low text-xs text-secondary">
                    <span>Mostrando las últimas {filteredSales.length} transacciones registradas</span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-semibold bg-surface-container-lowest text-on-surface hover:bg-surface-container border border-surface-container transition-colors cursor-pointer"
                    >
                        Cerrar Historial
                    </button>
                </div>
            </div>

            {/* Modal Profesional de Confirmación de Anulación */}
            <CancelSaleModal
                isOpen={!!saleToCancel}
                sale={saleToCancel}
                onClose={() => setSaleToCancel(null)}
                onConfirm={handleConfirmCancel}
                isCancelling={!!cancellingId}
            />
        </div>
    );
}
