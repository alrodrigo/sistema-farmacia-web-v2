import { useState, useMemo } from 'react';
import { useProductKardex } from '../hooks/useKardex';
import { useProducts } from '../hooks/useProducts';

interface KardexModalProps {
    product: any | null;
    onClose: () => void;
}

export default function KardexModal({ product, onClose }: KardexModalProps) {
    const { data: allProducts = [] } = useProducts();
    const liveProduct = useMemo(() => {
        if (!product?.id) return product;
        return allProducts.find(p => p.id === product.id) || product;
    }, [allProducts, product]);

    const { data: movements = [], isLoading } = useProductKardex(liveProduct?.id || null);

    // Filtros de Auditoría de Fechas y Tipos
    const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '7days' | 'month' | 'custom'>('all');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ADJUSTMENT'>('ALL');

    // Filtrado de movimientos
    const filteredMovements = useMemo(() => {
        if (!movements.length) return [];
        let list = movements;

        // Filtro por tipo
        if (typeFilter !== 'ALL') {
            list = list.filter(m => m.movement_type === typeFilter);
        }

        // Filtro por fecha
        const now = new Date();
        if (dateRangeFilter === '7days') {
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            list = list.filter(m => new Date(m.created_at) >= sevenDaysAgo);
        } else if (dateRangeFilter === 'month') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            list = list.filter(m => new Date(m.created_at) >= startOfMonth);
        } else if (dateRangeFilter === 'custom') {
            if (customFrom) {
                const fromDate = new Date(`${customFrom}T00:00:00`);
                list = list.filter(m => new Date(m.created_at) >= fromDate);
            }
            if (customTo) {
                const toDate = new Date(`${customTo}T23:59:59`);
                list = list.filter(m => new Date(m.created_at) <= toDate);
            }
        }

        return list;
    }, [movements, typeFilter, dateRangeFilter, customFrom, customTo]);

    // Métricas de auditoría
    const auditMetrics = useMemo(() => {
        let totalIn = 0;
        let totalOut = 0;
        let totalAdjustment = 0;

        filteredMovements.forEach(m => {
            const qty = Math.abs(m.quantity);
            if (m.movement_type === 'IN') totalIn += qty;
            else if (m.movement_type === 'OUT') totalOut += qty;
            else totalAdjustment += m.quantity;
        });

        // Fechas límites
        const sortedDates = [...movements].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const firstDate = sortedDates[0]?.created_at || null;
        const lastDate = sortedDates[sortedDates.length - 1]?.created_at || null;

        return {
            totalIn,
            totalOut,
            totalAdjustment,
            firstDate,
            lastDate,
            totalRecords: filteredMovements.length,
        };
    }, [filteredMovements, movements]);

    if (!liveProduct) return null;

    // Exportar Kardex a CSV
    const handleExportKardexCsv = () => {
        const headers = ["Fecha", "Hora", "Tipo", "Cantidad", "Lote", "Vencimiento Lote", "Motivo", "Responsable"];
        const rows = filteredMovements.map(m => {
            const d = new Date(m.created_at);
            const dateStr = d.toLocaleDateString('es-ES');
            const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            return [
                dateStr,
                timeStr,
                m.movement_type,
                m.quantity.toString(),
                m.product_batches?.lot_number || 'S/L',
                m.product_batches?.expiration_date || 'S/F',
                `"${m.reason || ''}"`,
                `"${m.user_profiles?.full_name || 'Sistema'}"`
            ];
        });

        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Kardex_${liveProduct.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-inverse-surface/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-surface-container-high overflow-hidden">
                {/* Header del Modal */}
                <div className="px-6 py-4 bg-surface-container-lowest border-b border-surface-container flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined text-[24px]">history</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base sm:text-lg font-bold text-on-surface">
                                    Kardex y Auditoría de Movimientos
                                </h3>
                                <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-container text-primary font-bold">
                                    {liveProduct.sku || 'S/SKU'}
                                </span>
                            </div>
                            <p className="text-xs text-secondary">
                                {liveProduct.name} {liveProduct.active_substance ? `• ${liveProduct.active_substance}` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleExportKardexCsv}
                            className="px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1.5 transition-colors border border-surface-container"
                            title="Descargar historial de movimientos en Excel/CSV"
                        >
                            <span className="material-symbols-outlined text-[16px] text-primary">download</span>
                            <span className="hidden sm:inline">Exportar CSV</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>
                </div>

                {/* Subheader: Lotes activos y Stock Actual */}
                <div className="px-6 py-3 bg-surface-container-low/60 border-b border-surface-container flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-secondary font-medium">Stock Físico Consolidado:</span>
                        <span className="font-mono font-bold text-sm text-primary px-2 py-0.5 rounded bg-primary/10">
                            {liveProduct.stock} unidades
                        </span>
                    </div>

                    {/* Lotes activos en bodega */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-secondary font-medium">Lotes vigentes:</span>
                        {liveProduct.product_batches && liveProduct.product_batches.length > 0 ? (
                            liveProduct.product_batches.map((b: any) => (
                                <span
                                    key={b.id}
                                    className="font-mono text-[11px] px-2 py-0.5 rounded bg-surface-container border border-surface-container-high text-on-surface flex items-center gap-1"
                                >
                                    <strong>{b.lot_number || 'Lote'}</strong>: {b.stock} uds
                                    {b.expiration_date && (
                                        <span className="text-secondary text-[10px]">
                                            (Vence: {b.expiration_date})
                                        </span>
                                    )}
                                </span>
                            ))
                        ) : (
                            <span className="text-secondary italic">Sin lotes registrados</span>
                        )}
                    </div>
                </div>

                {/* Filtros de Auditoría */}
                <div className="p-4 bg-surface-container-lowest border-b border-surface-container flex flex-wrap items-center justify-between gap-3 shrink-0">
                    {/* Botones de Rango de Fechas */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-secondary uppercase mr-1">Periodo:</span>
                        {[
                            { id: 'all', label: 'Todo el Historial' },
                            { id: '7days', label: 'Últimos 7 días' },
                            { id: 'month', label: 'Este Mes' },
                            { id: 'custom', label: 'Personalizado' },
                        ].map(f => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setDateRangeFilter(f.id as any)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${dateRangeFilter === f.id ? 'bg-primary text-on-primary border-primary shadow-xs' : 'bg-surface-container text-secondary border-surface-container hover:bg-surface-container-high'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {/* Selector de Tipo de Movimiento */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-secondary uppercase">Tipo:</span>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as any)}
                            className="bg-surface-container-low text-on-surface text-xs px-2.5 py-1 rounded-lg border border-surface-container focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                        >
                            <option value="ALL">Todos los movimientos</option>
                            <option value="IN">Entradas (+)</option>
                            <option value="OUT">Salidas / Ventas (-)</option>
                            <option value="ADJUSTMENT">Ajustes</option>
                        </select>
                    </div>

                    {/* Inputs de rango de fecha personalizado */}
                    {dateRangeFilter === 'custom' && (
                        <div className="w-full flex items-center gap-2 pt-2 border-t border-surface-container text-xs">
                            <span className="text-secondary font-medium">Desde:</span>
                            <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className="px-2 py-1 rounded bg-surface-container-low text-on-surface border border-surface-container font-mono"
                            />
                            <span className="text-secondary font-medium ml-2">Hasta:</span>
                            <input
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className="px-2 py-1 rounded bg-surface-container-low text-on-surface border border-surface-container font-mono"
                            />
                        </div>
                    )}
                </div>

                {/* Métricas Resumen del Periodo */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-surface-container-low/40 border-b border-surface-container shrink-0">
                    <div className="p-2.5 rounded-xl bg-surface-container-lowest border border-surface-container">
                        <span className="text-[10px] uppercase font-bold text-secondary block">Total Entradas</span>
                        <span className="font-mono text-base font-bold text-emerald-600">+{auditMetrics.totalIn} uds</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-container-lowest border border-surface-container">
                        <span className="text-[10px] uppercase font-bold text-secondary block">Total Ventas / Salidas</span>
                        <span className="font-mono text-base font-bold text-amber-700">-{auditMetrics.totalOut} uds</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-container-lowest border border-surface-container">
                        <span className="text-[10px] uppercase font-bold text-secondary block">Movimientos Registrados</span>
                        <span className="font-mono text-base font-bold text-on-surface">{auditMetrics.totalRecords}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-container-lowest border border-surface-container">
                        <span className="text-[10px] uppercase font-bold text-secondary block">Trazabilidad Temporal</span>
                        <span className="font-mono text-xs font-semibold text-secondary block truncate">
                            {auditMetrics.firstDate
                                ? `${new Date(auditMetrics.firstDate).toLocaleDateString('es-ES')} → Hoy`
                                : 'Sin registros'}
                        </span>
                    </div>
                </div>

                {/* Lista / Tabla de Movimientos */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="p-8 text-center text-secondary flex flex-col items-center justify-center gap-2">
                            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                            <span className="text-xs font-medium">Cargando auditoría de movimientos...</span>
                        </div>
                    ) : filteredMovements.length === 0 ? (
                        <div className="p-12 text-center text-secondary flex flex-col items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-4xl text-outline">history_toggle_off</span>
                            <p className="font-semibold text-sm text-on-surface">No se encontraron movimientos registrados</p>
                            <p className="text-xs text-secondary">
                                Los movimientos se generan automáticamente al registrar lotes, ajustar existencias o cobrar ventas en POS.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-surface-container text-secondary uppercase font-bold text-[10px]">
                                        <th className="py-2.5 px-3">Fecha y Hora</th>
                                        <th className="py-2.5 px-3">Tipo Operación</th>
                                        <th className="py-2.5 px-3 text-right">Cantidad</th>
                                        <th className="py-2.5 px-3">Lote / Caducidad</th>
                                        <th className="py-2.5 px-3">Motivo / Concepto</th>
                                        <th className="py-2.5 px-3">Responsable</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-container">
                                    {filteredMovements.map((mov) => {
                                        const date = new Date(mov.created_at);
                                        const isToday = new Date().toDateString() === date.toDateString();
                                        const dateLabel = isToday
                                            ? `Hoy, ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                                            : `${date.toLocaleDateString('es-ES')} ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

                                        const isEntry = mov.movement_type === 'IN';
                                        const isExit = mov.movement_type === 'OUT';

                                        // Estado de caducidad del lote si aplica
                                        const lot = mov.product_batches;
                                        let expBadge = null;
                                        if (lot?.expiration_date) {
                                            const expDate = new Date(lot.expiration_date);
                                            const diffDays = Math.ceil((expDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                            if (diffDays < 0) {
                                                expBadge = <span className="text-[9px] text-error font-bold">Vencido</span>;
                                            } else if (diffDays <= 30) {
                                                expBadge = <span className="text-[9px] text-amber-700 font-bold">Exp. en {diffDays}d</span>;
                                            } else {
                                                expBadge = <span className="text-[9px] text-secondary">Exp. {lot.expiration_date}</span>;
                                            }
                                        }

                                        return (
                                            <tr key={mov.id} className="hover:bg-surface-container-low transition-colors">
                                                {/* Fecha y Hora Auditada */}
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                    <span className="font-mono font-medium text-on-surface block">
                                                        {dateLabel}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-secondary">
                                                        {date.toLocaleTimeString('es-ES', { second: '2-digit' })} seg
                                                    </span>
                                                </td>

                                                {/* Tipo */}
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                    {isEntry ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800">
                                                            <span className="material-symbols-outlined text-[12px]">arrow_downward</span>
                                                            Entrada
                                                        </span>
                                                    ) : isExit ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-100 text-amber-800">
                                                            <span className="material-symbols-outlined text-[12px]">arrow_upward</span>
                                                            Venta POS
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-blue-100 text-blue-800">
                                                            <span className="material-symbols-outlined text-[12px]">tune</span>
                                                            Ajuste
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Cantidad */}
                                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                                    <span className={`font-mono text-sm font-bold ${isEntry ? 'text-emerald-600' : isExit ? 'text-amber-700' : 'text-primary'}`}>
                                                        {isEntry ? `+${mov.quantity}` : `${mov.quantity}`} uds
                                                    </span>
                                                </td>

                                                {/* Lote & Vencimiento */}
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                    {lot?.lot_number ? (
                                                        <div>
                                                            <span className="font-mono font-bold text-on-surface block text-[11px]">
                                                                {lot.lot_number}
                                                            </span>
                                                            {expBadge}
                                                        </div>
                                                    ) : (
                                                        <span className="text-secondary italic text-[11px]">Lote General</span>
                                                    )}
                                                </td>

                                                {/* Motivo */}
                                                <td className="py-2.5 px-3">
                                                    <span className="text-on-surface font-medium block">
                                                        {mov.reason || 'Sin motivo especificado'}
                                                    </span>
                                                    {mov.reference_id && (
                                                        <span className="font-mono text-[9px] text-secondary">
                                                            Ref: #{mov.reference_id.split('-')[0]}
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Responsable */}
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                    <span className="text-secondary font-medium">
                                                        {mov.user_profiles?.full_name || 'Sistema Farmacia'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer del Modal */}
                <div className="px-6 py-3 bg-surface-container border-t border-surface-container flex items-center justify-between text-xs text-secondary shrink-0">
                    <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
                        <span>Auditoría inmutable de inventario registrada con marca de tiempo UTC/Local</span>
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container-high text-on-surface font-semibold border border-surface-container transition-colors"
                    >
                        Cerrar Kardex
                    </button>
                </div>
            </div>
        </div>
    );
}
