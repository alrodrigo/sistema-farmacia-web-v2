import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { formatBs, formatDate } from '@/lib/utils';
import type { DateRange, TopProduct, ProfitMargin } from '../services/reportsApi';

export type ReportType = 'sales_list' | 'cash_audit' | 'top_products' | 'margins';

interface ReportDocumentPdfModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialType?: ReportType;
    range: DateRange;
    sales?: any[];
    cashCloseSummary: {
        totalSalesCents: number;
        totalTickets: number;
        avgTicketCents: number;
        cashCents: number;
        cardCents: number;
        qrCents: number;
        cancelledTickets: number;
        cancelledCents: number;
        cashierAuditList: any[];
    };
    topProducts?: TopProduct[];
    margins?: ProfitMargin[];
    selectedCashierName?: string;
    currentUserEmail?: string;
    initialCashierId?: string;
    initialPaymentMethod?: string;
    initialStatus?: 'all' | 'completed' | 'cancelled';
    initialTimeShift?: 'ALL' | 'morning' | 'afternoon' | 'custom';
}

export default function ReportDocumentPdfModal({
    isOpen,
    onClose,
    initialType = 'sales_list',
    range,
    sales = [],
    cashCloseSummary,
    topProducts = [],
    margins = [],
    selectedCashierName = 'Todos los Cajeros',
    currentUserEmail = 'Administrador',
    initialCashierId = 'ALL',
    initialPaymentMethod = 'ALL',
    initialStatus = 'all',
    initialTimeShift = 'ALL',
}: ReportDocumentPdfModalProps) {
    const [storeInfo, setStoreInfo] = useState<any>(null);
    const [reportType, setReportType] = useState<ReportType>(initialType);

    // FILTROS DINÁMICOS E INTERACTIVOS
    const [selectedCashierId, setSelectedCashierId] = useState<string>(initialCashierId);
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<'ALL' | 'cash' | 'card' | 'qr'>(
        initialPaymentMethod as any
    );
    const [salesStatusFilter, setSalesStatusFilter] = useState<'all' | 'completed' | 'cancelled'>(initialStatus);
    const [timeShiftFilter, setTimeShiftFilter] = useState<'ALL' | 'morning' | 'afternoon' | 'custom'>(
        initialTimeShift
    );
    const [customTimeFrom, setCustomTimeFrom] = useState<string>('07:00');
    const [customTimeTo, setCustomTimeTo] = useState<string>('23:00');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [salesGroupingMode, setSalesGroupingMode] = useState<'by_cashier' | 'flat'>('by_cashier');

    useEffect(() => {
        setReportType(initialType);
    }, [initialType]);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedCashierId(initialCashierId || 'ALL');
        setPaymentMethodFilter((initialPaymentMethod as any) || 'ALL');
        setSalesStatusFilter(initialStatus || 'all');
        setTimeShiftFilter(initialTimeShift || 'ALL');
    }, [isOpen, initialCashierId, initialPaymentMethod, initialStatus, initialTimeShift]);

    useEffect(() => {
        if (!isOpen) return;

        async function fetchSettings() {
            try {
                const { data } = await supabase
                    .from('store_settings')
                    .select('*')
                    .limit(1)
                    .maybeSingle();
                setStoreInfo(data);
            } catch (err) {
                console.error('Error cargando configuración para reporte:', err);
            }
        }

        fetchSettings();
    }, [isOpen]);

    // Extracción de todos los cajeros disponibles presentes en las ventas
    const availableCashiers = useMemo(() => {
        const map = new Map<string, string>();
        sales.forEach((s) => {
            const id = s.user_id || 'unknown';
            const name = (s.user_profiles as any)?.full_name || 'Cajero de Turno';
            if (!map.has(id)) {
                map.set(id, name);
            }
        });
        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [sales]);

    // FILTRO DINÁMICO DE VENTAS DETALLADAS (REACCIÓN INMEDIATA A TODOS LOS CONTROLES)
    const filteredSales = useMemo(() => {
        return sales.filter((s) => {
            // 1. Filtro por Cajero
            if (selectedCashierId !== 'ALL' && s.user_id !== selectedCashierId) {
                return false;
            }

            // 2. Filtro por Estado
            if (salesStatusFilter === 'completed' && s.status === 'cancelled') return false;
            if (salesStatusFilter === 'cancelled' && s.status !== 'cancelled') return false;

            // 3. Filtro por Método de Pago
            if (paymentMethodFilter !== 'ALL' && s.payment_method !== paymentMethodFilter) {
                return false;
            }

            // 4. Filtro por Turno / Horario
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

            // 5. Búsqueda rápida por texto (Ticket, Cliente, NIT, Cajero)
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchId = s.id?.toLowerCase().includes(q);
                const matchClient = s.client_name?.toLowerCase().includes(q);
                const matchNit = s.client_nit?.toLowerCase().includes(q);
                const matchCashier = (s.user_profiles as any)?.full_name?.toLowerCase().includes(q);
                if (!matchId && !matchClient && !matchNit && !matchCashier) return false;
            }

            return true;
        });
    }, [
        sales,
        selectedCashierId,
        salesStatusFilter,
        paymentMethodFilter,
        timeShiftFilter,
        customTimeFrom,
        customTimeTo,
        searchQuery,
    ]);

    // Conteo de filtros activos y reseteo
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedCashierId !== 'ALL') count++;
        if (paymentMethodFilter !== 'ALL') count++;
        if (salesStatusFilter !== 'all') count++;
        if (timeShiftFilter !== 'ALL') count++;
        if (searchQuery.trim()) count++;
        return count;
    }, [selectedCashierId, paymentMethodFilter, salesStatusFilter, timeShiftFilter, searchQuery]);

    const selectedCashierLabel = useMemo(() => {
        if (selectedCashierId === 'ALL') return 'Todos los cajeros';
        const found = availableCashiers.find((c) => c.id === selectedCashierId);
        return found ? found.name : 'Cajero seleccionado';
    }, [selectedCashierId, availableCashiers]);

    const paymentFilterLabel = useMemo(() => {
        if (paymentMethodFilter === 'ALL') return 'Todos los métodos';
        if (paymentMethodFilter === 'cash') return 'Efectivo';
        if (paymentMethodFilter === 'card') return 'Tarjeta';
        return 'QR';
    }, [paymentMethodFilter]);

    const statusFilterLabel = useMemo(() => {
        if (salesStatusFilter === 'all') return 'Todos los estados';
        if (salesStatusFilter === 'completed') return 'Válidos';
        return 'Anulados';
    }, [salesStatusFilter]);

    const shiftFilterLabel = useMemo(() => {
        if (timeShiftFilter === 'ALL') return 'Todo el día';
        if (timeShiftFilter === 'morning') return 'Mañana (06:00-14:30)';
        if (timeShiftFilter === 'afternoon') return 'Tarde (14:30-23:30)';
        return `Personalizado (${customTimeFrom} - ${customTimeTo})`;
    }, [timeShiftFilter, customTimeFrom, customTimeTo]);

    const handleResetFilters = () => {
        setSelectedCashierId('ALL');
        setPaymentMethodFilter('ALL');
        setSalesStatusFilter('all');
        setTimeShiftFilter('ALL');
        setCustomTimeFrom('07:00');
        setCustomTimeTo('23:00');
        setSearchQuery('');
    };

    // Agrupación de ventas dividida por cajeros y horarios de atención (sobre las ventas filtradas)
    const cashierSalesGroups = useMemo(() => {
        const map = new Map<
            string,
            {
                cashierId: string;
                cashierName: string;
                sales: any[];
                firstSaleAt: string;
                lastSaleAt: string;
                validCount: number;
                cancelledCount: number;
                totalValidCents: number;
                totalCancelledCents: number;
                totalDiscountCents: number;
                cashCents: number;
                cardCents: number;
                qrCents: number;
            }
        >();

        filteredSales.forEach((s) => {
            const cashierId = s.user_id || 'unknown';
            const cashierName = (s.user_profiles as any)?.full_name || 'Cajero de Turno';

            let group = map.get(cashierId);
            if (!group) {
                group = {
                    cashierId,
                    cashierName,
                    sales: [],
                    firstSaleAt: s.created_at,
                    lastSaleAt: s.created_at,
                    validCount: 0,
                    cancelledCount: 0,
                    totalValidCents: 0,
                    totalCancelledCents: 0,
                    totalDiscountCents: 0,
                    cashCents: 0,
                    cardCents: 0,
                    qrCents: 0,
                };
                map.set(cashierId, group);
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

            if (new Date(s.created_at) < new Date(group.firstSaleAt)) {
                group.firstSaleAt = s.created_at;
            }
            if (new Date(s.created_at) > new Date(group.lastSaleAt)) {
                group.lastSaleAt = s.created_at;
            }
        });

        return Array.from(map.values()).sort((a, b) => b.totalValidCents - a.totalValidCents);
    }, [filteredSales]);

    // Resumen de métricas dinámicamente recalculadas sobre las ventas filtradas
    const salesMetrics = useMemo(() => {
        const completed = filteredSales.filter((s) => s.status !== 'cancelled');
        const cancelled = filteredSales.filter((s) => s.status === 'cancelled');

        const totalValidSalesCents = completed.reduce((sum, s) => sum + s.total_cents, 0);
        const totalCancelledCents = cancelled.reduce((sum, s) => sum + s.total_cents, 0);
        const totalDiscountsCents = completed.reduce((sum, s) => sum + (s.discount_cents || 0), 0);

        let cashCents = 0;
        let cardCents = 0;
        let qrCents = 0;

        completed.forEach((s) => {
            if (s.payment_method === 'card') cardCents += s.total_cents;
            else if (s.payment_method === 'qr') qrCents += s.total_cents;
            else cashCents += s.total_cents;
        });

        return {
            totalValidSalesCents,
            totalCancelledCents,
            totalDiscountsCents,
            validCount: completed.length,
            cancelledCount: cancelled.length,
            cashCents,
            cardCents,
            qrCents,
        };
    }, [filteredSales]);

    // Filtros para Cuadre de Caja
    const filteredCashierAuditList = useMemo(() => {
        if (selectedCashierId === 'ALL') return cashCloseSummary.cashierAuditList;
        return cashCloseSummary.cashierAuditList.filter((c) => c.userId === selectedCashierId);
    }, [cashCloseSummary.cashierAuditList, selectedCashierId]);

    // Filtros dinámicos para Top Products y Margins con buscador
    const filteredTopProducts = useMemo(() => {
        if (!searchQuery.trim()) return topProducts;
        const q = searchQuery.toLowerCase();
        return topProducts.filter(
            (p) =>
                p.name?.toLowerCase().includes(q) ||
                p.category?.toLowerCase().includes(q) ||
                p.sku?.toLowerCase().includes(q)
        );
    }, [topProducts, searchQuery]);

    const filteredMargins = useMemo(() => {
        if (!searchQuery.trim()) return margins;
        const q = searchQuery.toLowerCase();
        return margins.filter(
            (m) => m.name?.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q)
        );
    }, [margins, searchQuery]);

    // Resumen de márgenes
    const totalProfitCents = useMemo(() => {
        return margins.reduce((acc, m) => acc + (m.total_profit_cents || 0), 0);
    }, [margins]);

    if (!isOpen) return null;

    const pharmacyName = storeInfo?.business_name || 'Farmacia PharmaCore';
    const pharmacyNit = storeInfo?.nit || '8839201021';
    const pharmacyAddress = storeInfo?.address || 'Av. Principal #450, Zona Central';
    const pharmacyPhone = storeInfo?.phone || '+591 2 2456789';
    const generatedDateStr = new Date().toLocaleString('es-ES', {
        dateStyle: 'long',
        timeStyle: 'short',
    });

    const reportTitles: Record<ReportType, { title: string; subtitle: string; tag: string }> = {
        sales_list: {
            title: 'Planilla Detallada de Ventas y Tickets',
            subtitle: 'Auditoría cronológica ticket por ticket con forma de pago, descuentos y estado',
            tag: 'Planilla de Ventas POS',
        },
        cash_audit: {
            title: 'Cuadre y Auditoría de Cierres de Caja',
            subtitle: 'Consolidado de turnos de operadores, métodos de pago y conciliación de caja chica',
            tag: 'Auditoría de Cierre de Caja',
        },
        top_products: {
            title: 'Ranking de Rotación de Productos',
            subtitle: 'Medicamentos con mayor volumen dispensado, recaudación bruta y margen comercial',
            tag: 'Ranking de Productos',
        },
        margins: {
            title: 'Matriz de Rentabilidad y Márgenes Comerciales',
            subtitle: 'Cálculo de dispersión entre costos de adquisición, precios de venta y utilidad acumulada',
            tag: 'Informe de Rentabilidad',
        },
    };

    // GENERACIÓN E IMPRESIÓN DEL PDF LIMPIO EN VENTANA AISLADA
    const handlePrintPdf = () => {
        const printWindow = window.open('', '_blank', 'width=1100,height=900');
        if (!printWindow) {
            alert('Por favor permite ventanas emergentes (pop-ups) para generar el PDF.');
            return;
        }

        const currentMeta = reportTitles[reportType];
        let tableHeaderHtml = '';
        let tableBodyHtml = '';
        let summaryBoxesHtml = '';

        if (reportType === 'sales_list') {
            summaryBoxesHtml = `
                <div class="kpi-grid">
                    <div class="kpi-card">
                        <div class="kpi-label">Total Recaudado (Válido)</div>
                        <div class="kpi-val" style="color: #006948;">Bs ${(salesMetrics.totalValidSalesCents / 100).toFixed(2)}</div>
                        <div class="kpi-sub">${salesMetrics.validCount} tickets completados</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Efectivo en Caja</div>
                        <div class="kpi-val" style="color: #047857;">Bs ${(salesMetrics.cashCents / 100).toFixed(2)}</div>
                        <div class="kpi-sub">Caja chica</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Tarjetas & QR</div>
                        <div class="kpi-val" style="color: #1d4ed8;">Bs ${((salesMetrics.cardCents + salesMetrics.qrCents) / 100).toFixed(2)}</div>
                        <div class="kpi-sub">Tarjeta: Bs ${(salesMetrics.cardCents / 100).toFixed(2)} | QR: Bs ${(salesMetrics.qrCents / 100).toFixed(2)}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Ventas Anuladas</div>
                        <div class="kpi-val" style="color: #b91c1c;">Bs ${(salesMetrics.totalCancelledCents / 100).toFixed(2)}</div>
                        <div class="kpi-sub">${salesMetrics.cancelledCount} ticket(s) anulados (Stock devuelto)</div>
                    </div>
                </div>
            `;

            if (salesGroupingMode === 'by_cashier') {
                tableHeaderHtml = `
                    <tr>
                        <th style="width: 25px; text-align: center;">#</th>
                        <th style="width: 75px;">ID Ticket</th>
                        <th style="width: 115px;">Fecha y Hora Exacta</th>
                        <th>Cliente / NIT-CI</th>
                        <th style="width: 65px; text-align: center;">Método</th>
                        <th style="width: 70px; text-align: right;">Descuento</th>
                        <th style="width: 80px; text-align: right;">Total Neto</th>
                        <th style="width: 65px; text-align: center;">Estado</th>
                    </tr>
                `;

                tableBodyHtml = cashierSalesGroups.map((group, groupIdx) => {
                    const firstTime = new Date(group.firstSaleAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const lastTime = new Date(group.lastSaleAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const scheduleStr = group.firstSaleAt === group.lastSaleAt ? firstTime : `${firstTime} a ${lastTime}`;

                    const cashierBanner = `
                        <tr style="background: #0f172a; color: #ffffff;">
                            <td colspan="8" style="padding: 7px 10px; font-weight: 700; font-size: 11px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <span style="display: inline-block; background: #006948; color: #ffffff; padding: 2px 7px; border-radius: 4px; font-size: 9.5px; text-transform: uppercase; margin-right: 8px; font-weight: 800;">Cajero #${groupIdx + 1}</span>
                                        <span style="font-size: 12px; font-weight: 800;">${group.cashierName}</span>
                                        <span style="font-weight: 400; font-size: 10px; opacity: 0.9; margin-left: 12px;">
                                            • Horario de Actividad: <strong style="font-family: monospace; background: rgba(255,255,255,0.15); padding: 1px 5px; border-radius: 3px;">${scheduleStr}</strong>
                                        </span>
                                    </div>
                                    <div style="font-size: 10.5px; font-family: monospace;">
                                        Subtotal: <strong style="color: #4ade80; font-size: 11.5px;">Bs ${(group.totalValidCents / 100).toFixed(2)}</strong> (${group.validCount} ventas OK)
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `;

                    const rows = group.sales.map((s, idx) => {
                        const isCancelled = s.status === 'cancelled';
                        const clientDisplay = s.client_name ? `${s.client_name}${s.client_nit ? ` (NIT: ${s.client_nit})` : ''}` : 'Público General';
                        const paymentLabel = s.payment_method === 'card' ? 'Tarjeta' : s.payment_method === 'qr' ? 'QR' : 'Efectivo';
                        const discountLabel = s.discount_cents && s.discount_cents > 0 ? `-Bs ${(s.discount_cents / 100).toFixed(2)}` : '-';
                        const totalBs = (s.total_cents / 100).toFixed(2);
                        const dateStr = new Date(s.created_at).toLocaleString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                        });

                        return `
                            <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px; ${isCancelled ? 'background-color: #fef2f2; text-decoration: line-through; opacity: 0.8;' : idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f8fafc;'}">
                                <td style="padding: 4px 6px; text-align: center; color: #64748b; font-family: monospace;">${idx + 1}</td>
                                <td style="padding: 4px 6px; font-weight: bold; font-family: monospace; color: #006948;">#${s.id.slice(0, 8)}</td>
                                <td style="padding: 4px 6px; color: #475569; font-family: monospace; white-space: nowrap;">${dateStr}</td>
                                <td style="padding: 4px 6px; color: #334155;">${clientDisplay}</td>
                                <td style="padding: 4px 6px; text-align: center; font-weight: 600; color: ${s.payment_method === 'card' ? '#1d4ed8' : s.payment_method === 'qr' ? '#7e22ce' : '#047857'};">
                                    ${paymentLabel}
                                </td>
                                <td style="padding: 4px 6px; text-align: right; font-family: monospace; color: #b91c1c;">
                                    ${discountLabel}
                                </td>
                                <td style="padding: 4px 6px; text-align: right; font-weight: bold; font-family: monospace; color: ${isCancelled ? '#991b1b' : '#0f172a'};">
                                    Bs ${totalBs}
                                </td>
                                <td style="padding: 4px 6px; text-align: center;">
                                    <span style="display: inline-block; padding: 2px 4px; border-radius: 4px; font-weight: bold; font-size: 8.5px; text-transform: uppercase; ${isCancelled ? 'background: #fee2e2; color: #991b1b;' : 'background: #e6f4ea; color: #137333;'}">
                                        ${isCancelled ? 'ANULADA' : 'VENDIDO'}
                                    </span>
                                </td>
                            </tr>
                        `;
                    }).join('');

                    const subtotalRow = `
                        <tr style="background: #f1f5f9; font-weight: 700; border-top: 1px solid #cbd5e1; border-bottom: 2px solid #94a3b8; font-size: 10px;">
                            <td colspan="4" style="padding: 5px 8px; text-align: right; color: #475569;">
                                Subtotal ${group.cashierName} (Efectivo: Bs ${(group.cashCents / 100).toFixed(2)} | Digital: Bs ${((group.cardCents + group.qrCents) / 100).toFixed(2)}):
                            </td>
                            <td style="padding: 5px 8px; text-align: center; font-family: monospace; font-size: 9.5px;">${group.sales.length} tks</td>
                            <td style="padding: 5px 8px; text-align: right; color: #b91c1c; font-family: monospace;">-Bs ${(group.totalDiscountCents / 100).toFixed(2)}</td>
                            <td style="padding: 5px 8px; text-align: right; color: #006948; font-family: monospace; font-size: 10.5px; font-weight: 800;">Bs ${(group.totalValidCents / 100).toFixed(2)}</td>
                            <td style="padding: 5px 8px; text-align: center; font-size: 9px;">${group.validCount} OK ${group.cancelledCount > 0 ? `| ${group.cancelledCount} Anul` : ''}</td>
                        </tr>
                    `;

                    return cashierBanner + rows + subtotalRow;
                }).join('') + `
                    <tr style="background: #e2e8f0 !important; font-weight: 800; border-top: 3px solid #64748b; font-size: 11px;">
                        <td colspan="5" style="padding: 8px; text-align: right; text-transform: uppercase;">GRAN TOTAL PLANILLA (${filteredSales.length} TICKETS - ${cashierSalesGroups.length} CAJEROS):</td>
                        <td style="padding: 8px; text-align: right; color: #b91c1c; font-family: monospace;">-Bs ${(salesMetrics.totalDiscountsCents / 100).toFixed(2)}</td>
                        <td style="padding: 8px; text-align: right; color: #006948; font-family: monospace; font-size: 12px; font-weight: 900;">Bs ${(salesMetrics.totalValidSalesCents / 100).toFixed(2)}</td>
                        <td style="padding: 8px; text-align: center; font-size: 9.5px;">${salesMetrics.validCount} OK / ${salesMetrics.cancelledCount} ANUL</td>
                    </tr>
                `;
            } else {
                tableHeaderHtml = `
                    <tr>
                        <th style="width: 25px; text-align: center;">#</th>
                        <th style="width: 70px;">ID Ticket</th>
                        <th style="width: 115px;">Fecha y Hora Exacta</th>
                        <th style="width: 110px;">Cajero</th>
                        <th>Cliente / NIT-CI</th>
                        <th style="width: 65px; text-align: center;">Método</th>
                        <th style="width: 65px; text-align: right;">Descuento</th>
                        <th style="width: 75px; text-align: right;">Total Neto</th>
                        <th style="width: 65px; text-align: center;">Estado</th>
                    </tr>
                `;

                tableBodyHtml = filteredSales.map((s, idx) => {
                    const isCancelled = s.status === 'cancelled';
                    const clientDisplay = s.client_name ? `${s.client_name}${s.client_nit ? ` (NIT: ${s.client_nit})` : ''}` : 'Público General';
                    const cashierName = (s.user_profiles as any)?.full_name || 'Cajero';
                    const paymentLabel = s.payment_method === 'card' ? 'Tarjeta' : s.payment_method === 'qr' ? 'QR' : 'Efectivo';
                    const discountLabel = s.discount_cents && s.discount_cents > 0 ? `-Bs ${(s.discount_cents / 100).toFixed(2)}` : '-';
                    const totalBs = (s.total_cents / 100).toFixed(2);
                    const dateStr = new Date(s.created_at).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                    });

                    return `
                        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px; ${isCancelled ? 'background-color: #fef2f2; text-decoration: line-through; opacity: 0.8;' : idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f8fafc;'}">
                            <td style="padding: 5px 6px; text-align: center; color: #64748b; font-family: monospace;">${idx + 1}</td>
                            <td style="padding: 5px 6px; font-weight: bold; font-family: monospace; color: #006948;">#${s.id.slice(0, 8)}</td>
                            <td style="padding: 5px 6px; color: #475569; font-family: monospace; white-space: nowrap;">${dateStr}</td>
                            <td style="padding: 5px 6px; font-weight: 600; color: #1e293b;">${cashierName}</td>
                            <td style="padding: 5px 6px; color: #334155;">${clientDisplay}</td>
                            <td style="padding: 5px 6px; text-align: center; font-weight: 600; color: ${s.payment_method === 'card' ? '#1d4ed8' : s.payment_method === 'qr' ? '#7e22ce' : '#047857'};">
                                ${paymentLabel}
                            </td>
                            <td style="padding: 5px 6px; text-align: right; font-family: monospace; color: #b91c1c;">
                                ${discountLabel}
                            </td>
                            <td style="padding: 5px 6px; text-align: right; font-weight: bold; font-family: monospace; color: ${isCancelled ? '#991b1b' : '#0f172a'};">
                                Bs ${totalBs}
                            </td>
                            <td style="padding: 5px 6px; text-align: center;">
                                <span style="display: inline-block; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 9px; text-transform: uppercase; ${isCancelled ? 'background: #fee2e2; color: #991b1b;' : 'background: #e6f4ea; color: #137333;'}">
                                    ${isCancelled ? 'ANULADA' : 'VENDIDO'}
                                </span>
                            </td>
                        </tr>
                    `;
                }).join('') + `
                    <tr style="background: #e2e8f0 !important; font-weight: 800; border-top: 2px solid #94a3b8; font-size: 11px;">
                        <td colspan="6" style="padding: 7px; text-align: right;">TOTAL PLANILLA (${filteredSales.length} TICKETS):</td>
                        <td style="padding: 7px; text-align: right; color: #b91c1c;">-Bs ${(salesMetrics.totalDiscountsCents / 100).toFixed(2)}</td>
                        <td style="padding: 7px; text-align: right; color: #006948;">Bs ${(salesMetrics.totalValidSalesCents / 100).toFixed(2)}</td>
                        <td style="padding: 7px; text-align: center;">${salesMetrics.validCount} OK / ${salesMetrics.cancelledCount} ANUL</td>
                    </tr>
                `;
            }
        } else if (reportType === 'cash_audit') {
            summaryBoxesHtml = `
                <div class="kpi-grid">
                    <div class="kpi-card">
                        <div class="kpi-label">Recaudación Total en Caja</div>
                        <div class="kpi-val" style="color: #006948;">Bs ${(cashCloseSummary.totalSalesCents / 100).toFixed(2)}</div>
                        <div class="kpi-sub">${cashCloseSummary.totalTickets} ventas consolidadas</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Total Efectivo</div>
                        <div class="kpi-val" style="color: #047857;">Bs ${(cashCloseSummary.cashCents / 100).toFixed(2)}</div>
                        <div class="kpi-sub">Caja chica y billetes</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Terminal Bancaria (POS)</div>
                        <div class="kpi-val" style="color: #1d4ed8;">Bs ${(cashCloseSummary.cardCents / 100).toFixed(2)}</div>
                        <div class="kpi-sub">Vouchers bancarios</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Transferencias QR</div>
                        <div class="kpi-val" style="color: #7e22ce;">Bs ${(cashCloseSummary.qrCents / 100).toFixed(2)}</div>
                        <div class="kpi-sub">Comprobantes digitales</div>
                    </div>
                </div>
            `;

            tableHeaderHtml = `
                <tr>
                    <th style="width: 30px; text-align: center;">#</th>
                    <th>Cajero / Operador</th>
                    <th style="text-align: center; width: 65px;">Tickets</th>
                    <th style="text-align: right; width: 90px;">Efectivo</th>
                    <th style="text-align: right; width: 90px;">Tarjeta</th>
                    <th style="text-align: right; width: 90px;">QR</th>
                    <th style="text-align: right; width: 100px;">Total Recaudado</th>
                    <th style="text-align: center; width: 130px;">Horario de Turno</th>
                </tr>
            `;

            tableBodyHtml = cashCloseSummary.cashierAuditList.map((c, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px; ${idx % 2 === 0 ? 'background: #ffffff;' : 'background: #f8fafc;'}">
                    <td style="padding: 7px; text-align: center; color: #64748b; font-family: monospace;">${idx + 1}</td>
                    <td style="padding: 7px; font-weight: bold; color: #0f172a;">${c.name}</td>
                    <td style="padding: 7px; text-align: center; font-family: monospace; font-weight: 600;">${c.tickets}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; color: #047857; font-weight: 600;">Bs ${(c.cashCents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; color: #1d4ed8; font-weight: 600;">Bs ${(c.cardCents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; color: #7e22ce; font-weight: 600;">Bs ${(c.qrCents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: right; font-weight: bold; font-family: monospace; color: #006948; font-size: 12px;">Bs ${(c.totalCents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: center; color: #475569; font-size: 9.5px; font-family: monospace;">
                        ${new Date(c.firstSale).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} - 
                        ${new Date(c.lastSale).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                </tr>
            `).join('') + `
                <tr style="background: #e2e8f0 !important; font-weight: 800; border-top: 2px solid #94a3b8; font-size: 11px;">
                    <td colspan="2" style="padding: 7px; text-align: right;">TOTAL GENERAL ARQUEO:</td>
                    <td style="padding: 7px; text-align: center; font-family: monospace;">${cashCloseSummary.totalTickets}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; color: #047857;">Bs ${(cashCloseSummary.cashCents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; color: #1d4ed8;">Bs ${(cashCloseSummary.cardCents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; color: #7e22ce;">Bs ${(cashCloseSummary.qrCents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; color: #006948; font-size: 12px;">Bs ${(cashCloseSummary.totalSalesCents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: center; font-size: 10px;">${cashCloseSummary.cashierAuditList.length} cajero(s)</td>
                </tr>
            `;
        } else if (reportType === 'top_products') {
            const totalQty = topProducts.reduce((sum, p) => sum + p.total_quantity, 0);
            const totalRevCents = topProducts.reduce((sum, p) => sum + p.total_revenue_cents, 0);

            summaryBoxesHtml = `
                <div class="kpi-grid">
                    <div class="kpi-card">
                        <div class="kpi-label">Ingresos por Productos Top</div>
                        <div class="kpi-val" style="color: #006948;">Bs ${(totalRevCents / 100).toFixed(2)}</div>
                        <div class="kpi-sub">Ranking de rotación</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Unidades Dispensadas</div>
                        <div class="kpi-val">${totalQty.toLocaleString()} uds</div>
                        <div class="kpi-sub">Volumen acumulado</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Productos Listados</div>
                        <div class="kpi-val">${topProducts.length}</div>
                        <div class="kpi-sub">Medicamentos analizados</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Margen Comercial Medio</div>
                        <div class="kpi-val" style="color: #047857;">
                            ${topProducts.length > 0 ? Math.round(topProducts.reduce((acc, p) => acc + p.margin_percent, 0) / topProducts.length) : 0}%
                        </div>
                        <div class="kpi-sub">Rentabilidad promedio</div>
                    </div>
                </div>
            `;

            tableHeaderHtml = `
                <tr>
                    <th style="width: 30px; text-align: center;">#</th>
                    <th style="width: 80px;">SKU / Clave</th>
                    <th>Medicamento y Presentación</th>
                    <th style="width: 120px;">Categoría</th>
                    <th style="text-align: right; width: 80px;">Cant. Vendida</th>
                    <th style="text-align: right; width: 100px;">Ingreso Total</th>
                    <th style="text-align: center; width: 75px;">Margen</th>
                </tr>
            `;

            tableBodyHtml = topProducts.map((p, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px; ${idx % 2 === 0 ? 'background: #ffffff;' : 'background: #f8fafc;'}">
                    <td style="padding: 7px; text-align: center; font-weight: bold; color: #006948;">${idx + 1}</td>
                    <td style="padding: 7px; font-family: monospace; color: #64748b;">${p.sku || '-'}</td>
                    <td style="padding: 7px; font-weight: 600; color: #0f172a;">${p.name}</td>
                    <td style="padding: 7px; color: #475569;">${p.category || 'General'}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; font-weight: bold;">${p.total_quantity}</td>
                    <td style="padding: 7px; text-align: right; font-weight: bold; font-family: monospace; color: #006948;">Bs ${(p.total_revenue_cents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: center;">
                        <span style="background: #e6f4ea; color: #137333; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">${p.margin_percent}%</span>
                    </td>
                </tr>
            `).join('') + `
                <tr style="background: #e2e8f0 !important; font-weight: 800; border-top: 2px solid #94a3b8; font-size: 11px;">
                    <td colspan="4" style="padding: 7px; text-align: right;">TOTAL PRODUCTOS RANKING:</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace;">${totalQty}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; color: #006948;">Bs ${(totalRevCents / 100).toFixed(2)}</td>
                    <td style="padding: 7px; text-align: center;">-</td>
                </tr>
            `;
        } else if (reportType === 'margins') {
            const totalSold = margins.reduce((acc, m) => acc + m.total_sold, 0);

            summaryBoxesHtml = `
                <div class="kpi-grid">
                    <div class="kpi-card">
                        <div class="kpi-label">Ganancia Bruta Acumulada</div>
                        <div class="kpi-val" style="color: #006948;">Bs ${(totalProfitCents / 100).toFixed(2)}</div>
                        <div class="kpi-sub">Utilidad neta operativa</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Total Unidades Vendidas</div>
                        <div class="kpi-val">${totalSold.toLocaleString()} uds</div>
                        <div class="kpi-sub">Rotación de medicamentos</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Líneas Analizadas</div>
                        <div class="kpi-val">${margins.length}</div>
                        <div class="kpi-sub">Medicamentos con costos</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Margen Comercial Medio</div>
                        <div class="kpi-val" style="color: #047857;">
                            ${margins.length > 0 ? Math.round(margins.reduce((acc, m) => acc + m.margin_percent, 0) / margins.length) : 0}%
                        </div>
                        <div class="kpi-sub">Rendimiento ponderado</div>
                    </div>
                </div>
            `;

            tableHeaderHtml = `
                <tr>
                    <th style="width: 25px; text-align: center;">#</th>
                    <th>Medicamento</th>
                    <th style="width: 100px;">Categoría</th>
                    <th style="text-align: right; width: 75px;">Costo Unit.</th>
                    <th style="text-align: right; width: 75px;">Precio Vta.</th>
                    <th style="text-align: right; width: 75px;">Margen U.</th>
                    <th style="text-align: center; width: 65px;">Margen %</th>
                    <th style="text-align: right; width: 65px;">Uds.</th>
                    <th style="text-align: right; width: 95px;">Ganancia Total</th>
                </tr>
            `;

            tableBodyHtml = margins.map((m, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10.5px; ${idx % 2 === 0 ? 'background: #ffffff;' : 'background: #f8fafc;'}">
                    <td style="padding: 6px; text-align: center; color: #64748b;">${idx + 1}</td>
                    <td style="padding: 6px; font-weight: bold; color: #0f172a;">${m.name}</td>
                    <td style="padding: 6px; color: #475569;">${m.category || 'General'}</td>
                    <td style="padding: 6px; text-align: right; font-family: monospace; color: #64748b;">Bs ${(m.cost_cents / 100).toFixed(2)}</td>
                    <td style="padding: 6px; text-align: right; font-family: monospace; font-weight: 600;">Bs ${(m.price_cents / 100).toFixed(2)}</td>
                    <td style="padding: 6px; text-align: right; font-family: monospace; color: #047857; font-weight: bold;">Bs ${(m.margin_cents / 100).toFixed(2)}</td>
                    <td style="padding: 6px; text-align: center;">
                        <span style="background: #e6f4ea; color: #137333; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 9.5px;">${m.margin_percent}%</span>
                    </td>
                    <td style="padding: 6px; text-align: right; font-family: monospace; font-weight: 600;">${m.total_sold}</td>
                    <td style="padding: 6px; text-align: right; font-weight: bold; font-family: monospace; color: #006948; font-size: 11px;">Bs ${(m.total_profit_cents / 100).toFixed(2)}</td>
                </tr>
            `).join('') + `
                <tr style="background: #e2e8f0 !important; font-weight: 800; border-top: 2px solid #94a3b8; font-size: 11px;">
                    <td colspan="7" style="padding: 7px; text-align: right;">TOTAL GANANCIA BRUTA OPERATIVA:</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace;">${totalSold}</td>
                    <td style="padding: 7px; text-align: right; font-family: monospace; color: #006948; font-size: 12px;">Bs ${(totalProfitCents / 100).toFixed(2)}</td>
                </tr>
            `;
        }

        const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>${currentMeta.title} - ${pharmacyName}</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 10mm 12mm 12mm 12mm;
        }
        * {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        body {
            margin: 0;
            padding: 0;
            color: #0f172a;
            background: #ffffff;
            font-size: 11px;
            line-height: 1.35;
        }
        .header-box {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #006948;
            padding-bottom: 10px;
            margin-bottom: 12px;
        }
        .brand-title {
            font-size: 19px;
            font-weight: 800;
            color: #006948;
            letter-spacing: -0.5px;
            margin: 0 0 3px 0;
        }
        .brand-sub {
            font-size: 10.5px;
            color: #64748b;
            margin: 0;
        }
        .meta-box {
            text-align: right;
            font-size: 10.5px;
            color: #475569;
        }
        .meta-tag {
            display: inline-block;
            background: #e6f4ea;
            color: #006948;
            font-weight: 700;
            padding: 3px 7px;
            border-radius: 4px;
            font-size: 9.5px;
            text-transform: uppercase;
            margin-bottom: 3px;
        }
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 14px;
        }
        .kpi-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 7px 9px;
        }
        .kpi-label {
            font-size: 8.5px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }
        .kpi-val {
            font-size: 14px;
            font-weight: 800;
            color: #0f172a;
            font-family: monospace;
            margin-top: 2px;
        }
        .kpi-sub {
            font-size: 9px;
            color: #475569;
        }
        .report-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
        }
        .report-table th {
            background: #f1f5f9;
            color: #334155;
            font-size: 9.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            padding: 6px;
            border-bottom: 2px solid #cbd5e1;
            text-align: left;
        }
        .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-top: 30px;
            page-break-inside: avoid;
        }
        .sign-line {
            border-top: 1px solid #94a3b8;
            text-align: center;
            padding-top: 5px;
            font-size: 10px;
            color: #475569;
        }
        .sign-title {
            font-weight: 700;
            color: #0f172a;
            font-size: 10.5px;
        }
        .footer-note {
            text-align: center;
            font-size: 8.5px;
            color: #94a3b8;
            margin-top: 16px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 6px;
        }
        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
        }
    </style>
</head>
<body>
    <div class="header-box">
        <div>
            <div class="brand-title">${pharmacyName}</div>
            <p class="brand-sub">NIT: ${pharmacyNit} • ${pharmacyAddress}</p>
            <p class="brand-sub">Teléfono: ${pharmacyPhone} • Sistema PharmaCore ERP Clinical</p>
        </div>
        <div class="meta-box">
            <span class="meta-tag">${currentMeta.tag}</span>
            <div style="font-weight: bold; margin-top: 3px;">Período: ${formatDate(range.from)} al ${formatDate(range.to)}</div>
            <div style="font-size: 9.5px; color: #475569;">Cajero / Operador: <strong>${selectedCashierLabel}</strong></div>
            <div style="font-size: 9.5px; color: #64748b;">Generado: ${generatedDateStr} por ${currentUserEmail}</div>
            ${reportType === 'sales_list' ? `
                <div style="font-size: 9px; color: #006948; font-weight: 600; margin-top: 3px; background: #e6f4ea; padding: 2px 6px; border-radius: 4px; border: 1px solid #b7e1cd;">
                    Filtros: ${paymentFilterLabel} • ${statusFilterLabel} • ${shiftFilterLabel}${searchQuery.trim() ? ` • Búsqueda: "${searchQuery}"` : ''}
                </div>
            ` : ''}
        </div>
    </div>

    ${summaryBoxesHtml}

    <table class="report-table">
        <thead>
            ${tableHeaderHtml}
        </thead>
        <tbody>
            ${tableBodyHtml}
        </tbody>
    </table>

    <div class="signatures">
        <div class="sign-line">
            <div class="sign-title">Responsable de Caja / Operador</div>
            <div>Declaración de tickets y valores entregados</div>
        </div>
        <div class="sign-line">
            <div class="sign-title">Administración / Auditoría Interna</div>
            <div>Cotejo de planilla contra base de datos</div>
        </div>
    </div>

    <div class="footer-note">
        Documento oficial generado automáticamente por PharmaCore ERP Clinical.<br>
        Todos los registros han sido auditados contra las transacciones registradas en base de datos.
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 300);
        };
    </script>
</body>
</html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/80 backdrop-blur-sm overflow-y-auto">
            <div className="bg-surface-container-lowest w-full max-w-5xl rounded-2xl shadow-2xl border border-surface-container flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Cabecera del Modal */}
                <div className="p-4 px-6 bg-inverse-surface text-inverse-on-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary text-on-primary flex items-center justify-center shadow-sm">
                            <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                        </div>
                        <div>
                            <h2 className="text-sm font-bold tracking-tight">
                                {reportTitles[reportType].title}
                            </h2>
                            <p className="text-xs text-secondary-fixed-dim">
                                Período: {formatDate(range.from)} al {formatDate(range.to)} • {selectedCashierName}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Selector de tipo de reporte en el modal */}
                        <div className="flex bg-inverse-surface/90 border border-surface-container-high/40 p-0.5 rounded-lg text-xs">
                            <button
                                type="button"
                                onClick={() => setReportType('sales_list')}
                                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                                    reportType === 'sales_list' ? 'bg-primary text-on-primary' : 'text-inverse-on-surface/80 hover:text-inverse-on-surface'
                                }`}
                                title="Ver Planilla de Ventas"
                            >
                                Ventas
                            </button>
                            <button
                                type="button"
                                onClick={() => setReportType('cash_audit')}
                                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                                    reportType === 'cash_audit' ? 'bg-primary text-on-primary' : 'text-inverse-on-surface/80 hover:text-inverse-on-surface'
                                }`}
                                title="Ver Cuadre de Cajeros"
                            >
                                Cuadre
                            </button>
                            <button
                                type="button"
                                onClick={() => setReportType('top_products')}
                                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                                    reportType === 'top_products' ? 'bg-primary text-on-primary' : 'text-inverse-on-surface/80 hover:text-inverse-on-surface'
                                }`}
                                title="Ver Ranking de Productos"
                            >
                                Top Prods
                            </button>
                            <button
                                type="button"
                                onClick={() => setReportType('margins')}
                                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                                    reportType === 'margins' ? 'bg-primary text-on-primary' : 'text-inverse-on-surface/80 hover:text-inverse-on-surface'
                                }`}
                                title="Ver Márgenes y Rentabilidad"
                            >
                                Márgenes
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={handlePrintPdf}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[18px]">print</span>
                            <span>Imprimir / Guardar PDF</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-surface-container-high/30 text-inverse-on-surface/80 hover:text-inverse-on-surface transition-colors cursor-pointer"
                            title="Cerrar vista previa"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>
                </div>

                {/* Sub-barra de filtros interactivos para sales_list */}
                {reportType === 'sales_list' && (
                    <div className="bg-surface-container-low px-6 py-3 border-b border-surface-container flex flex-col gap-2.5 text-xs shrink-0 shadow-xs">
                        {/* Fila 1: Ejes Principales (Modo, Cajero, Método de Pago, Estado) */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Modo de visualización */}
                                <div className="flex items-center gap-1.5">
                                    <span className="text-secondary font-semibold text-[11px] uppercase tracking-wider">Modo:</span>
                                    <div className="flex items-center gap-1 bg-surface-container-lowest p-0.5 rounded-lg border border-surface-container">
                                        <button
                                            type="button"
                                            onClick={() => setSalesGroupingMode('by_cashier')}
                                            className={`flex items-center gap-1 px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                                                salesGroupingMode === 'by_cashier'
                                                    ? 'bg-primary text-on-primary shadow-xs'
                                                    : 'text-secondary hover:text-on-surface'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[15px]">badge</span>
                                            <span>Por Cajeros ({cashierSalesGroups.length})</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSalesGroupingMode('flat')}
                                            className={`flex items-center gap-1 px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                                                salesGroupingMode === 'flat'
                                                    ? 'bg-primary text-on-primary shadow-xs'
                                                    : 'text-secondary hover:text-on-surface'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[15px]">list_alt</span>
                                            <span>Cronológico ({filteredSales.length})</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Selector de Cajero */}
                                <div className="flex items-center gap-1.5 bg-surface-container-lowest px-2.5 py-1 rounded-lg border border-surface-container">
                                    <span className="material-symbols-outlined text-[16px] text-primary">person</span>
                                    <select
                                        value={selectedCashierId}
                                        onChange={(e) => setSelectedCashierId(e.target.value)}
                                        className="bg-transparent text-on-surface font-semibold text-xs focus:outline-none cursor-pointer max-w-[170px] truncate"
                                    >
                                        <option value="ALL">Todos los Cajeros ({availableCashiers.length})</option>
                                        {availableCashiers.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Filtro Método de Pago */}
                                <div className="flex items-center gap-1 bg-surface-container-lowest p-0.5 rounded-lg border border-surface-container">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('ALL')}
                                        className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                            paymentMethodFilter === 'ALL'
                                                ? 'bg-primary text-on-primary'
                                                : 'text-secondary hover:text-on-surface'
                                        }`}
                                    >
                                        Todos Pagos
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('cash')}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                            paymentMethodFilter === 'cash'
                                                ? 'bg-emerald-700 text-white'
                                                : 'text-emerald-700 hover:bg-emerald-50'
                                        }`}
                                        title="Filtrar ventas en Efectivo"
                                    >
                                        <span className="material-symbols-outlined text-[13px]">payments</span>
                                        <span>Efectivo</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('card')}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                            paymentMethodFilter === 'card'
                                                ? 'bg-blue-700 text-white'
                                                : 'text-blue-700 hover:bg-blue-50'
                                        }`}
                                        title="Filtrar ventas con Tarjeta"
                                    >
                                        <span className="material-symbols-outlined text-[13px]">credit_card</span>
                                        <span>Tarjeta</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('qr')}
                                        className={`flex items-center gap-1 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                            paymentMethodFilter === 'qr'
                                                ? 'bg-purple-700 text-white'
                                                : 'text-purple-700 hover:bg-purple-50'
                                        }`}
                                        title="Filtrar ventas con QR"
                                    >
                                        <span className="material-symbols-outlined text-[13px]">qr_code_2</span>
                                        <span>QR</span>
                                    </button>
                                </div>
                            </div>

                            {/* Filtro Estado */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-secondary font-semibold text-[11px] uppercase tracking-wider">Estado:</span>
                                <div className="flex items-center gap-1 bg-surface-container-lowest p-0.5 rounded-lg border border-surface-container">
                                    <button
                                        type="button"
                                        onClick={() => setSalesStatusFilter('all')}
                                        className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                            salesStatusFilter === 'all'
                                                ? 'bg-primary text-on-primary'
                                                : 'text-secondary hover:text-on-surface'
                                        }`}
                                    >
                                        Todos ({sales.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSalesStatusFilter('completed')}
                                        className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                            salesStatusFilter === 'completed'
                                                ? 'bg-emerald-700 text-white'
                                                : 'text-emerald-700 hover:bg-emerald-50'
                                        }`}
                                    >
                                        Válidos ({salesMetrics.validCount})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSalesStatusFilter('cancelled')}
                                        className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                            salesStatusFilter === 'cancelled'
                                                ? 'bg-rose-700 text-white'
                                                : 'text-rose-700 hover:bg-rose-50'
                                        }`}
                                    >
                                        Anulados ({salesMetrics.cancelledCount})
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Fila 2: Turnos/Horarios, Búsqueda rápida y Reseteo */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-surface-container/60">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Filtro de Turno / Horario */}
                                <div className="flex items-center gap-1.5">
                                    <span className="text-secondary font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                                        Turno:
                                    </span>
                                    <div className="flex items-center gap-1 bg-surface-container-lowest p-0.5 rounded-lg border border-surface-container">
                                        <button
                                            type="button"
                                            onClick={() => setTimeShiftFilter('ALL')}
                                            className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                                timeShiftFilter === 'ALL'
                                                    ? 'bg-primary text-on-primary'
                                                    : 'text-secondary hover:text-on-surface'
                                            }`}
                                        >
                                            Todo el Día
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTimeShiftFilter('morning')}
                                            className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                                timeShiftFilter === 'morning'
                                                    ? 'bg-amber-600 text-white'
                                                    : 'text-amber-700 hover:bg-amber-50'
                                            }`}
                                            title="Turno Mañana: 06:00 a 14:30"
                                        >
                                            ☀️ Mañana (06-14:30)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTimeShiftFilter('afternoon')}
                                            className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                                timeShiftFilter === 'afternoon'
                                                    ? 'bg-indigo-700 text-white'
                                                    : 'text-indigo-700 hover:bg-indigo-50'
                                            }`}
                                            title="Turno Tarde/Noche: 14:30 a 23:30"
                                        >
                                            🌙 Tarde (14:30-23:30)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTimeShiftFilter('custom')}
                                            className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                                                timeShiftFilter === 'custom'
                                                    ? 'bg-primary text-on-primary'
                                                    : 'text-secondary hover:text-on-surface'
                                            }`}
                                        >
                                            Personalizado
                                        </button>
                                    </div>
                                </div>

                                {/* Inputs si es personalizado */}
                                {timeShiftFilter === 'custom' && (
                                    <div className="flex items-center gap-1.5 bg-surface-container-lowest px-2 py-0.5 rounded-lg border border-surface-container">
                                        <span className="text-[10px] text-secondary font-mono">De</span>
                                        <input
                                            type="time"
                                            value={customTimeFrom}
                                            onChange={(e) => setCustomTimeFrom(e.target.value)}
                                            className="bg-transparent text-on-surface text-xs font-mono font-bold focus:outline-none cursor-pointer"
                                        />
                                        <span className="text-[10px] text-secondary font-mono">a</span>
                                        <input
                                            type="time"
                                            value={customTimeTo}
                                            onChange={(e) => setCustomTimeTo(e.target.value)}
                                            className="bg-transparent text-on-surface text-xs font-mono font-bold focus:outline-none cursor-pointer"
                                        />
                                    </div>
                                )}

                                {/* Barra de búsqueda en vivo */}
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-secondary text-[15px]">
                                        search
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Buscar ticket, cliente o NIT..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-7 pr-6 py-1 bg-surface-container-lowest rounded-lg text-xs border border-surface-container text-on-surface placeholder:text-secondary focus:outline-none focus:ring-1 focus:ring-primary w-44 sm:w-56"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface"
                                        >
                                            <span className="material-symbols-outlined text-[13px]">close</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Reseteo y badge informativo */}
                            <div className="flex items-center gap-2">
                                {activeFilterCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleResetFilters}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100 transition-colors cursor-pointer"
                                        title="Restablecer todos los filtros a sus valores predeterminados"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                                        <span>Limpiar ({activeFilterCount})</span>
                                    </button>
                                )}
                                <span className="text-[11px] font-mono text-secondary">
                                    Filtrados: <strong className="text-primary font-bold">{filteredSales.length}</strong> / {sales.length}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Sub-barra de filtros para otros tipos de reportes */}
                {reportType !== 'sales_list' && (
                    <div className="bg-surface-container-low px-6 py-2.5 border-b border-surface-container flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 shadow-xs">
                        <div className="flex flex-wrap items-center gap-3">
                            {reportType === 'cash_audit' && (
                                <div className="flex items-center gap-1.5 bg-surface-container-lowest px-2.5 py-1 rounded-lg border border-surface-container">
                                    <span className="material-symbols-outlined text-[16px] text-primary">person</span>
                                    <select
                                        value={selectedCashierId}
                                        onChange={(e) => setSelectedCashierId(e.target.value)}
                                        className="bg-transparent text-on-surface font-semibold text-xs focus:outline-none cursor-pointer max-w-[180px] truncate"
                                    >
                                        <option value="ALL">Todos los Cajeros ({availableCashiers.length})</option>
                                        {availableCashiers.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Buscador para productos o márgenes */}
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-secondary text-[15px]">
                                    search
                                </span>
                                <input
                                    type="text"
                                    placeholder={reportType === 'cash_audit' ? "Buscar cajero..." : "Buscar producto o categoría..."}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-7 pr-6 py-1 bg-surface-container-lowest rounded-lg text-xs border border-surface-container text-on-surface placeholder:text-secondary focus:outline-none focus:ring-1 focus:ring-primary w-48 sm:w-64"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface"
                                    >
                                        <span className="material-symbols-outlined text-[13px]">close</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {(searchQuery.trim() || selectedCashierId !== 'ALL') && (
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold hover:bg-rose-100 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                                    <span>Limpiar</span>
                                </button>
                            )}
                            <span className="text-[11px] font-mono text-secondary">
                                {reportType === 'cash_audit' && `Cajeros: ${filteredCashierAuditList.length}`}
                                {reportType === 'top_products' && `Productos: ${filteredTopProducts.length}`}
                                {reportType === 'margins' && `Productos: ${filteredMargins.length}`}
                            </span>
                        </div>
                    </div>
                )}

                {/* Hoja de Vista Previa A4 */}
                <div className="p-6 overflow-y-auto bg-surface-container-low/50 flex justify-center">
                    <div className="bg-white text-slate-900 w-full max-w-4xl rounded-xl shadow-md border border-slate-200 p-8 flex flex-col gap-5 font-sans">
                        {/* Cabecera Clínica */}
                        <div className="flex justify-between items-start border-b-2 border-primary pb-3">
                            <div>
                                <h1 className="text-xl font-black text-primary tracking-tight">{pharmacyName}</h1>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    NIT: {pharmacyNit} • {pharmacyAddress}
                                </p>
                                <p className="text-xs text-slate-500">
                                    Teléfono: {pharmacyPhone} • PharmaCore ERP Clinical
                                </p>
                            </div>
                            <div className="text-right flex flex-col items-end">
                                <span className="inline-block bg-primary/10 text-primary font-bold text-[10px] uppercase px-2.5 py-1 rounded">
                                    {reportTitles[reportType].tag}
                                </span>
                                <div className="text-xs font-bold text-slate-800 mt-1">
                                    {formatDate(range.from)} al {formatDate(range.to)}
                                </div>
                                <div className="text-[11px] text-slate-600 font-semibold">Cajero / Operador: {selectedCashierLabel}</div>
                                <div className="text-[10px] text-slate-400">Emisión: {generatedDateStr}</div>
                                {reportType === 'sales_list' && (
                                    <div className="text-[9.5px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mt-1 font-medium text-right">
                                        Filtros: {paymentFilterLabel} • {statusFilterLabel} • {shiftFilterLabel}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* REPORTE 1: PLANILLA DE VENTAS */}
                        {reportType === 'sales_list' && (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                                            Total Recaudado
                                        </span>
                                        <div className="text-lg font-extrabold font-mono text-primary mt-0.5">
                                            Bs {(salesMetrics.totalValidSalesCents / 100).toFixed(2)}
                                        </div>
                                        <span className="text-[10px] text-slate-500 block mt-0.5">
                                            {salesMetrics.validCount} ventas válidas
                                        </span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                                            Efectivo en Caja
                                        </span>
                                        <div className="text-lg font-extrabold font-mono text-emerald-700 mt-0.5">
                                            Bs {(salesMetrics.cashCents / 100).toFixed(2)}
                                        </div>
                                        <span className="text-[10px] text-slate-500 block mt-0.5">Caja chica</span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                                            Tarjetas & QR
                                        </span>
                                        <div className="text-lg font-extrabold font-mono text-blue-700 mt-0.5">
                                            Bs {((salesMetrics.cardCents + salesMetrics.qrCents) / 100).toFixed(2)}
                                        </div>
                                        <span className="text-[10px] text-slate-500 block mt-0.5">Medios digitales</span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                                            Ventas Anuladas
                                        </span>
                                        <div className="text-lg font-extrabold font-mono text-rose-700 mt-0.5">
                                            Bs {(salesMetrics.totalCancelledCents / 100).toFixed(2)}
                                        </div>
                                        <span className="text-[10px] text-rose-600 block mt-0.5">
                                            {salesMetrics.cancelledCount} anulada(s)
                                        </span>
                                    </div>
                                </div>

                                {salesGroupingMode === 'by_cashier' ? (
                                    <div className="space-y-4">
                                        {cashierSalesGroups.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 border border-slate-200 rounded-lg">
                                                Sin tickets de venta para el filtro seleccionado.
                                            </div>
                                        ) : (
                                            cashierSalesGroups.map((group, groupIdx) => {
                                                const firstTime = new Date(group.firstSaleAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                const lastTime = new Date(group.lastSaleAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                const scheduleStr = group.firstSaleAt === group.lastSaleAt ? firstTime : `${firstTime} a ${lastTime}`;

                                                return (
                                                    <div key={group.cashierId} className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                                        {/* Cabecera del Cajero con Horario de Actividad */}
                                                        <div className="bg-slate-900 text-white p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="bg-primary text-white text-[10px] font-black uppercase px-2 py-0.5 rounded">
                                                                    Cajero #{groupIdx + 1}
                                                                </span>
                                                                <span className="font-bold text-sm text-white tracking-tight">{group.cashierName}</span>
                                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-300 ml-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                                                    <span className="material-symbols-outlined text-[13px] text-emerald-400">schedule</span>
                                                                    <span>Horario: <strong className="font-mono text-white">{scheduleStr}</strong></span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3 text-xs">
                                                                <span className="text-slate-300">
                                                                    {group.validCount} ventas válidas {group.cancelledCount > 0 ? `• ${group.cancelledCount} anul.` : ''}
                                                                </span>
                                                                <span className="font-bold font-mono text-emerald-400 text-sm">
                                                                    Bs {(group.totalValidCents / 100).toFixed(2)}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Tabla de ventas individuales del cajero */}
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left text-xs">
                                                                <thead>
                                                                    <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                                                                        <th className="p-2 text-center w-8">#</th>
                                                                        <th className="p-2">ID Ticket</th>
                                                                        <th className="p-2">Fecha y Hora Exacta</th>
                                                                        <th className="p-2">Cliente / NIT</th>
                                                                        <th className="p-2 text-center">Método</th>
                                                                        <th className="p-2 text-right">Descuento</th>
                                                                        <th className="p-2 text-right">Total (Bs)</th>
                                                                        <th className="p-2 text-center">Estado</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-200">
                                                                    {group.sales.map((s, idx) => {
                                                                        const isCancelled = s.status === 'cancelled';
                                                                        return (
                                                                            <tr
                                                                                key={s.id}
                                                                                className={`hover:bg-slate-50 ${isCancelled ? 'bg-rose-50/60 line-through opacity-70' : ''}`}
                                                                            >
                                                                                <td className="p-2 text-center font-mono text-slate-400">{idx + 1}</td>
                                                                                <td className="p-2 font-bold font-mono text-primary">#{s.id.slice(0, 8)}</td>
                                                                                <td className="p-2 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                                                                                    {new Date(s.created_at).toLocaleString('es-ES', {
                                                                                        day: '2-digit',
                                                                                        month: '2-digit',
                                                                                        year: 'numeric',
                                                                                        hour: '2-digit',
                                                                                        minute: '2-digit',
                                                                                        second: '2-digit',
                                                                                    })}
                                                                                </td>
                                                                                <td className="p-2 text-slate-700 truncate max-w-[170px]">
                                                                                    {s.client_name ? `${s.client_name}${s.client_nit ? ` (${s.client_nit})` : ''}` : 'Público General'}
                                                                                </td>
                                                                                <td className="p-2 text-center">
                                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                                                        s.payment_method === 'card' ? 'bg-blue-100 text-blue-800' : s.payment_method === 'qr' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                                                                                    }`}>
                                                                                        {s.payment_method === 'card' ? 'Tarjeta' : s.payment_method === 'qr' ? 'QR' : 'Efectivo'}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-2 text-right font-mono text-rose-700 font-semibold">
                                                                                    {s.discount_cents && s.discount_cents > 0 ? `-Bs ${(s.discount_cents / 100).toFixed(2)}` : '-'}
                                                                                </td>
                                                                                <td className="p-2 text-right font-mono font-bold text-slate-900">
                                                                                    Bs {(s.total_cents / 100).toFixed(2)}
                                                                                </td>
                                                                                <td className="p-2 text-center">
                                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                                        isCancelled ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                                                                                    }`}>
                                                                                        {isCancelled ? 'ANULADA' : 'VENDIDO'}
                                                                                    </span>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        {/* Subtotal del Cajero */}
                                                        <div className="bg-slate-50 border-t border-slate-200 p-2.5 px-4 flex flex-wrap items-center justify-between text-xs text-slate-700">
                                                            <div className="flex items-center gap-4 text-[11px]">
                                                                <span>Efectivo: <strong className="font-mono text-emerald-700">Bs {(group.cashCents / 100).toFixed(2)}</strong></span>
                                                                <span>Digital: <strong className="font-mono text-blue-700">Bs {((group.cardCents + group.qrCents) / 100).toFixed(2)}</strong></span>
                                                                {group.totalDiscountCents > 0 && (
                                                                    <span>Descuentos: <strong className="font-mono text-rose-700">-Bs {(group.totalDiscountCents / 100).toFixed(2)}</strong></span>
                                                                )}
                                                            </div>
                                                            <div className="font-mono font-bold text-slate-900">
                                                                Subtotal {group.cashierName}: <span className="text-primary font-black text-sm">Bs {(group.totalValidCents / 100).toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}

                                        {/* Barra de Gran Total Planilla */}
                                        <div className="bg-slate-100 border-2 border-slate-300 rounded-xl p-3 px-5 flex flex-wrap items-center justify-between text-xs font-bold">
                                            <span className="uppercase text-slate-700 tracking-wider">
                                                Gran Total Planilla ({filteredSales.length} tickets • {cashierSalesGroups.length} cajeros):
                                            </span>
                                            <div className="flex items-center gap-5">
                                                <span className="text-rose-700 font-mono">
                                                    Descuentos: -Bs ${(salesMetrics.totalDiscountsCents / 100).toFixed(2)}
                                                </span>
                                                <span className="text-primary font-black font-mono text-base">
                                                    Bs ${(salesMetrics.totalValidSalesCents / 100).toFixed(2)}
                                                </span>
                                                <span className="text-[11px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-300">
                                                    {salesMetrics.validCount} OK / {salesMetrics.cancelledCount} Anul
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                                                    <th className="p-2 text-center w-8">#</th>
                                                    <th className="p-2">ID Ticket</th>
                                                    <th className="p-2">Fecha y Hora Exacta</th>
                                                    <th className="p-2">Cajero</th>
                                                    <th className="p-2">Cliente / NIT</th>
                                                    <th className="p-2 text-center">Método</th>
                                                    <th className="p-2 text-right">Descuento</th>
                                                    <th className="p-2 text-right">Total (Bs)</th>
                                                    <th className="p-2 text-center">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {filteredSales.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={9} className="text-center py-6 text-slate-400">
                                                            Sin tickets de venta registrados.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredSales.map((s, idx) => {
                                                        const isCancelled = s.status === 'cancelled';
                                                        return (
                                                            <tr
                                                                key={s.id}
                                                                className={`hover:bg-slate-50 ${isCancelled ? 'bg-rose-50/60 line-through opacity-70' : ''}`}
                                                            >
                                                                <td className="p-2 text-center font-mono text-slate-400">{idx + 1}</td>
                                                                <td className="p-2 font-bold font-mono text-primary">#{s.id.slice(0, 8)}</td>
                                                                <td className="p-2 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                                                                    {new Date(s.created_at).toLocaleString('es-ES', {
                                                                        day: '2-digit',
                                                                        month: '2-digit',
                                                                        year: 'numeric',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit',
                                                                        second: '2-digit',
                                                                    })}
                                                                </td>
                                                                <td className="p-2 font-semibold text-slate-800">
                                                                    {(s.user_profiles as any)?.full_name || 'Cajero'}
                                                                </td>
                                                                <td className="p-2 text-slate-600 truncate max-w-[150px]">
                                                                    {s.client_name ? `${s.client_name}${s.client_nit ? ` (${s.client_nit})` : ''}` : 'Público General'}
                                                                </td>
                                                                <td className="p-2 text-center">
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                                        s.payment_method === 'card' ? 'bg-blue-100 text-blue-800' : s.payment_method === 'qr' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                                                                    }`}>
                                                                        {s.payment_method === 'card' ? 'Tarjeta' : s.payment_method === 'qr' ? 'QR' : 'Efectivo'}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2 text-right font-mono text-rose-700 font-semibold">
                                                                    {s.discount_cents && s.discount_cents > 0 ? `-Bs ${(s.discount_cents / 100).toFixed(2)}` : '-'}
                                                                </td>
                                                                <td className="p-2 text-right font-mono font-bold text-slate-900">
                                                                    Bs {(s.total_cents / 100).toFixed(2)}
                                                                </td>
                                                                <td className="p-2 text-center">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                        isCancelled ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                                                                    }`}>
                                                                        {isCancelled ? 'ANULADA' : 'VENDIDO'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                                    <td colSpan={6} className="p-2 text-right uppercase text-[10px] text-slate-700">
                                                        Total Planilla ({filteredSales.length} tickets):
                                                    </td>
                                                    <td className="p-2 text-right font-mono text-rose-700">
                                                        -Bs ${(salesMetrics.totalDiscountsCents / 100).toFixed(2)}
                                                    </td>
                                                    <td className="p-2 text-right font-mono text-primary text-sm font-black">
                                                        Bs ${(salesMetrics.totalValidSalesCents / 100).toFixed(2)}
                                                    </td>
                                                    <td className="p-2 text-center text-[10px] font-mono text-slate-600">
                                                        {salesMetrics.validCount} OK / {salesMetrics.cancelledCount} Anul
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}

                        {/* REPORTE 2: CUADRE DE CAJAS */}
                        {reportType === 'cash_audit' && (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Total Recaudado</span>
                                        <div className="text-lg font-extrabold font-mono text-primary mt-0.5">
                                            Bs {(cashCloseSummary.totalSalesCents / 100).toFixed(2)}
                                        </div>
                                        <span className="text-[10px] text-slate-500 block mt-0.5">{cashCloseSummary.totalTickets} ventas</span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Efectivo</span>
                                        <div className="text-lg font-extrabold font-mono text-emerald-700 mt-0.5">
                                            Bs {(cashCloseSummary.cashCents / 100).toFixed(2)}
                                        </div>
                                        <span className="text-[10px] text-slate-500 block mt-0.5">Caja chica</span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Tarjetas POS</span>
                                        <div className="text-lg font-extrabold font-mono text-blue-700 mt-0.5">
                                            Bs {(cashCloseSummary.cardCents / 100).toFixed(2)}
                                        </div>
                                        <span className="text-[10px] text-slate-500 block mt-0.5">Terminal</span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">Transferencias QR</span>
                                        <div className="text-lg font-extrabold font-mono text-purple-700 mt-0.5">
                                            Bs {(cashCloseSummary.qrCents / 100).toFixed(2)}
                                        </div>
                                        <span className="text-[10px] text-slate-500 block mt-0.5">SPEI / QR</span>
                                    </div>
                                </div>

                                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                    <table className="w-full text-left text-xs">
                                        <thead>
                                            <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                                                <th className="p-2 text-center w-8">#</th>
                                                <th className="p-2">Cajero / Operador</th>
                                                <th className="p-2 text-center">Tickets</th>
                                                <th className="p-2 text-right">Efectivo</th>
                                                <th className="p-2 text-right">Tarjeta</th>
                                                <th className="p-2 text-right">QR</th>
                                                <th className="p-2 text-right">Total Recaudado</th>
                                                <th className="p-2 text-center">Rango Horario</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {filteredCashierAuditList.map((c, idx) => (
                                                <tr key={c.userId} className="hover:bg-slate-50">
                                                    <td className="p-2 text-center font-mono text-slate-400">{idx + 1}</td>
                                                    <td className="p-2 font-bold text-slate-800">{c.name}</td>
                                                    <td className="p-2 text-center font-mono font-semibold">{c.tickets}</td>
                                                    <td className="p-2 text-right font-mono text-emerald-700 font-semibold">
                                                        Bs {(c.cashCents / 100).toFixed(2)}
                                                    </td>
                                                    <td className="p-2 text-right font-mono text-blue-700 font-semibold">
                                                        Bs {(c.cardCents / 100).toFixed(2)}
                                                    </td>
                                                    <td className="p-2 text-right font-mono text-purple-700 font-semibold">
                                                        Bs {(c.qrCents / 100).toFixed(2)}
                                                    </td>
                                                    <td className="p-2 text-right font-mono font-bold text-primary">
                                                        Bs {(c.totalCents / 100).toFixed(2)}
                                                    </td>
                                                    <td className="p-2 text-center font-mono text-slate-500 text-[10px]">
                                                        {new Date(c.firstSale).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - 
                                                        {new Date(c.lastSale).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                                <td colSpan={2} className="p-2 text-right uppercase text-[10px] text-slate-700">Total Arqueo:</td>
                                                <td className="p-2 text-center font-mono">{cashCloseSummary.totalTickets}</td>
                                                <td className="p-2 text-right font-mono text-emerald-700">Bs {(cashCloseSummary.cashCents / 100).toFixed(2)}</td>
                                                <td className="p-2 text-right font-mono text-blue-700">Bs {(cashCloseSummary.cardCents / 100).toFixed(2)}</td>
                                                <td className="p-2 text-right font-mono text-purple-700">Bs {(cashCloseSummary.qrCents / 100).toFixed(2)}</td>
                                                <td className="p-2 text-right font-mono text-primary font-bold">Bs {(cashCloseSummary.totalSalesCents / 100).toFixed(2)}</td>
                                                <td className="p-2 text-center text-slate-500 text-[10px]">{cashCloseSummary.cashierAuditList.length} cajeros</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* REPORTE 3: TOP PRODUCTOS */}
                        {reportType === 'top_products' && (
                            <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                                            <th className="p-2 text-center w-8">#</th>
                                            <th className="p-2">SKU</th>
                                            <th className="p-2">Medicamento</th>
                                            <th className="p-2">Categoría</th>
                                            <th className="p-2 text-right">Cant. Vendida</th>
                                            <th className="p-2 text-right">Ingreso Total</th>
                                            <th className="p-2 text-center">Margen</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {filteredTopProducts.map((p, idx) => (
                                            <tr key={p.product_id} className="hover:bg-slate-50">
                                                <td className="p-2 text-center font-bold text-primary">{idx + 1}</td>
                                                <td className="p-2 font-mono text-slate-500">{p.sku || '-'}</td>
                                                <td className="p-2 font-semibold text-slate-800">{p.name}</td>
                                                <td className="p-2 text-slate-600">{p.category || 'General'}</td>
                                                <td className="p-2 text-right font-mono font-bold">{p.total_quantity}</td>
                                                <td className="p-2 text-right font-mono font-bold text-primary">
                                                    {formatBs(p.total_revenue_cents)}
                                                </td>
                                                <td className="p-2 text-center">
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                                        {p.margin_percent}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* REPORTE 4: MATRIZ DE RENTABILIDAD Y MÁRGENES */}
                        {reportType === 'margins' && (
                            <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                                            <th className="p-2 text-center w-8">#</th>
                                            <th className="p-2">Medicamento</th>
                                            <th className="p-2">Categoría</th>
                                            <th className="p-2 text-right">Costo Unit.</th>
                                            <th className="p-2 text-right">Precio Vta.</th>
                                            <th className="p-2 text-right">Margen U.</th>
                                            <th className="p-2 text-center">Margen %</th>
                                            <th className="p-2 text-right">Uds.</th>
                                            <th className="p-2 text-right">Ganancia Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {filteredMargins.map((m, idx) => (
                                            <tr key={m.product_id} className="hover:bg-slate-50">
                                                <td className="p-2 text-center font-mono text-slate-400">{idx + 1}</td>
                                                <td className="p-2 font-bold text-slate-800">{m.name}</td>
                                                <td className="p-2 text-slate-600">{m.category || 'General'}</td>
                                                <td className="p-2 text-right font-mono text-slate-500">{formatBs(m.cost_cents)}</td>
                                                <td className="p-2 text-right font-mono font-semibold">{formatBs(m.price_cents)}</td>
                                                <td className="p-2 text-right font-mono text-emerald-700 font-bold">{formatBs(m.margin_cents)}</td>
                                                <td className="p-2 text-center">
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                                        {m.margin_percent}%
                                                    </span>
                                                </td>
                                                <td className="p-2 text-right font-mono font-semibold">{m.total_sold}</td>
                                                <td className="p-2 text-right font-mono font-bold text-primary">
                                                    {formatBs(m.total_profit_cents)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Firmas de Validación */}
                        <div className="grid grid-cols-2 gap-12 pt-6 mt-2 border-t border-slate-200">
                            <div className="border-t border-slate-400 text-center pt-2">
                                <p className="text-xs font-bold text-slate-800">Responsable de Caja / Operador</p>
                                <p className="text-[10px] text-slate-500">Entrega de Valores y Arqueo</p>
                            </div>
                            <div className="border-t border-slate-400 text-center pt-2">
                                <p className="text-xs font-bold text-slate-800">Auditoría / Administración</p>
                                <p className="text-[10px] text-slate-500">Conciliación Contable y Cierre</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pie del modal */}
                <div className="p-3 px-6 bg-surface-container border-t border-surface-container flex items-center justify-between text-xs text-secondary shrink-0">
                    <span>💡 Elige "Guardar como PDF" en la ventana de impresión para descargar el archivo directamente.</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold transition-colors cursor-pointer"
                    >
                        Cerrar Vista Previa
                    </button>
                </div>
            </div>
        </div>
    );
}
