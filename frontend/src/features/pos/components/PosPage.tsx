import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useHasPermission } from '@/features/users/hooks/usePermissions';
import { useCategories } from '@/features/categories/hooks/useCategories';
import { usePos } from '../hooks/usePos';
import { getActiveCashShift, type CashShift } from '../services/cashShiftsApi';
import TicketReceipt from './TicketReceipt';
import CashCloseModal from './CashCloseModal';
import OpenShiftModal from './OpenShiftModal';
import SalesHistoryModal from './SalesHistoryModal';

export default function PosPage() {
  const { user } = useAuthStore();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const canAccess = useHasPermission('pos:access');
  const canSell = useHasPermission('pos:sell');
  const canManageShifts = useHasPermission('pos:shifts');
  const canViewHistory = useHasPermission('pos:history');
  const canDiscount = useHasPermission('pos:discount');

  const { data: categories = [] } = useCategories();

  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [reprintSaleId, setReprintSaleId] = useState<string | null>(null);
  const [isDiscountOpen, setIsDiscountOpen] = useState(false);
  const [isClientEditOpen, setIsClientEditOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    getActiveCashShift(user.id).then(setActiveShift);
  }, [user]);

  const {
    products, isLoading, cart, searchTerm, setSearchTerm,
    filterFavoritesOnly, setFilterFavoritesOnly, favoritesCount,
    selectedCategory, setSelectedCategory,
    clientName, setClientName, clientNit, setClientNit,
    receivedAmountBs, setReceivedAmountBs, changeAmountBs,
    paymentMethod, setPaymentMethod, isProcessing, isOnline,
    subtotalBs,
    discountType, setDiscountType,
    discountValue, setDiscountValue,
    discountReason, setDiscountReason,
    discountCents, discountBs,
    totalBs,
    applyQuickPercent, applyQuickAmount, clearDiscount,
    handleAddToCart, handleUpdateQuantity, removeItem, clearCart, handleCheckout,
    saleSuccess, handleNewSale, handleAfterPrint,
  } = usePos();

  const handleClearCartConfirm = () => {
    if (cart.length === 0) return;
    const totalItems = cart.reduce((acc, i) => acc + i.quantity, 0);
    const confirmClear = window.confirm(
      `¿Deseas vaciar los ${totalItems} artículo(s) del ticket actual?`
    );
    if (confirmClear) {
      clearCart();
      clearDiscount();
      setReceivedAmountBs('');
    }
  };

  // Atajos globales de teclado F-Keys para máxima fluidez en mostrador
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleNewSale();
        searchInputRef.current?.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setIsClientEditOpen(prev => !prev);
      } else if (e.key === 'F8') {
        if (canDiscount) {
          e.preventDefault();
          setIsDiscountOpen(prev => !prev);
        }
      } else if (e.key === 'F9') {
        if (canViewHistory) {
          e.preventDefault();
          setIsHistoryModalOpen(true);
        }
      } else if (e.key === 'F12') {
        e.preventDefault();
        if (cart.length > 0 && canSell && !isProcessing) {
          handleCheckout(activeShift?.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length, canSell, canDiscount, canViewHistory, isProcessing, activeShift?.id]);

  if (!canAccess) {
    return (
      <div className="p-12 max-w-xl mx-auto my-12 text-center bg-surface-container-lowest rounded-2xl border border-surface-container shadow-sm flex flex-col items-center gap-3">
        <span className="material-symbols-outlined text-4xl text-error">lock</span>
        <h2 className="text-lg font-bold text-on-surface">Acceso Restringido al Punto de Venta</h2>
        <p className="text-xs text-secondary">
          Tu rol de usuario actual no tiene asignado el permiso <span className="font-mono font-bold text-on-surface">pos:access</span> para operar la terminal de caja.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* LAYOUT POS - print:hidden oculta todo esto al imprimir */}
      <div className="print:hidden flex flex-col lg:flex-row gap-5 p-5 h-[calc(100vh-64px)] overflow-hidden bg-background">
        {/* ==============================================================================
            COLUMNA IZQUIERDA: Catálogo de Dispensación (65%)
           ============================================================================== */}
        <div className="w-full lg:w-[65%] flex flex-col gap-3.5 h-full overflow-hidden">
          {/* 1. Barra Superior: Búsqueda con Escáner, Estado y Acciones Rápidas */}
          <div className="bg-surface-container-lowest p-3 rounded-xl shadow-xs border border-surface-container flex flex-col sm:flex-row items-center gap-2.5 shrink-0">
            <div className="relative flex-1 w-full">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                barcode_scanner
              </span>
              <input
                ref={searchInputRef}
                id="pos-search-input"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-24 py-2 rounded-lg bg-surface text-on-surface placeholder:text-outline font-mono text-xs focus:outline-none focus:ring-1.5 focus:ring-primary focus:bg-surface-container-lowest border border-surface-container transition-all shadow-inner"
                placeholder="Escanear código de barras o teclear fármaco, sustancia, SKU..."
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  className="px-2 py-0.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface-variant font-mono text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Presione [F3] para enfocar buscador"
                >
                  <span className="material-symbols-outlined text-[13px]">qr_code_scanner</span>
                  <span>[F3]</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
              {/* Badge Estado Sistema */}
              <div className="flex items-center gap-1.5 bg-surface-container-low px-2.5 py-1.5 rounded-lg text-primary font-bold text-[11px] border border-surface-container shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="font-mono tracking-wider">{isOnline ? 'RECETARIO ACTIVO' : 'MODO OFFLINE'}</span>
              </div>

              {/* Botón Historial de Ventas */}
              {canViewHistory && (
                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(true)}
                  className="flex items-center gap-1.5 bg-surface-container-low hover:bg-surface-container text-on-surface px-3 py-1.5 rounded-lg font-bold text-xs border border-surface-container transition-all active:scale-95 shrink-0 cursor-pointer shadow-xs"
                  title="Historial de tickets y reimpresión [F9]"
                >
                  <span className="material-symbols-outlined text-[17px] text-primary">history</span>
                  <span>Historial</span>
                  <kbd className="text-[9px] font-mono opacity-70">F9</kbd>
                </button>
              )}

              {/* Control de Turno y Arqueo */}
              {canManageShifts && (
                activeShift ? (
                  <button
                    type="button"
                    onClick={() => setIsCloseModalOpen(true)}
                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 px-3 py-1.5 rounded-lg font-bold text-xs border border-emerald-300 transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
                    title="Cerrar turno de caja y realizar arqueo"
                  >
                    <span className="material-symbols-outlined text-[17px] text-emerald-700">point_of_sale</span>
                    <span>Arqueo Turno</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsOpenShiftModalOpen(true)}
                    className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 px-3 py-1.5 rounded-lg font-bold text-xs border border-amber-300 transition-all shadow-xs active:scale-95 shrink-0 cursor-pointer"
                    title="Abrir turno con fondo inicial"
                  >
                    <span className="material-symbols-outlined text-[17px] text-amber-600">lock_open</span>
                    <span>Abrir Caja</span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* 2. Filtro Horizontal de Categorías Terapéuticas */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-none select-none">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('');
                setFilterFavoritesOnly(false);
              }}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                !selectedCategory && !filterFavoritesOnly
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'bg-surface-container-lowest text-secondary hover:text-on-surface hover:bg-surface-container-low border border-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">category</span>
              <span>Todos ({products.length})</span>
            </button>

            {/* Filtro Rápido de Favoritos */}
            <button
              type="button"
              onClick={() => setFilterFavoritesOnly(!filterFavoritesOnly)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                filterFavoritesOnly
                  ? 'bg-amber-100 text-amber-900 border border-amber-400 shadow-xs'
                  : 'bg-surface-container-lowest text-secondary hover:text-on-surface hover:bg-surface-container-low border border-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[15px] text-amber-500">
                {filterFavoritesOnly ? 'star' : 'star_border'}
              </span>
              <span>Favoritos ({favoritesCount})</span>
            </button>

            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setFilterFavoritesOnly(false);
                    setSelectedCategory(isSelected ? '' : cat.id);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-on-primary font-bold shadow-xs'
                      : 'bg-surface-container-lowest text-secondary hover:text-on-surface hover:bg-surface-container-low border border-surface-container'
                  }`}
                >
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>

          {/* 3. Cuadrícula de Medicamentos Clínicos (3 Columnas) */}
          <div className="overflow-y-auto pr-1 pb-16 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {isLoading ? (
                <div className="col-span-full p-12 text-center text-secondary flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[36px] text-primary animate-spin">progress_activity</span>
                  <span className="text-sm font-semibold">Cargando catálogo clínico...</span>
                </div>
              ) : products.length === 0 ? (
                <div className="col-span-full p-12 text-center text-secondary flex flex-col items-center justify-center gap-2 bg-surface-container-lowest rounded-xl border border-surface-container">
                  <span className="material-symbols-outlined text-[36px] text-outline">search_off</span>
                  <span className="text-sm font-semibold">No se encontraron medicamentos</span>
                  <p className="text-xs text-outline max-w-sm">Intente con otro término, principio activo o código de barras.</p>
                </div>
              ) : (
                products.map((prod: any) => {
                  const isLowStock = prod.stock <= 5;
                  const isOut = prod.stock === 0;

                  return (
                    <div
                      key={prod.id}
                      className="bg-surface-container-lowest p-3.5 rounded-xl shadow-xs hover:shadow-md border border-surface-container hover:border-primary/40 transition-all flex flex-col justify-between group relative overflow-hidden"
                    >
                      <div>
                        {/* Cabecera de la Tarjeta */}
                        <div className="flex items-start justify-between gap-1.5 mb-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase truncate max-w-[125px] ${
                            prod.requires_prescription
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-surface-container-low text-primary'
                          }`}>
                            {prod.requires_prescription ? '💊 Receta (Rx)' : (prod.categories?.name || 'Venta Libre')}
                          </span>

                          <div className="flex items-center gap-1 shrink-0">
                            {prod.product_batches && prod.product_batches.length > 1 && (
                              <span
                                className="px-1.5 py-0.5 rounded bg-surface-container text-secondary text-[10px] font-mono font-bold"
                                title={prod.product_batches.map((b: any) => `${b.lot_number}: ${b.stock} uds`).join(', ')}
                              >
                                {prod.product_batches.length} lotes
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold flex items-center gap-1 ${
                              isOut
                                ? 'bg-error-container text-on-error-container font-extrabold'
                                : isLowStock
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-surface-container text-on-surface'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOut ? 'bg-error' : isLowStock ? 'bg-amber-600' : 'bg-primary'}`}></span>
                              <span>{prod.stock} disp.</span>
                            </span>
                          </div>
                        </div>

                        {/* Badges de Atributos */}
                        <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                          {prod.is_priority && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                              ⭐ FAVORITO
                            </span>
                          )}
                          {prod.pharmaceutical_form && (
                            <span className="px-1.5 py-0.2 rounded bg-surface-container text-secondary text-[9px] font-mono">
                              {prod.pharmaceutical_form}
                            </span>
                          )}
                        </div>

                        {/* Título y Sustancia Activa */}
                        <h4 className="font-bold text-on-surface group-hover:text-primary leading-tight line-clamp-1 text-sm transition-colors">
                          {prod.name}
                        </h4>
                        {prod.active_substance ? (
                          <p className="text-xs text-primary font-medium truncate mt-0.5">
                            {prod.active_substance}
                          </p>
                        ) : null}
                        <p className="text-[11px] text-secondary mt-0.5 truncate font-mono">
                          {prod.suppliers?.name || 'Laboratorio Farmacéutico'}
                        </p>
                      </div>

                      {/* Pie de Tarjeta: Precio y Botón Agregar */}
                      <div className="pt-3 mt-3 bg-surface-container-low/50 -mx-3.5 -mb-3.5 p-3 rounded-b-xl flex items-center justify-between border-t border-surface-container">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-outline uppercase font-bold tracking-wider">P. Venta</span>
                          <span className="font-mono text-base lg:text-lg text-on-surface font-extrabold">
                            Bs {(prod.price_cents / 100).toFixed(2)}
                          </span>
                        </div>

                        {canSell ? (
                          <button
                            type="button"
                            onClick={() => handleAddToCart(prod)}
                            disabled={isOut || isProcessing}
                            className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold text-xs shadow-xs transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[17px]">add</span>
                            <span>Agregar</span>
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 rounded bg-surface-container text-secondary text-[10px] font-semibold select-none">
                            Solo Consulta
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 4. Barra de Accesos Rápidos F-Keys (Footer Catálogo) */}
          <div className="bg-surface-container-lowest p-2.5 px-3.5 rounded-xl shadow-xs border border-surface-container flex flex-wrap items-center justify-between gap-2 text-secondary text-xs shrink-0 select-none">
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-inverse-surface text-inverse-on-surface font-mono text-[10px] font-bold">F2</kbd>
              <span>Nueva Venta</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-inverse-surface text-inverse-on-surface font-mono text-[10px] font-bold">F3</kbd>
              <span>Buscar / Escáner</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-inverse-surface text-inverse-on-surface font-mono text-[10px] font-bold">F4</kbd>
              <span>Cliente</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-inverse-surface text-inverse-on-surface font-mono text-[10px] font-bold">F8</kbd>
              <span>Descuento</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-inverse-surface text-inverse-on-surface font-mono text-[10px] font-bold">F9</kbd>
              <span>Historial</span>
            </div>
            <div className="flex items-center gap-1.5 text-primary font-bold">
              <kbd className="px-1.5 py-0.5 rounded bg-primary text-on-primary font-mono text-[10px]">F12</kbd>
              <span>Cobro Inmediato</span>
            </div>
          </div>
        </div>

        {/* ==============================================================================
            COLUMNA DERECHA: Ticket de Dispensación Persistente (35%)
           ============================================================================== */}
        <div className="w-full lg:w-[35%] flex flex-col gap-3 h-full overflow-hidden">
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container flex flex-col h-full overflow-hidden">
            {/* Cabecera del Ticket Clínico */}
            <div className="bg-inverse-surface p-3.5 text-inverse-on-surface flex items-center justify-between shrink-0">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-fixed-dim text-[19px]">receipt_long</span>
                  <span className="font-bold text-sm tracking-tight">Ticket de Dispensación</span>
                </div>
                <span className="font-mono text-[11px] text-secondary-fixed-dim mt-0.5">
                  Caja 01 • {activeShift ? (activeShift.user_profiles?.full_name || user?.email?.split('@')[0] || 'Operador') : 'Turno Activo'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearCartConfirm}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-error/20 hover:bg-error/30 text-rose-300 border border-error/30 text-[11px] font-bold transition-all active:scale-95 cursor-pointer"
                    title="Vaciar todos los productos del ticket actual"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                    <span>Vaciar</span>
                  </button>
                )}
                <span className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold uppercase tracking-wider ${
                  isOnline ? 'bg-primary/20 text-primary-fixed' : 'bg-error/20 text-error'
                }`}>
                  {isOnline ? 'En Curso' : 'Offline'}
                </span>
              </div>
            </div>

            {/* Barra Compacta de Datos del Cliente */}
            <div className="bg-surface-container-low px-3.5 py-2 flex items-center justify-between border-b border-surface-container shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[15px]">person</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-xs text-on-surface truncate">
                    {clientName.trim() || 'Cliente de Mostrador (Público General)'}
                  </span>
                  <span className="text-[10px] text-secondary font-mono truncate">
                    {clientNit.trim() ? `NIT/CI: ${clientNit.trim()}` : 'Tarifa Estándar PharmaCore'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClientEditOpen(!isClientEditOpen)}
                className="p-1 rounded hover:bg-surface-container text-secondary hover:text-primary transition-colors cursor-pointer shrink-0"
                title="Editar datos de cliente [F4]"
              >
                <span className="material-symbols-outlined text-[17px]">
                  {isClientEditOpen ? 'expand_less' : 'edit'}
                </span>
              </button>
            </div>

            {/* Campos Expandibles de Cliente (F4) */}
            {isClientEditOpen && (
              <div className="p-3 bg-surface-container-low border-b border-surface-container grid grid-cols-2 gap-2 animate-fadeIn shrink-0">
                <div>
                  <label className="text-[10px] font-bold text-secondary uppercase block mb-1">Nombre / Razón Social</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Cliente mostrador..."
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-surface text-on-surface border border-surface-container focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-secondary uppercase block mb-1">NIT / CI</label>
                  <input
                    type="text"
                    value={clientNit}
                    onChange={(e) => setClientNit(e.target.value)}
                    placeholder="0"
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-surface text-on-surface font-mono border border-surface-container focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Lista de Medicamentos en el Ticket */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-background">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-secondary opacity-50 space-y-2 py-8">
                  <span className="material-symbols-outlined text-5xl">shopping_cart</span>
                  <p className="text-xs font-semibold">El ticket está vacío</p>
                  <p className="text-[11px] text-center max-w-[200px]">Escanee un código de barras o seleccione fármacos del catálogo.</p>
                </div>
              ) : (
                cart.map(item => (
                  <div
                    key={item.product_id}
                    className="bg-surface p-2.5 rounded-lg border border-surface-container shadow-xs flex items-center justify-between gap-2 group hover:border-primary/30 transition-all"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-xs text-on-surface truncate">{item.name}</span>
                      <span className="font-mono text-[11px] text-secondary">
                        Bs {(item.price_cents / 100).toFixed(2)} c/u
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* Stepper de Cantidad */}
                      <div className="flex items-center bg-surface-container-lowest border border-surface-container rounded-md px-1 py-0.5 shadow-xs">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.product_id, -1)}
                          className="w-5 h-5 flex items-center justify-center text-secondary hover:text-error hover:bg-error-container rounded transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">remove</span>
                        </button>
                        <span className="font-mono text-xs px-1.5 font-extrabold w-6 text-center text-on-surface">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.product_id, 1)}
                          className="w-5 h-5 flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-container rounded transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">add</span>
                        </button>
                      </div>

                      {/* Total de Línea */}
                      <div className="w-16 text-right font-mono text-xs text-on-surface font-extrabold">
                        Bs {((item.price_cents * item.quantity) / 100).toFixed(2)}
                      </div>

                      {/* Botón Eliminar */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.product_id)}
                        className="w-6 h-6 flex items-center justify-center text-outline hover:text-error hover:bg-error-container rounded transition-colors cursor-pointer"
                        title="Eliminar medicamento"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ==============================================================================
                Panel Inferior: Descuentos, Totales, Métodos de Pago y Botón de Cobro
               ============================================================================== */}
            <div className="p-3.5 bg-surface-container-lowest border-t border-surface-container shrink-0 overflow-y-auto max-h-[50vh]">
              {/* MÓDULO DE DESCUENTO AL TICKET (Protegido por Dynamic RBAC 'pos:discount') */}
              {cart.length > 0 && (
                <div className="mb-3">
                  {!canDiscount ? (
                    <div className="p-2 rounded-lg bg-surface-container-low border border-surface-container flex items-center justify-between text-secondary text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-outline">lock</span>
                        <span>Descuentos restringidos</span>
                      </div>
                      <span className="text-[10px] text-outline font-mono">Requiere pos:discount</span>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-surface-container bg-surface-container-low/50 p-2.5 transition-all">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setIsDiscountOpen(!isDiscountOpen)}
                          className="flex items-center gap-1.5 text-xs font-bold text-on-surface hover:text-primary transition-colors cursor-pointer select-none"
                        >
                          <span className="material-symbols-outlined text-[18px] text-primary">local_offer</span>
                          <span>Descuento al Ticket</span>
                          <span className="material-symbols-outlined text-[16px] text-secondary">
                            {isDiscountOpen ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>

                        {discountCents > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                              -Bs {discountBs}
                            </span>
                            <button
                              type="button"
                              onClick={clearDiscount}
                              className="text-secondary hover:text-error p-0.5 rounded transition-colors cursor-pointer"
                              title="Eliminar descuento"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-secondary font-medium font-mono">[F8] Opcional</span>
                        )}
                      </div>

                      {/* Panel Expandido de Descuento */}
                      {isDiscountOpen && (
                        <div className="flex flex-col gap-2.5 pt-2.5 mt-2 border-t border-surface-container animate-fadeIn">
                          {/* Tipo: % Porcentaje o Bs Monto Fijo */}
                          <div className="grid grid-cols-2 gap-1 p-0.5 bg-surface-container rounded-lg">
                            <button
                              type="button"
                              onClick={() => {
                                setDiscountType('percentage');
                                if (!discountValue) setDiscountValue('10');
                              }}
                              className={`py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                                discountType === 'percentage'
                                  ? 'bg-surface-container-lowest text-primary shadow-xs'
                                  : 'text-secondary hover:text-on-surface'
                              }`}
                            >
                              % Porcentaje
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDiscountType('amount');
                                if (!discountValue) setDiscountValue('5');
                              }}
                              className={`py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                                discountType === 'amount'
                                  ? 'bg-surface-container-lowest text-primary shadow-xs'
                                  : 'text-secondary hover:text-on-surface'
                              }`}
                            >
                              Bs Monto Fijo
                            </button>
                          </div>

                          {/* Controles según tipo */}
                          {discountType === 'percentage' ? (
                            <div className="flex flex-col gap-1.5">
                              {/* Botones rápidos de porcentaje */}
                              <div className="grid grid-cols-4 gap-1">
                                {[5, 10, 15, 20].map((pct) => (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() => applyQuickPercent(pct)}
                                    className={`py-1 text-xs font-mono font-bold rounded border transition-colors cursor-pointer ${
                                      discountValue === pct.toString()
                                        ? 'bg-primary text-on-primary border-primary shadow-xs'
                                        : 'bg-surface border-surface-container text-on-surface hover:bg-surface-container'
                                    }`}
                                  >
                                    {pct}%
                                  </button>
                                ))}
                              </div>
                              {/* Input personalizado de porcentaje */}
                              <div className="relative">
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-secondary">%</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={discountValue}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    setDiscountType('percentage');
                                    setDiscountValue(e.target.value.replace(/^0+(?=\d)/, ''));
                                  }}
                                  placeholder="Porcentaje manual (ej. 8)..."
                                  className="w-full text-xs pr-7 pl-3 py-1.5 rounded-lg bg-surface text-on-surface border border-surface-container focus:ring-1 focus:ring-primary focus:outline-none font-mono"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {/* Botones rápidos de monto */}
                              <div className="grid grid-cols-3 gap-1">
                                {[5, 10, 20].map((amt) => (
                                  <button
                                    key={amt}
                                    type="button"
                                    onClick={() => applyQuickAmount(amt)}
                                    className={`py-1 text-xs font-mono font-bold rounded border transition-colors cursor-pointer ${
                                      discountValue === amt.toString()
                                        ? 'bg-primary text-on-primary border-primary shadow-xs'
                                        : 'bg-surface border-surface-container text-on-surface hover:bg-surface-container'
                                    }`}
                                  >
                                    Bs {amt}
                                  </button>
                                ))}
                              </div>
                              {/* Input personalizado de monto en Bs */}
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-secondary">Bs</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.50"
                                  value={discountValue}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    setDiscountType('amount');
                                    setDiscountValue(e.target.value.replace(/^0+(?=\d)/, ''));
                                  }}
                                  placeholder="Monto fijo a descontar..."
                                  className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg bg-surface text-on-surface border border-surface-container focus:ring-1 focus:ring-primary focus:outline-none font-mono font-bold"
                                />
                              </div>
                            </div>
                          )}

                          {/* Motivo o Justificación del Descuento */}
                          <div>
                            <select
                              value={discountReason}
                              onChange={(e) => setDiscountReason(e.target.value)}
                              className="w-full text-[11px] px-2.5 py-1.5 rounded-lg bg-surface text-on-surface border border-surface-container focus:ring-1 focus:ring-primary focus:outline-none"
                            >
                              <option value="">Motivo del Descuento (Opcional)...</option>
                              <option value="Tercera Edad (Adulto Mayor)">Tercera Edad (Adulto Mayor)</option>
                              <option value="Convenio Institucional / Seguro">Convenio Institucional / Seguro</option>
                              <option value="Cliente Frecuente / Fidelización">Cliente Frecuente / Fidelización</option>
                              <option value="Promoción del Día">Promoción del Día</option>
                              <option value="Por Daño de Empaque">Por Daño de Empaque</option>
                              <option value="Cortesía Administrativa">Cortesía Administrativa</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* DESGLOSE FINANCIERO */}
              <div className="bg-surface-container-low p-3.5 rounded-xl border border-surface-container flex flex-col gap-1.5 mb-3">
                <div className="flex items-center justify-between text-xs text-secondary">
                  <span>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} artículos)</span>
                  <span className="font-mono text-on-surface font-semibold">Bs {subtotalBs}</span>
                </div>

                {discountCents > 0 && (
                  <div className="flex items-center justify-between text-xs text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                    <div className="flex flex-col">
                      <span className="font-bold flex items-center gap-1 text-[11px]">
                        <span className="material-symbols-outlined text-[13px]">loyalty</span>
                        <span>Descuento {discountType === 'percentage' && discountValue ? `(${discountValue}%)` : 'al Total'}</span>
                      </span>
                      {discountReason && (
                        <span className="text-[10px] text-emerald-700 italic">{discountReason}</span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-xs">-Bs {discountBs}</span>
                  </div>
                )}

                <div className="mt-1 pt-2 bg-surface-container-high/40 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-xl flex items-baseline justify-between border-t border-surface-container">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-secondary font-bold tracking-wider">Total a Pagar</span>
                    <span className="text-[10px] text-outline font-mono">Moneda nacional (BOB)</span>
                  </div>
                  <span className="text-2xl lg:text-3xl font-extrabold text-primary font-mono tracking-tight">
                    Bs {totalBs}
                  </span>
                </div>
              </div>

              {/* Selector de Método de Pago */}
              <div className="flex flex-col gap-1.5 mb-3">
                <span className="text-[10px] uppercase text-secondary font-bold tracking-wider">Forma de Pago</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'cash', label: 'Efectivo', icon: 'payments' },
                    { id: 'card', label: 'Tarjeta', icon: 'credit_card' },
                    { id: 'qr', label: 'QR Digital', icon: 'qr_code_2' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs ${
                        paymentMethod === m.id
                          ? 'bg-primary border-primary text-on-primary shadow-sm'
                          : 'bg-surface border-surface-container text-secondary hover:bg-surface-container-low hover:text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px] mb-0.5">{m.icon}</span>
                      <span className="text-[11px]">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Desglose de Efectivo y Cambio / Vuelto */}
              {paymentMethod === 'cash' && (
                <div className="bg-surface-container-low/70 p-2.5 rounded-xl border border-surface-container flex flex-col gap-2 mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-secondary uppercase">Efectivo Recibido:</label>
                    <div className="relative w-36">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-secondary">Bs</span>
                      <input
                        type="number"
                        step="0.50"
                        min="0"
                        value={receivedAmountBs}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setReceivedAmountBs(e.target.value.replace(/^0+(?=\d)/, ''))}
                        placeholder={totalBs}
                        className="w-full pl-8 pr-2 py-1 text-sm font-mono font-bold text-right bg-surface rounded-lg border border-surface-container focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Botones Rápidos de Denominaciones (Billetes) */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5 select-none">
                    <button
                      type="button"
                      onClick={() => setReceivedAmountBs(totalBs)}
                      className="px-2 py-0.5 text-[10px] font-bold rounded bg-surface hover:bg-surface-container text-primary border border-primary/20 shrink-0 cursor-pointer"
                    >
                      Exacto
                    </button>
                    {[10, 20, 50, 100, 200].map(bill => (
                      <button
                        key={bill}
                        type="button"
                        onClick={() => setReceivedAmountBs(bill.toString())}
                        className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-surface hover:bg-surface-container text-on-surface border border-surface-container shrink-0 cursor-pointer"
                      >
                        +{bill}
                      </button>
                    ))}
                  </div>

                  {/* Banner de Cambio / Vuelto */}
                  <div className="flex items-center justify-between pt-1 border-t border-surface-container">
                    <span className="text-xs font-bold text-emerald-800">Cambio / Vuelto:</span>
                    <span className="font-mono text-sm font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Bs {changeAmountBs}
                    </span>
                  </div>
                </div>
              )}

              {/* Botón Maestro de Finalización & Cobro [F12] */}
              <button
                type="button"
                onClick={() => handleCheckout(activeShift?.id)}
                disabled={!canSell || cart.length === 0 || isProcessing}
                className="w-full py-3.5 px-4 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-bold text-sm tracking-tight shadow-md flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
                title={!canSell ? 'Tu rol no tiene permiso para cobrar ventas (pos:sell)' : undefined}
              >
                <span className="material-symbols-outlined text-[22px]">point_of_sale</span>
                <span>
                  {!canSell
                    ? 'SOLO CONSULTA (SIN PERMISO DE COBRO)'
                    : isProcessing
                    ? 'PROCESANDO VENTA...'
                    : `FINALIZAR VENTA & COBRAR`}
                </span>
                <kbd className="ml-1 px-1.5 py-0.5 rounded bg-primary-container text-on-primary font-mono text-[10px]">
                  F12
                </kbd>
              </button>

              {/* Footer de Validación Sanitaria */}
              <div className="flex items-center justify-between mt-2.5 px-1 text-outline font-mono text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px] text-primary">verified_user</span>
                  <span>Trazabilidad FEFO Activa</span>
                </span>
                <span>Terminal POS-01</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL ÉXITO DE VENTA */}
      {saleSuccess && (
        <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-6 text-center border border-surface-container">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-[38px]">check_circle</span>
            </div>
            <h3 className="text-xl font-bold text-on-surface mb-1">¡Venta Completada con Éxito!</h3>
            <p className="text-secondary text-xs mb-1">
              Ticket <span className="font-mono font-bold text-primary">#{saleSuccess.id.split('-')[0]}</span>
            </p>
            {saleSuccess.discount_cents && saleSuccess.discount_cents > 0 ? (
              <p className="text-xs text-emerald-700 font-semibold mb-1">
                Descuento aplicado: -Bs {(saleSuccess.discount_cents / 100).toFixed(2)}
              </p>
            ) : null}
            <p className="text-3xl font-extrabold text-primary font-mono my-3">
              Bs {(saleSuccess.total / 100).toFixed(2)}
            </p>
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={handleNewSale}
                className="flex-1 py-2.5 rounded-xl bg-surface-container-high text-on-surface font-bold text-xs hover:bg-surface-container transition-colors cursor-pointer"
              >
                Nueva Venta (F2)
              </button>
              <button
                type="button"
                onClick={() => setShowPrintModal(true)}
                className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs hover:bg-primary-container transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">print</span>
                <span>Imprimir Ticket</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE TICKET TÉRMICO DE LA VENTA RECIENTE */}
      {saleSuccess && showPrintModal && (
        <TicketReceipt
          saleId={saleSuccess.id}
          onComplete={() => {
            setShowPrintModal(false);
            handleAfterPrint();
          }}
        />
      )}

      {/* REIMPRESIÓN DE TICKET DESDE HISTORIAL */}
      {reprintSaleId && (
        <TicketReceipt
          saleId={reprintSaleId}
          onComplete={() => setReprintSaleId(null)}
        />
      )}

      {/* MODAL DE APERTURA DE CAJA */}
      <OpenShiftModal
        isOpen={isOpenShiftModalOpen}
        onClose={() => setIsOpenShiftModalOpen(false)}
        onShiftOpened={(shift) => setActiveShift(shift)}
      />

      {/* MODAL DE CIERRE DE CAJA / TURNO */}
      <CashCloseModal
        isOpen={isCloseModalOpen}
        onClose={() => {
          setIsCloseModalOpen(false);
          if (user) {
            getActiveCashShift(user.id).then(setActiveShift);
          }
        }}
      />

      {/* MODAL DE HISTORIAL DE VENTAS Y REIMPRESIÓN */}
      <SalesHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onReprint={(id) => {
          setReprintSaleId(id);
          setIsHistoryModalOpen(false);
        }}
      />
    </>
  );
}