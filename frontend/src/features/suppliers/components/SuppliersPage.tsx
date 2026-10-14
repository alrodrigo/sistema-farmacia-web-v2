import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuppliers, useSupplierMutations } from '../hooks/useSuppliers';
import { useProducts } from '@/features/products/hooks/useProducts';
import { useHasPermission } from '@/features/users/hooks/usePermissions';
import { exportToCsv } from '@/lib/exportUtils';
import type { SupplierPayload } from '../services/suppliersApi';
import { toast } from '@/stores/toastStore';
import { confirmDialog } from '@/stores/confirmModalStore';

// Helper para extraer iniciales de la razón social de forma elegante
function getInitials(name: string): string {
    const cleaned = name.replace(/s\.a\.|de\s+c\.v\.|s\.r\.l\.|ltda\.|inc\./gi, '').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name.slice(0, 2) || 'PR').toUpperCase();
}

export default function SuppliersPage() {
    const navigate = useNavigate();
    const canView = useHasPermission('suppliers:view');
    const canCreate = useHasPermission('suppliers:create');
    const canEdit = useHasPermission('suppliers:edit');
    const canDelete = useHasPermission('suppliers:delete');

    const { data: suppliers = [], isLoading, isFetching, error, refetch } = useSuppliers();
    const { data: products = [] } = useProducts();
    const { createMut, updateMut, deleteMut } = useSupplierMutations();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedQuickFilter, setSelectedQuickFilter] = useState<'all' | 'with_products' | 'empty' | 'low_stock'>('all');
    const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    // Estados de Formulario Modal
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
    const [formName, setFormName] = useState('');
    const [formNit, setFormNit] = useState('');
    const [formContactName, setFormContactName] = useState('');
    const [formPhone, setFormPhone] = useState('');

    const openCreateForm = () => {
        if (!canCreate) return;
        setEditingSupplier(null);
        setFormName('');
        setFormNit('');
        setFormContactName('');
        setFormPhone('');
        setIsFormOpen(true);
    };

    const openEditForm = (sup: any) => {
        if (!canEdit) return;
        setEditingSupplier(sup);
        setFormName(sup.name);
        setFormNit(sup.nit || '');
        setFormContactName(sup.contact_name || '');
        setFormPhone(sup.contact_phone || '');
        setIsFormOpen(true);
    };

    const closeForm = () => {
        setIsFormOpen(false);
        setEditingSupplier(null);
        setFormName('');
        setFormNit('');
        setFormContactName('');
        setFormPhone('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingSupplier ? !canEdit : !canCreate) return;
        const trimmedName = formName.trim();
        if (!trimmedName) return;

        const payload: SupplierPayload = {
            name: trimmedName,
            nit: formNit.trim() || null,
            contactName: formContactName.trim() || null,
            contactPhone: formPhone.trim() || null,
            isActive: true,
        };

        if (editingSupplier) {
            updateMut.mutate({ id: editingSupplier.id, ...payload }, {
                onSuccess: () => {
                    closeForm();
                    refetch();
                    toast.success(`Datos de "${name}" actualizados con éxito`, 'Proveedor Actualizado');
                },
                onError: (err: any) => toast.error(err.message, 'Error al actualizar proveedor')
            });
        } else {
            createMut.mutate(payload, {
                onSuccess: () => {
                    closeForm();
                    refetch();
                    toast.success(`Proveedor "${name}" registrado en el sistema`, 'Proveedor Creado');
                },
                onError: (err: any) => toast.error(err.message, 'Error al registrar proveedor')
            });
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!canDelete) return;
        const linkedProducts = products.filter((p: any) => p.supplier_id === id);
        if (linkedProducts.length > 0) {
            toast.warning(
                `No se puede eliminar "${name}" porque tiene ${linkedProducts.length} medicamentos asociados en inventario. Reasigne los productos primero.`,
                'Proveedor con medicamentos vinculados'
            );
            return;
        }

        const confirmed = await confirmDialog({
            title: '¿Eliminar Proveedor / Distribuidor?',
            message: `¿Estás seguro de eliminar "${name}" del directorio? Esta acción no se puede deshacer.`,
            confirmText: 'Sí, eliminar',
            cancelText: 'Cancelar',
            type: 'danger',
        });

        if (confirmed) {
            deleteMut.mutate(id, {
                onSuccess: () => {
                    refetch();
                    toast.success(`Proveedor "${name}" eliminado`);
                },
                onError: (err: any) => toast.error(err.message, 'No se puede eliminar')
            });
        }
    };

    // 1. ENRIQUECER PROVEEDORES CON DATOS REALES DE INVENTARIO
    const enrichedSuppliers = useMemo(() => {
        return suppliers.map((sup: any, idx: number) => {
            const initials = getInitials(sup.name);
            const code = `PRV-${String(idx + 1).padStart(4, '0')}`;
            const linkedProducts = products.filter(p => p.supplier_id === sup.id);
            const skusCount = linkedProducts.length;
            const totalUnits = linkedProducts.reduce((acc, p) => acc + p.stock, 0);
            const lowStockCount = linkedProducts.filter(p => p.stock <= (p.min_stock ?? 3)).length;

            return {
                ...sup,
                initials,
                code,
                skusCount,
                totalUnits,
                lowStockCount,
            };
        });
    }, [suppliers, products]);

    // 2. KPI MÉTRICAS REALES
    const metrics = useMemo(() => {
        const totalCount = suppliers.length;
        const activeCount = suppliers.filter((s: any) => s.is_active !== false).length;
        const withProductsCount = enrichedSuppliers.filter(s => s.skusCount > 0).length;
        const suppliedProductsCount = products.filter(p => !!p.supplier_id).length;
        const withContactCount = suppliers.filter((s: any) => !!s.contact_phone || !!s.contact_name).length;
        const withNitCount = suppliers.filter((s: any) => !!s.nit).length;

        return {
            totalCount,
            activeCount,
            withProductsCount,
            suppliedProductsCount,
            withContactCount,
            withNitCount,
        };
    }, [suppliers, products, enrichedSuppliers]);

    // 3. FILTRADO Y BÚSQUEDA
    const filteredSuppliers = useMemo(() => {
        return enrichedSuppliers.filter((s) => {
            if (selectedQuickFilter === 'with_products' && s.skusCount === 0) return false;
            if (selectedQuickFilter === 'empty' && s.skusCount > 0) return false;
            if (selectedQuickFilter === 'low_stock' && s.lowStockCount === 0) return false;

            if (selectedStatus === 'active' && s.is_active === false) return false;
            if (selectedStatus === 'inactive' && s.is_active !== false) return false;

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matchName = s.name.toLowerCase().includes(term);
                const matchNit = s.nit ? s.nit.toLowerCase().includes(term) : false;
                const matchContact = s.contact_name ? s.contact_name.toLowerCase().includes(term) : false;
                const matchPhone = s.contact_phone ? s.contact_phone.toLowerCase().includes(term) : false;
                const matchCode = s.code.toLowerCase().includes(term);
                if (!matchName && !matchNit && !matchContact && !matchPhone && !matchCode) return false;
            }
            return true;
        });
    }, [enrichedSuppliers, searchTerm, selectedQuickFilter, selectedStatus]);

    // Paginación
    const totalPages = Math.ceil(filteredSuppliers.length / pageSize) || 1;
    const paginatedSuppliers = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredSuppliers.slice(start, start + pageSize);
    }, [filteredSuppliers, currentPage, pageSize]);

    // 4. EXPORTAR A CSV
    const handleExportCsv = () => {
        const rows = enrichedSuppliers.map(s => [
            s.code,
            s.name,
            s.nit || 'Sin NIT',
            s.contact_name || 'Sin representante',
            s.contact_phone || 'Sin teléfono',
            s.skusCount,
            s.totalUnits,
            s.lowStockCount,
            s.is_active !== false ? 'Activo' : 'Inactivo',
            s.created_at ? new Date(s.created_at).toISOString().slice(0, 10) : 'Sin fecha'
        ]);

        exportToCsv({
            filename: `Directorio_Proveedores_${new Date().toISOString().slice(0, 10)}.csv`,
            headers: [
                'ID / Código',
                'Razón Social / Laboratorio',
                'NIT / Código Fiscal',
                'Contacto / Representante',
                'Teléfono de Contacto',
                'Medicamentos Vinculados',
                'Total Existencias (Uds)',
                'Alertas Stock Bajo',
                'Estado',
                'Fecha Registro'
            ],
            rows
        });
    };

    const isSubmitting = createMut.isPending || updateMut.isPending;

    if (!canView) {
        return (
            <div className="p-12 max-w-xl mx-auto my-12 text-center bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-error">lock</span>
                <h2 className="text-lg font-bold text-on-surface">Acceso Restringido a Proveedores</h2>
                <p className="text-xs text-secondary">
                    Tu rol actual no tiene asignado el permiso <span className="font-mono font-bold text-on-surface">suppliers:view</span> para consultar el directorio de laboratorios y distribuidores.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full gap-6 p-6 max-w-[1700px] mx-auto">
            {/* CABECERA & ACCIONES */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <nav className="flex items-center gap-1.5 font-mono text-xs text-secondary uppercase tracking-wider">
                        <span>Operaciones</span>
                        <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
                        <span className="text-on-surface font-semibold">Proveedores y Laboratorios</span>
                    </nav>
                    <h1 className="text-2xl lg:text-3xl font-bold text-on-surface tracking-tight">
                        Directorio de Proveedores &amp; Laboratorios Farmacéuticos
                    </h1>
                    <p className="text-sm text-secondary max-w-3xl">
                        Gestión de laboratorios abastecedores, representantes comerciales, NIT y medicamentos enlazados en inventario.
                    </p>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
                    <button
                        type="button"
                        onClick={handleExportCsv}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container shadow-sm border border-surface-container transition-colors font-semibold text-sm cursor-pointer"
                        title="Exportar listado a formato CSV / Excel"
                    >
                        <span className="material-symbols-outlined text-[18px] text-secondary">download</span>
                        <span>Exportar Listado (CSV)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container shadow-sm border border-surface-container transition-colors font-semibold text-sm disabled:opacity-60 cursor-pointer"
                        title="Recargar proveedores"
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
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary shadow-sm transition-all font-semibold text-sm active:scale-95 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            <span>Nuevo Proveedor</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ERROR BANNER */}
            {error && (
                <div className="p-4 rounded-xl bg-error-container text-error flex items-center justify-between border border-error/30">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px]">warning</span>
                        <span className="text-sm font-semibold">Error al cargar proveedores: {(error as any)?.message || 'Error de conexión'}</span>
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="px-3 py-1 bg-surface-container-lowest text-on-surface rounded text-xs font-semibold hover:bg-surface-container"
                    >
                        Reintentar
                    </button>
                </div>
            )}

            {/* KPI METRIC CARDS STRIP (Bento Grid con Datos Reales) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1: Total Proveedores */}
                <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-secondary tracking-wider">Total Proveedores</span>
                        <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                            <span className="material-symbols-outlined text-[18px]">domain</span>
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-bold text-on-surface">{metrics.totalCount}</span>
                        <span className="text-xs text-secondary">registrados</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-surface-container/60 flex items-center justify-between text-xs text-secondary">
                        <span>Activos comerciales:</span>
                        <span className="font-mono font-semibold text-on-surface">{metrics.activeCount} vigentes</span>
                    </div>
                </div>

                {/* KPI 2: Medicamentos Suministrados */}
                <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-secondary tracking-wider">Medicamentos Enlazados</span>
                        <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary group-hover:scale-105 transition-transform">
                            <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-bold text-on-surface">{metrics.suppliedProductsCount}</span>
                        <span className="text-xs text-secondary">productos en catálogo</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-surface-container/60 flex items-center justify-between text-xs text-secondary">
                        <span>Proveedores con ítems:</span>
                        <span className="font-mono font-semibold text-on-surface">{metrics.withProductsCount} activos</span>
                    </div>
                </div>

                {/* KPI 3: Canales de Contacto */}
                <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-secondary tracking-wider">Canal Telefónico / Contacto</span>
                        <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                            <span className="material-symbols-outlined text-[18px]">call</span>
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-bold text-primary">{metrics.withContactCount}</span>
                        <span className="text-xs text-secondary">con teléfono / contacto</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-surface-container/60 flex items-center justify-between text-xs text-secondary">
                        <span>Cobertura de contacto:</span>
                        <span className="font-mono font-semibold text-on-surface">
                            {metrics.totalCount > 0 ? Math.round((metrics.withContactCount / metrics.totalCount) * 100) : 0}%
                        </span>
                    </div>
                </div>

                {/* KPI 4: Registro Fiscal / NIT */}
                <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-secondary tracking-wider">Trazabilidad Fiscal / NIT</span>
                        <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                            <span className="material-symbols-outlined text-[18px]">badge</span>
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="font-mono text-2xl font-bold text-on-surface">{metrics.withNitCount}</span>
                        <span className="text-xs text-secondary">con NIT registrado</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-surface-container/60 flex items-center justify-between text-xs text-secondary">
                        <span>Padrón fiscal:</span>
                        <span className="font-mono font-semibold text-on-surface">
                            {metrics.totalCount > 0 ? Math.round((metrics.withNitCount / metrics.totalCount) * 100) : 0}% registrados
                        </span>
                    </div>
                </div>
            </div>

            {/* BARRA DE BÚSQUEDA Y FILTROS OPERATIVOS */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container p-4 flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                    {/* Buscador */}
                    <div className="relative flex-1 max-w-xl">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
                        <input
                            type="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por razón social, NIT, representante o teléfono..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                        />
                    </div>

                    {/* Filtro por Estado */}
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value as any)}
                                className="appearance-none bg-surface-container-low text-on-surface text-xs pl-3 pr-8 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container cursor-pointer font-medium"
                            >
                                <option value="all">Estado: Todos</option>
                                <option value="active">Solo Activos</option>
                                <option value="inactive">Solo Inactivos</option>
                            </select>
                            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-outline text-[16px] pointer-events-none">expand_more</span>
                        </div>
                    </div>
                </div>

                {/* Filtros Rápidos Operativos */}
                <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1">
                    <button
                        type="button"
                        onClick={() => setSelectedQuickFilter('all')}
                        className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                            selectedQuickFilter === 'all'
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'bg-surface-container-low hover:bg-surface-container text-secondary'
                        }`}
                    >
                        Todos ({enrichedSuppliers.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedQuickFilter('with_products')}
                        className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                            selectedQuickFilter === 'with_products'
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'bg-surface-container-low hover:bg-surface-container text-secondary'
                        }`}
                    >
                        Con Medicamentos ({enrichedSuppliers.filter(s => s.skusCount > 0).length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedQuickFilter('low_stock')}
                        className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                            selectedQuickFilter === 'low_stock'
                                ? 'bg-error text-on-error shadow-xs'
                                : 'bg-error-container text-error hover:bg-error/20'
                        }`}
                    >
                        Con Stock Bajo ({enrichedSuppliers.filter(s => s.lowStockCount > 0).length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedQuickFilter('empty')}
                        className={`px-3.5 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                            selectedQuickFilter === 'empty'
                                ? 'bg-surface-container-high text-on-surface shadow-xs'
                                : 'bg-surface-container-low hover:bg-surface-container text-secondary'
                        }`}
                    >
                        Sin Productos (0) ({enrichedSuppliers.filter(s => s.skusCount === 0).length})
                    </button>
                </div>
            </div>

            {/* TABLA PRINCIPAL DE PROVEEDORES (Limpia, Sin Checkboxes, Solo Atributos Reales) */}
            <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container overflow-hidden flex flex-col">
                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-surface-container-low text-secondary font-mono text-[11px] uppercase tracking-wider select-none">
                            <tr>
                                <th className="px-5 py-3 font-bold">Código</th>
                                <th className="px-5 py-3 font-bold">Razón Social / Laboratorio</th>
                                <th className="px-4 py-3 font-bold">NIT / Código Fiscal</th>
                                <th className="px-4 py-3 font-bold">Contacto / Representante</th>
                                <th className="px-4 py-3 font-bold">Teléfono de Contacto</th>
                                <th className="px-4 py-3 font-bold text-center">Medicamentos Suministrados</th>
                                <th className="px-4 py-3 font-bold text-right">Existencias (Uds)</th>
                                <th className="px-4 py-3 font-bold">Alertas Stock</th>
                                <th className="px-4 py-3 font-bold text-center">Estado</th>
                                <th className="px-5 py-3 font-bold text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container text-sm">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center text-secondary">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
                                            <span>Cargando directorio de proveedores...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedSuppliers.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="py-16 text-center text-secondary">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="material-symbols-outlined text-4xl text-outline">domain_disabled</span>
                                            <span className="font-medium">No se encontraron proveedores coincidentes.</span>
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
                                paginatedSuppliers.map((sup) => (
                                    <tr key={sup.id} className="hover:bg-surface-container-low/50 transition-colors group">
                                        {/* Código ID */}
                                        <td className="px-5 py-3.5 font-mono text-xs font-bold text-primary whitespace-nowrap">
                                            {sup.code}
                                        </td>

                                        {/* Razón Social con Avatar de Iniciales */}
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center shrink-0 text-on-surface font-mono text-xs font-bold border border-surface-container-high group-hover:bg-primary group-hover:text-on-primary transition-colors shadow-xs">
                                                    {sup.initials}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-bold text-on-surface truncate text-sm">{sup.name}</span>
                                                    <span className="font-mono text-[11px] text-secondary">
                                                        Registrado: {sup.created_at ? new Date(sup.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : 'S/F'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* NIT / Código Fiscal */}
                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                            {sup.nit ? (
                                                <span className="font-mono text-xs text-on-surface px-2 py-0.5 bg-surface-container rounded border border-surface-container-high font-semibold">
                                                    {sup.nit}
                                                </span>
                                            ) : (
                                                <span className="font-mono text-xs text-secondary italic">Sin NIT</span>
                                            )}
                                        </td>

                                        {/* Representante / Contacto Clave */}
                                        <td className="px-4 py-3.5">
                                            {sup.contact_name ? (
                                                <div className="flex items-center gap-1.5 text-xs text-on-surface font-medium">
                                                    <span className="material-symbols-outlined text-[15px] text-secondary">person</span>
                                                    <span className="truncate">{sup.contact_name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-secondary italic">Sin representante</span>
                                            )}
                                        </td>

                                        {/* Teléfono */}
                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                            {sup.contact_phone ? (
                                                <a
                                                    href={`tel:${sup.contact_phone}`}
                                                    className="font-mono text-xs text-primary hover:underline flex items-center gap-1 font-semibold"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">call</span>
                                                    <span>{sup.contact_phone}</span>
                                                </a>
                                            ) : (
                                                <span className="font-mono text-xs text-secondary italic">Sin teléfono</span>
                                            )}
                                        </td>

                                        {/* Medicamentos Suministrados */}
                                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                            {sup.skusCount > 0 ? (
                                                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-on-surface px-2.5 py-0.5 rounded-full bg-surface-container border border-surface-container-high">
                                                    <span>{sup.skusCount}</span>
                                                    <span className="text-[10px] text-secondary font-normal">medicamentos</span>
                                                </span>
                                            ) : (
                                                <span className="font-mono text-xs text-secondary italic">0 medicamentos</span>
                                            )}
                                        </td>

                                        {/* Existencias Totales */}
                                        <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-on-surface whitespace-nowrap">
                                            {sup.totalUnits.toLocaleString()} uds
                                        </td>

                                        {/* Alertas de Stock Bajo */}
                                        <td className="px-4 py-3.5 whitespace-nowrap">
                                            {sup.lowStockCount > 0 ? (
                                                <span className="inline-flex items-center gap-1 text-error bg-error-container/60 px-2 py-0.5 rounded text-[11px] font-semibold">
                                                    <span className="material-symbols-outlined text-[13px]">warning</span>
                                                    {sup.lowStockCount} con stock bajo
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-secondary bg-surface-container px-2 py-0.5 rounded text-[11px] font-mono">
                                                    <span className="material-symbols-outlined text-[13px] text-primary">check</span>
                                                    Sin alertas
                                                </span>
                                            )}
                                        </td>

                                        {/* Estado */}
                                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                            {sup.is_active !== false ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-mono text-[10px] font-bold uppercase border border-primary/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
                                                    Activo
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container text-secondary font-mono text-[10px] font-bold uppercase border border-surface-container-high">
                                                    Inactivo
                                                </span>
                                            )}
                                        </td>

                                        {/* Acciones */}
                                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                            <div className="inline-flex items-center justify-end gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/inventory?search=${encodeURIComponent(sup.name)}`)}
                                                    className="p-1.5 rounded text-secondary hover:text-primary hover:bg-surface-container transition-colors"
                                                    title={`Ver medicamentos abastecidos por ${sup.name}`}
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                                                </button>
                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditForm(sup)}
                                                        className="p-1.5 rounded text-secondary hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                                                        title="Editar datos del proveedor"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">edit</span>
                                                    </button>
                                                )}
                                                {canDelete && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(sup.id, sup.name)}
                                                        className="p-1.5 rounded text-secondary hover:text-error hover:bg-error-container transition-colors cursor-pointer"
                                                        title="Eliminar proveedor"
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

                {/* Footer de Paginación */}
                <div className="px-5 py-3.5 bg-surface-container-lowest border-t border-surface-container flex flex-col sm:flex-row items-center justify-between gap-3 text-secondary text-xs">
                    <div>
                        Mostrando <span className="font-mono font-semibold text-on-surface">{paginatedSuppliers.length}</span> de <span className="font-mono font-semibold text-on-surface">{filteredSuppliers.length}</span> proveedores registrados
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-2.5 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-40 font-mono text-xs flex items-center transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                            <span>Anterior</span>
                        </button>
                        <span className="font-mono px-2 text-on-surface">Página {currentPage} de {totalPages}</span>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-2.5 py-1 rounded bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-40 font-mono text-xs flex items-center transition-colors cursor-pointer"
                        >
                            <span>Siguiente</span>
                            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* MODAL CREAR / EDITAR PROVEEDOR */}
            {isFormOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-lg border border-surface-container-high overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-surface-container flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[20px]">domain</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-on-surface leading-tight">
                                        {editingSupplier ? 'Editar Proveedor / Laboratorio' : 'Registrar Nuevo Proveedor'}
                                    </h3>
                                    <span className="text-xs text-secondary">Datos comerciales y de contacto</span>
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
                                    Razón Social / Nombre del Laboratorio *
                                </label>
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    placeholder="ej. Bayer Farma, Pfizer Meds, Laboratorios Bagó..."
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    className="w-full bg-surface-container-low text-on-surface px-3.5 py-2.5 rounded-lg border border-surface-container focus:outline-none focus:ring-2 focus:ring-primary font-medium text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-secondary font-semibold text-xs uppercase tracking-wider mb-1.5">
                                        NIT / Código Fiscal
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="ej. 1028374021"
                                        value={formNit}
                                        onChange={(e) => setFormNit(e.target.value)}
                                        className="w-full bg-surface-container-low text-on-surface px-3.5 py-2.5 rounded-lg border border-surface-container focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-secondary font-semibold text-xs uppercase tracking-wider mb-1.5">
                                        Teléfono de Contacto
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="ej. +591 70012345"
                                        value={formPhone}
                                        onChange={(e) => setFormPhone(e.target.value)}
                                        className="w-full bg-surface-container-low text-on-surface px-3.5 py-2.5 rounded-lg border border-surface-container focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-secondary font-semibold text-xs uppercase tracking-wider mb-1.5">
                                    Nombre del Contacto Clave / Representante
                                </label>
                                <input
                                    type="text"
                                    placeholder="ej. Dra. Mariana Cordero, Ing. Carlos Valenzuela..."
                                    value={formContactName}
                                    onChange={(e) => setFormContactName(e.target.value)}
                                    className="w-full bg-surface-container-low text-on-surface px-3.5 py-2.5 rounded-lg border border-surface-container focus:outline-none focus:ring-2 focus:ring-primary font-medium text-sm"
                                />
                            </div>

                            {/* Vista previa de iniciales */}
                            {formName.trim() && (
                                <div className="p-3 rounded-lg bg-surface-container-low border border-surface-container flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-primary text-on-primary font-mono font-bold text-xs flex items-center justify-center">
                                        {getInitials(formName)}
                                    </div>
                                    <div className="flex flex-col text-xs">
                                        <span className="font-semibold text-on-surface">{formName}</span>
                                        <span className="text-secondary font-mono">
                                            {formNit ? `NIT: ${formNit}` : 'Sin NIT'} • {formContactName || 'Representante general'}
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
                                            <span>{editingSupplier ? 'Guardar Cambios' : 'Registrar Proveedor'}</span>
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