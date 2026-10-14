import { useState, useMemo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useHasPermission } from '@/features/users/hooks/usePermissions';
import { cancelSale } from '@/features/pos/services/sales';
import TicketReceipt from '@/features/pos/components/TicketReceipt';
import { toast } from '@/stores/toastStore';
import { confirmDialog } from '@/stores/confirmModalStore';
import ReportDocumentPdfModal, { type ReportType } from './ReportDocumentPdfModal';
import {
    useDateRange,
    useSalesSummary,
    useTopProducts,
    useSalesByCashier,
    useDailySales,
    useStockAlerts,
    useProfitMargins,
    useConsolidatedCashClose,
    type StockAlert,
} from '../hooks/useReports';
import { useUsers } from '@/features/users/hooks/useUsers';
import { formatBs, formatDate } from '@/lib/utils';
import { exportToCsv } from '@/lib/exportUtils';

export default function ReportsPage() {
    const qc = useQueryClient();
    const { user } = useAuthStore();
    const canView = useHasPermission('reports:view');
    const canCashClose = useHasPermission('reports:cash_close');
    const canVoidSale = useHasPermission('reports:void_sale');
    const canExport = useHasPermission('reports:export');

    const { range, setRange, setPreset } = useDateRange();
    const [activeTab, setActiveTab] = useState<'general' | 'cash_close' | 'margins' | 'stock_audit'>('general');
    const [selectedCashier, setSelectedCashier] = useState('ALL');
    const [reprintSaleId, setReprintSaleId] = useState<string | null>(null);
    const [cancellingSaleId, setCancellingSaleId] = useState<string | null>(null);
    const [pdfModalType, setPdfModalType] = useState<ReportType | null>(null);
    const [stockFilter, setStockFilter] = useState<'all' | 'low_stock' | 'expiring' | 'expired'>('all');
    const [salesTableMode, setSalesTableMode] = useState<'by_cashier' | 'chronological'>('by_cashier');
    const [salesSearchTerm, setSalesSearchTerm] = useState('');
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<'ALL' | 'cash' | 'card' | 'qr'>('ALL');
    const [salesStatusFilter, setSalesStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
    const [timeShiftFilter, setTimeShiftFilter] = useState<'ALL' | 'morning' | 'afternoon' | 'custom'>('ALL');
    const [customTimeFrom, setCustomTimeFrom] = useState<string>('07:00');
    const [customTimeTo, setCustomTimeTo] = useState<string>('23:00');
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const exportMenuRef = useRef<HTMLDivElement>(null);

    const activeFiltersCount = useMemo(() => {
        let count = 0;
        if (selectedCashier !== 'ALL') count++;
        if (paymentMethodFilter !== 'ALL') count++;
        if (salesStatusFilter !== 'all') count++;
        if (timeShiftFilter !== 'ALL') count++;
        if (salesSearchTerm.trim()) count++;
        return count;
    }, [selectedCashier, paymentMethodFilter, salesStatusFilter, timeShiftFilter, salesSearchTerm]);

    const handleResetAllFilters = () => {
        setSelectedCashier('ALL');
        setPaymentMethodFilter('ALL');
        setSalesStatusFilter('all');
        setTimeShiftFilter('ALL');
        setCustomTimeFrom('07:00');
        setCustomTimeTo('23:00');
        setSalesSearchTerm('');
    };

    // Cierre al hacer click fuera del dropdown de exportación
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
                setIsExportMenuOpen(false);
            }
        }
        if (isExportMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isExportMenuOpen]);

    const handleAdminCancelSale = async (sale: any) => {
        if (!user || !canVoidSale) return;
        const confirmed = await confirmDialog({
            title: '¿Anular Venta Administrativamente?',
            message: `¿Estás seguro de anular la venta #${sale.id.slice(0, 8)} por un total de Bs ${(sale.total_cents / 100).toFixed(2)}?\n\nEl stock de todos los medicamentos vendidos será restituido automáticamente al inventario.`,
            confirmText: 'Sí, anular y devolver stock',
            cancelText: 'Conservar venta',
            type: 'danger',
            icon: 'remove_shopping_cart',
        });
        if (!confirmed) return;

        const reason =
            prompt('Motivo de la anulación administrativa:', 'Anulación por Administrador / Corrección de caja') ||
            'Anulación por Administrador';

        setCancellingSaleId(sale.id);
        try {
            const res = await cancelSale(sale.id, user.id, reason);
            if (res.success) {
                toast.success('Venta anulada. El stock fue devuelto automáticamente al inventario.', 'Venta Anulada');
                await qc.invalidateQueries({ queryKey: ['consolidated-cash-close'] });
                qc.invalidateQueries({ queryKey: ['sales-summary'] });
                qc.invalidateQueries({ queryKey: ['daily-sales'] });
                qc.invalidateQueries({ queryKey: ['top-products'] });
                qc.invalidateQueries({ queryKey: ['sales-by-cashier'] });
                qc.invalidateQueries({ queryKey: ['products-catalog'] });
                qc.invalidateQueries({ queryKey: ['stock-alerts'] });
                qc.invalidateQueries({ queryKey: ['recent-sales'] });
            } else {
                toast.error(res.error || 'No se pudo anular la venta', 'Error de Anulación');
            }
        } finally {
            setCancellingSaleId(null);
        }
    };

    // Consultas React Query
    const summary = useSalesSummary(range);
    const topProducts = useTopProducts(range, 10);
    const cashiers = useSalesByCashier(range);
    const daily = useDailySales(range);
    const alerts = useStockAlerts();
    const margins = useProfitMargins(range);
    const { data: usersList = [] } = useUsers();
    const { data: consolidatedSales = [], isLoading: loadingConsolidated } = useConsolidatedCashClose(
        range.from,
        range.to,
        selectedCashier
    );

    const isLoading =
        summary.isLoading ||
        topProducts.isLoading ||
        cashiers.isLoading ||
        daily.isLoading ||
        alerts.isLoading ||
        margins.isLoading ||
        loadingConsolidated;

    // 1. Filtrado dinámico e interactivo de ventas consolidadas en tiempo real
    const filteredConsolidatedSales = useMemo(() => {
        return consolidatedSales.filter((s: any) => {
            // A. Forma de Pago
            if (paymentMethodFilter !== 'ALL' && s.payment_method !== paymentMethodFilter) {
                return false;
            }

            // B. Estado de Venta
            if (salesStatusFilter === 'completed' && s.status === 'cancelled') return false;
            if (salesStatusFilter === 'cancelled' && s.status !== 'cancelled') return false;

            // C. Turno / Horario
            if (timeShiftFilter !== 'ALL') {
                const saleDate = new Date(s.created_at);
                const timeInMinutes = saleDate.getHours() * 60 + saleDate.getMinutes();

                if (timeShiftFilter === 'morning') {
                    // Turno Mañana: 06:00 a 14:30
                    if (timeInMinutes < 6 * 60 || timeInMinutes > 14 * 60 + 30) return false;
                } else if (timeShiftFilter === 'afternoon') {
                    // Turno Tarde/Noche: 14:30 a 23:30
                    if (timeInMinutes < 14 * 60 + 30 || timeInMinutes > 23 * 60 + 30) return false;
                } else if (timeShiftFilter === 'custom') {
                    const [startH, startM] = customTimeFrom.split(':').map(Number);
                    const [endH, endM] = customTimeTo.split(':').map(Number);
                    const startMin = (startH || 0) * 60 + (startM || 0);
                    const endMin = (endH || 23) * 60 + (endM || 59);
                    if (timeInMinutes < startMin || timeInMinutes > endMin) return false;
                }
            }

            // D. Búsqueda rápida por texto (Ticket, Cliente, NIT, Cajero)
            if (salesSearchTerm.trim()) {
                const term = salesSearchTerm.toLowerCase();
                const matchId = s.id?.toLowerCase().includes(term);
                const matchClient = s.client_name?.toLowerCase().includes(term);
                const matchNit = s.client_nit?.toLowerCase().includes(term);
                const matchCashier = (s.user_profiles as any)?.full_name?.toLowerCase().includes(term);
                if (!matchId && !matchClient && !matchNit && !matchCashier) return false;
            }

            return true;
        });
    }, [
        consolidatedSales,
        paymentMethodFilter,
        salesStatusFilter,
        timeShiftFilter,
        customTimeFrom,
        customTimeTo,
        salesSearchTerm,
    ]);

    // 2. Resumen agrupado para Auditoría de Cierre de Caja (Reactivo a los filtros)
    const cashCloseSummary = useMemo(() => {
        const sales = filteredConsolidatedSales;
        const completedSales = sales.filter((s: any) => s.status !== 'cancelled');
        const cancelledSales = sales.filter((s: any) => s.status === 'cancelled');

        const totalSalesCents = completedSales.reduce((sum: number, s: any) => sum + s.total_cents, 0);
        const totalTickets = completedSales.length;
        const avgTicketCents = totalTickets > 0 ? Math.round(totalSalesCents / totalTickets) : 0;

        let cashCents = 0;
        let cardCents = 0;
        let qrCents = 0;

        completedSales.forEach((s: any) => {
            if (s.payment_method === 'card') cardCents += s.total_cents;
            else if (s.payment_method === 'qr') qrCents += s.total_cents;
            else cashCents += s.total_cents;
        });

        const cancelledTickets = cancelledSales.length;
        const cancelledCents = cancelledSales.reduce((sum: number, s: any) => sum + s.total_cents, 0);

        // Agrupación por cajero
        const byCashierMap = new Map<
            string,
            {
                name: string;
                tickets: number;
                totalCents: number;
                cashCents: number;
                cardCents: number;
                qrCents: number;
                firstSale: string;
                lastSale: string;
            }
        >();

        completedSales.forEach((s: any) => {
            const userId = s.user_id;
            const userName = (s.user_profiles as any)?.full_name || 'Desconocido';
            const existing = byCashierMap.get(userId) || {
                name: userName,
                tickets: 0,
                totalCents: 0,
                cashCents: 0,
                cardCents: 0,
                qrCents: 0,
                firstSale: s.created_at,
                lastSale: s.created_at,
            };

            existing.tickets += 1;
            existing.totalCents += s.total_cents;
            if (s.payment_method === 'card') existing.cardCents += s.total_cents;
            else if (s.payment_method === 'qr') existing.qrCents += s.total_cents;
            else existing.cashCents += s.total_cents;

            if (new Date(s.created_at) < new Date(existing.firstSale)) existing.firstSale = s.created_at;
            if (new Date(s.created_at) > new Date(existing.lastSale)) existing.lastSale = s.created_at;

            byCashierMap.set(userId, existing);
        });

        const cashierAuditList = Array.from(byCashierMap.entries()).map(([userId, data]) => ({
            userId,
            ...data,
            avgCents: data.tickets > 0 ? Math.round(data.totalCents / data.tickets) : 0,
        }));

        return {
            totalSalesCents,
            totalTickets,
            avgTicketCents,
            cashCents,
            cardCents,
            qrCents,
            cancelledTickets,
            cancelledCents,
            cashierAuditList,
        };
    }, [filteredConsolidatedSales]);

    // 3. Agrupación de ventas dividida por cajeros para auditoría del Administrador
    const cashierGroupsInPage = useMemo(() => {
        const map = new Map<
            string,
            {
                userId: string;
                name: string;
                sales: any[];
                validCount: number;
                cancelledCount: number;
                totalValidCents: number;
                totalCancelledCents: number;
                totalDiscountCents: number;
                cashCents: number;
                cardCents: number;
                qrCents: number;
                firstSale: string;
                lastSale: string;
            }
        >();

        filteredConsolidatedSales.forEach((s: any) => {
            const userId = s.user_id || 'unknown';
            const name = (s.user_profiles as any)?.full_name || 'Cajero de Turno';

            let group = map.get(userId);
            if (!group) {
                group = {
                    userId,
                    name,
                    sales: [],
                    validCount: 0,
                    cancelledCount: 0,
                    totalValidCents: 0,
                    totalCancelledCents: 0,
                    totalDiscountCents: 0,
                    cashCents: 0,
                    cardCents: 0,
                    qrCents: 0,
                    firstSale: s.created_at,
                    lastSale: s.created_at,
                };
                map.set(userId, group);
            }

            group.sales.push(s);

            const isCancelled = s.status === 'cancelled';
            if (isCancelled) {
                group.cancelledCount += 1;
                group.totalCancelledCents += s.total_cents;
            } else {
                group.validCount += 1;
                group.totalValidCents += s.total_cents;
                group.totalDiscountCents += s.discount_cents || 0;
                if (s.payment_method === 'card') group.cardCents += s.total_cents;
                else if (s.payment_method === 'qr') group.qrCents += s.total_cents;
                else group.cashCents += s.total_cents;
            }

            if (new Date(s.created_at) < new Date(group.firstSale)) {
                group.firstSale = s.created_at;
            }
            if (new Date(s.created_at) > new Date(group.lastSale)) {
                group.lastSale = s.created_at;
            }
        });

        return Array.from(map.values()).sort((a, b) => b.totalValidCents - a.totalValidCents);
    }, [filteredConsolidatedSales]);

    // 4. Ventas cronológicas continuas sobre el listado filtrado
    const filteredChronologicalSales = filteredConsolidatedSales;

    // Totales calculados
    const totalProfitCents = useMemo(() => {
        return (margins.data || []).reduce((acc, m) => acc + (m.total_profit_cents || 0), 0);
    }, [margins.data]);

    const lowStockCount = useMemo(() => {
        return (alerts.data || []).filter((a) => a.alert_type === 'low_stock').length;
    }, [alerts.data]);

    const expiringCount = useMemo(() => {
        return (alerts.data || []).filter((a) => a.alert_type !== 'low_stock').length;
    }, [alerts.data]);

    const chartMax = useMemo(() => Math.max(...(daily.data?.map((d) => d.total_cents) || [0])), [daily.data]);
    const chartHeight = 160;

    // Exportadores a Excel / CSV
    const handleExportSalesList = () => {
        if (consolidatedSales.length === 0) {
            toast.info('No hay ventas registradas en el período seleccionado para exportar.');
            return;
        }

        const headers = [
            'ID Ticket',
            'Fecha y Hora Exacta',
            'Cajero Responsable',
            'Cliente',
            'NIT / CI',
            'Método de Pago',
            'Descuento (Bs)',
            'Monto Total (Bs)',
            'Estado',
        ];
        const rows = consolidatedSales.map((s: any) => [
            s.id,
            new Date(s.created_at).toLocaleString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            }),
            (s.user_profiles as any)?.full_name || 'Cajero de Turno',
            s.client_name || 'Público General',
            s.client_nit || 'N/A',
            s.payment_method === 'card' ? 'Tarjeta' : s.payment_method === 'qr' ? 'QR' : 'Efectivo',
            s.discount_cents ? (s.discount_cents / 100).toFixed(2) : '0.00',
            (s.total_cents / 100).toFixed(2),
            s.status === 'cancelled' ? 'ANULADA' : 'COMPLETADA',
        ]);

        exportToCsv({
            filename: `ventas_detalladas_${range.from}_a_${range.to}`,
            headers,
            rows,
        });
        toast.success('Archivo CSV de ventas descargado');
    };

    const handleExportCashiersAudit = () => {
        if (cashCloseSummary.cashierAuditList.length === 0) {
            toast.info('No hay cierres de caja en el período seleccionado.');
            return;
        }

        const headers = [
            'Cajero',
            'Tickets Emitidos',
            'Efectivo (Bs)',
            'Tarjeta (Bs)',
            'QR (Bs)',
            'Total Recaudado (Bs)',
            'Ticket Promedio (Bs)',
            'Primera Venta (Inicio Turno)',
            'Última Venta (Fin Turno)',
        ];
        const rows = cashCloseSummary.cashierAuditList.map((c) => [
            c.name,
            c.tickets,
            (c.cashCents / 100).toFixed(2),
            (c.cardCents / 100).toFixed(2),
            (c.qrCents / 100).toFixed(2),
            (c.totalCents / 100).toFixed(2),
            (c.avgCents / 100).toFixed(2),
            new Date(c.firstSale).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            new Date(c.lastSale).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        ]);

        exportToCsv({
            filename: `cuadre_caja_cajeros_${range.from}_a_${range.to}`,
            headers,
            rows,
        });
        toast.success('Auditoría de cajeros descargada');
    };

    const handleExportTopProducts = () => {
        if (!topProducts.data || topProducts.data.length === 0) {
            toast.info('No hay productos vendidos en el período para exportar.');
            return;
        }

        const headers = ['Ranking', 'Producto', 'SKU', 'Categoría', 'Cantidad Vendida', 'Ingresos (Bs)', 'Margen (%)'];
        const rows = topProducts.data.map((p, i) => [
            i + 1,
            p.name,
            p.sku || 'N/A',
            p.category || 'Sin categoría',
            p.total_quantity,
            (p.total_revenue_cents / 100).toFixed(2),
            `${p.margin_percent}%`,
        ]);

        exportToCsv({
            filename: `top_productos_vendidos_${range.from}_a_${range.to}`,
            headers,
            rows,
        });
        toast.success('Ranking de productos descargado');
    };

    const handleExportMargins = () => {
        if (!margins.data || margins.data.length === 0) {
            toast.info('No hay datos de rentabilidad para exportar.');
            return;
        }

        const headers = [
            'Producto',
            'Categoría',
            'Costo Unitario (Bs)',
            'Precio Venta (Bs)',
            'Margen Unitario (Bs)',
            'Margen (%)',
            'Uds. Vendidas',
            'Ganancia Bruta (Bs)',
        ];
        const rows = margins.data.map((m) => [
            m.name,
            m.category || 'Sin categoría',
            (m.cost_cents / 100).toFixed(2),
            (m.price_cents / 100).toFixed(2),
            (m.margin_cents / 100).toFixed(2),
            `${m.margin_percent}%`,
            m.total_sold,
            (m.total_profit_cents / 100).toFixed(2),
        ]);

        exportToCsv({
            filename: `margen_rentabilidad_${range.from}_a_${range.to}`,
            headers,
            rows,
        });
    };

    const filteredAlerts = useMemo(() => {
        if (!alerts.data) return [];
        if (stockFilter === 'all') return alerts.data;
        if (stockFilter === 'low_stock') return alerts.data.filter((a) => a.alert_type === 'low_stock');
        if (stockFilter === 'expiring') return alerts.data.filter((a) => a.alert_type === 'expiring');
        return alerts.data.filter((a) => a.alert_type === 'expired');
    }, [alerts.data, stockFilter]);

    const getAlertBadgeClass = (type: StockAlert['alert_type']) => {
        switch (type) {
            case 'expired': return 'bg-error-container text-on-error-container border border-error/30';
            case 'expiring': return 'bg-amber-100 text-amber-900 border border-amber-200';
            case 'low_stock': return 'bg-error-container/60 text-on-error-container border border-error/20';
            default: return 'bg-surface-container text-on-surface-variant';
        }
    };

    const getMarginBadgeClass = (percent: number) => {
        if (percent >= 35) return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
        if (percent >= 20) return 'bg-blue-100 text-blue-800 border border-blue-200';
        if (percent >= 10) return 'bg-amber-100 text-amber-800 border border-amber-200';
        return 'bg-error-container text-on-error-container border border-error/20';
    };

    const selectedCashierName = useMemo(() => {
        if (selectedCashier === 'ALL') return 'Todos los Cajeros';
        const found = usersList.find((u: any) => u.id === selectedCashier);
        return found ? found.full_name || found.id.slice(0, 8) : 'Cajero Seleccionado';
    }, [selectedCashier, usersList]);

    if (!canView) {
        return (
            <div className="p-12 max-w-xl mx-auto my-12 text-center bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-error">lock</span>
                <h2 className="text-lg font-bold text-on-surface">Acceso Restringido a Reportes</h2>
                <p className="text-xs text-secondary">
                    Tu rol actual no tiene asignado el permiso <span className="font-mono font-bold text-on-surface">reports:view</span> para consultar analíticas y reportes financieros.
                </p>
            </div>
        );
    }

    return (
        <div className="p-3 sm:p-6 max-w-7xl mx-auto flex flex-col gap-6 font-sans">
            {/* ==============================================================================
                1. HEADER SECTION CON HIERARCHY PROFUNDA & ACTION TOOLBAR
               ============================================================================== */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm">
                <div className="flex flex-col gap-1 max-w-3xl">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                            Módulo Analítico Avanzado
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
                        <span className="font-mono text-[11px] text-secondary">
                            PharmaCore ERP Clinical
                        </span>
                    </div>
                    <h1 className="text-2xl lg:text-3xl font-extrabold text-on-surface tracking-tight">
                        Centro de Reportes & Analítica Farmacéutica
                    </h1>
                    <p className="text-xs lg:text-sm text-secondary">
                        Consolidado financiero, ventas en punto de venta (POS), rotación de stock clínico y cuadre de turnos para auditoría y toma de decisiones.
                    </p>
                </div>

                {/* Filtros & Barra de Acciones */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2 xl:pt-0">
                    {/* Rango de Fechas */}
                    <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container shadow-sm">
                        <span className="material-symbols-outlined text-[17px] text-secondary">calendar_today</span>
                        <input
                            type="date"
                            value={range.from}
                            onChange={(e) => setRange({ ...range, from: e.target.value })}
                            className="bg-transparent text-on-surface text-xs font-mono font-semibold focus:outline-none cursor-pointer"
                        />
                        <span className="text-secondary text-xs font-mono">-</span>
                        <input
                            type="date"
                            value={range.to}
                            onChange={(e) => setRange({ ...range, to: e.target.value })}
                            className="bg-transparent text-on-surface text-xs font-mono font-semibold focus:outline-none cursor-pointer"
                        />
                    </div>

                    {/* Presets Rápidos */}
                    <div className="flex bg-surface-container-low p-1 rounded-xl border border-surface-container">
                        {(['today', 'week', 'month', 'year'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPreset(p)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg hover:bg-surface-container text-on-surface transition-colors cursor-pointer"
                            >
                                {p === 'today' ? 'Hoy' : p === 'week' ? '7D' : p === 'month' ? '30D' : 'Año'}
                            </button>
                        ))}
                    </div>

                    {/* Selector de Cajero */}
                    <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container shadow-sm">
                        <span className="material-symbols-outlined text-[17px] text-secondary">storefront</span>
                        <select
                            value={selectedCashier}
                            onChange={(e) => setSelectedCashier(e.target.value)}
                            className="bg-transparent text-on-surface text-xs font-semibold focus:outline-none cursor-pointer"
                        >
                            <option value="ALL">Todos los Cajeros ({usersList.length})</option>
                            {usersList.map((u: any) => (
                                <option key={u.id} value={u.id}>
                                    {u.full_name || u.id.slice(0, 8)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Botón Exportar PDF Oficial */}
                    {canExport && (
                        <button
                            type="button"
                            onClick={() => setPdfModalType('sales_list')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
                            title="Generar e imprimir Planilla Detallada de Ventas en PDF (ticket por ticket)"
                        >
                            <span className="material-symbols-outlined text-[18px]">table_view</span>
                            <span>Planilla de Ventas</span>
                            <span className="font-mono text-[10px] bg-primary-fixed/20 text-primary-fixed px-1.5 py-0.5 rounded font-bold">
                                PDF
                            </span>
                        </button>
                    )}

                    {/* Dropdown Exportar Reportes (PDF y CSV) */}
                    {canExport && (
                        <div className="relative" ref={exportMenuRef}>
                            <button
                                type="button"
                                onClick={() => setIsExportMenuOpen((prev) => !prev)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs shadow-sm transition-all cursor-pointer ${
                                    isExportMenuOpen
                                        ? 'bg-primary/10 text-primary border border-primary/30 ring-1 ring-primary/20'
                                        : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
                                }`}
                                title="Opciones de exportación en PDF y formato Excel / CSV"
                            >
                                <span className="material-symbols-outlined text-[17px] text-primary">ios_share</span>
                                <span>Exportar Reportes</span>
                                <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${
                                    isExportMenuOpen ? 'rotate-180 text-primary' : 'text-secondary'
                                }`}>
                                    expand_more
                                </span>
                            </button>

                            {isExportMenuOpen && (
                                <div className="absolute right-0 top-full mt-1.5 w-72 bg-surface-container-lowest rounded-2xl shadow-2xl border border-surface-container p-2 z-40 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary border-b border-surface-container mb-1.5 flex justify-between items-center">
                                        <span>Reportes Oficiales</span>
                                        <span className="text-primary font-mono font-bold">PDF / CSV</span>
                                    </div>

                                    {/* Opción 1: Planilla de Ventas */}
                                    <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-surface-container-low transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 pr-1">
                                            <span className="material-symbols-outlined text-[17px] text-primary shrink-0">table_view</span>
                                            <div className="truncate">
                                                <span className="text-xs font-semibold text-on-surface block truncate">Planilla de Ventas</span>
                                                <span className="text-[10px] text-secondary block truncate">Ticket por ticket</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    setPdfModalType('sales_list');
                                                }}
                                                className="px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[10px] cursor-pointer"
                                                title="Ver e imprimir en PDF"
                                            >
                                                PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    handleExportSalesList();
                                                }}
                                                className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface font-semibold text-[10px] cursor-pointer"
                                                title="Descargar archivo CSV"
                                            >
                                                CSV
                                            </button>
                                        </div>
                                    </div>

                                    {/* Opción 2: Cuadre de Cajeros */}
                                    <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-surface-container-low transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 pr-1">
                                            <span className="material-symbols-outlined text-[17px] text-secondary shrink-0">badge</span>
                                            <div className="truncate">
                                                <span className="text-xs font-semibold text-on-surface block truncate">Cuadre de Cajeros</span>
                                                <span className="text-[10px] text-secondary block truncate">Turnos y arqueo</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    setPdfModalType('cash_audit');
                                                }}
                                                className="px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[10px] cursor-pointer"
                                                title="Ver e imprimir en PDF"
                                            >
                                                PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    handleExportCashiersAudit();
                                                }}
                                                className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface font-semibold text-[10px] cursor-pointer"
                                                title="Descargar archivo CSV"
                                            >
                                                CSV
                                            </button>
                                        </div>
                                    </div>

                                    {/* Opción 3: Ranking de Productos */}
                                    <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-surface-container-low transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 pr-1">
                                            <span className="material-symbols-outlined text-[17px] text-primary shrink-0">inventory</span>
                                            <div className="truncate">
                                                <span className="text-xs font-semibold text-on-surface block truncate">Ranking Productos</span>
                                                <span className="text-[10px] text-secondary block truncate">Rotación y volumen</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    setPdfModalType('top_products');
                                                }}
                                                className="px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[10px] cursor-pointer"
                                                title="Ver e imprimir en PDF"
                                            >
                                                PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    handleExportTopProducts();
                                                }}
                                                className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface font-semibold text-[10px] cursor-pointer"
                                                title="Descargar archivo CSV"
                                            >
                                                CSV
                                            </button>
                                        </div>
                                    </div>

                                    {/* Opción 4: Análisis de Márgenes */}
                                    <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-surface-container-low transition-colors">
                                        <div className="flex items-center gap-2 min-w-0 pr-1">
                                            <span className="material-symbols-outlined text-[17px] text-emerald-700 shrink-0">query_stats</span>
                                            <div className="truncate">
                                                <span className="text-xs font-semibold text-on-surface block truncate">Análisis Márgenes</span>
                                                <span className="text-[10px] text-secondary block truncate">Rentabilidad</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    setPdfModalType('margins');
                                                }}
                                                className="px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[10px] cursor-pointer"
                                                title="Ver e imprimir en PDF"
                                            >
                                                PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsExportMenuOpen(false);
                                                    handleExportMargins();
                                                }}
                                                className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface font-semibold text-[10px] cursor-pointer"
                                                title="Descargar archivo CSV"
                                            >
                                                CSV
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ==============================================================================
                2. PRIMARY METRIC CARDS (4-GRID DENSITY)
               ============================================================================== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1: Ingresos Totales */}
                <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="text-[11px] font-bold uppercase text-secondary tracking-wider">
                                Ingresos Totales Netos
                            </span>
                            <div className="text-2xl font-black font-mono text-on-surface mt-1">
                                {summary.data ? formatBs(summary.data.total_sales_cents) : 'Bs 0.00'}
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined text-[22px]">payments</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 bg-surface-container-low/60 p-2.5 rounded-xl border border-surface-container/50">
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-secondary font-medium">Ventas Brutas:</span>
                            <span className="font-mono font-semibold text-on-surface">
                                {summary.data ? formatBs(summary.data.gross_sales_cents) : 'Bs 0.00'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-secondary font-medium">Descuentos Aplicados:</span>
                            <span className="font-mono font-bold text-rose-600">
                                {summary.data && summary.data.total_discount_cents > 0
                                    ? `-${formatBs(summary.data.total_discount_cents)}`
                                    : 'Bs 0.00'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* KPI 2: Ventas POS & Tickets */}
                <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="text-[11px] font-bold uppercase text-secondary tracking-wider">
                                Ventas POS & Tickets
                            </span>
                            <div className="text-2xl font-black font-mono text-on-surface mt-1">
                                {summary.data ? summary.data.total_tickets.toLocaleString() : '0'}{' '}
                                <span className="text-xs font-normal text-secondary">tickets</span>
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-secondary">
                            <span className="material-symbols-outlined text-[22px]">receipt_long</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 bg-surface-container-low/60 p-2.5 rounded-xl border border-surface-container/50">
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-secondary font-medium">Ticket Promedio:</span>
                            <span className="font-mono font-bold text-on-surface">
                                {summary.data ? formatBs(summary.data.avg_ticket_cents) : 'Bs 0.00'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-secondary font-medium">Items Dispensados:</span>
                            <span className="font-mono font-semibold text-primary">
                                {summary.data ? `${summary.data.total_items_sold} uds` : '0 uds'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* KPI 3: Alertas de Stock & Merma */}
                <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="text-[11px] font-bold uppercase text-secondary tracking-wider">
                                Alertas de Inventario
                            </span>
                            <div className="text-2xl font-black font-mono text-on-surface mt-1">
                                {(alerts.data?.length || 0).toLocaleString()}{' '}
                                <span className="text-xs font-normal text-secondary">críticas</span>
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-error-container/40 flex items-center justify-center text-error">
                            <span className="material-symbols-outlined text-[22px]">auto_delete</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 bg-surface-container-low/60 p-2.5 rounded-xl border border-surface-container/50">
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-secondary font-medium">Bajo Stock Mínimo:</span>
                            <span className="font-mono font-bold text-amber-700">{lowStockCount} prods</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-secondary font-medium">Por Vencer o Vencidos:</span>
                            <span className="font-mono font-bold text-error">{expiringCount} prods</span>
                        </div>
                    </div>
                </div>

                {/* KPI 4: Rentabilidad / Desglose de Pagos */}
                <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <span className="text-[11px] font-bold uppercase text-secondary tracking-wider">
                                Ganancia Bruta Operativa
                            </span>
                            <div className="text-2xl font-black font-mono text-emerald-800 mt-1">
                                {formatBs(totalProfitCents)}
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-700">
                            <span className="material-symbols-outlined text-[22px]">query_stats</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 bg-surface-container-low/60 p-2.5 rounded-xl border border-surface-container/50">
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-secondary font-medium">Efectivo en Caja:</span>
                            <span className="font-mono font-semibold text-on-surface">
                                {formatBs(cashCloseSummary.cashCents)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-secondary font-medium">Tarjetas & QR:</span>
                            <span className="font-mono font-semibold text-primary">
                                {formatBs(cashCloseSummary.cardCents + cashCloseSummary.qrCents)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ==============================================================================
                3. SUB-TAB NAVIGATION BAR
               ============================================================================== */}
            <div className="flex items-center gap-1.5 bg-surface-container-lowest p-1.5 rounded-2xl border border-surface-container shadow-sm overflow-x-auto">
                <button
                    type="button"
                    onClick={() => setActiveTab('general')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === 'general'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-secondary hover:text-on-surface hover:bg-surface-container-low'
                    }`}
                >
                    <span className="material-symbols-outlined text-[17px]">analytics</span>
                    <span>Todos los Reportes (General)</span>
                </button>

                {canCashClose && (
                    <button
                        type="button"
                        onClick={() => setActiveTab('cash_close')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                            activeTab === 'cash_close'
                                ? 'bg-primary text-on-primary shadow-sm'
                                : 'text-secondary hover:text-on-surface hover:bg-surface-container-low'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[17px]">point_of_sale</span>
                        <span>Corte de Caja y Ventas POS</span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setActiveTab('margins')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === 'margins'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-secondary hover:text-on-surface hover:bg-surface-container-low'
                    }`}
                >
                    <span className="material-symbols-outlined text-[17px]">query_stats</span>
                    <span>Margen y Rentabilidad</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('stock_audit')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap cursor-pointer ${
                        activeTab === 'stock_audit'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-secondary hover:text-on-surface hover:bg-surface-container-low'
                    }`}
                >
                    <span className="material-symbols-outlined text-[17px]">inventory_2</span>
                    <span>Rotación y Alertas de Stock</span>
                </button>
            </div>

            {isLoading && (
                <div className="p-3 text-center text-xs text-secondary animate-pulse bg-surface-container-low/50 rounded-xl">
                    Actualizando datos analíticos y consolidando registros en tiempo real...
                </div>
            )}

            {/* ==============================================================================
                4. VISTA 1: TODOS LOS REPORTES (GENERAL) (65% / 35% SPLIT)
               ============================================================================== */}
            {activeTab === 'general' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* COLUMNA IZQUIERDA (65% -> 8 cols) */}
                    <div className="lg:col-span-8 flex flex-col gap-6">
                        {/* CARD 1: DESEMPEÑO DE VENTAS Y TENDENCIA DIARIA */}
                        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <h2 className="text-base font-bold text-on-surface">
                                        Desempeño de Ventas y Tendencia Diaria
                                    </h2>
                                    <p className="text-xs text-secondary">
                                        Ingresos diarios consolidados y volumen de tickets en el período
                                    </p>
                                </div>
                                <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
                                    {daily.data?.length || 0} Días Analizados
                                </span>
                            </div>

                            {/* Visualizador de Barras Interactivas */}
                            <div className="w-full bg-surface-container-low/40 p-4 rounded-xl border border-surface-container/60 flex flex-col gap-2">
                                <div className="h-44 w-full flex items-end justify-between gap-2 pt-4 px-2 overflow-x-auto">
                                    {daily.data && daily.data.length > 0 ? (
                                        daily.data.map((day) => {
                                            const height = chartMax > 0 ? (day.total_cents / chartMax) * chartHeight : 0;
                                            return (
                                                <div
                                                    key={day.date}
                                                    className="flex-1 flex flex-col items-center gap-1.5 min-w-[38px] group cursor-pointer"
                                                    title={`${formatDate(day.date)}: ${formatBs(day.total_cents)} (${day.tickets} tickets)`}
                                                >
                                                    <div className="w-full flex justify-center items-end h-[160px]">
                                                        <div
                                                            className="w-full max-w-[28px] rounded-t transition-all duration-300 group-hover:bg-primary group-hover:scale-105"
                                                            style={{
                                                                height: `${Math.max(height, 6)}px`,
                                                                backgroundColor: height > 0 ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
                                                                opacity: height > 0 ? 0.9 : 0.3,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] text-secondary font-mono group-hover:text-primary font-bold">
                                                        {day.date.split('-')[2]}
                                                    </span>
                                                    <span className="text-[9px] text-secondary font-mono opacity-70">
                                                        {day.tickets}tkt
                                                    </span>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs text-secondary">
                                            Sin registros de ventas en el período seleccionado.
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center justify-between text-secondary pt-2 border-t border-surface-container text-xs font-mono">
                                    <span>Volumen Total: {summary.data ? formatBs(summary.data.total_sales_cents) : 'Bs 0.00'}</span>
                                    <span className="text-primary font-semibold">Máx Diario: {formatBs(chartMax)}</span>
                                </div>
                            </div>
                        </div>

                        {/* CARD 2: TOP 10 MEDICAMENTOS CON MAYOR RENDIMIENTO */}
                        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-base font-bold text-on-surface">
                                        Top 10 Medicamentos con Mayor Rotación
                                    </h2>
                                    <p className="text-xs text-secondary">
                                        Ranking por volumen de unidades dispensadas y margen comercial
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleExportTopProducts}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-primary transition-colors border border-surface-container cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[15px]">download</span>
                                    <span>Exportar Top</span>
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-surface-container-low text-secondary font-bold text-[11px] uppercase tracking-wider h-9 border-b border-surface-container">
                                            <th className="px-4 font-semibold text-center w-10">#</th>
                                            <th className="px-4 font-semibold">SKU / Clave</th>
                                            <th className="px-4 font-semibold">Medicamento y Presentación</th>
                                            <th className="px-4 font-semibold">Categoría</th>
                                            <th className="px-4 font-semibold text-right">Uds.</th>
                                            <th className="px-4 font-semibold text-right">Ingreso</th>
                                            <th className="px-4 font-semibold text-center">Margen</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-surface-container text-xs">
                                        {topProducts.data && topProducts.data.length > 0 ? (
                                            topProducts.data.map((p, i) => (
                                                <tr key={p.product_id} className="hover:bg-surface-bright h-11 transition-colors">
                                                    <td className="px-4 text-center font-bold text-primary font-mono">{i + 1}</td>
                                                    <td className="px-4 font-mono text-secondary text-[11px]">{p.sku || '-'}</td>
                                                    <td className="px-4 font-bold text-on-surface truncate max-w-[220px]">
                                                        {p.name}
                                                    </td>
                                                    <td className="px-4 text-secondary">{p.category || 'General'}</td>
                                                    <td className="px-4 font-mono text-secondary text-right font-semibold">
                                                        {p.total_quantity}
                                                    </td>
                                                    <td className="px-4 font-mono font-bold text-on-surface text-right">
                                                        {formatBs(p.total_revenue_cents)}
                                                    </td>
                                                    <td className="px-4 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getMarginBadgeClass(p.margin_percent)}`}>
                                                            {p.margin_percent}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={7} className="text-center py-8 text-secondary">
                                                    Sin ventas registradas en el período seleccionado.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* COLUMNA DERECHA (35% -> 4 cols) */}
                    <div className="lg:col-span-4 flex flex-col gap-6">
                        {/* CARD 1: CIERRES Y ARQUEOS (POS) - CONCILIACIÓN DE MÉTODOS DE PAGO */}
                        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-base font-bold text-on-surface">Cierres y Arqueos (POS)</h2>
                                    <p className="text-xs text-secondary">Desglose de recaudación por vía de cobro</p>
                                </div>
                                <span className="material-symbols-outlined text-secondary text-[22px]">
                                    account_balance_wallet
                                </span>
                            </div>

                            {/* Desglose de Pagos */}
                            <div className="flex flex-col gap-2.5">
                                {/* Efectivo */}
                                <div className="bg-surface-container-low p-3.5 rounded-xl flex flex-col gap-1.5 border border-surface-container/60">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-emerald-800 flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[16px] text-primary">payments</span>
                                            Efectivo en Caja Chica
                                        </span>
                                        <span className="font-mono font-bold text-on-surface">
                                            {formatBs(cashCloseSummary.cashCents)}
                                        </span>
                                    </div>
                                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="bg-primary h-full rounded-full transition-all"
                                            style={{
                                                width: `${
                                                    cashCloseSummary.totalSalesCents > 0
                                                        ? (cashCloseSummary.cashCents / cashCloseSummary.totalSalesCents) * 100
                                                        : 0
                                                }%`,
                                            }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-mono text-secondary text-right">
                                        {cashCloseSummary.totalSalesCents > 0
                                            ? `${Math.round((cashCloseSummary.cashCents / cashCloseSummary.totalSalesCents) * 100)}% del total`
                                            : '0%'}
                                    </span>
                                </div>

                                {/* Tarjeta */}
                                <div className="bg-surface-container-low p-3.5 rounded-xl flex flex-col gap-1.5 border border-surface-container/60">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-blue-800 flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[16px] text-blue-700">credit_card</span>
                                            Terminal Bancaria (POS)
                                        </span>
                                        <span className="font-mono font-bold text-on-surface">
                                            {formatBs(cashCloseSummary.cardCents)}
                                        </span>
                                    </div>
                                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="bg-blue-600 h-full rounded-full transition-all"
                                            style={{
                                                width: `${
                                                    cashCloseSummary.totalSalesCents > 0
                                                        ? (cashCloseSummary.cardCents / cashCloseSummary.totalSalesCents) * 100
                                                        : 0
                                                }%`,
                                            }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-mono text-secondary text-right">
                                        {cashCloseSummary.totalSalesCents > 0
                                            ? `${Math.round((cashCloseSummary.cardCents / cashCloseSummary.totalSalesCents) * 100)}% del total`
                                            : '0%'}
                                    </span>
                                </div>

                                {/* QR */}
                                <div className="bg-surface-container-low p-3.5 rounded-xl flex flex-col gap-1.5 border border-surface-container/60">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-purple-800 flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[16px] text-purple-700">qr_code_2</span>
                                            Transferencias QR / SPEI
                                        </span>
                                        <span className="font-mono font-bold text-on-surface">
                                            {formatBs(cashCloseSummary.qrCents)}
                                        </span>
                                    </div>
                                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="bg-purple-600 h-full rounded-full transition-all"
                                            style={{
                                                width: `${
                                                    cashCloseSummary.totalSalesCents > 0
                                                        ? (cashCloseSummary.qrCents / cashCloseSummary.totalSalesCents) * 100
                                                        : 0
                                                }%`,
                                            }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-mono text-secondary text-right">
                                        {cashCloseSummary.totalSalesCents > 0
                                            ? `${Math.round((cashCloseSummary.qrCents / cashCloseSummary.totalSalesCents) * 100)}% del total`
                                            : '0%'}
                                    </span>
                                </div>
                            </div>

                            {/* Alerta de Anulación si existe */}
                            {cashCloseSummary.cancelledTickets > 0 && (
                                <div className="p-3 rounded-xl bg-error-container/30 border border-error/20 flex items-center justify-between text-xs text-on-error-container">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[18px] text-error">info</span>
                                        <span>{cashCloseSummary.cancelledTickets} venta(s) anulada(s)</span>
                                    </div>
                                    <span className="font-mono font-bold text-error">
                                        -{formatBs(cashCloseSummary.cancelledCents)}
                                    </span>
                                </div>
                            )}

                            {canCashClose && (
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('cash_close')}
                                    className="w-full py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[17px] text-secondary">badge</span>
                                    <span>Ver Bitácora Detallada de Turnos</span>
                                </button>
                            )}
                        </div>

                        {/* CARD 2: VENTAS POR CAJERO */}
                        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-on-surface">Ventas por Cajero</h2>
                                <span className="text-[11px] text-secondary font-mono">Consolidado</span>
                            </div>
                            <div className="divide-y divide-surface-container max-h-56 overflow-y-auto">
                                {cashiers.data && cashiers.data.length > 0 ? (
                                    cashiers.data.map((c) => (
                                        <div
                                            key={c.user_id}
                                            className="py-2.5 flex justify-between items-center text-xs hover:bg-surface-bright px-1 rounded-lg transition-colors"
                                        >
                                            <div className="min-w-0">
                                                <span className="font-bold text-on-surface truncate block">{c.cashier_name}</span>
                                                <span className="text-[11px] text-secondary font-mono">{c.total_tickets} tickets</span>
                                            </div>
                                            <div className="text-right ml-3">
                                                <div className="font-mono font-bold text-on-surface">{formatBs(c.total_sales_cents)}</div>
                                                <div className="text-[10px] text-secondary font-mono">{formatBs(c.avg_ticket_cents)} / tkt</div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-6 text-center text-xs text-secondary">
                                        Sin ventas por cajero en el período
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* CARD 3: ALERTAS URGENTES DE INVENTARIO */}
                        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-error text-[18px]">warning</span>
                                    <h2 className="text-sm font-bold text-on-surface">Alertas Críticas</h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('stock_audit')}
                                    className="text-[11px] font-bold text-primary hover:underline"
                                >
                                    Ver todas ({alerts.data?.length || 0})
                                </button>
                            </div>
                            <div className="divide-y divide-surface-container max-h-48 overflow-y-auto">
                                {alerts.data && alerts.data.length > 0 ? (
                                    alerts.data.slice(0, 5).map((a) => (
                                        <div key={a.id} className="py-2 flex justify-between items-center text-xs">
                                            <div className="min-w-0 pr-2">
                                                <span className="font-bold text-on-surface truncate block">{a.name}</span>
                                                <span className="text-[10px] text-secondary font-mono">
                                                    Stock: {a.stock} / Mín: {a.min_stock}
                                                </span>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${getAlertBadgeClass(a.alert_type)}`}>
                                                {a.alert_type === 'low_stock' ? 'Bajo Stock' : a.alert_type === 'expiring' ? 'Por Vencer' : 'Vencido'}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-6 text-center text-xs text-secondary">
                                        Sin alertas críticas registradas.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ==============================================================================
                5. VISTA 2: CORTE DE CAJA Y VENTAS POS (AUDITORÍA DE TURNOS)
               ============================================================================== */}
            {activeTab === 'cash_close' && (
                <div className="flex flex-col gap-6">
                    {/* Panel Maestro de Filtros Interactivos para Turnos y Ventas */}
                    <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col gap-3.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-container pb-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[20px] text-primary">tune</span>
                                <div>
                                    <h2 className="text-sm font-bold text-on-surface">
                                        Filtros Interactivos de Turnos & Auditoría
                                    </h2>
                                    <p className="text-[11px] text-secondary">
                                        Filtra en tiempo real por cajero, método de pago, estado o franja horaria para auditar el arqueo.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {activeFiltersCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleResetAllFilters}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs border border-rose-200 transition-colors cursor-pointer"
                                        title="Restablecer todos los filtros a sus valores predeterminados"
                                    >
                                        <span className="material-symbols-outlined text-[15px]">restart_alt</span>
                                        <span>Limpiar Filtros ({activeFiltersCount})</span>
                                    </button>
                                )}
                                <span className="text-xs font-mono font-semibold bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container text-secondary">
                                    Ventas: <strong className="text-primary">{filteredConsolidatedSales.length}</strong> / {consolidatedSales.length}
                                </span>
                            </div>
                        </div>

                        {/* Controles Fila 1: Cajero, Método de Pago, Estado */}
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Selector de Cajero */}
                                <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1.5 rounded-xl border border-surface-container">
                                    <span className="material-symbols-outlined text-[16px] text-primary">badge</span>
                                    <span className="text-secondary font-medium text-[11px]">Cajero:</span>
                                    <select
                                        value={selectedCashier}
                                        onChange={(e) => setSelectedCashier(e.target.value)}
                                        className="bg-transparent text-on-surface text-xs font-semibold focus:outline-none cursor-pointer max-w-[180px] truncate"
                                    >
                                        <option value="ALL">Todos los Cajeros ({usersList.length})</option>
                                        {usersList.map((u: any) => (
                                            <option key={u.id} value={u.id}>
                                                {u.full_name || u.id.slice(0, 8)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Chips Método de Pago */}
                                <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-surface-container">
                                    <span className="text-secondary font-medium text-[11px] px-1.5">Pago:</span>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('ALL')}
                                        className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                            paymentMethodFilter === 'ALL'
                                                ? 'bg-primary text-on-primary shadow-xs'
                                                : 'text-secondary hover:text-on-surface'
                                        }`}
                                    >
                                        Todos
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('cash')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                            paymentMethodFilter === 'cash'
                                                ? 'bg-emerald-700 text-white shadow-xs'
                                                : 'text-emerald-700 hover:bg-emerald-50'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[14px]">payments</span>
                                        <span>Efectivo</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('card')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                            paymentMethodFilter === 'card'
                                                ? 'bg-blue-700 text-white shadow-xs'
                                                : 'text-blue-700 hover:bg-blue-50'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[14px]">credit_card</span>
                                        <span>Tarjeta</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('qr')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                            paymentMethodFilter === 'qr'
                                                ? 'bg-purple-700 text-white shadow-xs'
                                                : 'text-purple-700 hover:bg-purple-50'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[14px]">qr_code_2</span>
                                        <span>QR</span>
                                    </button>
                                </div>
                            </div>

                            {/* Chips Estado de Venta */}
                            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-surface-container">
                                <span className="text-secondary font-medium text-[11px] px-1.5">Estado:</span>
                                <button
                                    type="button"
                                    onClick={() => setSalesStatusFilter('all')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                        salesStatusFilter === 'all'
                                            ? 'bg-primary text-on-primary shadow-xs'
                                            : 'text-secondary hover:text-on-surface'
                                    }`}
                                >
                                    Todos
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSalesStatusFilter('completed')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                        salesStatusFilter === 'completed'
                                            ? 'bg-emerald-700 text-white shadow-xs'
                                            : 'text-emerald-700 hover:bg-emerald-50'
                                    }`}
                                >
                                    Válidos
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSalesStatusFilter('cancelled')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                        salesStatusFilter === 'cancelled'
                                            ? 'bg-rose-700 text-white shadow-xs'
                                            : 'text-rose-700 hover:bg-rose-50'
                                    }`}
                                >
                                    Anulados
                                </button>
                            </div>
                        </div>

                        {/* Controles Fila 2: Turnos/Horarios */}
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-surface-container/60">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Chips Turnos */}
                                <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-surface-container">
                                    <span className="material-symbols-outlined text-[16px] text-secondary ml-1.5">schedule</span>
                                    <span className="text-secondary font-medium text-[11px] px-1">Turno:</span>
                                    <button
                                        type="button"
                                        onClick={() => setTimeShiftFilter('ALL')}
                                        className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                            timeShiftFilter === 'ALL'
                                                ? 'bg-primary text-on-primary shadow-xs'
                                                : 'text-secondary hover:text-on-surface'
                                        }`}
                                    >
                                        Todo el Día
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTimeShiftFilter('morning')}
                                        className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                            timeShiftFilter === 'morning'
                                                ? 'bg-amber-600 text-white shadow-xs'
                                                : 'text-amber-700 hover:bg-amber-50'
                                        }`}
                                        title="Turno Mañana: 06:00 a 14:30"
                                    >
                                        ☀️ Mañana (06:00 - 14:30)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTimeShiftFilter('afternoon')}
                                        className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                            timeShiftFilter === 'afternoon'
                                                ? 'bg-indigo-700 text-white shadow-xs'
                                                : 'text-indigo-700 hover:bg-indigo-50'
                                        }`}
                                        title="Turno Tarde/Noche: 14:30 a 23:30"
                                    >
                                        🌙 Tarde (14:30 - 23:30)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTimeShiftFilter('custom')}
                                        className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                            timeShiftFilter === 'custom'
                                                ? 'bg-primary text-on-primary shadow-xs'
                                                : 'text-secondary hover:text-on-surface'
                                        }`}
                                    >
                                        Personalizado
                                    </button>
                                </div>

                                {timeShiftFilter === 'custom' && (
                                    <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-1 rounded-xl border border-surface-container">
                                        <span className="text-[11px] text-secondary font-mono">De</span>
                                        <input
                                            type="time"
                                            value={customTimeFrom}
                                            onChange={(e) => setCustomTimeFrom(e.target.value)}
                                            className="bg-transparent text-on-surface text-xs font-mono font-bold focus:outline-none cursor-pointer"
                                        />
                                        <span className="text-[11px] text-secondary font-mono">a</span>
                                        <input
                                            type="time"
                                            value={customTimeTo}
                                            onChange={(e) => setCustomTimeTo(e.target.value)}
                                            className="bg-transparent text-on-surface text-xs font-mono font-bold focus:outline-none cursor-pointer"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Acceso rápido a Planilla PDF */}
                            <button
                                type="button"
                                onClick={() => setPdfModalType('sales_list')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer ml-auto"
                                title="Generar e imprimir Planilla Oficial en PDF con estos filtros"
                            >
                                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                <span>Ver Planilla PDF</span>
                            </button>
                        </div>
                    </div>

                    {/* Tarjetas de Resumen de Turnos y Métodos de Pago */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-surface-container flex flex-col justify-between shadow-sm">
                            <span className="text-xs font-bold uppercase text-primary tracking-wider">Total Recaudado</span>
                            <div className="mt-2 flex items-baseline gap-1">
                                <span className="text-2xl font-black font-mono text-primary">
                                    {formatBs(cashCloseSummary.totalSalesCents)}
                                </span>
                            </div>
                            <span className="text-xs text-secondary mt-1">{cashCloseSummary.totalTickets} ventas válidas</span>
                        </div>

                        <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col justify-between shadow-sm">
                            <div className="flex items-center justify-between text-emerald-800 text-xs font-bold uppercase tracking-wider">
                                <span>Cobros en Efectivo</span>
                                <span className="material-symbols-outlined text-[18px]">payments</span>
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                                <span className="text-2xl font-black font-mono text-emerald-950">
                                    {formatBs(cashCloseSummary.cashCents)}
                                </span>
                            </div>
                            <span className="text-xs text-emerald-700 mt-1">Caja chica</span>
                        </div>

                        <div className="p-5 rounded-2xl bg-blue-50 border border-blue-200 flex flex-col justify-between shadow-sm">
                            <div className="flex items-center justify-between text-blue-800 text-xs font-bold uppercase tracking-wider">
                                <span>Cobros con Tarjeta</span>
                                <span className="material-symbols-outlined text-[18px]">credit_card</span>
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                                <span className="text-2xl font-black font-mono text-blue-950">
                                    {formatBs(cashCloseSummary.cardCents)}
                                </span>
                            </div>
                            <span className="text-xs text-blue-700 mt-1">POS bancario</span>
                        </div>

                        <div className="p-5 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col justify-between shadow-sm">
                            <div className="flex items-center justify-between text-purple-800 text-xs font-bold uppercase tracking-wider">
                                <span>Cobros con QR</span>
                                <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
                            </div>
                            <div className="mt-2 flex items-baseline gap-1">
                                <span className="text-2xl font-black font-mono text-purple-950">
                                    {formatBs(cashCloseSummary.qrCents)}
                                </span>
                            </div>
                            <span className="text-xs text-purple-700 mt-1">Transferencias QR</span>
                        </div>
                    </div>

                    {/* Alerta de Anuladas si existen */}
                    {cashCloseSummary.cancelledTickets > 0 && (
                        <div className="p-4 rounded-2xl bg-error-container text-on-error-container flex items-center justify-between border border-error/20">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-2xl">error</span>
                                <div>
                                    <span className="font-bold text-sm block">
                                        {cashCloseSummary.cancelledTickets} Venta(s) Anulada(s) en este período
                                    </span>
                                    <span className="text-xs opacity-90">
                                        Estas ventas han sido excluidas de los totales de recaudación y el stock fue repuesto en el inventario.
                                    </span>
                                </div>
                            </div>
                            <span className="text-lg font-mono font-bold">
                                -{formatBs(cashCloseSummary.cancelledCents)}
                            </span>
                        </div>
                    )}

                    {/* Tabla de Cuadre por Cajero con Desglose */}
                    <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container overflow-hidden">
                        <div className="p-5 border-b border-surface-container flex justify-between items-center">
                            <div>
                                <h2 className="text-base font-bold text-on-surface">Cuadre Consolidado por Cajero</h2>
                                <p className="text-xs text-secondary">Desglose de recaudación y formas de pago por cada operador</p>
                            </div>
                            <button
                                onClick={handleExportCashiersAudit}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-primary transition-colors border border-surface-container cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">download</span>
                                <span>Exportar Cuadre</span>
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-surface-container-low text-secondary font-bold text-xs uppercase tracking-wider h-10 border-b border-surface-container">
                                        <th className="px-5 font-semibold">Cajero</th>
                                        <th className="px-5 font-semibold text-center">Tickets</th>
                                        <th className="px-5 font-semibold text-right">Efectivo</th>
                                        <th className="px-5 font-semibold text-right">Tarjeta</th>
                                        <th className="px-5 font-semibold text-right">QR</th>
                                        <th className="px-5 font-semibold text-right">Total</th>
                                        <th className="px-5 font-semibold text-center">Rango Horario</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-container text-xs">
                                    {cashCloseSummary.cashierAuditList.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-8 text-secondary">
                                                No hay registros de ventas para el filtro y rango de fechas seleccionado.
                                            </td>
                                        </tr>
                                    ) : (
                                        cashCloseSummary.cashierAuditList.map((c) => (
                                            <tr key={c.userId} className="hover:bg-surface-bright h-12 transition-colors">
                                                <td className="px-5 font-bold text-on-surface">{c.name}</td>
                                                <td className="px-5 text-center font-mono font-semibold">{c.tickets}</td>
                                                <td className="px-5 text-right font-mono text-emerald-700 font-semibold">
                                                    {formatBs(c.cashCents)}
                                                </td>
                                                <td className="px-5 text-right font-mono text-blue-700 font-semibold">
                                                    {formatBs(c.cardCents)}
                                                </td>
                                                <td className="px-5 text-right font-mono text-purple-700 font-semibold">
                                                    {formatBs(c.qrCents)}
                                                </td>
                                                <td className="px-5 text-right font-mono font-bold text-primary">
                                                    {formatBs(c.totalCents)}
                                                </td>
                                                <td className="px-5 text-center font-mono text-secondary text-xs">
                                                    {new Date(c.firstSale).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    {' - '}
                                                    {new Date(c.lastSale).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Desglose y Auditoría de Ventas (Dividido por Cajeros y Horarios Exactos) */}
                    <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-surface-container overflow-hidden">
                        <div className="p-5 border-b border-surface-container flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-base font-bold text-on-surface">Historial de Ventas Detallado</h2>
                                <p className="text-xs text-secondary">
                                    Auditoría ticket por ticket dividida por operadores de caja y horarios exactos
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                {/* Barra de búsqueda rápida */}
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
                                        search
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Buscar ticket, cliente o cajero..."
                                        value={salesSearchTerm}
                                        onChange={(e) => setSalesSearchTerm(e.target.value)}
                                        className="pl-8 pr-7 py-1.5 bg-surface-container-low rounded-lg text-xs border border-surface-container text-on-surface placeholder:text-secondary focus:outline-none focus:ring-1 focus:ring-primary w-48 sm:w-60"
                                    />
                                    {salesSearchTerm && (
                                        <button
                                            type="button"
                                            onClick={() => setSalesSearchTerm('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    )}
                                </div>

                                {/* Conmutador de modo de vista */}
                                <div className="flex bg-surface-container-low p-0.5 rounded-lg border border-surface-container text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setSalesTableMode('by_cashier')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                                            salesTableMode === 'by_cashier'
                                                ? 'bg-primary text-on-primary shadow-xs'
                                                : 'text-secondary hover:text-on-surface'
                                        }`}
                                        title="Ver ventas organizadas por cada cajero"
                                    >
                                        <span className="material-symbols-outlined text-[15px]">badge</span>
                                        <span>Por Cajeros ({cashierGroupsInPage.length})</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSalesTableMode('chronological')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                                            salesTableMode === 'chronological'
                                                ? 'bg-primary text-on-primary shadow-xs'
                                                : 'text-secondary hover:text-on-surface'
                                        }`}
                                        title="Ver lista corrida cronológica completa"
                                    >
                                        <span className="material-symbols-outlined text-[15px]">schedule</span>
                                        <span>Cronológico ({filteredChronologicalSales.length})</span>
                                    </button>
                                </div>

                                {/* Acciones de exportación directa */}
                                <button
                                    onClick={() => setPdfModalType('sales_list')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-xs font-bold text-on-primary transition-all active:scale-95 shadow-xs cursor-pointer"
                                    title="Abrir e imprimir documento PDF oficial de ventas"
                                >
                                    <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                    <span>Planilla PDF</span>
                                </button>
                                <button
                                    onClick={handleExportSalesList}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-xs font-semibold text-primary transition-colors border border-surface-container cursor-pointer"
                                    title="Descargar datos en hoja Excel/CSV"
                                >
                                    <span className="material-symbols-outlined text-[16px]">table_view</span>
                                    <span>CSV</span>
                                </button>
                            </div>
                        </div>

                        {/* CUERPO: MODO POR CAJEROS */}
                        {salesTableMode === 'by_cashier' ? (
                            <div className="p-4 sm:p-5 space-y-4 max-h-[700px] overflow-y-auto">
                                {cashierGroupsInPage.length === 0 ? (
                                    <div className="text-center py-12 text-secondary">
                                        <span className="material-symbols-outlined text-4xl text-secondary/50 mb-2 block">
                                            receipt_long
                                        </span>
                                        No se encontraron ventas con los filtros seleccionados.
                                    </div>
                                ) : (
                                    cashierGroupsInPage.map((group, groupIdx) => {
                                        const firstTime = new Date(group.firstSale).toLocaleTimeString('es-ES', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                        });
                                        const lastTime = new Date(group.lastSale).toLocaleTimeString('es-ES', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                        });
                                        const shiftSchedule = group.firstSale === group.lastSale ? firstTime : `${firstTime} a ${lastTime}`;

                                        return (
                                            <div
                                                key={group.userId}
                                                className="border border-surface-container rounded-xl overflow-hidden shadow-xs bg-surface-container-lowest"
                                            >
                                                {/* Encabezado del Cajero */}
                                                <div className="bg-surface-container-low px-4 py-3 border-b border-surface-container flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="w-6 h-6 rounded-md bg-primary text-on-primary font-black text-[10px] flex items-center justify-center">
                                                            #{groupIdx + 1}
                                                        </span>
                                                        <span className="font-bold text-sm text-on-surface">
                                                            {group.name}
                                                        </span>
                                                        <div className="flex items-center gap-1 text-[11px] text-secondary bg-surface-container px-2 py-0.5 rounded-md border border-surface-container-high">
                                                            <span className="material-symbols-outlined text-[14px] text-primary">
                                                                schedule
                                                            </span>
                                                            <span>
                                                                Turno:{' '}
                                                                <strong className="font-mono text-on-surface">
                                                                    {shiftSchedule}
                                                                </strong>
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-3 text-xs">
                                                        <span className="text-secondary">
                                                            {group.validCount} ventas OK{' '}
                                                            {group.cancelledCount > 0 && `(${group.cancelledCount} anuladas)`}
                                                        </span>
                                                        <div className="font-bold font-mono text-primary text-sm bg-primary/10 px-2 py-0.5 rounded">
                                                            {formatBs(group.totalValidCents)}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Tabla de tickets del cajero */}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left border-collapse text-xs">
                                                        <thead>
                                                            <tr className="bg-surface-container-lowest text-secondary font-bold uppercase text-[10px] border-b border-surface-container h-8">
                                                                <th className="px-4 font-semibold w-24">ID Ticket</th>
                                                                <th className="px-4 font-semibold">Hora Exacta</th>
                                                                <th className="px-4 font-semibold">Cliente / NIT</th>
                                                                <th className="px-4 font-semibold text-center">Método</th>
                                                                <th className="px-4 font-semibold text-right">Descuento</th>
                                                                <th className="px-4 font-semibold text-right">Total</th>
                                                                <th className="px-4 font-semibold text-center">Estado</th>
                                                                <th className="px-4 font-semibold text-center">Acciones</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-surface-container">
                                                            {group.sales.map((s: any) => {
                                                                const isCancelled = s.status === 'cancelled';
                                                                return (
                                                                    <tr
                                                                        key={s.id}
                                                                        className={`h-10 transition-colors ${
                                                                            isCancelled
                                                                                ? 'bg-error-container/10 line-through opacity-70'
                                                                                : 'hover:bg-surface-bright'
                                                                        }`}
                                                                    >
                                                                        <td className="px-4 font-mono text-primary font-semibold">
                                                                            #{s.id.slice(0, 8)}
                                                                        </td>
                                                                        <td className="px-4 font-mono text-secondary whitespace-nowrap">
                                                                            {new Date(s.created_at).toLocaleString('es-ES', {
                                                                                day: '2-digit',
                                                                                month: 'short',
                                                                                hour: '2-digit',
                                                                                minute: '2-digit',
                                                                                second: '2-digit',
                                                                            })}
                                                                        </td>
                                                                        <td className="px-4 text-on-surface truncate max-w-[180px]">
                                                                            {s.client_name
                                                                                ? `${s.client_name}${s.client_nit ? ` (${s.client_nit})` : ''}`
                                                                                : 'Público General'}
                                                                        </td>
                                                                        <td className="px-4 text-center">
                                                                            <span
                                                                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                                    s.payment_method === 'card'
                                                                                        ? 'bg-blue-100 text-blue-800'
                                                                                        : s.payment_method === 'qr'
                                                                                        ? 'bg-purple-100 text-purple-800'
                                                                                        : 'bg-emerald-100 text-emerald-800'
                                                                                }`}
                                                                            >
                                                                                {s.payment_method === 'card'
                                                                                    ? 'Tarjeta'
                                                                                    : s.payment_method === 'qr'
                                                                                    ? 'QR'
                                                                                    : 'Efectivo'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-4 text-right font-mono font-semibold text-error">
                                                                            {s.discount_cents && s.discount_cents > 0
                                                                                ? `-${formatBs(s.discount_cents)}`
                                                                                : '-'}
                                                                        </td>
                                                                        <td className="px-4 text-right font-mono font-bold text-on-surface">
                                                                            {formatBs(s.total_cents)}
                                                                        </td>
                                                                        <td className="px-4 text-center">
                                                                            {isCancelled ? (
                                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-error-container text-on-error-container">
                                                                                    ANULADA
                                                                                </span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                                                                                    OK
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 text-center">
                                                                            <div className="flex items-center justify-center gap-1.5">
                                                                                <button
                                                                                    onClick={() => setReprintSaleId(s.id)}
                                                                                    className="p-1 rounded bg-surface-container-low hover:bg-surface-container text-primary transition-colors border border-surface-container cursor-pointer"
                                                                                    title="Reimprimir ticket de venta"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[15px]">
                                                                                        print
                                                                                    </span>
                                                                                </button>
                                                                                {canVoidSale &&
                                                                                    (!isCancelled ? (
                                                                                        <button
                                                                                            disabled={cancellingSaleId === s.id}
                                                                                            onClick={() => handleAdminCancelSale(s)}
                                                                                            className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-error-container/40 hover:bg-error-container text-error text-[10px] font-bold transition-colors disabled:opacity-50 cursor-pointer"
                                                                                            title="Anular venta y reponer stock de medicamentos"
                                                                                        >
                                                                                            <span className="material-symbols-outlined text-[13px]">
                                                                                                cancel
                                                                                            </span>
                                                                                            <span>
                                                                                                {cancellingSaleId === s.id ? '...' : 'Anular'}
                                                                                            </span>
                                                                                        </button>
                                                                                    ) : (
                                                                                        <span className="text-[10px] text-error font-medium italic">
                                                                                            Anulada
                                                                                        </span>
                                                                                    ))}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Subtotal del cajero */}
                                                <div className="bg-surface-container-low px-4 py-2 border-t border-surface-container flex flex-wrap items-center justify-between text-xs text-secondary">
                                                    <div className="flex items-center gap-3 text-[11px]">
                                                        <span>
                                                            Efectivo:{' '}
                                                            <strong className="font-mono text-emerald-700">
                                                                {formatBs(group.cashCents)}
                                                            </strong>
                                                        </span>
                                                        <span>
                                                            Digital:{' '}
                                                            <strong className="font-mono text-blue-700">
                                                                {formatBs(group.cardCents + group.qrCents)}
                                                            </strong>
                                                        </span>
                                                        {group.totalDiscountCents > 0 && (
                                                            <span>
                                                                Descuentos:{' '}
                                                                <strong className="font-mono text-error">
                                                                    -{formatBs(group.totalDiscountCents)}
                                                                </strong>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="font-mono font-bold text-on-surface">
                                                        Subtotal {group.name}:{' '}
                                                        <span className="text-primary font-black text-xs">
                                                            {formatBs(group.totalValidCents)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        ) : (
                            /* CUERPO: MODO CRONOLÓGICO CORRIDO */
                            <div className="overflow-x-auto max-h-[600px]">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-surface-container-low text-secondary font-bold uppercase tracking-wider h-10 border-b border-surface-container sticky top-0 z-10">
                                            <th className="px-5 font-semibold">ID Ticket</th>
                                            <th className="px-5 font-semibold">Fecha y Hora Exacta</th>
                                            <th className="px-5 font-semibold">Cajero</th>
                                            <th className="px-5 font-semibold">Cliente / NIT</th>
                                            <th className="px-5 font-semibold text-center">Método</th>
                                            <th className="px-5 font-semibold text-right">Descuento</th>
                                            <th className="px-5 font-semibold text-right">Monto Total</th>
                                            <th className="px-5 font-semibold text-center">Estado</th>
                                            <th className="px-5 font-semibold text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-surface-container">
                                        {filteredChronologicalSales.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="text-center py-10 text-secondary">
                                                    Sin ventas en el período o búsqueda seleccionada.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredChronologicalSales.map((s: any) => {
                                                const isCancelled = s.status === 'cancelled';
                                                return (
                                                    <tr
                                                        key={s.id}
                                                        className={`h-11 transition-colors ${
                                                            isCancelled
                                                                ? 'bg-error-container/10 line-through opacity-70'
                                                                : 'hover:bg-surface-bright'
                                                        }`}
                                                    >
                                                        <td className="px-5 font-mono text-primary font-semibold">
                                                            #{s.id.slice(0, 8)}
                                                        </td>
                                                        <td className="px-5 text-secondary font-mono whitespace-nowrap">
                                                            {new Date(s.created_at).toLocaleString('es-ES', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                                second: '2-digit',
                                                            })}
                                                        </td>
                                                        <td className="px-5 font-semibold text-on-surface">
                                                            {(s.user_profiles as any)?.full_name || 'Cajero'}
                                                        </td>
                                                        <td className="px-5 text-on-surface truncate max-w-[160px]">
                                                            {s.client_name
                                                                ? `${s.client_name}${s.client_nit ? ` (${s.client_nit})` : ''}`
                                                                : 'Público General'}
                                                        </td>
                                                        <td className="px-5 text-center">
                                                            <span
                                                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                    s.payment_method === 'card'
                                                                        ? 'bg-blue-100 text-blue-800'
                                                                        : s.payment_method === 'qr'
                                                                        ? 'bg-purple-100 text-purple-800'
                                                                        : 'bg-emerald-100 text-emerald-800'
                                                                }`}
                                                            >
                                                                {s.payment_method === 'card'
                                                                    ? 'Tarjeta'
                                                                    : s.payment_method === 'qr'
                                                                    ? 'QR'
                                                                    : 'Efectivo'}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 text-right font-mono font-semibold text-error">
                                                            {s.discount_cents && s.discount_cents > 0
                                                                ? `-${formatBs(s.discount_cents)}`
                                                                : '-'}
                                                        </td>
                                                        <td className="px-5 text-right font-mono font-bold text-on-surface">
                                                            {formatBs(s.total_cents)}
                                                        </td>
                                                        <td className="px-5 text-center">
                                                            {isCancelled ? (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-error-container text-on-error-container">
                                                                    ANULADA
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                                                                    OK
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-5 text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <button
                                                                    onClick={() => setReprintSaleId(s.id)}
                                                                    className="p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary transition-colors border border-surface-container cursor-pointer"
                                                                    title="Reimprimir ticket de venta"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">
                                                                        print
                                                                    </span>
                                                                </button>
                                                                {canVoidSale &&
                                                                    (!isCancelled ? (
                                                                        <button
                                                                            disabled={cancellingSaleId === s.id}
                                                                            onClick={() => handleAdminCancelSale(s)}
                                                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-error-container/40 hover:bg-error-container text-error text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer"
                                                                            title="Anular venta y reponer stock de medicamentos"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[15px]">
                                                                                cancel
                                                                            </span>
                                                                            <span>
                                                                                {cancellingSaleId === s.id ? '...' : 'Anular'}
                                                                            </span>
                                                                        </button>
                                                                    ) : (
                                                                        <span className="text-[10px] text-error font-medium italic">
                                                                            Anulada
                                                                        </span>
                                                                    ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ==============================================================================
                6. VISTA 3: MARGEN Y RENTABILIDAD POR PRODUCTO
               ============================================================================== */}
            {activeTab === 'margins' && (
                <div className="flex flex-col gap-6">
                    <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-base font-bold text-on-surface">
                                    Matriz de Márgenes y Rentabilidad Comercial
                                </h2>
                                <p className="text-xs text-secondary">
                                    Dispersión de costos de adquisición, precios de venta y utilidad bruta por medicamento
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleExportMargins}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">download</span>
                                <span>Exportar Rentabilidad</span>
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-surface-container-low text-secondary font-bold text-[11px] uppercase tracking-wider h-10 border-b border-surface-container">
                                        <th className="px-5 font-semibold">Medicamento</th>
                                        <th className="px-5 font-semibold">Categoría</th>
                                        <th className="px-5 font-semibold text-right">Costo Unitario</th>
                                        <th className="px-5 font-semibold text-right">Precio Venta</th>
                                        <th className="px-5 font-semibold text-right">Margen Unitario</th>
                                        <th className="px-5 font-semibold text-center">Margen (%)</th>
                                        <th className="px-5 font-semibold text-right">Uds. Vendidas</th>
                                        <th className="px-5 font-semibold text-right">Ganancia Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-container text-xs">
                                    {margins.data && margins.data.length > 0 ? (
                                        margins.data.map((m) => (
                                            <tr key={m.product_id} className="hover:bg-surface-bright h-12 transition-colors">
                                                <td className="px-5 font-bold text-on-surface">{m.name}</td>
                                                <td className="px-5 text-secondary">{m.category || 'General'}</td>
                                                <td className="px-5 font-mono text-secondary text-right">{formatBs(m.cost_cents)}</td>
                                                <td className="px-5 font-mono text-on-surface text-right font-semibold">{formatBs(m.price_cents)}</td>
                                                <td className="px-5 font-mono text-emerald-700 text-right font-bold">{formatBs(m.margin_cents)}</td>
                                                <td className="px-5 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getMarginBadgeClass(m.margin_percent)}`}>
                                                        {m.margin_percent}%
                                                    </span>
                                                </td>
                                                <td className="px-5 font-mono text-secondary text-right font-semibold">{m.total_sold}</td>
                                                <td className="px-5 font-mono text-primary text-right font-black text-sm">
                                                    {formatBs(m.total_profit_cents)}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={8} className="text-center py-8 text-secondary">
                                                Sin datos de rentabilidad para el período seleccionado.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ==============================================================================
                7. VISTA 4: ROTACIÓN Y ALERTAS DE INVENTARIO
               ============================================================================== */}
            {activeTab === 'stock_audit' && (
                <div className="flex flex-col gap-6">
                    <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-container shadow-sm flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-base font-bold text-on-surface">
                                    Auditoría de Stock Crítico y Caducidades
                                </h2>
                                <p className="text-xs text-secondary">
                                    Monitoreo de medicamentos con existencias por debajo del umbral mínimo o fechas de vencimiento próximas
                                </p>
                            </div>

                            {/* Filtro de severidad de alertas */}
                            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-surface-container">
                                {(
                                    [
                                        { key: 'all', label: 'Todas' },
                                        { key: 'low_stock', label: 'Bajo Stock' },
                                        { key: 'expiring', label: 'Por Vencer (<30d)' },
                                        { key: 'expired', label: 'Vencidos' },
                                    ] as const
                                ).map((t) => (
                                    <button
                                        key={t.key}
                                        type="button"
                                        onClick={() => setStockFilter(t.key)}
                                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                            stockFilter === t.key
                                                ? 'bg-surface-container-lowest text-primary shadow-sm'
                                                : 'text-secondary hover:text-on-surface'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-surface-container-low text-secondary font-bold text-[11px] uppercase tracking-wider h-10 border-b border-surface-container">
                                        <th className="px-5 font-semibold">Medicamento</th>
                                        <th className="px-5 font-semibold">SKU / Clave</th>
                                        <th className="px-5 font-semibold">Categoría</th>
                                        <th className="px-5 font-semibold">Proveedor</th>
                                        <th className="px-5 font-semibold text-center">Stock Actual</th>
                                        <th className="px-5 font-semibold text-center">Stock Mínimo</th>
                                        <th className="px-5 font-semibold text-center">Fecha Caducidad</th>
                                        <th className="px-5 font-semibold text-center">Condición</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-container text-xs">
                                    {filteredAlerts.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="text-center py-8 text-secondary">
                                                No hay alertas que coincidan con el filtro seleccionado.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAlerts.map((a) => (
                                            <tr key={a.id} className="hover:bg-surface-bright h-12 transition-colors">
                                                <td className="px-5 font-bold text-on-surface">{a.name}</td>
                                                <td className="px-5 font-mono text-secondary text-[11px]">{a.sku || '-'}</td>
                                                <td className="px-5 text-secondary">{a.category || 'General'}</td>
                                                <td className="px-5 text-secondary">{a.supplier || 'No asignado'}</td>
                                                <td className="px-5 font-mono text-center font-bold text-on-surface">{a.stock}</td>
                                                <td className="px-5 font-mono text-center text-secondary">{a.min_stock}</td>
                                                <td className="px-5 font-mono text-center text-secondary">
                                                    {a.expiration_date ? formatDate(a.expiration_date) : 'N/A'}
                                                </td>
                                                <td className="px-5 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getAlertBadgeClass(a.alert_type)}`}>
                                                        {a.alert_type === 'low_stock' ? 'Bajo Mínimo' : a.alert_type === 'expiring' ? 'Próximo a Vencer' : 'VENCIDO'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ==============================================================================
                8. BOTTOM SECTION: MÓDULOS DE DESCARGA DE REPORTES ESPECÍFICOS PRE-DISEÑADOS
               ============================================================================== */}
            <div className="flex flex-col gap-4 pt-2">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-on-surface">
                            Módulos de Descarga de Reportes Específicos Pre-diseñados
                        </h2>
                        <p className="text-xs text-secondary">
                            Formatos estandarizados listos para auditorías contables, gerenciales y sanitarias
                        </p>
                    </div>
                    <span className="text-[11px] font-mono text-secondary uppercase bg-surface-container-low px-3 py-1 rounded-lg border border-surface-container">
                        Formatos PharmaCore Oficial
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Planilla de Ventas */}
                    <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="flex flex-col gap-1.5">
                            <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center text-primary mb-1">
                                <span className="material-symbols-outlined text-[19px]">table_view</span>
                            </div>
                            <h3 className="font-bold text-sm text-on-surface">Planilla Detallada de Ventas</h3>
                            <p className="text-xs text-secondary">
                                Registro ticket por ticket con forma de pago, fecha, cajero, descuentos y estado.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPdfModalType('sales_list')}
                                className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                <span>PDF</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleExportSalesList}
                                className="py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                title="Descargar CSV"
                            >
                                <span className="material-symbols-outlined text-[15px]">file_download</span>
                                <span>CSV</span>
                            </button>
                        </div>
                    </div>

                    {/* Card 2: Cuadre de Cajeros */}
                    <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="flex flex-col gap-1.5">
                            <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center text-secondary mb-1">
                                <span className="material-symbols-outlined text-[19px]">badge</span>
                            </div>
                            <h3 className="font-bold text-sm text-on-surface">Cuadre y Auditoría de Caja</h3>
                            <p className="text-xs text-secondary">
                                Rendimiento por operador, conciliación de efectivo, tarjeta y transferencias QR.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPdfModalType('cash_audit')}
                                className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                <span>PDF</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleExportCashiersAudit}
                                className="py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                title="Descargar CSV"
                            >
                                <span className="material-symbols-outlined text-[15px]">file_download</span>
                                <span>CSV</span>
                            </button>
                        </div>
                    </div>

                    {/* Card 3: Ranking de Productos */}
                    <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="flex flex-col gap-1.5">
                            <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center text-primary mb-1">
                                <span className="material-symbols-outlined text-[19px]">inventory</span>
                            </div>
                            <h3 className="font-bold text-sm text-on-surface">Ranking y Rotación</h3>
                            <p className="text-xs text-secondary">
                                Medicamentos con mayor volumen dispensado, recaudación bruta y margen comercial.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPdfModalType('top_products')}
                                className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                <span>PDF</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleExportTopProducts}
                                className="py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                title="Descargar CSV"
                            >
                                <span className="material-symbols-outlined text-[15px]">file_download</span>
                                <span>CSV</span>
                            </button>
                        </div>
                    </div>

                    {/* Card 4: Matriz de Rentabilidad */}
                    <div className="bg-surface-container-lowest p-5 rounded-2xl border border-surface-container shadow-sm flex flex-col justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="flex flex-col gap-1.5">
                            <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center text-emerald-700 mb-1">
                                <span className="material-symbols-outlined text-[19px]">query_stats</span>
                            </div>
                            <h3 className="font-bold text-sm text-on-surface">Rentabilidad y Márgenes</h3>
                            <p className="text-xs text-secondary">
                                Detalle de costos de adquisición, precios de venta y ganancia bruta acumulada.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPdfModalType('margins')}
                                className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                                <span>PDF</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleExportMargins}
                                className="py-2 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                title="Descargar CSV"
                            >
                                <span className="material-symbols-outlined text-[15px]">file_download</span>
                                <span>CSV</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ==============================================================================
                MODALES: REPORTE DOCUMENTAL PDF & REIMPRESIÓN DE TICKET
               ============================================================================== */}
            {pdfModalType && (
                <ReportDocumentPdfModal
                    isOpen={Boolean(pdfModalType)}
                    initialType={pdfModalType}
                    onClose={() => setPdfModalType(null)}
                    range={range}
                    sales={consolidatedSales}
                    cashCloseSummary={cashCloseSummary}
                    topProducts={topProducts.data}
                    margins={margins.data}
                    selectedCashierName={selectedCashierName}
                    currentUserEmail={user?.email || 'Administrador'}
                    initialCashierId={selectedCashier}
                    initialPaymentMethod={paymentMethodFilter}
                    initialStatus={salesStatusFilter}
                    initialTimeShift={timeShiftFilter}
                />
            )}

            {reprintSaleId && (
                <TicketReceipt
                    saleId={reprintSaleId}
                    onComplete={() => setReprintSaleId(null)}
                />
            )}
        </div>
    );
}