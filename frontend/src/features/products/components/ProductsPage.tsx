import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useProducts, useProductMutations } from "../hooks/useProducts";
import { useCategories } from "@/features/categories/hooks/useCategories";
import { useSuppliers } from "@/features/suppliers/hooks/useSuppliers";
import { useHasPermission } from "@/features/users/hooks/usePermissions";
import { exportToCsv } from "@/lib/exportUtils";
import type { BatchInput } from "../services/productsApi";
import KardexModal from "./KardexModal";
import { toast } from "@/stores/toastStore";
import { confirmDialog } from "@/stores/confirmModalStore";

// Helper para detectar productos vencidos o próximos a vencer (30 días por defecto)
function isProductExpiring(p: any, daysAhead = 30): boolean {
    if (p.stock <= 0) return false;
    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + daysAhead);

    // Revisar primero lotes individuales si existen
    if (p.product_batches && p.product_batches.length > 0) {
        const hasExpBatch = p.product_batches.some((b: any) => {
            if (!b.expiration_date || (b.stock !== undefined && Number(b.stock) <= 0)) return false;
            return new Date(b.expiration_date) <= targetDate;
        });
        if (hasExpBatch) return true;
    }

    // Fallback a fecha directa del producto
    if (p.expiration_date) {
        return new Date(p.expiration_date) <= targetDate;
    }

    return false;
}

