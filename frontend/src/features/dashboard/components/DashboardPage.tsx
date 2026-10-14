import { useState, useMemo, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDashboard } from '../hooks/useDashboard';
import { exportToCsv } from '@/lib/exportUtils';
import TicketReceipt from '@/features/pos/components/TicketReceipt';
import CashCloseModal from '@/features/pos/components/CashCloseModal';
import KardexModal from '@/features/products/components/KardexModal';
import { addBatchToProduct, writeOffBatch } from '../services/dashboardApi';
import { useHasPermission } from '@/features/users/hooks/usePermissions';

export default function DashboardPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const canViewDashboard = useHasPermission('dashboard:view');
    // Permiso dinámico RBAC: Administrador, o cualquier rol que tenga 'dashboard:financial' o 'reports:view'
    const canViewFinancials = useHasPermission('dashboard:financial') || useHasPermission('reports:view');

    // Versión 100% automática según permisos dinámicos del rol:
    // - Con permiso financiero: Vista Gerencial Completa (Finanzas, Ventas, Cajas, Stock y Alertas)
    // - Sin permiso financiero: Vista Operativa / Vendedores (Únicamente Stock Crítico, Vencimientos FEFO y Alertas)
    const effectiveMode: 'financial' | 'operational' = canViewFinancials ? 'financial' : 'operational';

    const { data, isLoading, isFetching, isError, error, refetch } = useDashboard();

    // Reimpresión de ticket desde transacciones recientes
    const [reprintSaleId, setReprintSaleId] = useState<string | null>(null);

    // Modal de Arqueo / Cierre de Turno
    const [isCashCloseOpen, setIsCashCloseOpen] = useState(false);

    // Modal de Kardex Clínico
    const [kardexProduct, setKardexProduct] = useState<{ id: string; name: string } | null>(null);

    // Modal de Reabastecimiento / Ingreso de Lote (para Stock Bajo)
    const [restockProduct, setRestockProduct] = useState<{
        id: string;
        name: string;
        stock: number;
        min_stock: number;
        laboratory?: string;
    } | null>(null);
    const [restockLotNumber, setRestockLotNumber] = useState('');
    const [restockExpDate, setRestockExpDate] = useState('');
    const [restockQty, setRestockQty] = useState('10');

    // Modal de Baja / Retiro de Lote Vencido (para FEFO)
    const [writeOffItem, setWriteOffItem] = useState<{
        productId: string;
        batchId: string;
        name: string;
        lot_number: string | null;
        stock: number;
        expiration_date: string;
        diffDays: number;
    } | null>(null);
    const [writeOffQty, setWriteOffQty] = useState('0');
    const [writeOffReason, setWriteOffReason] = useState('Vencimiento de medicamento / Baja sanitaria');

    // Filtros de tabla: Ventas Recientes (Paginada a 5 para cuadrar en tamaño con la columna lateral)
    const [salesTab, setSalesTab] = useState<'all' | 'completed' | 'cancelled'>('all');
    const [salesSearch, setSalesSearch] = useState('');
    const [salesPage, setSalesPage] = useState(1);
    const salesPageSize = 5;

    // Filtros de tabla: ⚠️ Productos con Stock Bajo
    const [stockSearch, setStockSearch] = useState('');
    const [stockLabFilter, setStockLabFilter] = useState('');
    const [stockTypeFilter, setStockTypeFilter] = useState('');
    const [stockPage, setStockPage] = useState(1);
    const stockPageSize = 5;

    // Filtros de tabla: 📅 Productos Próximos a Vencer
    const [expSearch, setExpSearch] = useState('');
    const [expLabFilter, setExpLabFilter] = useState('');
    const [expStatusFilter, setExpStatusFilter] = useState('');
    const [expPage, setExpPage] = useState(1);
    const expPageSize = 5;

    const todayFormatted = useMemo(() => 
        new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
    , []);

    // Atajo de teclado F2 para ir a POS
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                navigate('/pos');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate]);

    // Mutación para ingresar lote (Stock Bajo)
    const restockMut = useMutation({
        mutationFn: addBatchToProduct,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['dashboard-metrics-v2'] });
            qc.invalidateQueries({ queryKey: ['products-catalog'] });
            setRestockProduct(null);
            setRestockLotNumber('');
            setRestockExpDate('');
            setRestockQty('10');
        },
        onError: (err: any) => alert(`Error al registrar lote: ${err.message}`),
    });

    // Mutación para dar de baja lote vencido (FEFO)
    const writeOffMut = useMutation({
        mutationFn: writeOffBatch,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['dashboard-metrics-v2'] });
            qc.invalidateQueries({ queryKey: ['products-catalog'] });
            setWriteOffItem(null);
        },
        onError: (err: any) => alert(`Error al retirar lote: ${err.message}`),
    });

    const handleConfirmRestock = () => {
        if (!restockProduct) return;
        const addNum = parseInt(restockQty, 10);
        if (isNaN(addNum) || addNum <= 0) {
            alert('Ingrese una cantidad válida mayor a cero');
            return;
        }
        if (!restockLotNumber.trim()) {
            alert('Por favor ingrese o genere un número de lote');
            return;
        }
        if (!restockExpDate) {
            alert('Por favor seleccione la fecha de caducidad del lote');
            return;
        }
        restockMut.mutate({
            productId: restockProduct.id,
            lotNumber: restockLotNumber.trim(),
            expirationDate: restockExpDate,
            quantity: addNum,
        });
    };

    const handleConfirmWriteOff = () => {
        if (!writeOffItem) return;
        const outNum = parseInt(writeOffQty, 10);
        if (isNaN(outNum) || outNum <= 0) {
            alert('Ingrese una cantidad válida mayor a cero');
            return;
        }
        if (outNum > writeOffItem.stock) {
            alert(`No puede retirar más de las ${writeOffItem.stock} unidades disponibles en este lote.`);
            return;
        }
        writeOffMut.mutate({
            productId: writeOffItem.productId,
            batchId: writeOffItem.batchId,
            quantity: outNum,
            reason: writeOffReason,
            lotNumber: writeOffItem.lot_number || undefined,
        });
    };

    // 1. Filtrado y Paginación de Ventas Recientes (5 por página para cuadrar con panel derecho)
    const filteredRecentSales = useMemo(() => {
        const sales = data?.recentSales ?? [];
        return sales.filter(s => {
            if (salesTab === 'completed' && s.status === 'cancelled') return false;
            if (salesTab === 'cancelled' && s.status !== 'cancelled') return false;
            if (salesSearch.trim()) {
                const term = salesSearch.toLowerCase().trim();
                const matchId = s.id.toLowerCase().includes(term);
                const matchCashier = s.cashier_name.toLowerCase().includes(term);
                if (!matchId && !matchCashier) return false;
            }
            return true;
        });
    }, [data?.recentSales, salesTab, salesSearch]);

    const totalSalesPages = Math.ceil(filteredRecentSales.length / salesPageSize) || 1;
    const paginatedSales = useMemo(() => {
        const start = (salesPage - 1) * salesPageSize;
        return filteredRecentSales.slice(start, start + salesPageSize);
    }, [filteredRecentSales, salesPage, salesPageSize]);

    // 2. Filtrado y Paginación: Productos con Stock Bajo (Foto de Referencia)
    const filteredStockList = useMemo(() => {
        const list = data?.criticalStockProducts ?? [];
        return list.filter(item => {
            if (stockLabFilter && item.laboratory !== stockLabFilter) return false;
            if (stockTypeFilter === 'zero' && item.stock !== 0) return false;
            if (stockTypeFilter === 'low' && item.stock === 0) return false;
            if (stockSearch.trim()) {
                const term = stockSearch.toLowerCase().trim();
                const matchName = item.name.toLowerCase().includes(term);
                const matchSku = item.sku ? item.sku.toLowerCase().includes(term) : false;
                const matchLab = item.laboratory.toLowerCase().includes(term);
                if (!matchName && !matchSku && !matchLab) return false;
            }
            return true;
        });
    }, [data?.criticalStockProducts, stockLabFilter, stockTypeFilter, stockSearch]);

    const totalStockPages = Math.ceil(filteredStockList.length / stockPageSize) || 1;
    const paginatedStockList = useMemo(() => {
        const start = (stockPage - 1) * stockPageSize;
        return filteredStockList.slice(start, start + stockPageSize);
    }, [filteredStockList, stockPage, stockPageSize]);

    // Exportar Excel Stock Bajo
    const handleExportStockExcel = () => {
        const rows = filteredStockList.map(item => [
            item.name,
            item.laboratory,
            `${item.stock} unidades`,
            `${item.min_stock} unidades`,
            `Faltan ${item.faltante} unidades`,
            item.category
        ]);
        exportToCsv({
            filename: `Productos_Stock_Bajo_${new Date().toISOString().slice(0, 10)}.csv`,
            headers: ['Producto', 'Laboratorio', 'Stock Actual', 'Stock Mínimo', 'Faltante', 'Categoría'],
            rows
        });
    };

    // 3. Filtrado y Paginación: Productos y Lotes Próximos a Vencer (Control FEFO)
    const filteredExpList = useMemo(() => {
        const list = data?.expiringProducts ?? [];
        return list.filter(item => {
            if (expLabFilter && item.laboratory !== expLabFilter) return false;
            if (expStatusFilter === 'vencido' && item.diffDays > 0) return false;
            if (expStatusFilter === 'urgente' && (item.diffDays <= 0 || item.diffDays > 15)) return false;
            if (expStatusFilter === 'proximo' && (item.diffDays <= 15 || item.diffDays > 60)) return false;
            if (expSearch.trim()) {
                const term = expSearch.toLowerCase().trim();
                const matchName = item.name.toLowerCase().includes(term);
                const matchSku = item.sku ? item.sku.toLowerCase().includes(term) : false;
                const matchLab = item.laboratory.toLowerCase().includes(term);
                const matchLot = item.lot_number ? item.lot_number.toLowerCase().includes(term) : false;
                if (!matchName && !matchSku && !matchLab && !matchLot) return false;
            }
            return true;
        });
    }, [data?.expiringProducts, expLabFilter, expStatusFilter, expSearch]);

    const totalExpPages = Math.ceil(filteredExpList.length / expPageSize) || 1;
    const paginatedExpList = useMemo(() => {
        const start = (expPage - 1) * expPageSize;
        return filteredExpList.slice(start, start + expPageSize);
    }, [filteredExpList, expPage, expPageSize]);

    // Exportar Excel Próximos a Vencer
    const handleExportExpExcel = () => {
        const rows = filteredExpList.map(item => [
            item.name,
            item.lot_number || 'S/L',
            item.sku || 'S/SKU',
            item.laboratory,
            item.expiration_date,
            item.diffDays <= 0 ? 'VENCIDO' : `${item.diffDays} días`,
            `${item.stock} unidades`,
            item.category
        ]);
        exportToCsv({
            filename: `Control_Lotes_Vencimientos_${new Date().toISOString().slice(0, 10)}.csv`,
            headers: ['Producto', 'Lote', 'SKU', 'Laboratorio', 'Fecha de Vencimiento', 'Días Restantes', 'Stock de Lote', 'Categoría'],
            rows
        });
    };

    // Helper: Formato de fecha en español (ej. "10 de febrero de 2028")
    const formatFullSpanishDate = (dateStr: string) => {
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
            }
            return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dateStr));
        } catch {
            return dateStr;
        }
    };

    if (!canViewDashboard) {
        return (
            <div className="p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="w-16 h-16 rounded-2xl bg-error-container text-error flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-[32px]">lock</span>
                </div>
                <h2 className="text-xl font-bold text-on-surface">Acceso Restringido al Dashboard</h2>
                <p className="text-sm text-secondary max-w-md mt-1">
                    No dispones del permiso de visualización (<span className="font-mono text-xs font-semibold text-primary">dashboard:view</span>) para acceder a este panel de control. Contacta al Administrador.
                </p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-secondary">
                <span className="material-symbols-outlined text-[40px] text-primary animate-spin">
                    progress_activity
                </span>
                <p className="font-semibold text-sm">Cargando métricas ejecutivas de PharmaCore...</p>
            </div>
        );
    }

    if (isError || !data) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <div className="p-6 rounded-xl bg-error-container text-error flex flex-col gap-3 border border-error/30">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[28px]">error</span>
                        <h2 className="text-lg font-bold">Error al sincronizar el Panel de Control</h2>
                    </div>
                    <p className="text-sm">{(error as any)?.message || 'No se pudo conectar con el servidor central.'}</p>
                    <button
                        onClick={() => refetch()}
                        className="w-fit px-4 py-2 rounded-lg bg-error text-on-error font-bold text-xs shadow-sm hover:opacity-90"
                    >
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    const {
        totalSalesTodayCents = 0,
        totalSalesYesterdayCents = 0,
        vsYesterdayPct = 0,
        totalTicketsToday = 0,
        avgTicketCents = 0,
        activeShift = null,
        criticalStockProducts = [],
        expiredLotsCount = 0,
        urgentLotsCount = 0,
        laboratoriesList = [],
        hourlyDistribution = [],
    } = data;

    const totalTodayBs = (totalSalesTodayCents / 100).toFixed(2);
    const avgTicketBs = (avgTicketCents / 100).toFixed(2);

    return (
        <div className="flex flex-col w-full gap-6 p-6 max-w-[1600px] mx-auto animate-fadeIn">
            {/* 1. CABECERA & ACCESOS RÁPIDOS */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-bold text-[11px] uppercase tracking-wider">
                            {effectiveMode === 'financial' ? 'Gestión Ejecutiva & Clínica' : 'Atención al Mostrador'}
                        </span>
                        <span className="text-outline text-xs">•</span>
                        <span className="font-mono text-xs text-secondary">
                            {effectiveMode === 'financial' ? 'Dashboard Gerencial' : 'Alertas para Vendedores'}
                        </span>
                    </div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-on-surface tracking-tight">
                        {effectiveMode === 'financial'
                            ? 'Panel de Control - Farmacia Central'
                            : 'Monitor de Stock y Alertas de Mostrador'}
                    </h1>
                    <p className="text-sm text-secondary mt-0.5">
                        {effectiveMode === 'financial'
                            ? `Resumen financiero y clínico en tiempo real • ${activeShift ? `Turno Activo (${activeShift.cashier_name})` : 'Turno General'}`
                            : 'Monitoreo de quiebres de inventario, rotación de lotes urgentes (FEFO) y soporte para dispensación'}
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-sm border border-surface-container text-on-surface text-xs font-semibold">
                        <span className="material-symbols-outlined text-secondary text-[16px]">calendar_today</span>
                        <span>Hoy, {todayFormatted}</span>
                    </div>

                    {effectiveMode === 'financial' && (
                        <button
                            type="button"
                            onClick={() => setIsCashCloseOpen(true)}
                            className="flex items-center gap-1.5 bg-surface-container-lowest hover:bg-surface-container-low px-3 py-1.5 rounded-lg shadow-sm border border-surface-container text-on-surface transition-colors font-semibold text-xs cursor-pointer"
                            title="Realizar arqueo de caja y cierre de turno"
                        >
                            <span className="material-symbols-outlined text-primary text-[16px]">account_balance_wallet</span>
                            <span>Arqueo de Turno</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleExportStockExcel}
                        className="flex items-center gap-1.5 bg-surface-container-lowest hover:bg-surface-container-low px-3 py-1.5 rounded-lg shadow-sm border border-surface-container text-on-surface transition-colors font-semibold text-xs cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-secondary text-[16px]">file_download</span>
                        <span>Descargar Reporte</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-on-primary px-3.5 py-1.5 rounded-lg shadow-sm transition-colors font-semibold text-xs cursor-pointer"
                    >
                        <span className={`material-symbols-outlined text-[16px] ${isFetching ? 'animate-spin' : ''}`}>sync</span>
                        <span>{isFetching ? 'Sincronizando...' : 'Sincronizar'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/pos')}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-semibold text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        <span>Nueva Venta</span>
                        <kbd className="ml-0.5 px-1.5 py-0.2 rounded bg-primary-container text-on-primary text-[10px] font-mono font-bold">
                            F2
                        </kbd>
                    </button>
                </div>
            </div>

            {/* 2. BENTO CARDS KPI */}
            {effectiveMode === 'operational' ? (
                /* CARDS OPERATIVAS EXCLUSIVAS PARA VENDEDORES (0% cifras de dinero, 100% stock y alertas) */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Stock Crítico / Agotándose */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[11px] font-bold uppercase text-amber-700 tracking-wider block flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px] text-amber-500">warning</span>
                                    <span>Stock Crítico / Agotándose</span>
                                </span>
                                <div className="font-mono text-2xl lg:text-3xl font-bold text-on-surface mt-1">
                                    {criticalStockProducts.length} <span className="text-xs text-secondary font-sans font-normal">productos</span>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                                <span className="material-symbols-outlined text-[24px]">production_quantity_limits</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-2 flex items-center justify-between bg-surface-container-low -mx-4 -mb-4 px-4 py-2 border-t border-surface-container">
                            <span className="text-xs text-secondary">
                                Requieren reposición o sustituto
                            </span>
                            <span className="font-mono text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                Alerta mostrador
                            </span>
                        </div>
                    </div>

                    {/* Card 2: Lotes Próximos a Vencer (FEFO ≤ 30 días) */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[11px] font-bold uppercase text-secondary tracking-wider block flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px] text-primary">schedule</span>
                                    <span>Vencimientos Próximos (≤30d)</span>
                                </span>
                                <div className="font-mono text-2xl lg:text-3xl font-bold text-on-surface mt-1">
                                    {urgentLotsCount} <span className="text-xs text-secondary font-sans font-normal">lotes</span>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                                <span className="material-symbols-outlined text-[24px]">event_busy</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-2 flex items-center justify-between bg-surface-container-low -mx-4 -mb-4 px-4 py-2 border-t border-surface-container">
                            <span className="text-xs text-secondary">
                                Priorizar salida en mostrador (FEFO)
                            </span>
                            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                Rotar primero
                            </span>
                        </div>
                    </div>

                    {/* Card 3: Lotes Caducados (Retiro Obligatorio) */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[11px] font-bold uppercase text-error tracking-wider block flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px] text-error">dangerous</span>
                                    <span>Lotes Caducados / Retirar</span>
                                </span>
                                <div className={`font-mono text-2xl lg:text-3xl font-bold mt-1 ${expiredLotsCount > 0 ? 'text-error' : 'text-on-surface'}`}>
                                    {expiredLotsCount} <span className="text-xs text-secondary font-sans font-normal">lotes</span>
                                </div>
                            </div>
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform ${
                                expiredLotsCount > 0 ? 'bg-error-container text-error' : 'bg-surface-container text-secondary'
                            }`}>
                                <span className="material-symbols-outlined text-[24px]">block</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-2 flex items-center justify-between bg-surface-container-low -mx-4 -mb-4 px-4 py-2 border-t border-surface-container">
                            <span className="text-xs text-secondary">
                                Prohibida su dispensación
                            </span>
                            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                                expiredLotsCount > 0 ? 'bg-error text-white animate-pulse' : 'bg-surface-container text-secondary'
                            }`}>
                                {expiredLotsCount > 0 ? 'Baja sanitaria' : 'Sin caducados'}
                            </span>
                        </div>
                    </div>

                    {/* Card 4: Terminal de Mostrador */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[11px] font-bold uppercase text-secondary tracking-wider block">Terminal de Mostrador</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="font-bold text-lg text-on-surface truncate max-w-[150px]">
                                        {activeShift ? activeShift.cashier_name : 'Caja Cerrada'}
                                    </span>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                                <span className="material-symbols-outlined text-[24px]">point_of_sale</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-2 flex items-center justify-between bg-surface-container-low -mx-4 -mb-4 px-4 py-2 border-t border-surface-container">
                            <button
                                type="button"
                                onClick={() => navigate('/pos')}
                                className="inline-flex items-center gap-1 text-primary hover:underline font-bold text-xs cursor-pointer"
                            >
                                <span>Ir a POS / Vender (F2)</span>
                                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/inventory')}
                                className="text-secondary hover:text-on-surface font-semibold text-xs cursor-pointer"
                            >
                                Catálogo
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* CARDS FINANCIERAS GERENCIALES (Ventas Diarias, Órdenes, Margen %, Cajas) */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Ventas Diarias */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[11px] font-bold uppercase text-secondary tracking-wider block">Ventas Diarias</span>
                                <div className="font-mono text-2xl lg:text-3xl font-bold text-on-surface mt-1">
                                    Bs {totalTodayBs}
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                                <span className="material-symbols-outlined text-[24px]">payments</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-2 flex items-center justify-between bg-surface-container-low -mx-4 -mb-4 px-4 py-2 border-t border-surface-container">
                            <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-bold ${
                                (vsYesterdayPct ?? 0) >= 0 ? 'bg-primary-fixed text-on-primary-fixed-variant' : 'bg-error-container text-error'
                            }`}>
                                <span className="material-symbols-outlined text-[14px]">
                                    {(vsYesterdayPct ?? 0) >= 0 ? 'trending_up' : 'trending_down'}
                                </span>
                                <span>{(vsYesterdayPct ?? 0) >= 0 ? `+${vsYesterdayPct}% vs ayer` : `${vsYesterdayPct}% vs ayer`}</span>
                            </span>
                            <span className="text-xs text-secondary font-mono">
                                Ayer: Bs {(totalSalesYesterdayCents / 100).toFixed(2)}
                            </span>
                        </div>
                    </div>

                    {/* Card 2: Total de Órdenes */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[11px] font-bold uppercase text-secondary tracking-wider block">Total de Órdenes</span>
                                <div className="font-mono text-2xl lg:text-3xl font-bold text-on-surface mt-1">
                                    {totalTicketsToday} <span className="text-xs text-secondary font-sans font-normal">tickets</span>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-secondary-container flex items-center justify-center text-on-secondary-fixed group-hover:scale-105 transition-transform">
                                <span className="material-symbols-outlined text-[24px]">shopping_bag</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-2 flex items-center justify-between bg-surface-container-low -mx-4 -mb-4 px-4 py-2 border-t border-surface-container">
                            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-semibold">
                                <span className="material-symbols-outlined text-[14px]">speed</span>
                                <span>Flujo activo</span>
                            </span>
                            <span className="text-xs text-secondary font-mono">Ticket prom: Bs {avgTicketBs}</span>
                        </div>
                    </div>

                    {/* Card 3: Alertas de Stock Bajo y FEFO */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[11px] font-bold uppercase text-error tracking-wider block">Alertas de Stock & FEFO</span>
                                <div className="font-mono text-2xl lg:text-3xl font-bold text-error mt-1">
                                    {criticalStockProducts.length + expiredLotsCount} <span className="text-xs text-secondary font-sans font-normal">alertas</span>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-error-container flex items-center justify-center text-error group-hover:scale-105 transition-transform">
                                <span className="material-symbols-outlined text-[24px]">warning</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-2 flex items-center justify-between bg-surface-container-low -mx-4 -mb-4 px-4 py-2 border-t border-surface-container">
                            <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-bold ${
                                expiredLotsCount > 0 ? 'bg-red-100 text-red-800' : 'bg-error-container text-on-error-container'
                            }`}>
                                {expiredLotsCount > 0 ? `${expiredLotsCount} Vencidos` : 'Control FEFO'}
                            </span>
                            <span className="font-mono text-xs text-secondary font-medium">
                                {criticalStockProducts.length} stock bajo • {urgentLotsCount} por vencer (≤30d)
                            </span>
                        </div>
                    </div>

                    {/* Card 4: Cajeros / Turno Activo */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="text-[11px] font-bold uppercase text-secondary tracking-wider block">Caja Terminal</span>
                                <div className="font-mono text-2xl lg:text-3xl font-bold text-on-surface mt-1">
                                    {activeShift ? '1 / 1' : '0 / 1'} <span className="text-xs text-secondary font-sans font-normal">Cajas</span>
                                </div>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                                <span className="material-symbols-outlined text-[24px]">point_of_sale</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-2 flex items-center justify-between bg-surface-container-low -mx-4 -mb-4 px-4 py-2 border-t border-surface-container">
                            {activeShift ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed-variant font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                                    <span>Turno Abierto</span>
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded bg-surface-container text-secondary font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                                    <span>Caja Cerrada</span>
                                </span>
                            )}
                            <span className="text-xs text-secondary truncate max-w-[140px]">
                                {activeShift ? activeShift.cashier_name : 'Sin operador'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* 3. SECCIÓN 2 COLUMNAS: VENTAS RECIENTES (IZQ) Y WIDGET LATERAL (DER) - Solo en modo Gerencial */}
            {effectiveMode === 'financial' && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Columna Izquierda (8 cols): Tabla de Ventas Recientes */}
                <div className="xl:col-span-8 bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
                    <div className="p-4 bg-surface-container-lowest flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-container">
                        <div>
                            <h2 className="font-bold text-base text-on-surface">Ventas Recientes</h2>
                            <p className="text-xs text-secondary">Transacciones validadas en puntos de dispensación en tiempo real</p>
                        </div>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-[16px]">filter_list</span>
                            <input
                                type="text"
                                value={salesSearch}
                                onChange={(e) => setSalesSearch(e.target.value)}
                                placeholder="Filtrar por ticket o cajero..."
                                className="bg-surface-container-low pl-8 pr-3 py-1.5 rounded-lg text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary w-56 border border-surface-container"
                            />
                        </div>
                    </div>

                    <div className="px-4 py-2 bg-surface-container-low flex items-center justify-between flex-wrap gap-2 border-b border-surface-container">
                        <div className="flex items-center gap-1 text-xs">
                            <button
                                type="button"
                                onClick={() => setSalesTab('all')}
                                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                                    salesTab === 'all' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-secondary hover:text-on-surface'
                                }`}
                            >
                                Todas ({data.recentSales.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setSalesTab('completed')}
                                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                                    salesTab === 'completed' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-secondary hover:text-on-surface'
                                }`}
                            >
                                Completadas ({data.recentSales.filter(s => s.status !== 'cancelled').length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setSalesTab('cancelled')}
                                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                                    salesTab === 'cancelled' ? 'bg-surface-container-lowest text-error shadow-sm' : 'text-secondary hover:text-on-surface'
                                }`}
                            >
                                Anuladas ({data.recentSales.filter(s => s.status === 'cancelled').length})
                            </button>
                        </div>
                        <span className="text-secondary font-mono text-[11px]">
                            Mostrando {filteredRecentSales.length} transacciones
                        </span>
                    </div>

                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-surface-container-low text-secondary font-bold text-[10px] uppercase tracking-wider h-8 border-b border-surface-container">
                                    <th className="px-4">Fecha / Hora</th>
                                    <th className="px-4">Ticket</th>
                                    <th className="px-4">Cajero</th>
                                    <th className="px-4">Pago</th>
                                    <th className="px-4 text-right">Monto</th>
                                    <th className="px-4 text-center">Estado</th>
                                    <th className="px-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container">
                                {paginatedSales.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="text-center py-6 text-secondary">
                                            No hay ventas registradas coincidentes.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedSales.map(sale => (
                                        <tr key={sale.id} className="hover:bg-surface-bright transition-colors h-10">
                                            <td className="px-4 whitespace-nowrap font-mono text-secondary text-[11px]">
                                                {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-4 whitespace-nowrap">
                                                <span className="px-1.5 py-0.5 rounded bg-surface font-mono font-semibold text-primary text-[11px]">
                                                    #{sale.id.slice(0, 8).toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-4 whitespace-nowrap text-on-surface font-medium text-xs">
                                                {sale.cashier_name}
                                            </td>
                                            <td className="px-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                                    sale.payment_method === 'card'
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : sale.payment_method === 'qr'
                                                            ? 'bg-purple-100 text-purple-800'
                                                            : 'bg-emerald-100 text-emerald-800'
                                                }`}>
                                                    <span className="material-symbols-outlined text-[12px]">
                                                        {sale.payment_method === 'card' ? 'credit_card' : sale.payment_method === 'qr' ? 'qr_code' : 'payments'}
                                                    </span>
                                                    <span>{sale.payment_method === 'card' ? 'Tarjeta' : sale.payment_method === 'qr' ? 'QR' : 'Efectivo'}</span>
                                                </span>
                                            </td>
                                            <td className="px-4 whitespace-nowrap text-right font-mono font-bold text-on-surface">
                                                {sale.status === 'cancelled' ? (
                                                    <span className="text-error line-through">
                                                        Bs {(sale.total_cents / 100).toFixed(2)}
                                                    </span>
                                                ) : (
                                                    <span>Bs {(sale.total_cents / 100).toFixed(2)}</span>
                                                )}
                                            </td>
                                            <td className="px-4 whitespace-nowrap text-center">
                                                {sale.status === 'cancelled' ? (
                                                    <span className="px-2 py-0.5 rounded bg-error-container text-error text-[10px] font-bold">
                                                        Anulado
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed-variant text-[10px] font-bold">
                                                        Cobrado
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 whitespace-nowrap text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => setReprintSaleId(sale.id)}
                                                    className="p-1 rounded text-secondary hover:text-primary hover:bg-surface-container transition-colors"
                                                    title="Reimprimir Ticket Térmico"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">print</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-2.5 px-4 bg-surface-container-lowest flex items-center justify-between border-t border-surface-container text-xs">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={salesPage <= 1}
                                onClick={() => setSalesPage(p => Math.max(1, p - 1))}
                                className="px-2 py-0.5 rounded border border-surface-container text-secondary hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed font-medium text-[11px]"
                            >
                                &lt; Anterior
                            </button>
                            <span className="font-semibold text-secondary text-[11px]">
                                Pág {salesPage} de {totalSalesPages}
                            </span>
                            <button
                                type="button"
                                disabled={salesPage >= totalSalesPages}
                                onClick={() => setSalesPage(p => Math.min(totalSalesPages, p + 1))}
                                className="px-2 py-0.5 rounded border border-surface-container text-secondary hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed font-medium text-[11px]"
                            >
                                Siguiente &gt;
                            </button>
                        </div>
                        <NavLink to="/reports" className="text-primary hover:underline font-semibold flex items-center gap-1 text-xs">
                            <span>Ver todas en Reportes</span>
                            <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                        </NavLink>
                    </div>
                </div>

                {/* Columna Derecha (4 cols): Widget Lateral */}
                <div className="xl:col-span-4 flex flex-col gap-4">
                    {/* Tarjeta: Turno de Caja Activo */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[20px]">account_balance_wallet</span>
                                <h3 className="font-bold text-sm text-on-surface">Turno de Caja Activo</h3>
                            </div>
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-container text-primary font-bold">
                                CAJA-01
                            </span>
                        </div>

                        <div className="bg-surface-container-low rounded-lg p-3 mb-3 border border-surface-container">
                            <span className="text-[10px] font-bold uppercase text-secondary block">Efectivo Físico en Cajón</span>
                            <div className="flex items-baseline justify-between mt-1">
                                <span className="font-mono text-2xl font-bold text-on-surface">
                                    Bs {(((activeShift?.opening_amount_cents ?? 0) + (activeShift?.cash_sales_cents ?? 0)) / 100).toFixed(2)}
                                </span>
                                <span className="text-[10px] text-primary font-bold bg-primary-fixed px-2 py-0.5 rounded">
                                    Operativo
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 bg-surface-container-lowest rounded p-2 font-mono text-[11px] border border-surface-container">
                                <div>
                                    <span className="text-secondary block text-[10px]">Fondo Inicial:</span>
                                    <span className="font-semibold text-on-surface">
                                        Bs {((activeShift?.opening_amount_cents ?? 0) / 100).toFixed(2)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-secondary block text-[10px]">Cobros Efectivo:</span>
                                    <span className="font-semibold text-primary">
                                        +Bs {((activeShift?.cash_sales_cents ?? 0) / 100).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setIsCashCloseOpen(true)}
                                className="w-full py-2 px-3 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-semibold text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                            >
                                <span className="material-symbols-outlined text-[16px]">calculate</span>
                                <span>Arqueo de Caja</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/reports')}
                                className="w-full py-2 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container text-on-surface font-semibold text-xs transition-colors flex items-center justify-center gap-1"
                            >
                                <span className="material-symbols-outlined text-[16px]">insights</span>
                                <span>Auditoría de Turnos</span>
                            </button>
                        </div>
                    </div>

                    {/* Flujo de Despacho (Horas del Día) */}
                    <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-secondary tracking-wider">Flujo de Despacho Hoy</span>
                            <span className="font-mono text-xs text-primary font-bold">
                                {hourlyDistribution.reduce((acc, h) => acc + h.count, 0)} tickets
                            </span>
                        </div>
                        <div className="h-20 w-full flex items-end gap-1.5 pt-2">
                            {hourlyDistribution.slice(0, 10).map((h) => {
                                const maxCents = Math.max(...hourlyDistribution.map(x => x.totalCents), 1);
                                const heightPct = h.totalCents > 0 ? Math.max(20, Math.round((h.totalCents / maxCents) * 100)) : 10;
                                return (
                                    <div key={h.hour} className="flex-1 bg-surface-container rounded-t flex flex-col justify-end items-center h-full group relative">
                                        <div
                                            className="w-full bg-primary/40 group-hover:bg-primary rounded-t transition-all"
                                            style={{ height: `${heightPct}%` }}
                                        ></div>
                                        <span className="font-mono text-[9px] text-secondary mt-1">{h.hour}h</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
            )}

            {/* BANNER GUÍA DE DISPENSACIÓN PARA VENDEDORES (Solo en modo Operativo) */}
            {effectiveMode === 'operational' && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[22px]">medical_services</span>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-on-surface">Guía de Dispensación Segura para el Personal de Ventas</h3>
                            <p className="text-xs text-secondary mt-0.5">
                                Revisa los lotes con menos de 30 días para ofrecerlos primero al cliente según la norma sanitaria FEFO. Si un producto está en quiebre de stock, verifica su principio activo en el catálogo.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => navigate('/inventory')}
                            className="px-3.5 py-1.5 rounded-lg bg-surface-container-lowest border border-surface-container text-primary font-bold text-xs hover:bg-surface-container transition-colors shadow-xs cursor-pointer"
                        >
                            Ver Catálogo
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/pos')}
                            className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary font-bold text-xs hover:bg-primary-container transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-[16px]">add</span>
                            <span>Nueva Venta</span>
                        </button>
                    </div>
                </div>
            )}

            {/* 4. SECCIÓN CLÍNICA A: ⚠️ PRODUCTOS CON STOCK BAJO (Fiel a la Foto de Referencia) */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
                {/* Cabecera & Controles de Filtro */}
                <div className="p-4 bg-surface-container-lowest flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-surface-container">
                    <div className="flex items-center gap-2">
                        <span className="text-amber-500 font-bold text-lg">⚠️</span>
                        <h2 className="text-base font-bold text-on-surface">Productos con Stock Bajo</h2>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-mono text-xs font-bold">
                            {filteredStockList.length}
                        </span>
                    </div>

                    {/* Toolbar de filtros exacto a la foto */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Buscador */}
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-[16px]">search</span>
                            <input
                                type="search"
                                value={stockSearch}
                                onChange={(e) => {
                                    setStockSearch(e.target.value);
                                    setStockPage(1);
                                }}
                                placeholder="Buscar producto..."
                                className="bg-surface-container-low pl-8 pr-3 py-1.5 rounded-lg text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary border border-surface-container w-44 sm:w-52"
                            />
                        </div>

                        {/* Select Laboratorios */}
                        <select
                            value={stockLabFilter}
                            onChange={(e) => {
                                setStockLabFilter(e.target.value);
                                setStockPage(1);
                            }}
                            className="bg-surface-container-low text-on-surface text-xs px-2.5 py-1.5 rounded-lg border border-surface-container focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-medium"
                        >
                            <option value="">Todos los Laboratorios</option>
                            {laboratoriesList.map(lab => (
                                <option key={lab} value={lab}>{lab}</option>
                            ))}
                        </select>

                        {/* Select Stocks */}
                        <select
                            value={stockTypeFilter}
                            onChange={(e) => {
                                setStockTypeFilter(e.target.value);
                                setStockPage(1);
                            }}
                            className="bg-surface-container-low text-on-surface text-xs px-2.5 py-1.5 rounded-lg border border-surface-container focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-medium"
                        >
                            <option value="">Todos los Stocks</option>
                            <option value="zero">Agotados (0 unidades)</option>
                            <option value="low">Bajo Mínimo (&gt; 0)</option>
                        </select>

                        {/* Botón Verde Exportar Excel */}
                        <button
                            type="button"
                            onClick={handleExportStockExcel}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-sm"
                        >
                            <span className="material-symbols-outlined text-[16px]">description</span>
                            <span>Exportar Excel</span>
                        </button>
                    </div>
                </div>

                {/* Tabla de Productos con Stock Bajo */}
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="bg-surface-container-low text-secondary font-bold text-[11px] uppercase tracking-wider h-9 border-b border-surface-container">
                                <th className="py-2 px-4">Producto</th>
                                <th className="py-2 px-4">Laboratorio</th>
                                <th className="py-2 px-4 text-center">Stock Actual</th>
                                <th className="py-2 px-4 text-center">Stock Mínimo</th>
                                <th className="py-2 px-4 text-center">Faltante</th>
                                <th className="py-2 px-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container">
                            {paginatedStockList.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-secondary">
                                        No se encontraron productos con stock bajo coincidentes.
                                    </td>
                                </tr>
                            ) : (
                                paginatedStockList.map(item => (
                                    <tr key={item.id} className="hover:bg-surface-bright transition-colors h-12">
                                        <td className="py-2 px-4 font-bold text-on-surface uppercase tracking-tight">
                                            {item.name}
                                        </td>
                                        <td className="py-2 px-4 text-secondary uppercase font-semibold text-[11px]">
                                            {item.laboratory}
                                        </td>
                                        <td className="py-2 px-4 text-center">
                                            <span className="inline-block px-3 py-0.5 rounded-full font-mono text-[11px] font-bold text-red-600 bg-red-50 border border-red-200">
                                                {item.stock} unidades
                                            </span>
                                        </td>
                                        <td className="py-2 px-4 text-center font-mono text-secondary">
                                            {item.min_stock} unidades
                                        </td>
                                        <td className="py-2 px-4 text-center font-bold text-on-surface">
                                            Faltan {item.faltante} unidades
                                        </td>
                                        <td className="py-2 px-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    title="Ver historial y Kardex"
                                                    onClick={() => setKardexProduct({ id: item.id, name: item.name })}
                                                    className="p-1.5 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-primary transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">history</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Ver en Catálogo de Inventario"
                                                    onClick={() => navigate(`/inventory?search=${encodeURIComponent(item.name)}`)}
                                                    className="p-1.5 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setRestockProduct(item);
                                                        setRestockLotNumber(`LOTE-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                                                        const defaultExp = new Date();
                                                        defaultExp.setFullYear(defaultExp.getFullYear() + 2);
                                                        setRestockExpDate(defaultExp.toISOString().slice(0, 10));
                                                        setRestockQty(item.faltante > 0 ? item.faltante.toString() : '10');
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-sm"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">add_box</span>
                                                    <span>Ingresar Lote</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginación exacta a la foto */}
                <div className="p-3 bg-surface-container-lowest flex items-center justify-center gap-3 border-t border-surface-container text-xs">
                    <button
                        type="button"
                        disabled={stockPage <= 1}
                        onClick={() => setStockPage(p => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded border border-surface-container text-secondary hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                        &lt; Anterior
                    </button>
                    <span className="font-semibold text-on-surface">
                        Página {stockPage} de {totalStockPages} ({filteredStockList.length} productos)
                    </span>
                    <button
                        type="button"
                        disabled={stockPage >= totalStockPages}
                        onClick={() => setStockPage(p => Math.min(totalStockPages, p + 1))}
                        className="px-2.5 py-1 rounded border border-surface-container text-secondary hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                        Siguiente &gt;
                    </button>
                </div>
            </div>

            {/* 5. SECCIÓN CLÍNICA B: 📅 CONTROL DE LOTES Y VENCIMIENTOS (FEFO) */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
                {/* Cabecera & Controles de Filtro */}
                <div className="p-4 bg-surface-container-lowest flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-surface-container">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-secondary font-bold text-lg">📅</span>
                        <h2 className="text-base font-bold text-on-surface">Control de Lotes y Vencimientos (FEFO)</h2>
                        <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface font-mono text-xs font-bold">
                            {filteredExpList.length} lotes
                        </span>
                        {expiredLotsCount > 0 && (
                            <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white font-mono text-xs font-bold flex items-center gap-1 shadow-sm animate-pulse">
                                <span className="material-symbols-outlined text-[13px]">error</span>
                                <span>{expiredLotsCount} Vencidos</span>
                            </span>
                        )}
                        {urgentLotsCount > 0 && (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-mono text-xs font-bold flex items-center gap-1 shadow-sm">
                                <span className="material-symbols-outlined text-[13px]">warning</span>
                                <span>{urgentLotsCount} Próximos (≤30d)</span>
                            </span>
                        )}
                    </div>

                    {/* Toolbar de filtros */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Buscador */}
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-[16px]">search</span>
                            <input
                                type="search"
                                value={expSearch}
                                onChange={(e) => {
                                    setExpSearch(e.target.value);
                                    setExpPage(1);
                                }}
                                placeholder="Buscar producto, lote o SKU..."
                                className="bg-surface-container-low pl-8 pr-3 py-1.5 rounded-lg text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary border border-surface-container w-44 sm:w-56"
                            />
                        </div>

                        {/* Select Laboratorios */}
                        <select
                            value={expLabFilter}
                            onChange={(e) => {
                                setExpLabFilter(e.target.value);
                                setExpPage(1);
                            }}
                            className="bg-surface-container-low text-on-surface text-xs px-2.5 py-1.5 rounded-lg border border-surface-container focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-medium"
                        >
                            <option value="">Todos los Laboratorios</option>
                            {laboratoriesList.map(lab => (
                                <option key={lab} value={lab}>{lab}</option>
                            ))}
                        </select>

                        {/* Select Estados */}
                        <select
                            value={expStatusFilter}
                            onChange={(e) => {
                                setExpStatusFilter(e.target.value);
                                setExpPage(1);
                            }}
                            className="bg-surface-container-low text-on-surface text-xs px-2.5 py-1.5 rounded-lg border border-surface-container focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-medium"
                        >
                            <option value="">Todos los Estados</option>
                            <option value="vencido">Vencidos (&lt;= hoy)</option>
                            <option value="urgente">Urgente (&lt; 15 días)</option>
                            <option value="proximo">Próximos (&lt; 60 días)</option>
                        </select>

                        {/* Botón Rojo Exportar Excel */}
                        <button
                            type="button"
                            onClick={handleExportExpExcel}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-colors shadow-sm"
                        >
                            <span className="material-symbols-outlined text-[16px]">description</span>
                            <span>Exportar Excel</span>
                        </button>
                    </div>
                </div>

                {/* Tabla de Productos y Lotes Próximos a Vencer */}
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="bg-surface-container-low text-secondary font-bold text-[11px] uppercase tracking-wider h-9 border-b border-surface-container">
                                <th className="py-2 px-4">Producto</th>
                                <th className="py-2 px-4">Lote</th>
                                <th className="py-2 px-4">SKU</th>
                                <th className="py-2 px-4">Laboratorio</th>
                                <th className="py-2 px-4">Fecha de Vencimiento</th>
                                <th className="py-2 px-4 text-center">Días Restantes</th>
                                <th className="py-2 px-4 text-center">Stock del Lote</th>
                                <th className="py-2 px-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container">
                            {paginatedExpList.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-secondary">
                                        No hay productos o lotes próximos a vencer registrados.
                                    </td>
                                </tr>
                            ) : (
                                paginatedExpList.map(item => (
                                    <tr key={item.id} className="hover:bg-surface-bright transition-colors h-12">
                                        <td className="py-2 px-4 font-bold text-on-surface uppercase tracking-tight">
                                            <div>{item.name}</div>
                                            <div className="text-[10px] text-secondary font-normal">{item.category}</div>
                                        </td>
                                        <td className="py-2 px-4">
                                            <span className="font-mono px-2 py-0.5 rounded bg-surface-container-high text-primary font-bold text-[11px] border border-surface-container">
                                                {item.lot_number || 'S/L'}
                                            </span>
                                        </td>
                                        <td className="py-2 px-4 font-mono text-secondary font-semibold">
                                            {item.sku || 'S/SKU'}
                                        </td>
                                        <td className="py-2 px-4 text-secondary uppercase font-semibold text-[11px]">
                                            {item.laboratory}
                                        </td>
                                        <td className="py-2 px-4 font-medium text-on-surface">
                                            {formatFullSpanishDate(item.expiration_date)}
                                        </td>
                                        <td className="py-2 px-4 text-center">
                                            {item.diffDays < 0 ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold text-red-700 bg-red-100 uppercase tracking-wider border border-red-200">
                                                    <span className="material-symbols-outlined text-[12px]">cancel</span>
                                                    <span>Vencido hace {Math.abs(item.diffDays)}d</span>
                                                </span>
                                            ) : item.diffDays === 0 ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold text-red-700 bg-red-100 uppercase tracking-wider border border-red-200 animate-pulse">
                                                    <span className="material-symbols-outlined text-[12px]">warning</span>
                                                    <span>Vence HOY</span>
                                                </span>
                                            ) : item.diffDays <= 15 ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300">
                                                    <span className="material-symbols-outlined text-[12px]">priority_high</span>
                                                    <span>{item.diffDays} días (Crítico)</span>
                                                </span>
                                            ) : item.diffDays <= 30 ? (
                                                <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200">
                                                    {item.diffDays} días
                                                </span>
                                            ) : (
                                                <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold text-secondary bg-surface-container">
                                                    {item.diffDays} días
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 px-4 text-center font-mono font-bold text-on-surface">
                                            <div>{item.stock} uds</div>
                                            <div className="text-[10px] text-secondary font-normal">Total prod: {item.totalProductStock}</div>
                                        </td>
                                        <td className="py-2 px-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    title="Ver historial y Kardex"
                                                    onClick={() => setKardexProduct({ id: item.productId, name: item.name })}
                                                    className="p-1.5 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-primary transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">history</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Ver en Catálogo de Inventario"
                                                    onClick={() => navigate(`/inventory?search=${encodeURIComponent(item.name)}`)}
                                                    className="p-1.5 rounded bg-surface-container hover:bg-surface-container-high text-secondary hover:text-on-surface transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Dar de baja / Retirar unidades vencidas de este lote"
                                                    onClick={() => {
                                                        setWriteOffItem({
                                                            productId: item.productId,
                                                            batchId: item.id,
                                                            name: item.name,
                                                            lot_number: item.lot_number,
                                                            stock: item.stock,
                                                            expiration_date: item.expiration_date,
                                                            diffDays: item.diffDays,
                                                        });
                                                        setWriteOffQty(item.stock.toString());
                                                        setWriteOffReason(item.diffDays <= 0 ? 'Caducidad de medicamento / Baja sanitaria' : 'Retiro preventivo por vencimiento próximo');
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition-colors shadow-sm"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">remove_circle_outline</span>
                                                    <span>Dar de Baja</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Paginación exacta a la foto */}
                <div className="p-3 bg-surface-container-lowest flex items-center justify-center gap-3 border-t border-surface-container text-xs">
                    <button
                        type="button"
                        disabled={expPage <= 1}
                        onClick={() => setExpPage(p => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded border border-surface-container text-secondary hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                        &lt; Anterior
                    </button>
                    <span className="font-semibold text-on-surface">
                        Página {expPage} de {totalExpPages} ({filteredExpList.length} productos)
                    </span>
                    <button
                        type="button"
                        disabled={expPage >= totalExpPages}
                        onClick={() => setExpPage(p => Math.min(totalExpPages, p + 1))}
                        className="px-2.5 py-1 rounded border border-surface-container text-secondary hover:text-on-surface disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                    >
                        Siguiente &gt;
                    </button>
                </div>
            </div>

            {/* MODAL 1: INGRESO DE NUEVO LOTE FÍSICO (STOCK BAJO) */}
            {restockProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-lg p-6 border border-surface-container-high">
                        <div className="flex items-center justify-between pb-3 border-b border-surface-container">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[22px]">add_box</span>
                                <h3 className="text-base font-bold text-on-surface">Ingreso de Lote / Reabastecimiento</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRestockProduct(null)}
                                className="text-secondary hover:text-on-surface"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        <div className="py-4 flex flex-col gap-3.5">
                            <div>
                                <p className="text-sm font-bold text-on-surface uppercase">
                                    {restockProduct.name}
                                </p>
                                {restockProduct.laboratory && (
                                    <span className="text-[11px] text-secondary uppercase font-semibold">
                                        Laboratorio: {restockProduct.laboratory}
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs bg-surface-container-low p-2.5 rounded-lg border border-surface-container">
                                <div>
                                    <span className="text-secondary block">Stock actual:</span>
                                    <span className="font-mono font-bold text-sm text-red-600">
                                        {restockProduct.stock} unidades
                                    </span>
                                </div>
                                <div>
                                    <span className="text-secondary block">Stock mínimo deseado:</span>
                                    <span className="font-mono font-bold text-sm text-on-surface">
                                        {restockProduct.min_stock} unidades
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-bold text-secondary uppercase">
                                            Número de Lote:
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setRestockLotNumber(`LOTE-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`)}
                                            className="text-[10px] text-primary hover:underline font-semibold"
                                        >
                                            Generar auto
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={restockLotNumber}
                                        onChange={(e) => setRestockLotNumber(e.target.value)}
                                        placeholder="Ej: LOTE-2026-A"
                                        className="w-full bg-surface-container-low font-mono text-xs font-semibold text-on-surface px-3 py-2 rounded-lg border border-surface-container focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-[11px] font-bold text-secondary uppercase">
                                        Fecha de Caducidad:
                                    </label>
                                    <input
                                        type="date"
                                        value={restockExpDate}
                                        onChange={(e) => setRestockExpDate(e.target.value)}
                                        className="w-full bg-surface-container-low font-mono text-xs font-semibold text-on-surface px-3 py-2 rounded-lg border border-surface-container focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold text-secondary uppercase">
                                    Cantidad de Unidades a Ingresar (+):
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={restockQty}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => setRestockQty(e.target.value.replace(/^0+(?=\d)/, ''))}
                                    placeholder="10"
                                    className="w-full bg-surface-container-low font-mono text-lg font-bold text-on-surface px-3 py-1.5 rounded-lg border border-surface-container focus:ring-2 focus:ring-primary focus:outline-none"
                                    autoFocus
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                {[5, 10, 20, 50, 100].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setRestockQty(n.toString())}
                                        className="flex-1 py-1 text-xs font-mono font-semibold rounded bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors"
                                    >
                                        +{n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container">
                            <button
                                type="button"
                                onClick={() => setRestockProduct(null)}
                                className="px-3.5 py-1.5 rounded-lg text-secondary hover:bg-surface-container text-xs font-semibold"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmRestock}
                                disabled={restockMut.isPending}
                                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
                            >
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                <span>{restockMut.isPending ? 'Guardando Lote...' : `Registrar Entrada (+${restockQty} uds)`}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 2: RETIRO / BAJA DE LOTE VENCIDO (CONTROL FEFO) */}
            {writeOffItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-lg p-6 border border-red-200">
                        <div className="flex items-center justify-between pb-3 border-b border-surface-container">
                            <div className="flex items-center gap-2 text-red-600">
                                <span className="material-symbols-outlined text-[24px]">delete_sweep</span>
                                <h3 className="text-base font-bold text-on-surface">Retiro de Lote / Merma Clínica</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setWriteOffItem(null)}
                                className="text-secondary hover:text-on-surface"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        <div className="py-4 flex flex-col gap-3.5">
                            <div>
                                <p className="text-sm font-bold text-on-surface uppercase">
                                    {writeOffItem.name}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-container-high font-bold text-primary">
                                        Lote: {writeOffItem.lot_number || 'S/L'}
                                    </span>
                                    <span className="text-xs text-secondary font-medium">
                                        Caduca: {formatFullSpanishDate(writeOffItem.expiration_date)}
                                    </span>
                                </div>
                            </div>

                            <div className="bg-red-50 text-red-900 border border-red-200 p-3 rounded-lg text-xs flex items-center justify-between">
                                <div>
                                    <span className="font-semibold block">Estado Sanitario:</span>
                                    <span>
                                        {writeOffItem.diffDays < 0
                                            ? `Vencido hace ${Math.abs(writeOffItem.diffDays)} días`
                                            : writeOffItem.diffDays === 0
                                                ? 'Vence el día de hoy'
                                                : `Próximo a caducar en ${writeOffItem.diffDays} días`}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="font-semibold block">Unidades en este lote:</span>
                                    <span className="font-mono font-bold text-base text-red-700">
                                        {writeOffItem.stock} uds
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold text-secondary uppercase">
                                    Cantidad de Unidades a Dar de Baja (-):
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="1"
                                        max={writeOffItem.stock}
                                        value={writeOffQty}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => setWriteOffQty(e.target.value.replace(/^0+(?=\d)/, ''))}
                                        placeholder="1"
                                        className="w-full bg-surface-container-low font-mono text-lg font-bold text-red-600 px-3 py-1.5 rounded-lg border border-surface-container focus:ring-2 focus:ring-red-500 focus:outline-none"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setWriteOffQty(writeOffItem.stock.toString())}
                                        className="px-3 py-2 text-xs font-semibold rounded bg-surface-container hover:bg-surface-container-high text-on-surface whitespace-nowrap"
                                    >
                                        Lote Completo ({writeOffItem.stock})
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold text-secondary uppercase">
                                    Motivo del Retiro / Ajuste:
                                </label>
                                <select
                                    value={writeOffReason}
                                    onChange={(e) => setWriteOffReason(e.target.value)}
                                    className="w-full bg-surface-container-low text-xs font-medium text-on-surface px-3 py-2 rounded-lg border border-surface-container focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
                                >
                                    <option value="Vencimiento de medicamento / Baja sanitaria">Vencimiento de medicamento / Baja sanitaria</option>
                                    <option value="Merma clínica / Envase deteriorado o roto">Merma clínica / Envase deteriorado o roto</option>
                                    <option value="Devolución al proveedor / Canje de lote">Devolución al proveedor / Canje de lote</option>
                                    <option value="Retiro preventivo por caducidad próxima">Retiro preventivo por caducidad próxima</option>
                                    <option value="Ajuste por descarte en inventario físico">Ajuste por descarte en inventario físico</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container">
                            <button
                                type="button"
                                onClick={() => setWriteOffItem(null)}
                                className="px-3.5 py-1.5 rounded-lg text-secondary hover:bg-surface-container text-xs font-semibold"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmWriteOff}
                                disabled={writeOffMut.isPending}
                                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
                            >
                                <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                                <span>{writeOffMut.isPending ? 'Procesando Baja...' : `Confirmar Salida (-${writeOffQty} uds)`}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 3: AUDITORÍA CLÍNICA DE KARDEX */}
            {kardexProduct && (
                <KardexModal
                    product={kardexProduct}
                    onClose={() => setKardexProduct(null)}
                />
            )}

            {/* MODAL 4: ARQUEO DE CAJA Y CIERRE DE TURNO */}
            <CashCloseModal
                isOpen={isCashCloseOpen}
                onClose={() => {
                    setIsCashCloseOpen(false);
                    refetch();
                }}
            />

            {/* MODAL DE REIMPRESIÓN DE TICKET */}
            {reprintSaleId && (
                <TicketReceipt
                    saleId={reprintSaleId}
                    onComplete={() => setReprintSaleId(null)}
                />
            )}
        </div>
    );
}