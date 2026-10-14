import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getCashierDailyClose, type CashierCloseData } from '../services/cashCloseApi';
import { getActiveCashShift, closeCashShift, type CashShift } from '../services/cashShiftsApi';
import CashCloseReceipt, { type ReconciliationData } from './CashCloseReceipt';

interface CashCloseModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CashCloseModal({ isOpen, onClose }: CashCloseModalProps) {
    const { user } = useAuthStore();
    const [isLoading, setIsLoading] = useState(true);
    const [closeData, setCloseData] = useState<CashierCloseData | null>(null);
    const [activeShift, setActiveShift] = useState<CashShift | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);

    // Estado del Arqueo
    const [countedCashBs, setCountedCashBs] = useState<string>('');
    const [isSubmittingClose, setIsSubmittingClose] = useState(false);

    useEffect(() => {
        if (!isOpen || !user) return;

        setIsLoading(true);
        Promise.all([
            getCashierDailyClose(user.id),
            getActiveCashShift(user.id),
        ])
            .then(([dailyData, shift]) => {
                setCloseData(dailyData);
                setActiveShift(shift);

                // Calcular efectivo esperado por defecto
                const openingCents = shift?.opening_amount_cents || 0;
                const cashSalesCents = dailyData.cashSalesCents || 0;
                const expectedCents = openingCents + cashSalesCents;
                setCountedCashBs((expectedCents / 100).toFixed(2));
            })
            .catch((err) => {
                console.error('Error cargando cierre de turno:', err);
                alert('No se pudo cargar la información del turno');
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [isOpen, user]);

    if (!isOpen) return null;

    const openingCents = activeShift?.opening_amount_cents || 0;
    const cashSalesCents = closeData?.cashSalesCents || 0;
    const expectedCents = openingCents + cashSalesCents;

    const countedCents = Math.round((parseFloat(countedCashBs) || 0) * 100);
    const diffCents = countedCents - expectedCents;

    const reconciliation: ReconciliationData = {
        openingFundBs: (openingCents / 100).toFixed(2),
        expectedCashBs: (expectedCents / 100).toFixed(2),
        countedCashBs: (countedCents / 100).toFixed(2),
        diffBs: (Math.abs(diffCents) / 100).toFixed(2),
        diffStatus: diffCents === 0 ? 'exact' : diffCents > 0 ? 'surplus' : 'deficit',
    };

    const handleConfirmClose = async () => {
        if (!closeData) return;

        setIsSubmittingClose(true);
        try {
            if (activeShift) {
                await closeCashShift(activeShift.id, countedCents, expectedCents);
            }
            setIsPrinting(true);
        } catch (err: any) {
            console.error('Error al registrar cierre de turno:', err);
            alert(`Error al registrar el cierre: ${err.message}`);
        } finally {
            setIsSubmittingClose(false);
        }
    };

    if (isPrinting && closeData) {
        return (
            <CashCloseReceipt
                data={closeData}
                reconciliation={reconciliation}
                onClose={() => {
                    setIsPrinting(false);
                    onClose();
                }}
            />
        );
    }

    const totalBs = closeData ? (closeData.totalSalesCents / 100).toFixed(2) : '0.00';
    const avgTicketBs =
        closeData && closeData.totalTickets > 0
            ? (closeData.totalSalesCents / closeData.totalTickets / 100).toFixed(2)
            : '0.00';

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
            <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-surface-container">
                {/* Cabecera */}
                <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
                    <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[22px]">point_of_sale</span>
                        </span>
                        <div>
                            <h2 className="text-lg font-bold text-on-surface">Cierre &amp; Arqueo de Caja</h2>
                            <p className="text-xs text-secondary">Cuadre operativo de efectivo y cobros del turno</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-secondary hover:text-error transition-colors p-1.5 rounded-lg hover:bg-surface-container"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                {/* Contenido */}
                <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[75vh]">
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3 text-secondary">
                            <span className="material-symbols-outlined animate-spin text-3xl text-primary">
                                progress_activity
                            </span>
                            <span className="text-sm font-medium">Calculando ventas y fondo de caja...</span>
                        </div>
                    ) : closeData ? (
                        <>
                            {/* Información del Cajero */}
                            <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold">
                                        <span className="material-symbols-outlined text-[20px]">badge</span>
                                    </div>
                                    <div>
                                        <span className="text-sm font-bold text-on-surface block">
                                            {closeData.cashierName}
                                        </span>
                                        <span className="text-xs text-secondary font-mono">{user?.email}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-semibold text-secondary uppercase tracking-wider block">
                                        Fecha
                                    </span>
                                    <span className="text-xs font-bold text-on-surface font-mono">
                                        {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                    </span>
                                </div>
                            </div>

                            {/* Gran Total y Tickets */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col justify-between">
                                    <span className="text-xs font-bold uppercase text-primary tracking-wider">
                                        Total Ventas
                                    </span>
                                    <div className="mt-2 flex items-baseline gap-1">
                                        <span className="text-xs text-primary font-bold">Bs</span>
                                        <span className="text-2xl font-bold font-mono text-primary">{totalBs}</span>
                                    </div>
                                    <span className="text-[11px] text-secondary mt-1">Ingresos del turno</span>
                                </div>

                                <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container flex flex-col justify-between">
                                    <span className="text-xs font-bold uppercase text-secondary tracking-wider">
                                        Tickets Válidos
                                    </span>
                                    <div className="mt-2 flex items-baseline gap-1">
                                        <span className="text-2xl font-bold font-mono text-on-surface">
                                            {closeData.totalTickets}
                                        </span>
                                        <span className="text-xs text-secondary">tickets</span>
                                    </div>
                                    <span className="text-[11px] text-secondary mt-1">Promedio: Bs {avgTicketBs}</span>
                                </div>
                            </div>

                            {/* Desglose de Métodos de Pago */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col">
                                    <div className="flex items-center gap-1 text-emerald-800 text-xs font-bold">
                                        <span className="material-symbols-outlined text-[15px]">payments</span>
                                        <span>Efectivo</span>
                                    </div>
                                    <div className="mt-1 font-mono font-bold text-emerald-900 text-sm">
                                        Bs {(closeData.cashSalesCents / 100).toFixed(2)}
                                    </div>
                                    <span className="text-[10px] text-emerald-700">{closeData.cashTickets} tkt</span>
                                </div>

                                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex flex-col">
                                    <div className="flex items-center gap-1 text-blue-800 text-xs font-bold">
                                        <span className="material-symbols-outlined text-[15px]">credit_card</span>
                                        <span>Tarjeta</span>
                                    </div>
                                    <div className="mt-1 font-mono font-bold text-blue-900 text-sm">
                                        Bs {(closeData.cardSalesCents / 100).toFixed(2)}
                                    </div>
                                    <span className="text-[10px] text-blue-700">{closeData.cardTickets} tkt</span>
                                </div>

                                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex flex-col">
                                    <div className="flex items-center gap-1 text-purple-800 text-xs font-bold">
                                        <span className="material-symbols-outlined text-[15px]">qr_code_2</span>
                                        <span>QR</span>
                                    </div>
                                    <div className="mt-1 font-mono font-bold text-purple-900 text-sm">
                                        Bs {(closeData.qrSalesCents / 100).toFixed(2)}
                                    </div>
                                    <span className="text-[10px] text-purple-700">{closeData.qrTickets} tkt</span>
                                </div>
                            </div>

                            {/* SECCIÓN ARQUEO DE EFECTIVO (GAVETA) */}
                            <div className="p-4 rounded-xl bg-surface-container-low border border-surface-container flex flex-col gap-3">
                                <div className="flex items-center justify-between border-b border-surface-container pb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-[20px]">
                                            calculate
                                        </span>
                                        <span className="font-bold text-xs uppercase text-on-surface tracking-wider">
                                            Arqueo de Efectivo en Gaveta
                                        </span>
                                    </div>
                                    {activeShift ? (
                                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">
                                            Turno Activo
                                        </span>
                                    ) : (
                                        <span className="text-[10px] bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded font-medium">
                                            Sin fondo inicial
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-surface-container">
                                        <span className="text-secondary block text-[11px]">(+) Fondo Inicial:</span>
                                        <span className="font-mono font-bold text-on-surface">
                                            Bs {(openingCents / 100).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-surface-container">
                                        <span className="text-secondary block text-[11px]">(+) Ventas Efectivo:</span>
                                        <span className="font-mono font-bold text-emerald-700">
                                            Bs {(cashSalesCents / 100).toFixed(2)}
                                        </span>
                                    </div>
                                </div>

                                <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-surface-container flex items-center justify-between text-xs">
                                    <span className="font-bold text-on-surface">(=) Efectivo Total Esperado:</span>
                                    <span className="font-mono font-bold text-primary text-base">
                                        Bs {(expectedCents / 100).toFixed(2)}
                                    </span>
                                </div>

                                {/* Input del Cajero con lo contado físicamente */}
                                <div className="flex flex-col gap-1.5 pt-1">
                                    <label className="text-[11px] font-bold uppercase text-secondary">
                                        Efectivo Físico Contado en Gaveta (Bs):
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-secondary">
                                            Bs
                                        </span>
                                        <input
                                            type="number"
                                            step="0.50"
                                            value={countedCashBs}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setCountedCashBs(e.target.value.replace(/^0+(?=\d)/, ''))}
                                            className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-container-lowest text-on-surface font-mono text-base font-bold border border-surface-container focus:ring-2 focus:ring-primary focus:outline-none"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                {/* Indicador de Cuadre / Sobrante / Faltante */}
                                <div
                                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                                        diffCents === 0
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                            : diffCents > 0
                                            ? 'bg-blue-50 border-blue-300 text-blue-900'
                                            : 'bg-error-container border-error/30 text-on-error-container'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[18px]">
                                            {diffCents === 0
                                                ? 'check_circle'
                                                : diffCents > 0
                                                ? 'trending_up'
                                                : 'warning'}
                                        </span>
                                        <span>
                                            {diffCents === 0
                                                ? 'Caja Cuadrada Exacta'
                                                : diffCents > 0
                                                ? 'Sobrante de Caja'
                                                : 'Faltante de Caja'}
                                        </span>
                                    </div>
                                    <span className="font-mono text-sm">
                                        {diffCents >= 0 ? '+' : '-'}Bs {(Math.abs(diffCents) / 100).toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Desglose de Ventas del Turno */}
                            <div>
                                <span className="text-xs font-bold text-secondary uppercase tracking-wider block mb-2">
                                    Historial del Turno ({closeData.sales.length})
                                </span>
                                <div className="max-h-32 overflow-y-auto divide-y divide-surface-container border border-surface-container rounded-xl">
                                    {closeData.sales.length === 0 ? (
                                        <div className="p-4 text-xs text-center text-secondary">
                                            Aún no has registrado ventas en esta jornada.
                                        </div>
                                    ) : (
                                        closeData.sales.map((s, index) => {
                                            const badge = getPaymentBadge(s.payment_method);
                                            const isCancelled = s.status === 'cancelled';
                                            return (
                                                <div
                                                    key={s.id}
                                                    className={`p-2 px-3 flex justify-between items-center text-xs transition-colors ${
                                                        isCancelled
                                                            ? 'bg-error-container/20 line-through opacity-70'
                                                            : 'hover:bg-surface-container-low'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 font-mono">
                                                        <span className="text-secondary">#{index + 1}</span>
                                                        <span className="text-on-surface">
                                                            {new Date(s.created_at).toLocaleTimeString('es-ES', {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            })}
                                                        </span>
                                                        <span
                                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badge.color}`}
                                                        >
                                                            {badge.label}
                                                        </span>
                                                        {isCancelled && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-error-container text-on-error-container">
                                                                ANULADA
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span
                                                        className={`font-mono font-bold ${
                                                            isCancelled ? 'text-secondary' : 'text-primary'
                                                        }`}
                                                    >
                                                        Bs {(s.total_cents / 100).toFixed(2)}
                                                    </span>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>

                {/* Pie con Acciones */}
                <div className="p-4 border-t border-surface-container flex justify-end gap-3 bg-surface-container-low">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-secondary hover:bg-surface-container transition-colors"
                    >
                        Cerrar
                    </button>
                    <button
                        disabled={!closeData || isSubmittingClose}
                        onClick={handleConfirmClose}
                        className="flex items-center gap-2 bg-primary hover:bg-primary-container text-on-primary px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                        <span>{isSubmittingClose ? 'Cerrando...' : 'Finalizar Cierre & Ver Tique'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
