import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategories, useCategoriesMutations } from '../hooks/useCategories';
import { useProducts } from '@/features/products/hooks/useProducts';
import { useHasPermission } from '@/features/users/hooks/usePermissions';
import { exportToCsv } from '@/lib/exportUtils';
import type { CategoryPayload } from '../services/categoriesApi';

// Catálogo de iconos farmacéuticos seleccionables para el Administrador
const AVAILABLE_ICONS = [
    { id: 'medication', label: 'Medicamento' },
    { id: 'pill', label: 'Comprimidos' },
    { id: 'vaccines', label: 'Antibióticos / Inyectables' },
    { id: 'healing', label: 'Gastro / Digestivo' },
    { id: 'cardiology', label: 'Cardiovascular' },
    { id: 'sanitizer', label: 'Curación / Antiséptico' },
    { id: 'lock', label: 'Controlado / Psicotrópico' },
    { id: 'nutrition', label: 'Vitaminas / Suplementos' },
    { id: 'air', label: 'Respiratorio / Tos' },
    { id: 'dermatology', label: 'Dermatología / Piel' },
    { id: 'visibility', label: 'Oftalmología / Ojos' },
    { id: 'child_care', label: 'Pediatría / Infantil' },
    { id: 'science', label: 'Laboratorio / Fórmulas' },
    { id: 'fluid_balance', label: 'Sueros / Soluciones' },
    { id: 'health_and_safety', label: 'Higiene / Cuidado' },
    { id: 'emergency', label: 'Urgencias / Botiquín' },
];