export default function ProductsPage() {
    const [searchParams] = useSearchParams();

    // 1. DATA LAYER
    const { data: products = [], isLoading: loadingProducts } = useProducts();
    const { data: categories = [], refetch: refetchCategories } = useCategories();
    const { data: suppliers = [], refetch: refetchSuppliers } = useSuppliers();
    const { createMut, updateMut, deleteMut } = useProductMutations();

    // Permisos Granulares Ortogonales (Dynamic RBAC)
    const canView = useHasPermission('inventory:view');
    const canCreate = useHasPermission('inventory:create');
    const canEdit = useHasPermission('inventory:edit');
    const canAdjustStock = useHasPermission('inventory:adjust_stock');
    const canViewKardex = useHasPermission('inventory:kardex');
    const canDelete = useHasPermission('inventory:delete');
    const canExport = useHasPermission('inventory:export');

    // 2. FILTERS & SEARCH
    const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState('');
    const [filterCriticalOnly, setFilterCriticalOnly] = useState(() => searchParams.get('filter') === 'critical');
    const [filterExpiringOnly, setFilterExpiringOnly] = useState(() => searchParams.get('filter') === 'expiring');

    // Sincronizar parámetro search y filter si cambia la URL
    useEffect(() => {
        const query = searchParams.get('search');
        if (query !== null) {
            setSearchTerm(query);
        }
        const filter = searchParams.get('filter');
        if (filter === 'critical') setFilterCriticalOnly(true);
        if (filter === 'expiring') setFilterExpiringOnly(true);
    }, [searchParams]);

    // Paginación
    const [pageSize, setPageSize] = useState<number>(10);
    const [currentPage, setCurrentPage] = useState<number>(1);

    // Modales
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any | null>(null);
    const [quickStockModalProd, setQuickStockModalProd] = useState<any | null>(null);
    const [quickStockAdd, setQuickStockAdd] = useState<string>('10');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [kardexModalProd, setKardexModalProd] = useState<any | null>(null);

    // Campos del formulario (Esquema Limpio)
    const [sku, setSku] = useState('');
    const [name, setName] = useState('');
    const [activeSubstance, setActiveSubstance] = useState('');
    const [description, setDescription] = useState('');
    const [pharmaceuticalForm, setPharmaceuticalForm] = useState('Comprimido');
    const [priceBs, setPriceBs] = useState('');
    const [boxPriceBs, setBoxPriceBs] = useState('');
    const [costBs, setCostBs] = useState('');
    const [stock, setStock] = useState('0');
    const [categoryId, setCategoryId] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [expirationDate, setExpirationDate] = useState('');
    const [lotNumber, setLotNumber] = useState('');
    const [batches, setBatches] = useState<BatchInput[]>([]);
    const [minStock, setMinStock] = useState('3');
    const [isPriority, setIsPriority] = useState(false);
    const [requiresPrescription, setRequiresPrescription] = useState(false);

    // Métodos para control dinámico de lotes
    const handleAddBatch = () => {
        setBatches(prev => [
            ...prev,
            {
                lot_number: '',
                expiration_date: '',
                stock: 0,
            }
        ]);
    };

    const handleRemoveBatch = (index: number) => {
        setBatches(prev => prev.filter((_, i) => i !== index));
        toast.info('Lote retirado del formulario');
    };

    const handleBatchChange = (index: number, field: keyof BatchInput, value: any) => {
        setBatches(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    // Suma en tiempo real del stock de todos los lotes
    const totalBatchesStock = useMemo(() => {
        return batches.reduce((acc, b) => acc + (Math.max(0, parseInt(b.stock as any, 10) || 0)), 0);
    }, [batches]);

    // Identificación automática del vencimiento más próximo (FEFO)
    const earliestBatchExp = useMemo(() => {
        const valid = batches
            .map(b => b.expiration_date)
            .filter((d): d is string => !!d && d.trim() !== '')
            .sort();
        return valid.length > 0 ? valid[0] : '';
    }, [batches]);

    // Generador aleatorio de SKU amigable para farmacia
    const generateAutoSku = () => {
        const prefixes = ['MED', 'ATB', 'ALG', 'DER', 'VIT', 'RES'];
        const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        setSku(`${randomPrefix}-${randomNum}`);
    };

    // Cálculo dinámico de margen comercial en tiempo real
    const calculatedMargin = useMemo(() => {
        const cost = parseFloat(costBs);
        const sale = parseFloat(priceBs);
        if (!isNaN(cost) && !isNaN(sale) && cost >= 0 && sale > 0) {
            const profit = sale - cost;
            const pct = ((profit / sale) * 100).toFixed(1);
            return { profit, pct, isPositive: profit >= 0 };
        }
        return null;
    }, [costBs, priceBs]);

    // Atajos de teclado: Ctrl+K / Cmd+K y ESC
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                const searchEl = document.getElementById('inventorySearchInput');
                if (searchEl) searchEl.focus();
            }
            if (e.key === 'Escape') {
                if (isFormModalOpen) setIsFormModalOpen(false);
                else if (kardexModalProd) setKardexModalProd(null);
                else if (quickStockModalProd) setQuickStockModalProd(null);
                else if (isImportModalOpen) setIsImportModalOpen(false);
                else setSearchTerm('');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFormModalOpen, kardexModalProd, quickStockModalProd, isImportModalOpen]);

    // Refrescar catálogos de categorías y proveedores al abrir el modal para garantizar datos frescos
    useEffect(() => {
        if (isFormModalOpen) {
            refetchCategories();
            refetchSuppliers();
        }
    }, [isFormModalOpen, refetchCategories, refetchSuppliers]);

    // 3. KPI CALCULATIONS & METRICS
    const metrics = useMemo(() => {
        const totalCount = products.length;
        const withStock = products.filter(p => p.stock > 0).length;
        const stockPct = totalCount > 0 ? Math.round((withStock / totalCount) * 100) : 0;

        const totalCostCents = products.reduce((acc, p) => acc + (p.cost_cents * p.stock), 0);
        const totalPvpCents = products.reduce((acc, p) => acc + (p.price_cents * p.stock), 0);
        const avgMargin = totalPvpCents > 0
            ? (((totalPvpCents - totalCostCents) / totalPvpCents) * 100).toFixed(1)
            : '0.0';

        const now = new Date();
        const thirtyDaysAhead = new Date();
        thirtyDaysAhead.setDate(now.getDate() + 30);

        const expiringItems = products.filter(p => isProductExpiring(p));

        expiringItems.sort((a, b) => {
            const dateA = a.expiration_date ? new Date(a.expiration_date).getTime() : Infinity;
            const dateB = b.expiration_date ? new Date(b.expiration_date).getTime() : Infinity;
            return dateA - dateB;
        });
        const nearestExpiring = expiringItems[0] || null;
        let nearestDays: number | null = null;
        if (nearestExpiring?.expiration_date) {
            const diffMs = new Date(nearestExpiring.expiration_date).getTime() - now.getTime();
            nearestDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }

        const criticalItems = products.filter(p => p.stock <= (p.min_stock ?? 3));
        const zeroStockCount = products.filter(p => p.stock === 0).length;
        const lowStockCount = criticalItems.length - zeroStockCount;

        return {
            totalCount,
            withStock,
            stockPct,
            totalCostCents,
            totalPvpCents,
            avgMargin,
            expiringCount: expiringItems.length,
            nearestExpiring,
            nearestDays,
            criticalCount: criticalItems.length,
            zeroStockCount,
            lowStockCount,
        };
    }, [products]);

    // 4. FILTERED DATA
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            if (filterCriticalOnly && p.stock > (p.min_stock ?? 3)) return false;
            if (filterExpiringOnly && !isProductExpiring(p)) return false;
            if (selectedCategory && p.category_id !== selectedCategory) return false;
            if (selectedSupplier && p.supplier_id !== selectedSupplier) return false;
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                const matchName = p.name.toLowerCase().includes(term);
                const matchSubstance = p.active_substance ? p.active_substance.toLowerCase().includes(term) : false;
                const matchForm = p.pharmaceutical_form ? p.pharmaceutical_form.toLowerCase().includes(term) : false;
                const matchSku = p.sku ? p.sku.toLowerCase().includes(term) : false;
                const matchDesc = p.description ? p.description.toLowerCase().includes(term) : false;
                const matchCat = p.categories?.name ? p.categories.name.toLowerCase().includes(term) : false;
                const matchSup = p.suppliers?.name ? p.suppliers.name.toLowerCase().includes(term) : false;
                if (!matchName && !matchSubstance && !matchForm && !matchSku && !matchDesc && !matchCat && !matchSup) return false;
            }
            return true;
        });
    }, [products, searchTerm, selectedCategory, selectedSupplier, filterCriticalOnly, filterExpiringOnly]);

    // Resetear a pág 1 cuando cambien filtros
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedCategory, selectedSupplier, filterCriticalOnly, filterExpiringOnly, pageSize]);

    // Paginación
    const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredProducts.slice(start, start + pageSize);
    }, [filteredProducts, currentPage, pageSize]);

    const openCreateModal = () => {
        if (!canCreate) return;
        setDescription(''); setPriceBs(''); setBoxPriceBs(''); setCostBs('');
        setStock(''); setCategoryId(''); setSupplierId(''); setExpirationDate(''); setLotNumber('');
        setBatches([{
            lot_number: '',
            expiration_date: '',
            stock: '' as any,
        }]);
        setMinStock('3'); setIsPriority(false); setRequiresPrescription(false);
        setIsFormModalOpen(true);
    };

    const openEditModal = (prod: any) => {
        if (!canEdit) return;
        setEditingProduct(prod);
        setSku(prod.sku || '');
        setName(prod.name);
        setActiveSubstance(prod.active_substance || '');
        setDescription(prod.description || '');
        setPriceBs((prod.price_cents / 100).toFixed(2));
        setBoxPriceBs(prod.box_price_cents && prod.box_price_cents > 0 ? (prod.box_price_cents / 100).toFixed(2) : '');
        setCostBs((prod.cost_cents / 100).toFixed(2));
        setStock(prod.stock.toString());
        setCategoryId(prod.category_id || '');
        setSupplierId(prod.supplier_id || '');
        setExpirationDate(prod.expiration_date || '');

        // Cargar lotes reales desde product_batches
        const loadedBatches: BatchInput[] = (prod.product_batches || []).map((b: any) => ({
            id: b.id,
            lot_number: b.lot_number || '',
            expiration_date: b.expiration_date || '',
            stock: b.stock ?? 0,
        }));

        if (loadedBatches.length > 0) {
            setBatches(loadedBatches);
        } else {
            setBatches([{
                lot_number: 'LOTE-1',
                expiration_date: prod.expiration_date || '',
                stock: prod.stock || 0,
            }]);
        }

        const currentLot = prod.product_batches?.[0]?.lot_number || '';
        setLotNumber(currentLot);
        setMinStock(prod.min_stock?.toString() || '3');
        setIsPriority(Boolean(prod.is_priority));
        setRequiresPrescription(Boolean(prod.requires_prescription));
        setIsFormModalOpen(true);
    };

    // Toggle rápido de Favorito / Prioridad en POS con 1 solo clic en la tabla
    const handleTogglePriority = (prod: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canEdit) return;
        updateMut.mutate({ id: prod.id, is_priority: !prod.is_priority });
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingProduct ? !canEdit : !canCreate) return;
        if (!priceBs || !costBs) {
            toast.warning('El precio de venta y el costo son obligatorios', 'Campos incompletos');
            return;
        }

        const price_cents = Math.round(parseFloat(priceBs) * 100);
        const box_price_cents = boxPriceBs && parseFloat(boxPriceBs) > 0 ? Math.round(parseFloat(boxPriceBs) * 100) : 0;
        const cost_cents = Math.round(parseFloat(costBs) * 100);

        // Validar que los IDs realmente existan en los catálogos para evitar violaciones de clave foránea
        const validCategoryId = (categoryId && categories.some(c => c.id === categoryId)) ? categoryId : null;
        const validSupplierId = (supplierId && suppliers.some(s => s.id === supplierId)) ? supplierId : null;

        // Calcular stock y vencimiento derivados de los lotes activos
        const finalStock = batches.length > 0 ? totalBatchesStock : (parseInt(stock, 10) || 0);
        const finalExp = earliestBatchExp || expirationDate || null;

        const payload: any = {
            sku: sku.trim() || null,
            name: name.trim(),
            active_substance: activeSubstance.trim() || null,
            pharmaceutical_form: pharmaceuticalForm || null,
            description: description.trim() || null,
            price_cents,
            box_price_cents,
            cost_cents,
            stock: finalStock,
            min_stock: parseInt(minStock, 10) || 3,
            is_priority: isPriority,
            requires_prescription: requiresPrescription,
            category_id: validCategoryId,
            supplier_id: validSupplierId,
            expiration_date: finalExp,
            batches: batches.length > 0 ? batches : undefined,
            initial_lot_number: lotNumber.trim() || undefined,
        };

        if (editingProduct) {
            updateMut.mutate({ id: editingProduct.id, ...payload, lot_number: lotNumber.trim() }, {
                onSuccess: () => {
                    setIsFormModalOpen(false);
                    toast.success(`Ficha técnica de "${name}" actualizada correctamente`, 'Medicamento Actualizado');
                },
                onError: (err: any) => toast.error(err.message, 'Error al actualizar')
            });
        } else {
            createMut.mutate(payload, {
                onSuccess: () => {
                    setIsFormModalOpen(false);
                    toast.success(`"${name}" añadido al catálogo con stock inicial de ${finalStock} uds`, 'Medicamento Creado');
                },
                onError: (err: any) => toast.error(err.message, 'Error al crear medicamento')
            });
        }
    };

    const handleDeleteProduct = async (prod: any) => {
        if (!canDelete) return;
        const confirmed = await confirmDialog({
            title: '¿Eliminar Medicamento?',
            message: `Esta acción dará de baja definitivamente "${prod.name}" del catálogo de la farmacia. ¿Deseas continuar?`,
            confirmText: 'Sí, eliminar',
            cancelText: 'Cancelar',
            type: 'danger',
        });
        if (confirmed) {
            deleteMut.mutate(prod.id, {
                onSuccess: () => toast.success(`"${prod.name}" fue eliminado del catálogo`),
                onError: (err: any) => toast.error(err.message, 'No se pudo eliminar')
            });
        }
    };

    // Quick stock adjustment (+ unidades)
    const handleSaveQuickStock = () => {
        if (!canAdjustStock || !quickStockModalProd) return;
        const addNum = parseInt(quickStockAdd, 10);
        if (isNaN(addNum) || addNum <= 0) {
            toast.warning('Ingrese una cantidad válida mayor a cero');
            return;
        }
        const newStock = quickStockModalProd.stock + addNum;
        updateMut.mutate(
            { id: quickStockModalProd.id, stock: newStock },
            {
                onSuccess: () => {
                    setQuickStockModalProd(null);
                    toast.success(`Se añadieron +${addNum} uds al stock de "${quickStockModalProd.name}"`, 'Stock Actualizado');
                },
                onError: (err: any) => toast.error(err.message, 'Error al ajustar stock')
            }
        );
    };

    // Exportación CSV
    const handleExportCsv = () => {
        const rows = filteredProducts.map(p => {
            const cost = (p.cost_cents / 100).toFixed(2);
            const price = (p.price_cents / 100).toFixed(2);
            const boxPrice = p.box_price_cents && p.box_price_cents > 0 ? (p.box_price_cents / 100).toFixed(2) : '0.00';
            const margin = p.price_cents > 0
                ? (((p.price_cents - p.cost_cents) / p.price_cents) * 100).toFixed(1) + '%'
                : '0%';
            return [
                p.sku || '',
                p.name,
                p.categories?.name || 'Sin categoría',
                p.suppliers?.name || 'Sin proveedor',
                p.stock,
                p.min_stock ?? 3,
                cost,
                price,
                boxPrice,
                margin,
                p.expiration_date || 'Sin fecha'
            ];
        });

        exportToCsv({
            filename: `Inventario_Farmacia_${new Date().toISOString().slice(0, 10)}.csv`,
            headers: [
                'SKU', 'Medicamento / Descripción', 'Categoría', 'Proveedor',
                'Stock Actual', 'Stock Mínimo', 'Costo Bs', 'Precio Venta Unitario Bs', 'Precio Caja Bs', 'Margen %', 'Vencimiento'
            ],
            rows
        });
    };

    // Helper: Icono por categoría
    const getProductIcon = (catName?: string | null) => {
        const c = (catName || '').toLowerCase();
        if (c.includes('antibio')) return 'medication';
        if (c.includes('analge') || c.includes('dolor')) return 'pill';
        if (c.includes('cardio') || c.includes('hiperten')) return 'cardiology';
        if (c.includes('inyect') || c.includes('vacun')) return 'vaccines';
        if (c.includes('gastro')) return 'science';
        if (c.includes('diabet')) return 'monitor_heart';
        return 'medication';
    };

    if (!canView) {
        return (
            <div className="p-12 max-w-xl mx-auto my-12 text-center bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm flex flex-col items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-error">lock</span>
                <h2 className="text-lg font-bold text-on-surface">Acceso Restringido al Inventario</h2>
                <p className="text-xs text-secondary">
                    Tu rol actual no tiene asignado el permiso <span className="font-mono font-bold text-on-surface">inventory:view</span> para consultar el catálogo de medicamentos.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full gap-6 p-3 sm:p-6 max-w-[1600px] mx-auto">
            {/* 1. TOP BANNER / KPI METRIC CARDS STRIP */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-1.5 text-primary font-semibold text-xs tracking-wide uppercase mb-1">
                            <span className="material-symbols-outlined text-[16px]">inventory</span>
                            <span>Módulo Central de Dispensación &amp; Logística</span>
                        </div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-on-surface tracking-tight">
                            Catálogo de Inventario &amp; Medicamentos
                        </h1>
                        <p className="text-sm text-secondary mt-0.5">
                            Gestión de existencias, precios de costo, lotes y vencimientos ({metrics.totalCount.toLocaleString()} ítems registrados)
                        </p>
                    </div>

                    {/* Quick Action Shortcuts */}
                    <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                        {canExport && (
                            <button
                                type="button"
                                onClick={handleExportCsv}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold text-sm transition-colors border border-surface-container shadow-sm cursor-pointer"
                                title="Exportar inventario actual a formato Excel / CSV"
                            >
                                <span className="material-symbols-outlined text-[18px] text-secondary">file_download</span>
                                <span>Exportar Lotes</span>
                            </button>
                        )}
                        {canCreate && (
                            <button
                                type="button"
                                onClick={() => setIsImportModalOpen(true)}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold text-sm transition-colors border border-surface-container shadow-sm cursor-pointer"
                                title="Importar catálogo masivo desde archivo CSV"
                            >
                                <span className="material-symbols-outlined text-[18px] text-secondary">upload_file</span>
                                <span>Importar CSV</span>
                            </button>
                        )}
                        {canCreate ? (
                            <button
                                id="btnOpenNewProduct"
                                type="button"
                                onClick={openCreateModal}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-semibold text-sm transition-all shadow-sm active:scale-95 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                <span>Agregar Producto</span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-secondary text-xs font-semibold">
                                <span className="material-symbols-outlined text-[16px] text-primary">visibility</span>
                                <span>Consulta (Solo Lectura)</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bento-style Metric Cards Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Total SKUs */}
                    <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden group">
                        <div className="flex items-center justify-between">
                            <span className="text-xs uppercase font-bold text-secondary tracking-wider">Total SKUs Activos</span>
                            <span className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
                                <span className="material-symbols-outlined text-[18px]">medical_services</span>
                            </span>
                        </div>
                        <div className="mt-3 flex items-baseline justify-between">
                            <span className="font-mono text-2xl font-bold text-on-surface">{metrics.totalCount}</span>
                            <span className="flex items-center text-xs font-semibold text-primary">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span> {metrics.stockPct}% con stock
                            </span>
                        </div>
                        <div className="mt-2 w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                            <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${metrics.stockPct}%` }}></div>
                        </div>
                    </div>

                    {/* Card 2: Valor del Inventario */}
                    <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <span className="text-xs uppercase font-bold text-secondary tracking-wider">Valor del Inventario (Costo)</span>
                            <span className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
                                <span className="material-symbols-outlined text-[18px]">payments</span>
                            </span>
                        </div>
                        <div className="mt-3 flex items-baseline justify-between">
                            <span className="font-mono text-2xl font-bold text-on-surface">
                                Bs {(metrics.totalCostCents / 100).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="font-mono text-xs text-secondary">
                                PVP est. Bs {(metrics.totalPvpCents / 100).toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-secondary">
                            <span>Margen Promedio</span>
                            <span className="font-mono text-primary font-bold">{metrics.avgMargin}%</span>
                        </div>
                    </div>

                    {/* Card 3: Alertas Caducidad FEFO */}
                    <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden border-l-4 border-error">
                        <div className="flex items-center justify-between">
                            <span className="text-xs uppercase font-bold text-secondary tracking-wider">Alerta Caducidad (&lt;30 días)</span>
                            <span className="w-8 h-8 rounded-lg bg-error-container flex items-center justify-center text-error">
                                <span className="material-symbols-outlined text-[18px]">event_busy</span>
                            </span>
                        </div>
                        <div className="mt-3 flex items-baseline justify-between">
                            <span className="font-mono text-2xl font-bold text-error">{metrics.expiringCount}</span>
                            {metrics.expiringCount > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setFilterExpiringOnly(!filterExpiringOnly)}
                                    className="text-xs font-semibold text-error hover:underline flex items-center gap-0.5"
                                >
                                    <span>{filterExpiringOnly ? 'Ver Todos' : 'Ver Vencimientos'}</span>
                                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                </button>
                            ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded bg-primary-fixed/40 text-primary text-[11px] font-bold">
                                    Todo Vigente
                                </span>
                            )}
                        </div>
                        <p className="mt-2 text-xs text-secondary truncate">
                            {metrics.nearestExpiring
                                ? `Próximo: ${metrics.nearestExpiring.name} (${metrics.nearestDays !== null ? (metrics.nearestDays < 0 ? 'Vencido' : `${metrics.nearestDays} días`) : ''})`
                                : 'No hay medicamentos próximos a caducar'}
                        </p>
                    </div>

                    {/* Card 4: Stock Crítico */}
                    <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container flex flex-col justify-between relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <span className="text-xs uppercase font-bold text-secondary tracking-wider">Bajo Quiebre de Stock</span>
                            <span className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                                <span className="material-symbols-outlined text-[18px]">warning</span>
                            </span>
                        </div>
                        <div className="mt-3 flex items-baseline justify-between">
                            <span className="font-mono text-2xl font-bold text-on-surface">{metrics.criticalCount}</span>
                            <button
                                type="button"
                                onClick={() => setFilterCriticalOnly(!filterCriticalOnly)}
                                className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5"
                            >
                                <span>{filterCriticalOnly ? 'Ver Todos' : 'Ver Críticos'}</span>
                                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                            </button>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-secondary">
                            <span className="w-2 h-2 rounded-full bg-error"></span> {metrics.zeroStockCount} en nivel cero
                            <span className="mx-1">•</span>
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span> {metrics.lowStockCount} bajo mínimo
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. MAIN MANAGEMENT PANEL */}
            <div className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container-high overflow-hidden">
                {/* Controls & Filters Toolbar */}
                <div className="p-4 bg-surface-container-lowest flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-surface-container">
                    {/* Search Input Container */}
                    <div className="flex-1 max-w-2xl relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
                        <input
                            id="inventorySearchInput"
                            type="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por Nombre, Principio Activo, Código de Barras o SKU (Ctrl + K)..."
                            className="w-full pl-10 pr-24 py-2 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-mono text-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container transition-all"
                        />
                        {searchTerm ? (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-secondary hover:text-on-surface bg-surface-container px-1.5 py-0.5 rounded cursor-pointer"
                            >
                                ESC limpiar
                            </button>
                        ) : (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-secondary bg-surface-container px-1.5 py-0.5 rounded pointer-events-none">
                                Ctrl + K
                            </span>
                        )}
                    </div>

                    {/* Filter Controls Group */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Category Filter */}
                        <div className="relative">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="appearance-none bg-surface-container-low text-on-surface text-xs pl-3 pr-8 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container cursor-pointer font-medium"
                            >
                                <option value="">Todas las categorías ({categories.length})</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">expand_more</span>
                        </div>

                        {/* Supplier Filter */}
                        <div className="relative">
                            <select
                                value={selectedSupplier}
                                onChange={(e) => setSelectedSupplier(e.target.value)}
                                className="appearance-none bg-surface-container-low text-on-surface text-xs pl-3 pr-8 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container cursor-pointer font-medium"
                            >
                                <option value="">Todos los Proveedores ({suppliers.length})</option>
                                {suppliers.map(sup => (
                                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                                ))}
                            </select>
                            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">expand_more</span>
                        </div>

                        {/* Stock Alert Pill Toggle */}
                        <button
                            type="button"
                            onClick={() => setFilterCriticalOnly(!filterCriticalOnly)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                                filterCriticalOnly
                                    ? 'bg-error text-on-error border-error shadow-sm'
                                    : 'bg-error-container text-error hover:bg-error/20 border-error/20'
                            }`}
                            title="Filtrar por productos con existencias en nivel de alerta crítica o quiebre"
                        >
                            <span className="material-symbols-outlined text-[16px]">crisis_alert</span>
                            <span>Ver Stock Crítico</span>
                            <span className={`w-5 h-5 rounded-full font-mono text-[10px] flex items-center justify-center font-bold ${
                                filterCriticalOnly ? 'bg-white text-error' : 'bg-error text-on-error'
                            }`}>
                                {metrics.criticalCount}
                            </span>
                        </button>

                        {/* Expiration Alert Pill Toggle */}
                        <button
                            type="button"
                            onClick={() => setFilterExpiringOnly(!filterExpiringOnly)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                                filterExpiringOnly
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                    : 'bg-amber-100 text-amber-900 hover:bg-amber-200/80 border-amber-300'
                            }`}
                            title="Filtrar por productos vencidos o próximos a vencer (<30 días)"
                        >
                            <span className="material-symbols-outlined text-[16px]">event_busy</span>
                            <span>Próximos a Vencer</span>
                            <span className={`w-5 h-5 rounded-full font-mono text-[10px] flex items-center justify-center font-bold ${
                                filterExpiringOnly ? 'bg-white text-amber-900' : 'bg-amber-600 text-white'
                            }`}>
                                {metrics.expiringCount}
                            </span>
                        </button>

                        {/* Reset Filters Button if any active */}
                        {(searchTerm || selectedCategory || selectedSupplier || filterCriticalOnly || filterExpiringOnly) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchTerm('');
                                    setSelectedCategory('');
                                    setSelectedSupplier('');
                                    setFilterCriticalOnly(false);
                                    setFilterExpiringOnly(false);
                                }}
                                className="p-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary hover:text-on-surface transition-colors"
                                title="Limpiar todos los filtros"
                            >
                                <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Data Table Container */}
                <div className="w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-surface-container-low text-secondary font-bold text-[11px] tracking-wider uppercase select-none border-b border-surface-container">
                                <th className="py-3 px-3">SKU</th>
                                <th className="py-3 px-4 min-w-[280px]">Nombre del Medicamento &amp; Detalle</th>
                                <th className="py-3 px-3">Categoría</th>
                                <th className="py-3 px-3">Proveedor Principal</th>
                                <th className="py-3 px-4">Nivel Stock &amp; Existencias</th>
                                <th className="py-3 px-3 text-right">Costo Neto</th>
                                <th className="py-3 px-3 text-right">PVP Farmacia</th>
                                <th className="py-3 px-3 text-center">Margen</th>
                                <th className="py-3 px-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container text-sm text-on-surface">
                            {loadingProducts ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-secondary">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="material-symbols-outlined text-primary text-[32px] animate-spin">progress_activity</span>
                                            <span>Cargando catálogo clínico de medicamentos...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-secondary">
                                        <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
                                            <span className="material-symbols-outlined text-[40px] text-outline">search_off</span>
                                            <p className="font-semibold text-on-surface">No se encontraron medicamentos</p>
                                            <p className="text-xs text-secondary">
                                                Intente modificar los términos de búsqueda o verifique los filtros seleccionados.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedProducts.map(prod => {
                                    const costBsNum = prod.cost_cents / 100;
                                    const priceBsNum = prod.price_cents / 100;
                                    const marginPct = priceBsNum > 0
                                        ? (((priceBsNum - costBsNum) / priceBsNum) * 100).toFixed(1)
                                        : '0.0';

                                    // FEFO logic
                                    let expBadge = null;
                                    if (prod.expiration_date) {
                                        const expDate = new Date(prod.expiration_date);
                                        const now = new Date();
                                        const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                        if (diffDays < 0) {
                                            expBadge = <span className="text-[11px] font-bold text-error bg-error-container px-1.5 py-0.5 rounded">Vencido</span>;
                                        } else if (diffDays <= 30) {
                                            expBadge = <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">Exp. en {diffDays}d</span>;
                                        } else {
                                            expBadge = <span className="text-[11px] text-secondary font-mono">Exp. {prod.expiration_date}</span>;
                                        }
                                    }

                                    const isCritical = prod.stock <= (prod.min_stock ?? 3);
                                    const isZero = prod.stock === 0;

                                    return (
                                        <tr key={prod.id} className="hover:bg-surface-bright transition-colors group">
                                            {/* SKU & Lote */}
                                            <td className="py-3.5 px-3">
                                                <span className="font-mono text-xs font-bold text-primary">
                                                    {prod.sku || 'S/SKU'}
                                                </span>
                                                {prod.product_batches && prod.product_batches.length > 1 ? (
                                                    <div className="font-mono text-[10px] text-primary font-semibold flex items-center gap-1 mt-0.5" title={prod.product_batches.map((b: any) => `${b.lot_number}: ${b.stock} uds`).join(' | ')}>
                                                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[13px]">layers</span>
                                                            <span>{prod.product_batches.length} Lotes activos</span>
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="font-mono text-[10px] text-secondary truncate max-w-[130px]" title={prod.product_batches?.[0]?.lot_number ? `Lote: ${prod.product_batches[0].lot_number}` : (prod.description || 'Sin lote')}>
                                                        {prod.product_batches?.[0]?.lot_number ? `Lote: ${prod.product_batches[0].lot_number}` : (prod.description || 'Lote Estándar')}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Medicamento & Detalle */}
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary flex-shrink-0">
                                                        <span className="material-symbols-outlined text-[20px]">
                                                            {getProductIcon(prod.categories?.name)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-sm text-on-surface group-hover:text-primary transition-colors flex items-center gap-1.5 flex-wrap">
                                                            <span>{prod.name}</span>
                                                            {prod.is_priority && (
                                                                <span className="material-symbols-outlined text-amber-500 text-[16px]" title="Medicamento Favorito / Acceso Rápido en POS">
                                                                    star
                                                                </span>
                                                            )}
                                                            {prod.requires_prescription && (
                                                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-error-container text-error" title="Requiere Prescripción Médica (Rx)">
                                                                    Rx
                                                                </span>
                                                            )}
                                                        </div>
                                                        {prod.active_substance && (
                                                            <div className="text-xs text-primary/80 font-medium truncate max-w-[280px]">
                                                                {prod.active_substance}
                                                            </div>
                                                        )}
                                                        <div className="text-xs text-secondary flex items-center gap-2 mt-0.5 flex-wrap">
                                                            {prod.pharmaceutical_form && (
                                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-mono text-[10px]">
                                                                    {prod.pharmaceutical_form}
                                                                </span>
                                                            )}
                                                            {expBadge}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Categoría */}
                                            <td className="py-3.5 px-3">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container text-on-surface-variant truncate max-w-[130px]">
                                                    {prod.categories?.name || 'Venta Libre'}
                                                </span>
                                            </td>

                                            {/* Proveedor */}
                                            <td className="py-3.5 px-3">
                                                <span className="text-xs font-medium text-on-surface block truncate max-w-[140px]">
                                                    {prod.suppliers?.name || 'Distribuidor Local'}
                                                </span>
                                                <span className="text-[10px] text-secondary">Entrega Regular</span>
                                            </td>

                                            {/* Stock Status */}
                                            <td className="py-3.5 px-4">
                                                <div className="flex flex-col gap-0.5">
                                                    {isZero ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-error-container text-error w-fit">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                                                            Agotado: 0 uds
                                                        </span>
                                                    ) : isCritical ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-error-container text-error w-fit">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                                                            Bajo: {prod.stock} uds
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-primary-fixed/40 text-on-primary-fixed-variant w-fit">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                                            Óptimo: {prod.stock} uds
                                                        </span>
                                                    )}
                                                    {prod.product_batches && prod.product_batches.length > 1 ? (
                                                        <div className="flex flex-wrap items-center gap-1 max-w-[210px]" title="Distribución por lotes">
                                                            {prod.product_batches.map((b: any) => (
                                                                <span key={b.id} className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-surface-container border border-surface-container-high text-on-surface">
                                                                    {b.lot_number}: <strong className="text-primary">{b.stock}</strong>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="font-mono text-[10px] text-secondary">
                                                            Mínimo sugerido: {prod.min_stock ?? 3} uds
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Costo Neto */}
                                            <td className="py-3.5 px-3 text-right">
                                                <span className="font-mono text-xs text-secondary font-medium">
                                                    Bs {costBsNum.toFixed(2)}
                                                </span>
                                            </td>

                                            {/* PVP Farmacia */}
                                            <td className="py-3.5 px-3 text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="font-mono text-sm font-bold text-on-surface">
                                                        Bs {priceBsNum.toFixed(2)}
                                                    </span>
                                                    {prod.box_price_cents && prod.box_price_cents > 0 ? (
                                                        <span className="font-mono text-[11px] text-primary font-medium flex items-center gap-0.5" title="Precio referencial por caja">
                                                            Caja: Bs {(prod.box_price_cents / 100).toFixed(2)}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>

                                            {/* Margen */}
                                            <td className="py-3.5 px-3 text-center">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-bold text-primary bg-primary-fixed/40">
                                                    {marginPct}%
                                                </span>
                                            </td>

                                            {/* Acciones Granulares Ortogonales */}
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100">
                                                    {canEdit && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleTogglePriority(prod, e)}
                                                            className={`p-1 rounded hover:bg-surface-container transition-colors cursor-pointer ${prod.is_priority ? 'text-amber-500' : 'text-outline hover:text-amber-500'}`}
                                                            title={prod.is_priority ? "Quitar de Favoritos POS" : "Marcar como Favorito / Acceso Rápido en POS"}
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">
                                                                {prod.is_priority ? 'star' : 'star_border'}
                                                            </span>
                                                        </button>
                                                    )}
                                                    {/* Botón Ver Kardex y Auditoría de Fechas */}
                                                    {canViewKardex && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setKardexModalProd(prod)}
                                                            className="p-1 rounded hover:bg-surface-container text-secondary hover:text-primary transition-colors cursor-pointer"
                                                            title="Ver Kardex y Auditoría de Movimientos / Fechas"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">history</span>
                                                        </button>
                                                    )}
                                                    {canAdjustStock && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setQuickStockModalProd(prod)}
                                                            className="p-1 rounded hover:bg-surface-container text-primary hover:text-primary-container transition-colors cursor-pointer"
                                                            title="Reabastecer existencias rápidamente (+ unidades)"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">add_box</span>
                                                        </button>
                                                    )}
                                                    {canEdit ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditModal(prod)}
                                                            className="p-1 rounded hover:bg-surface-container text-secondary hover:text-on-surface transition-colors cursor-pointer"
                                                            title="Editar ficha técnica del medicamento"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-secondary font-mono px-2 select-none">Lectura</span>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteProduct(prod)}
                                                            className="p-1 rounded hover:bg-error-container text-secondary hover:text-error transition-colors cursor-pointer"
                                                            title="Eliminar medicamento"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Table Pagination & Counter Bar */}
                <div className="p-4 bg-surface-container-lowest flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-surface-container">
                    <div className="flex items-center gap-3 text-xs text-secondary flex-wrap">
                        <span>
                            Mostrando <span className="font-mono font-bold text-on-surface">
                                {filteredProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} a {Math.min(currentPage * pageSize, filteredProducts.length)}
                            </span> de <span className="font-mono font-bold text-on-surface">{filteredProducts.length}</span> medicamentos
                        </span>
                        <div className="hidden sm:inline-block w-1 h-1 rounded-full bg-secondary"></div>
                        <div className="flex items-center gap-1.5">
                            <span>Mostrar por página:</span>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="bg-surface-container-low text-on-surface text-xs py-1 px-2 rounded focus:outline-none focus:ring-1 focus:ring-primary border border-surface-container cursor-pointer font-medium"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    </div>

                    {/* Pagination Controls */}
                    <div className="flex items-center gap-1 self-center sm:self-auto">
                        <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold hover:bg-surface-container transition-colors border border-surface-container"
                        >
                            <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                            <span>Anterior</span>
                        </button>

                        <div className="flex items-center gap-1 px-2 font-mono text-xs font-bold text-on-surface">
                            <span>Página {currentPage} de {totalPages}</span>
                        </div>

                        <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold hover:bg-surface-container transition-colors border border-surface-container"
                        >
                            <span>Siguiente</span>
                            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 3. MODAL: REGISTRAR / EDITAR MEDICAMENTO (High Fidelity matching HTML Mockup) */}
            {isFormModalOpen && (editingProduct ? canEdit : canCreate) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/65 backdrop-blur-sm animate-fadeIn">
                    <div className="relative w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] border border-surface-container-high">
                        {/* Modal Header */}
                        <div className="bg-surface-container-lowest px-6 pt-5 pb-4 flex items-start justify-between">
                            <div className="flex items-start gap-3.5">
                                <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0 text-primary">
                                    <span className="material-symbols-outlined text-[24px]">medication_liquid</span>
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <h2 className="font-semibold text-lg text-on-surface tracking-tight">
                                            {editingProduct ? 'Editar Ficha de Medicamento' : 'Crear Nuevo Medicamento / Producto'}
                                        </h2>
                                        <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant text-[11px] font-bold tracking-wide uppercase">
                                            {editingProduct ? 'Modo Edición' : 'Nuevo SKU'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-secondary mt-0.5">
                                        Complete la información farmacológica y comercial para el catálogo institucional
                                    </p>
                                </div>
                            </div>
                            <button
                                aria-label="Cerrar modal"
                                onClick={() => setIsFormModalOpen(false)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
                                type="button"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        {/* Accent Separator */}
                        <div className="h-[1px] w-full bg-surface-container"></div>

                        {/* Modal Body (Scrollable form) */}
                        <form onSubmit={handleFormSubmit} className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
                            {/* Row 1: Nombre & SKU */}
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                                <div className="sm:col-span-7 flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-on-surface flex items-center justify-between">
                                        <span>Nombre Comercial del Producto <span className="text-error">*</span></span>
                                        <span className="text-[11px] text-secondary font-normal">DCI + Concentración</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="ej. Amoxicilina 500mg cápsulas"
                                        className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface placeholder:text-outline text-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary transition-all border border-surface-container"
                                        required
                                    />
                                </div>
                                <div className="sm:col-span-5 flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-on-surface">
                                        Código SKU / Barras
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="text"
                                            value={sku}
                                            onChange={(e) => setSku(e.target.value)}
                                            placeholder="ej. MED-9024"
                                            className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-mono text-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary uppercase tracking-wide border border-surface-container"
                                        />
                                        <button
                                            type="button"
                                            onClick={generateAutoSku}
                                            title="Generar código aleatorio de farmacia"
                                            className="h-[38px] px-2.5 rounded bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1 text-xs font-bold text-secondary hover:text-on-surface border border-surface-container"
                                        >
                                            <span className="material-symbols-outlined text-[16px] text-primary">autorenew</span>
                                            <span>Auto</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Principio Activo (Genérico) & Forma Farmacéutica */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-on-surface flex items-center justify-between">
                                        <span>Principio Activo (Genérico)</span>
                                        <span className="text-[11px] text-primary font-medium">Búsqueda POS</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={activeSubstance}
                                        onChange={(e) => setActiveSubstance(e.target.value)}
                                        placeholder="ej. Paracetamol 500mg, Ibuprofeno..."
                                        className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface placeholder:text-outline text-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary transition-all border border-surface-container"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-on-surface">
                                        Forma Farmacéutica
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={pharmaceuticalForm}
                                            onChange={(e) => setPharmaceuticalForm(e.target.value)}
                                            className="w-full h-[38px] pl-3 pr-8 rounded bg-surface-container-low text-on-surface text-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer border border-surface-container"
                                        >
                                            <option value="Comprimido">Comprimido / Tableta</option>
                                            <option value="Cápsula">Cápsula</option>
                                            <option value="Jarabe">Jarabe</option>
                                            <option value="Suspensión">Suspensión oral</option>
                                            <option value="Inyectable">Inyectable / Ampolla</option>
                                            <option value="Pomada / Gel">Pomada / Crema / Gel</option>
                                            <option value="Gotas">Gotas oftálmicas / óticas</option>
                                            <option value="Aerosol / Inhalador">Aerosol / Inhalador</option>
                                            <option value="Supositorio">Supositorio</option>
                                            <option value="Solución">Solución / Suero</option>
                                            <option value="Material Médico">Material Médico / Insumo</option>
                                        </select>
                                        <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                                            expand_more
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Row 3: Categoría Farmacéutica & Proveedor Asignado */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-on-surface">
                                        Categoría Farmacológica
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={categoryId}
                                            onChange={(e) => setCategoryId(e.target.value)}
                                            className="w-full h-[38px] pl-3 pr-8 rounded bg-surface-container-low text-on-surface text-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer border border-surface-container"
                                        >
                                            <option value="">Seleccionar categoría...</option>
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                        <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                                            expand_more
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-on-surface">
                                        Laboratorio / Proveedor
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={supplierId}
                                            onChange={(e) => setSupplierId(e.target.value)}
                                            className="w-full h-[38px] pl-3 pr-8 rounded bg-surface-container-low text-on-surface text-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer border border-surface-container"
                                        >
                                            <option value="">Seleccionar laboratorio...</option>
                                            {suppliers.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                                            expand_more
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Row 4: Estructura de Precios & Stock */}
                            <div className="bg-surface-container-low p-3.5 rounded-xl flex flex-col gap-2 border border-surface-container">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">Estructura de Precios &amp; Stock</span>
                                    <span className="font-mono text-[11px] text-on-surface-variant flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[13px] text-primary">lock_clock</span> Base monetaria en centavos
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {/* Cost Price */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-bold text-on-surface">
                                            Precio de Costo <span className="text-error">*</span>
                                        </label>
                                        <div className="relative flex items-center">
                                            <span className="absolute left-2.5 font-mono text-xs text-secondary select-none">Bs</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={costBs}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setCostBs(e.target.value.replace(/^0+(?=\d)/, ''))}
                                                placeholder="0.00"
                                                required
                                                className="w-full h-[38px] pl-8 pr-2.5 rounded bg-surface-container-lowest text-on-surface font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                                            />
                                        </div>
                                        <span className="text-[11px] text-secondary">Costo unitario de compra</span>
                                    </div>
                                    {/* Sale Price */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-bold text-on-surface">
                                            Precio de Venta <span className="text-error">*</span>
                                        </label>
                                        <div className="relative flex items-center">
                                            <span className="absolute left-2.5 font-mono text-xs text-secondary select-none">Bs</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={priceBs}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setPriceBs(e.target.value.replace(/^0+(?=\d)/, ''))}
                                                placeholder="0.00"
                                                required
                                                className="w-full h-[38px] pl-8 pr-2.5 rounded bg-surface-container-lowest text-on-surface font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                                            />
                                        </div>
                                        <span className={`font-mono text-[11px] font-medium ${calculatedMargin ? (calculatedMargin.isPositive ? 'text-primary' : 'text-error') : 'text-secondary'}`}>
                                            {calculatedMargin
                                                ? `Margen: ${calculatedMargin.isPositive ? '+' : ''}Bs ${calculatedMargin.profit.toFixed(2)} (${calculatedMargin.pct}%)`
                                                : 'Margen calculado: --'}
                                        </span>
                                    </div>
                                    {/* Box Price */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-bold text-on-surface flex items-center justify-between">
                                            <span>Precio por Caja</span>
                                            <span className="text-[10px] text-outline">Opcional</span>
                                        </label>
                                        <div className="relative flex items-center">
                                            <span className="absolute left-2.5 font-mono text-xs text-secondary select-none">Bs</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={boxPriceBs}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => setBoxPriceBs(e.target.value.replace(/^0+(?=\d)/, ''))}
                                                placeholder="0.00"
                                                className="w-full h-[38px] pl-8 pr-2.5 rounded bg-surface-container-lowest text-on-surface font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                                            />
                                        </div>
                                        <span className="text-[11px] text-secondary">Referencial para venta por caja</span>
                                    </div>
                                    {/* Initial Stock */}
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-bold text-on-surface flex items-center justify-between">
                                            <span>Stock Total (Uds) <span className="text-error">*</span></span>
                                            {batches.length > 0 && (
                                                <span className="text-[10px] text-primary font-bold">{batches.length} lote(s)</span>
                                            )}
                                        </label>
                                        <div className="relative flex items-center">
                                            <input
                                                type="number"
                                                min="0"
                                                value={batches.length > 0 ? (totalBatchesStock === 0 ? '' : totalBatchesStock) : (stock === '0' || stock === '' ? '' : stock)}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => {
                                                    const clean = e.target.value.replace(/^0+(?=\d)/, '');
                                                    setStock(clean);
                                                    if (batches.length === 1) {
                                                        handleBatchChange(0, 'stock', clean === '' ? 0 : Math.max(0, parseInt(clean, 10) || 0));
                                                    }
                                                }}
                                                readOnly={batches.length > 1}
                                                placeholder="0"
                                                required
                                                className={`w-full h-[38px] px-3 pr-12 rounded text-on-surface font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container ${batches.length > 1 ? 'bg-surface-container font-bold cursor-not-allowed' : 'bg-surface-container-lowest'}`}
                                            />
                                            <span className="absolute right-2.5 text-[11px] text-secondary select-none font-mono">uds</span>
                                        </div>
                                        <span className="text-[11px] text-secondary">
                                            {batches.length > 1 ? 'Suma automática de los lotes' : 'Existencias en mostrador'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Row 5: Stock Mínimo & Tipo de Receta & Favorito POS */}
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-start">
                                <div className="sm:col-span-4 flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-on-surface">
                                        Stock Mínimo Alerta
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={minStock === '0' || minStock === '' ? '' : minStock}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => setMinStock(e.target.value.replace(/^0+(?=\d)/, ''))}
                                        placeholder="3"
                                        className="w-full h-[38px] px-3 rounded bg-surface-container-low text-on-surface font-mono text-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                                    />
                                    <span className="text-[11px] text-secondary">Avisa quiebre en Dashboard</span>
                                </div>
                                <div className="sm:col-span-4 flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-on-surface">
                                        Tipo de Prescripción
                                    </label>
                                    <div className="grid grid-cols-2 gap-1.5 h-[38px]">
                                        <button
                                            type="button"
                                            onClick={() => setRequiresPrescription(false)}
                                            className={`px-2 rounded text-xs font-semibold flex items-center justify-center transition-all border ${!requiresPrescription ? 'bg-primary-fixed text-on-primary-fixed border-primary' : 'bg-surface-container-low text-secondary border-surface-container'}`}
                                        >
                                            Venta Libre (OTC)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRequiresPrescription(true)}
                                            className={`px-2 rounded text-xs font-semibold flex items-center justify-center transition-all border ${requiresPrescription ? 'bg-error-container text-on-error-container border-error' : 'bg-surface-container-low text-secondary border-surface-container'}`}
                                        >
                                            Receta (Rx)
                                        </button>
                                    </div>
                                    <span className="text-[11px] text-secondary">Alerta médica en POS</span>
                                </div>
                                <div className="sm:col-span-4 flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-on-surface">
                                        Medicamento Favorito POS
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsPriority(!isPriority)}
                                        className={`w-full h-[38px] px-3 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${isPriority ? 'bg-amber-100 text-amber-900 border-amber-400' : 'bg-surface-container-low text-secondary border-surface-container hover:bg-surface-container'}`}
                                    >
                                        <span className="material-symbols-outlined text-[18px] text-amber-500">
                                            {isPriority ? 'star' : 'star_border'}
                                        </span>
                                        <span>{isPriority ? '⭐ Favorito en POS' : 'Normal en Catálogo'}</span>
                                    </button>
                                    <span className="text-[11px] text-secondary">Acceso rápido en caja</span>
                                </div>
                            </div>

                            {/* Row 6: Control Dinámico de Lotes y Vencimientos (FEFO) */}
                            <div className="flex flex-col gap-3 bg-surface-container-low/70 p-3.5 rounded-xl border border-surface-container">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                            <span className="material-symbols-outlined text-[20px]">layers</span>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                                                Lotes y Vencimientos (Control FEFO)
                                                <span className="text-[10px] bg-primary-container text-on-primary-container font-bold px-1.5 py-0.2 rounded">
                                                    Activo
                                                </span>
                                            </h4>
                                            <p className="text-[11px] text-secondary">
                                                Registra o añade lotes con sus fechas y cantidades correspondientes
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddBatch}
                                        className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">add</span>
                                        <span>Agregar Otro Lote</span>
                                    </button>
                                </div>

                                {/* Lista de Lotes */}
                                <div className="flex flex-col gap-2 mt-1">
                                    {batches.map((batch, index) => {
                                        const isNearExpiring = batch.expiration_date ? (() => {
                                            const diff = (new Date(batch.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
                                            return diff <= 30;
                                        })() : false;

                                        return (
                                            <div
                                                key={batch.id || `batch-${index}`}
                                                className="grid grid-cols-12 gap-2.5 items-center bg-surface-container-lowest p-2.5 rounded-lg border border-surface-container shadow-xs"
                                            >
                                                {/* Código / Lote */}
                                                <div className="col-span-12 sm:col-span-4 flex flex-col gap-1">
                                                    <label className="text-[10px] font-bold text-secondary uppercase flex items-center justify-between">
                                                        <span>Lote #{index + 1}</span>
                                                        <span className="text-[9px] text-outline font-normal">Caja / Frasco</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={batch.lot_number}
                                                        onChange={(e) => handleBatchChange(index, 'lot_number', e.target.value.toUpperCase())}
                                                        placeholder={`ej. LOTE-${new Date().getFullYear()}-${index + 1}`}
                                                        className="w-full h-[34px] px-2.5 rounded bg-surface-container-low font-mono text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container uppercase"
                                                    />
                                                </div>

                                                {/* Vencimiento */}
                                                <div className="col-span-7 sm:col-span-4 flex flex-col gap-1">
                                                    <label className="text-[10px] font-bold text-secondary uppercase flex items-center justify-between">
                                                        <span>Vencimiento</span>
                                                        {isNearExpiring && (
                                                            <span className="text-[9px] text-error font-bold flex items-center gap-0.5">
                                                                <span className="material-symbols-outlined text-[12px]">warning</span>
                                                                Próximo
                                                            </span>
                                                        )}
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={batch.expiration_date || ''}
                                                        onChange={(e) => handleBatchChange(index, 'expiration_date', e.target.value)}
                                                        className="w-full h-[34px] px-2 rounded bg-surface-container-low font-mono text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                                                    />
                                                </div>

                                                {/* Cantidad / Stock */}
                                                <div className="col-span-4 sm:col-span-3 flex flex-col gap-1">
                                                    <label className="text-[10px] font-bold text-secondary uppercase">
                                                        Cantidad (Uds)
                                                    </label>
                                                    <div className="relative flex items-center">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={batch.stock === 0 || (batch.stock as any) === '' ? '' : batch.stock}
                                                            onFocus={(e) => e.target.select()}
                                                            onChange={(e) => {
                                                                const clean = e.target.value.replace(/^0+(?=\d)/, '');
                                                                handleBatchChange(index, 'stock', clean === '' ? 0 : Math.max(0, parseInt(clean, 10) || 0));
                                                            }}
                                                            placeholder="0"
                                                            className="w-full h-[34px] px-2.5 pr-8 rounded bg-surface-container-low font-mono text-xs text-on-surface font-bold focus:outline-none focus:ring-2 focus:ring-primary border border-surface-container"
                                                        />
                                                        <span className="absolute right-2 text-[10px] text-secondary select-none font-mono">uds</span>
                                                    </div>
                                                </div>

                                                {/* Botón Eliminar Lote */}
                                                <div className="col-span-1 sm:col-span-1 flex items-end justify-center pt-3 sm:pt-4">
                                                    {batches.length > 1 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveBatch(index)}
                                                            title="Eliminar este lote"
                                                            className="w-8 h-[34px] rounded flex items-center justify-center text-error hover:bg-error-container/40 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    ) : (
                                                        <div className="w-8 h-[34px] flex items-center justify-center text-outline/30" title="Al menos debe existir 1 lote">
                                                            <span className="material-symbols-outlined text-[18px]">lock</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Resumen de Lotes */}
                                <div className="flex items-center justify-between pt-1 px-1 text-xs text-secondary flex-wrap gap-2">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                        Suma total en lotes: <strong className="text-on-surface font-mono">{totalBatchesStock} unidades</strong>
                                    </span>
                                    {earliestBatchExp && (
                                        <span className="font-mono text-[11px] text-primary font-semibold">
                                            Primer vencimiento a vender: {earliestBatchExp}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Row 7: Descripción Farmacodinámica e Indicaciones */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-on-surface flex items-center justify-between">
                                    <span>Descripción e Indicaciones Farmacológicas</span>
                                    <span className="text-[11px] text-secondary font-normal">Opcional</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="ej. Indicado para fiebre, dolor de cabeza y malestar general. No administrar en personas con insuficiencia hepática..."
                                    rows={2}
                                    className="w-full p-2.5 rounded bg-surface-container-low text-on-surface placeholder:text-outline text-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none border border-surface-container"
                                />
                            </div>

                            {/* Database compliance notification banner */}
                            <div className="p-2.5 px-3.5 rounded-lg bg-surface-container flex items-start gap-2.5 border border-surface-container-high">
                                <span className="material-symbols-outlined text-[18px] text-primary flex-shrink-0 mt-0.5">verified</span>
                                <p className="text-[11px] text-on-surface-variant leading-snug">
                                    Los campos marcados con <strong className="text-error font-medium">*</strong> son obligatorios. Las tarifas se normalizan a enteros en centavos (<span className="font-mono">cents</span>) e impactan en tiempo real los terminales POS vinculados sin descuadres contables.
                                </p>
                            </div>

                            {/* Modal Footer */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-surface-container">
                                <div className="flex items-center gap-2 text-secondary self-start sm:self-auto">
                                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                                    <span className="font-mono text-xs">Sincronización instantánea con PostgreSQL</span>
                                </div>
                                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setIsFormModalOpen(false)}
                                        className="w-1/2 sm:w-auto px-4 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors text-sm font-semibold text-center"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={createMut.isPending || updateMut.isPending}
                                        className="w-1/2 sm:w-auto px-5 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-semibold text-sm transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {(createMut.isPending || updateMut.isPending) ? (
                                            <>
                                                <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                                                <span>Guardando...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                                <span>{editingProduct ? 'Actualizar Medicamento' : 'Guardar Medicamento'}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 4. MODAL RÁPIDO: AJUSTE DE EXISTENCIAS (+ STOCK) */}
            {quickStockModalProd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-md p-6 border border-surface-container-high">
                        <div className="flex items-center justify-between pb-3 border-b border-surface-container">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[22px]">add_box</span>
                                <h3 className="text-base font-bold text-on-surface">Ajuste Rápido de Stock</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setQuickStockModalProd(null)}
                                className="text-secondary hover:text-on-surface"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        <div className="py-4 flex flex-col gap-3">
                            <p className="text-sm font-semibold text-on-surface">
                                {quickStockModalProd.name}
                            </p>
                            <div className="text-xs text-secondary flex items-center justify-between">
                                <span>Stock actual en bodega:</span>
                                <span className="font-mono font-bold text-sm text-primary">{quickStockModalProd.stock} uds</span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-secondary uppercase">Ingresar cantidad a añadir (+):</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={quickStockAdd}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => setQuickStockAdd(e.target.value.replace(/^0+(?=\d)/, ''))}
                                    placeholder="1"
                                    className="w-full bg-surface-container-low font-mono text-lg font-bold text-on-surface px-3 py-2 rounded-lg border border-surface-container focus:ring-2 focus:ring-primary focus:outline-none"
                                    autoFocus
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                {[5, 10, 20, 50, 100].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setQuickStockAdd(n.toString())}
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
                                onClick={() => setQuickStockModalProd(null)}
                                className="px-3.5 py-1.5 rounded-lg text-secondary hover:bg-surface-container text-xs font-semibold"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveQuickStock}
                                disabled={updateMut.isPending}
                                className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold transition-all shadow-sm"
                            >
                                Confirmar (+{quickStockAdd})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 5. MODAL: IMPORTAR CSV INFO */}
            {isImportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-lg p-6 border border-surface-container-high">
                        <div className="flex items-center justify-between pb-3 border-b border-surface-container">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[22px]">upload_file</span>
                                <h3 className="text-base font-bold text-on-surface">Importar Catálogo CSV</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsImportModalOpen(false)}
                                className="text-secondary hover:text-on-surface"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        <div className="py-4 text-xs text-secondary flex flex-col gap-3 leading-relaxed">
                            <p>
                                Para realizar importaciones masivas de medicamentos con compatibilidad total en PharmaCore, descargue primero el formato base haciendo clic en <strong>Exportar Lotes</strong>.
                            </p>
                            <div className="p-3 rounded-lg bg-surface-container-low font-mono text-[11px] text-on-surface border border-surface-container">
                                SKU;Nombre;Categoría;Proveedor;Stock;Stock Mínimo;Costo;PVP;Margen;Vencimiento
                            </div>
                            <p>
                                El archivo debe estar delimitado por punto y coma (;) o comas y codificado en UTF-8 para preservar nombres con tildes y caracteres especiales.
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-surface-container">
                            <button
                                type="button"
                                onClick={() => setIsImportModalOpen(false)}
                                className="px-4 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 6. MODAL: KARDEX Y AUDITORÍA DE MOVIMIENTOS */}
            {kardexModalProd && (
                <KardexModal
                    product={kardexModalProd}
                    onClose={() => setKardexModalProd(null)}
                />
            )}
        </div>
    );
}