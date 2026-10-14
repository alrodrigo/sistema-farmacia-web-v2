import type { CashierCloseData } from '../services/cashCloseApi';

export interface ReconciliationData {
    openingFundBs: string;
    expectedCashBs: string;
    countedCashBs: string;
    diffBs: string;
    diffStatus: 'exact' | 'surplus' | 'deficit';
}

interface CashCloseReceiptProps {
    data: CashierCloseData;
    reconciliation?: ReconciliationData;
    onClose: () => void;
}

export default function CashCloseReceipt({ data, reconciliation, onClose }: CashCloseReceiptProps) {
    const totalBs = (data.totalSalesCents / 100).toFixed(2);
    const avgTicketBs = data.totalTickets > 0 ? (data.totalSalesCents / data.totalTickets / 100).toFixed(2) : '0.00';

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-inverse-surface/80 backdrop-blur-sm overflow-y-auto">
            {/* TICKET TÉRMICO (80mm) */}
            <div
                id="cash-close-receipt"
                className="bg-white text-black p-4 w-[80mm] min-h-[100mm] font-mono text-sm shadow-2xl border border-gray-300"
            >
                {/* Cabecera */}
                <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
                    <h2 className="text-lg font-bold uppercase tracking-tight">PharmaCore ERP</h2>
                    <p className="text-xs uppercase font-bold text-gray-700">Comprobante de Cierre &amp; Arqueo</p>
                    <p className="text-[11px] text-gray-600 mt-1">Sucursal Central La Paz</p>
                </div>

                {/* Datos del Turno */}
                <div className="text-xs space-y-1 mb-3 border-b border-dashed border-gray-400 pb-2">
                    <div className="flex justify-between">
                        <span className="text-gray-600">Fecha Cierre:</span>
                        <span className="font-bold">{new Date().toLocaleDateString('es-ES')}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-600">Hora Cierre:</span>
                        <span className="font-bold">{new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-600">Cajero / Operador:</span>
                        <span className="font-bold truncate max-w-[140px]">{data.cashierName}</span>
                    </div>
                </div>

                {/* Horarios de Operación */}
                <div className="text-xs space-y-1 mb-3 border-b border-dashed border-gray-400 pb-2">
                    <div className="flex justify-between">
                        <span className="text-gray-600">Primera Venta:</span>
                        <span>{data.firstSaleAt ? new Date(data.firstSaleAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-600">Última Venta:</span>
                        <span>{data.lastSaleAt ? new Date(data.lastSaleAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                    </div>
                </div>

                {/* Resumen de Ventas por Método */}
                <div className="text-xs space-y-1 mb-3 border-b border-dashed border-gray-400 pb-2">
                    <p className="font-bold text-[11px] uppercase text-gray-700 mb-1">Ventas por Forma de Pago:</p>
                    <div className="flex justify-between">
                        <span>Efectivo ({data.cashTickets}):</span>
                        <span className="font-mono font-bold">Bs {(data.cashSalesCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Tarjeta ({data.cardTickets}):</span>
                        <span className="font-mono font-bold">Bs {(data.cardSalesCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Pago QR ({data.qrTickets}):</span>
                        <span className="font-mono font-bold">Bs {(data.qrSalesCents / 100).toFixed(2)}</span>
                    </div>
                    {data.cancelledTickets > 0 && (
                        <div className="flex justify-between text-red-600 pt-1 border-t border-dotted border-gray-300">
                            <span>Ventas Anuladas ({data.cancelledTickets}):</span>
                            <span className="font-mono font-bold">-Bs {(data.cancelledSalesCents / 100).toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Arqueo de Caja Chica (Si existe) */}
                {reconciliation && (
                    <div className="text-xs space-y-1 mb-3 border-b border-dashed border-gray-400 pb-2 bg-gray-50 p-2 rounded">
                        <p className="font-bold text-[11px] uppercase text-gray-800 mb-1">Arqueo Físico de Gaveta:</p>
                        <div className="flex justify-between">
                            <span className="text-gray-600">(+) Fondo Inicial:</span>
                            <span className="font-mono">Bs {reconciliation.openingFundBs}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600">(+) Ventas Efectivo:</span>
                            <span className="font-mono">Bs {(data.cashSalesCents / 100).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold border-t border-gray-300 pt-1">
                            <span>(=) Efectivo Esperado:</span>
                            <span className="font-mono">Bs {reconciliation.expectedCashBs}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                            <span>(=) Efectivo Contado:</span>
                            <span className="font-mono">Bs {reconciliation.countedCashBs}</span>
                        </div>
                        <div className="flex justify-between font-bold pt-1 border-t border-dotted border-gray-400">
                            <span>Diferencia de Caja:</span>
                            <span className="font-mono">
                                {reconciliation.diffStatus === 'exact'
                                    ? 'Bs 0.00 (CUADRADA)'
                                    : reconciliation.diffStatus === 'surplus'
                                    ? `+Bs ${reconciliation.diffBs} (SOBRANTE)`
                                    : `-Bs ${reconciliation.diffBs} (FALTANTE)`}
                            </span>
                        </div>
                    </div>
                )}

                {/* Gran Total Ventas */}
                <div className="py-2 border-b-2 border-double border-gray-700 mb-6">
                    <div className="flex justify-between items-baseline font-bold">
                        <span className="text-xs uppercase text-gray-700">Total Ventas ({data.totalTickets} tkt):</span>
                        <span className="text-lg">Bs {totalBs}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>Ticket Promedio:</span>
                        <span>Bs {avgTicketBs}</span>
                    </div>
                </div>

                {/* Firmas de Control */}
                <div className="pt-4 text-center text-xs space-y-6">
                    <div>
                        <div className="border-t border-gray-400 w-36 mx-auto pt-1">
                            <span>Firma del Cajero</span>
                        </div>
                    </div>
                    <div>
                        <div className="border-t border-gray-400 w-36 mx-auto pt-1">
                            <span>Firma de Recepción / Supervisor</span>
                        </div>
                    </div>
                </div>

                <div className="text-center mt-6 text-[10px] text-gray-500">
                    PharmaCore POS • Auditoría Operativa
                </div>
            </div>

            {/* Acciones en Pantalla (Ocultas al Imprimir) */}
            <div className="mt-6 flex gap-4 print:hidden">
                <button
                    onClick={handlePrint}
                    className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold shadow hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95"
                >
                    <span className="material-symbols-outlined text-[20px]">print</span>
                    <span>Imprimir en Tiquetera</span>
                </button>
                <button
                    onClick={onClose}
                    className="bg-surface-container-high text-on-surface px-6 py-2.5 rounded-xl font-bold shadow hover:bg-surface-variant transition-colors"
                >
                    Volver
                </button>
            </div>
        </div>
    );
}