export default function CategoriesPage() {
    const navigate = useNavigate();
    const canView = useHasPermission('categories:view');
    const canCreate = useHasPermission('categories:create');
    const canEdit = useHasPermission('categories:edit');
    const canDelete = useHasPermission('categories:delete');

    const { data: categories = [], isLoading, isFetching, error, refetch } = useCategories();
    const { data: products = [] } = useProducts();
    const { createMut, updateMut, deleteMut } = useCategoriesMutations();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedQuickFilter, setSelectedQuickFilter] = useState<'all' | 'with_products' | 'low_stock' | 'has_rx' | 'empty'>('all');
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    // Modales y estados de formulario
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<any | null>(null);
    const [formName, setFormName] = useState('');
    const [formIcon, setFormIcon] = useState('medication');
    const [formDescription, setFormDescription] = useState('');

    const openCreateForm = () => {
        if (!canCreate) return;
        setEditingCategory(null);
        setFormName('');
        setFormIcon('medication');
        setFormDescription('');
        setIsFormOpen(true);
    };

    const openEditForm = (cat: any) => {
        if (!canEdit) return;
        setEditingCategory(cat);
        setFormName(cat.name);
        setFormIcon(cat.icon || 'medication');
        setFormDescription(cat.description || '');
        setIsFormOpen(true);
    };

    const closeForm = () => {
        setIsFormOpen(false);
        setEditingCategory(null);
        setFormName('');
        setFormIcon('medication');
        setFormDescription('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = formName.trim();
        if (!trimmed) return;

        const payload: CategoryPayload = {
            name: trimmed,
            icon: formIcon || 'medication',
            description: formDescription.trim() || null,
        };

        if (editingCategory) {
            updateMut.mutate({ id: editingCategory.id, ...payload }, {
                onSuccess: () => {
                    closeForm();
                    refetch();
                },
                onError: (err: any) => alert(`Error al actualizar categoría: ${err.message}`)
            });
        } else {
            createMut.mutate(payload, {
                onSuccess: () => {
                    closeForm();
                    refetch();
                },
                onError: (err: any) => alert(`Error al crear categoría: ${err.message}`)
            });
        }
    };

    const handleDelete = (id: string, name: string) => {
        const linkedProducts = products.filter((p: any) => p.category_id === id);
        if (linkedProducts.length > 0) {
            alert(`No se puede eliminar "${name}" porque contiene ${linkedProducts.length} medicamentos asociados en inventario. Reasigne esos productos antes de eliminar.`);
            return;
        }

        if (window.confirm(`¿Estás seguro de eliminar la categoría farmacológica "${name}"?`)) {
            deleteMut.mutate(id, {
                onSuccess: () => refetch(),
                onError: (err: any) => alert(`No se puede eliminar: ${err.message}`)
            });
        }
    };

    // 1. CÁLCULO DE DATOS REALES POR CATEGORÍA
    const enrichedCategories = useMemo(() => {
        return categories.map((cat: any) => {
            const prodsInCat = products.filter(p => p.category_id === cat.id);
            const skusCount = prodsInCat.length;

            const rxCount = prodsInCat.filter(p => p.requires_prescription).length;
            const otcCount = skusCount - rxCount;

            const lowStockCount = prodsInCat.filter(p => p.stock <= (p.min_stock ?? 3)).length;
            const totalUnits = prodsInCat.reduce((acc, p) => acc + p.stock, 0);

            let catCost = 0;
            let catPrice = 0;
            prodsInCat.forEach(p => {
                catCost += p.cost_cents * Math.max(1, p.stock);
                catPrice += p.price_cents * Math.max(1, p.stock);
            });
            const computedMargin = catPrice > 0
                ? (((catPrice - catCost) / catPrice) * 100).toFixed(1)
                : '50.0';

            return {
                ...cat,
                icon: cat.icon || 'medication',
                description: cat.description || '',
                skusCount,
                rxCount,
                otcCount,
                lowStockCount,
                totalUnits,
                marginPct: computedMargin,
            };
        });
    }, [categories, products]);

    // 2. KPI METRICS
    const metrics = useMemo(() => {
        const totalCategories = categories.length;
        const categorizedProducts = products.filter(p => !!p.category_id);
        const categoriesWithProducts = enrichedCategories.filter(c => c.skusCount > 0).length;
        const categoriesWithLowStock = enrichedCategories.filter(c => c.lowStockCount > 0).length;
        const totalRxMedicines = products.filter(p => p.requires_prescription).length;

        let totalCost = 0;
        let totalPrice = 0;
        categorizedProducts.forEach(p => {
            totalCost += p.cost_cents * Math.max(1, p.stock);
            totalPrice += p.price_cents * Math.max(1, p.stock);
        });
        const globalMargin = totalPrice > 0
            ? (((totalPrice - totalCost) / totalPrice) * 100).toFixed(1)
            : '55.0';

        return {
            totalCategories,
            categoriesWithProducts,
            categorizedCount: categorizedProducts.length,
            categoriesWithLowStock,
            totalRxMedicines,
            globalMargin,
        };
    }, [categories, products, enrichedCategories]);

    // 3. FILTRADO
    const filteredCategories = useMemo(() => {
        return enrichedCategories.filter((cat) => {
            if (selectedQuickFilter === 'with_products' && cat.skusCount === 0) return false;
            if (selectedQuickFilter === 'empty' && cat.skusCount > 0) return false;
            if (selectedQuickFilter === 'low_stock' && cat.lowStockCount === 0) return false;
            if (selectedQuickFilter === 'has_rx' && cat.rxCount === 0) return false;

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matchName = cat.name.toLowerCase().includes(term);
                const matchDesc = cat.description ? cat.description.toLowerCase().includes(term) : false;
                if (!matchName && !matchDesc) return false;
            }
            return true;
        });
    }, [enrichedCategories, searchTerm, selectedQuickFilter]);

    // Paginación
    const totalPages = Math.ceil(filteredCategories.length / pageSize) || 1;
    const paginatedCategories = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredCategories.slice(start, start + pageSize);
    }, [filteredCategories, currentPage, pageSize]);

    // 4. EXPORTAR A CSV
    const handleExportCsv = () => {
        const rows = enrichedCategories.map(c => [
            c.name,
            c.description || 'Sin descripción',
            c.skusCount,
            c.rxCount,
            c.otcCount,
            c.totalUnits,
            `${c.marginPct}%`,
            c.lowStockCount,
            'Activo'
        ]);

        exportToCsv({
            filename: `Categorias_Farmaceuticas_${new Date().toISOString().slice(0, 10)}.csv`,
            headers: [
                'Categoría / Familia',
                'Descripción / Subfamilias',
                'Medicamentos Vinculados',
                'Con Receta Médica (Rx)',
                'Venta Libre (OTC)',
                'Stock Total (Uds)',
                'Margen Comercial Estimado',
                'Alertas Stock Bajo',
                'Estado'
            ],
            rows
        });
    };

    const isSubmitting = createMut.isPending || updateMut.isPending;

    if (!canView) {
        return (
            <div className="p-12 max-w-xl mx-auto my-12 text-center bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-error">lock</span>
                <h2 className="text-lg font-bold text-on-surface">Acceso Restringido a Categorías</h2>
                <p className="text-xs text-secondary">
                    Tu rol actual no tiene asignado el permiso <span className="font-mono font-bold text-on-surface">categories:view</span> para consultar familias y clasificaciones terapéuticas.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full gap-6 p-6 max-w-[1700px] mx-auto">
            {/* CABECERA */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <nav className="flex items-center gap-1.5 text-secondary font-mono text-xs uppercase tracking-wider">
                        <span>Operaciones</span>
                        <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
                        <span>Inventario</span>
                        <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
                        <span className="text-primary font-bold">Categorías</span>
                    </nav>
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                        <h1 className="text-2xl lg:text-3xl font-bold text-on-surface tracking-tight">
                            Categorías y Clasificación Terapéutica
                        </h1>
                        <span className="inline-flex px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-mono text-xs font-semibold">
                            Estructura de Catálogo Clínico
                        </span>
                    </div>
                    <p className="text-sm text-secondary max-w-4xl">
                        Gestión de familias terapéuticas, agrupación de medicamentos y análisis de existencias en mostrador.
                    </p>
                </div>

                {/* Botones de Cabecera */}
                <div className="flex items-center gap-2 self-start lg:self-auto shrink-0 flex-wrap">
                    <button
                        type="button"
                        onClick={handleExportCsv}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface font-semibold text-sm transition-colors border border-surface-container shadow-sm cursor-pointer"
                        title="Exportar listado a formato CSV / Excel"
                    >
                        <span className="material-symbols-outlined text-[18px] text-secondary">file_download</span>
                        <span>Exportar CSV</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface font-semibold text-sm transition-colors border border-surface-container shadow-sm disabled:opacity-60 cursor-pointer"
                        title="Recargar datos desde la base de datos"
                    >
                        <span className={`material-symbols-outlined text-[18px] text-primary ${isFetching ? 'animate-spin' : ''}`}>
                            refresh
                        </span>
                        <span>{isFetching ? 'Actualizando...' : 'Recargar'}</span>
                    </button>
                    {canCreate && (
                        <button
                            type="button"
                            onClick={openCreateForm}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-semibold text-sm shadow-sm transition-all active:scale-95 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[18px]">add_circle</span>
                            <span>Nueva Categoría</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ERROR BANNER */}
            {error && (
                <div className="p-4 rounded-xl bg-error-container text-error flex items-center justify-between border border-error/30">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px]">warning</span>
                        <span className="text-sm font-semibold">Error al cargar categorías: {(error as any)?.message || 'Error de conexión'}</span>
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="px-3 py-1 bg-surface-container-lowest text-on-surface rounded text-xs font-semibold hover:bg-surface-container"
                    >
                        Reintentar
                    </button>
                </div>
            )}

            {/* KPI METRIC CARDS STRIP */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1 */}
                <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex items-start justify-between">
                        <span className="text-xs uppercase font-bold text-secondary tracking-wider">Familias Registradas</span>
                        <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                            <span className="material-symbols-outlined text-[18px]">account_tree</span>
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-2xl font-bold text-on-surface">{metrics.totalCategories}</span>
                            <span className="text-xs text-secondary">categorías</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-primary font-medium">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            <span>{metrics.categoriesWithProducts} con productos activos</span>
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/20"></div>
                </div>

                {/* KPI 2 */}
                <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex items-start justify-between">
                        <span className="text-xs uppercase font-bold text-secondary tracking-wider">Medicamentos Enlazados</span>
                        <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                            <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-2xl font-bold text-on-surface">{metrics.categorizedCount}</span>
                            <span className="text-xs text-secondary">de {products.length} productos</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-primary font-medium">
                            <span className="material-symbols-outlined text-[14px]">pie_chart</span>
                            <span>{products.length > 0 ? Math.round((metrics.categorizedCount / products.length) * 100) : 0}% clasificados</span>
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/20"></div>
                </div>

                {/* KPI 3 */}
                <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex items-start justify-between">
                        <span className="text-xs uppercase font-bold text-secondary tracking-wider">Receta Médica Obligatoria (Rx)</span>
                        <div className="w-8 h-8 rounded-lg bg-secondary-container flex items-center justify-center text-on-secondary-fixed group-hover:scale-105 transition-transform">
                            <span className="material-symbols-outlined text-[18px]">prescriptions</span>
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-2xl font-bold text-on-surface">{metrics.totalRxMedicines}</span>
                            <span className="text-xs text-secondary">artículos bajo receta</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-secondary font-mono">
                            <span className="material-symbols-outlined text-[14px]">tune</span>
                            <span>Margen global est: {metrics.globalMargin}%</span>
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-secondary/20"></div>
                </div>

                {/* KPI 4 */}
                <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group border-l-4 border-error">
                    <div className="flex items-start justify-between">
                        <span className="text-xs uppercase font-bold text-secondary tracking-wider">Familias con Stock Bajo</span>
                        <div className="w-8 h-8 rounded-lg bg-error-container flex items-center justify-center text-error group-hover:scale-105 transition-transform">
                            <span className="material-symbols-outlined text-[18px]">warning</span>
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-2xl font-bold text-error">{metrics.categoriesWithLowStock}</span>
                            <span className="text-xs text-error font-medium">familias afectadas</span>
                        </div>
                        <p className="mt-1 text-xs text-secondary truncate">
                            Contienen ítems en o bajo el stock mínimo
                        </p>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-error/30"></div>
                </div>
            </div>

            {/* TABLA PRINCIPAL A ANCHO COMPLETO */}
            <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
                {/* Barra de Filtros y Búsqueda */}
                <div className="p-4 bg-surface-container-lowest flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-surface-container">
                    {/* Buscador */}
                    <div className="relative flex-1 max-w-xl">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
                        <input
                            type="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por nombre de categoría o descripción clínica..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                        />
                    </div>

                    {/* Quick Filter Tabs & View Toggle */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Tabs de Filtro Rápido */}
                        <div className="flex items-center gap-1 overflow-x-auto">
                            <button
                                type="button"
                                onClick={() => setSelectedQuickFilter('all')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                    selectedQuickFilter === 'all'
                                        ? 'bg-primary text-on-primary shadow-xs'
                                        : 'bg-surface-container-low hover:bg-surface-container text-secondary'
                                }`}
                            >
                                Todas ({enrichedCategories.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedQuickFilter('with_products')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                    selectedQuickFilter === 'with_products'
                                        ? 'bg-primary text-on-primary shadow-xs'
                                        : 'bg-surface-container-low hover:bg-surface-container text-secondary'
                                }`}
                            >
                                Con Productos ({enrichedCategories.filter(c => c.skusCount > 0).length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedQuickFilter('low_stock')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                    selectedQuickFilter === 'low_stock'
                                        ? 'bg-error text-on-error shadow-xs'
                                        : 'bg-error-container text-error hover:bg-error/20'
                                }`}
                            >
                                Stock Bajo ({enrichedCategories.filter(c => c.lowStockCount > 0).length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedQuickFilter('has_rx')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                    selectedQuickFilter === 'has_rx'
                                        ? 'bg-secondary-container text-on-secondary-fixed shadow-xs'
                                        : 'bg-surface-container-low hover:bg-surface-container text-secondary'
                                }`}
                            >
                                Con Receta (Rx) ({enrichedCategories.filter(c => c.rxCount > 0).length})
                            </button>
                        </div>

                        {/* Toggle de Vista Tabla vs Tarjetas */}
                        <div className="flex items-center p-0.5 bg-surface-container rounded-lg border border-surface-container ml-auto">
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${
                                    viewMode === 'table'
                                        ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                                        : 'text-secondary hover:text-on-surface'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[16px]">table_rows</span>
                                <span>Tabla</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('cards')}
                                className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${
                                    viewMode === 'cards'
                                        ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                                        : 'text-secondary hover:text-on-surface'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                                <span>Tarjetas</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* VISTA TABLA COMPLETA */}
                {viewMode === 'table' ? (
                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-surface-container-low text-secondary font-mono text-[11px] uppercase tracking-wider">
                                    <th className="py-3 px-5 font-bold">Categoría &amp; Icono</th>
                                    <th className="py-3 px-4 font-bold">Descripción / Subfamilias</th>
                                    <th className="py-3 px-4 font-bold text-center">Medicamentos (SKUs)</th>
                                    <th className="py-3 px-4 font-bold">Control de Receta</th>
                                    <th className="py-3 px-4 font-bold text-right">Existencias (Uds)</th>
                                    <th className="py-3 px-4 font-bold text-right">Margen Promedio</th>
                                    <th className="py-3 px-4 font-bold">Alertas de Stock</th>
                                    <th className="py-3 px-4 font-bold text-center">Estado</th>
                                    <th className="py-3 px-5 font-bold text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-container text-sm">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={9} className="py-16 text-center text-secondary">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
                                                <span>Cargando categorías farmacéuticas...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : paginatedCategories.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="py-16 text-center text-secondary">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <span className="material-symbols-outlined text-4xl text-outline">search_off</span>
                                                <span className="font-medium">No se encontraron categorías coincidentes.</span>
                                                {searchTerm && (
                                                    <button
                                                        onClick={() => setSearchTerm('')}
                                                        className="text-xs text-primary font-semibold hover:underline"
                                                    >
                                                        Limpiar búsqueda
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedCategories.map((cat) => (
                                        <tr key={cat.id} className="hover:bg-surface-container-low/50 transition-colors group">
                                            {/* Icono y Nombre */}
                                            <td className="py-3.5 px-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0 group-hover:bg-primary group-hover:text-on-primary transition-colors border border-surface-container-high shadow-xs">
                                                        <span className="material-symbols-outlined text-[22px]">{cat.icon}</span>
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="font-bold text-on-surface truncate text-sm">{cat.name}</span>
                                                        <span className="font-mono text-[11px] text-secondary">ID: {cat.id.slice(0, 8)}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Descripción */}
                                            <td className="py-3.5 px-4 text-secondary text-xs max-w-xs truncate">
                                                {cat.description || (
                                                    <span className="italic text-outline">Sin descripción adicional</span>
                                                )}
                                            </td>

                                            {/* Medicamentos SKUs */}
                                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                                {cat.skusCount > 0 ? (
                                                    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-on-surface px-2.5 py-0.5 rounded-full bg-surface-container border border-surface-container-high">
                                                        <span>{cat.skusCount}</span>
                                                        <span className="text-[10px] text-secondary font-normal">productos</span>
                                                    </span>
                                                ) : (
                                                    <span className="font-mono text-xs text-secondary italic">0 productos</span>
                                                )}
                                            </td>

                                            {/* Control de Receta (Derivado de sus productos reales) */}
                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                {cat.skusCount === 0 ? (
                                                    <span className="text-xs text-secondary">-</span>
                                                ) : cat.rxCount > 0 && cat.otcCount > 0 ? (
                                                    <div className="flex items-center gap-1.5 text-xs font-mono">
                                                        <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-fixed text-[11px] font-bold">
                                                            {cat.rxCount} Rx
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded bg-primary-fixed/40 text-primary text-[11px] font-semibold">
                                                            {cat.otcCount} OTC
                                                        </span>
                                                    </div>
                                                ) : cat.rxCount > 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-secondary-container text-on-secondary-fixed border border-secondary/20">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0"></span>
                                                        {cat.rxCount} con Receta (Rx)
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary-fixed/40 text-primary border border-primary/20">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
                                                        {cat.otcCount} Venta Libre (OTC)
                                                    </span>
                                                )}
                                            </td>

                                            {/* Existencias en Unidades */}
                                            <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-on-surface whitespace-nowrap">
                                                {cat.totalUnits.toLocaleString()} uds
                                            </td>

                                            {/* Margen Promedio */}
                                            <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-primary whitespace-nowrap">
                                                {cat.marginPct}%
                                            </td>

                                            {/* Alertas de Stock */}
                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                {cat.lowStockCount > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-error bg-error-container/60 px-2 py-0.5 rounded text-[11px] font-semibold">
                                                        <span className="material-symbols-outlined text-[13px]">warning</span>
                                                        {cat.lowStockCount} con stock bajo
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-secondary bg-surface-container px-2 py-0.5 rounded text-[11px] font-mono">
                                                        <span className="material-symbols-outlined text-[13px] text-primary">check</span>
                                                        Sin alertas
                                                    </span>
                                                )}
                                            </td>

                                            {/* Estado */}
                                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                                <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-primary font-mono text-[10px] font-bold uppercase border border-surface-container-high">
                                                    Activo
                                                </span>
                                            </td>

                                            {/* Acciones */}
                                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/inventory?search=${encodeURIComponent(cat.name)}`)}
                                                        className="p-1.5 rounded text-secondary hover:text-primary hover:bg-surface-container transition-colors"
                                                        title={`Ver productos de ${cat.name} en inventario`}
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                                                    </button>
                                                    {canEdit && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditForm(cat)}
                                                            className="p-1.5 rounded text-secondary hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                                                            title="Editar nombre, icono y descripción"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(cat.id, cat.name)}
                                                            className="p-1.5 rounded text-secondary hover:text-error hover:bg-error-container transition-colors cursor-pointer"
                                                            title="Eliminar categoría"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* VISTA TARJETAS BENTO */
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {paginatedCategories.map((cat) => (
                            <div
                                key={cat.id}
                                className="bg-surface-container-low/70 hover:bg-surface-container p-4 rounded-xl border border-surface-container transition-all flex flex-col justify-between group"
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-primary group-hover:scale-105 transition-transform shadow-xs border border-surface-container">
                                                <span className="material-symbols-outlined text-[22px]">{cat.icon}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <h3 className="font-bold text-on-surface text-sm truncate">{cat.name}</h3>
                                                <span className="text-[11px] text-secondary line-clamp-1">{cat.description || 'Categoría farmacéutica'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-surface-container/60 grid grid-cols-2 gap-2 text-xs font-mono">
                                        <div>
                                            <span className="text-secondary block text-[10px]">Medicamentos</span>
                                            <span className="font-bold text-on-surface">{cat.skusCount} SKUs</span>
                                        </div>
                                        <div>
                                            <span className="text-secondary block text-[10px]">Existencias</span>
                                            <span className="font-bold text-on-surface">{cat.totalUnits} uds</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-surface-container/60">
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/inventory?search=${encodeURIComponent(cat.name)}`)}
                                        className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                                        <span>Ver inventario</span>
                                    </button>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => openEditForm(cat)}
                                            className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
                                            title="Editar"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">edit</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(cat.id, cat.name)}
                                            className="p-1 rounded text-secondary hover:text-error hover:bg-error-container transition-colors"
                                            title="Eliminar"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Footer y Paginación */}
                <div className="p-4 bg-surface-container-lowest border-t border-surface-container flex flex-col sm:flex-row items-center justify-between gap-3 text-secondary text-xs">
                    <div>
                        Mostrando <span className="font-mono font-semibold text-on-surface">{paginatedCategories.length}</span> de <span className="font-mono font-semibold text-on-surface">{filteredCategories.length}</span> categorías registradas
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-2.5 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                            <span>Anterior</span>
                        </button>
                        <span className="font-mono px-2 text-on-surface">Página {currentPage} de {totalPages}</span>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-2.5 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <span>Siguiente</span>
                            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* MODAL CREAR / EDITAR CATEGORÍA CON SELECTOR DE ICONO */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-lg border border-surface-container-high overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-surface-container flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[20px]">{formIcon}</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-on-surface leading-tight">
                                        {editingCategory ? 'Editar Categoría Farmacéutica' : 'Nueva Categoría Farmacéutica'}
                                    </h3>
                                    <span className="text-xs text-secondary">Configuración clínica y taxonomía</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeForm}
                                className="text-secondary hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="block text-secondary font-semibold text-xs uppercase tracking-wider mb-1.5">
                                    Nombre de la Categoría *
                                </label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    placeholder="ej. Antibióticos Sistémicos, Salud Digestiva, Analgésicos..."
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full bg-surface-container-low text-on-surface px-3.5 py-2.5 rounded-lg border border-surface-container focus:outline-none focus:ring-2 focus:ring-primary font-medium text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-secondary font-semibold text-xs uppercase tracking-wider mb-1.5">
                                    Descripción o Subfamilias (Opcional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="ej. AINEs, Antipiréticos, Analgésicos periféricos..."
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    className="w-full bg-surface-container-low text-on-surface px-3.5 py-2 rounded-lg border border-surface-container focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                                />
                            </div>

                            {/* SELECTOR VISUAL DE ICONO */}
                            <div>
                                <label className="block text-secondary font-semibold text-xs uppercase tracking-wider mb-2">
                                    Icono Farmacéutico Personalizado
                                </label>
                                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 p-3 bg-surface-container-low rounded-xl border border-surface-container max-h-48 overflow-y-auto">
                                    {AVAILABLE_ICONS.map((icon) => {
                                        const isSelected = formIcon === icon.id;
                                        return (
                                            <button
                                                key={icon.id}
                                                type="button"
                                                onClick={() => setFormIcon(icon.id)}
                                                className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-primary text-on-primary ring-2 ring-primary shadow-sm scale-105'
                                                        : 'bg-surface-container-lowest hover:bg-surface-container text-secondary hover:text-on-surface'
                                                }`}
                                                title={icon.label}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">{icon.id}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <span className="text-[11px] text-secondary mt-1 block">
                                    Seleccionado: <strong className="text-on-surface">{AVAILABLE_ICONS.find(i => i.id === formIcon)?.label || formIcon}</strong>
                                </span>
                            </div>

                            {/* VISTA PREVIA */}
                            {formName.trim() && (
                                <div className="p-3.5 rounded-xl bg-surface-container-low border border-surface-container flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-xs">
                                        <span className="material-symbols-outlined text-[22px]">{formIcon}</span>
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-bold text-on-surface text-sm truncate">{formName}</span>
                                        <span className="text-xs text-secondary truncate">
                                            {formDescription || 'Categoría activa en catálogo'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container">
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    className="px-4 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary hover:text-on-surface font-semibold text-sm transition-colors cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !formName.trim()}
                                    className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-semibold text-sm transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                            <span>Guardando...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[16px]">check</span>
                                            <span>{editingCategory ? 'Guardar Cambios' : 'Crear Categoría'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}