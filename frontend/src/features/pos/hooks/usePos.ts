import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProducts } from '@/features/products/hooks/useProducts';
import { useCartStore, useCartTotal } from '@/stores/cartStore';
import { checkout, registerOnlineListener, flushPendingSales } from '../services/sales';
import { useAuthStore } from '@/stores/authStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { CartItem } from '@/stores/cartStore';
import { toast } from '@/stores/toastStore';
import { confirmDialog } from '@/stores/confirmModalStore';

export function usePos() {
    const qc = useQueryClient();
    const { data: products = [], isLoading } = useProducts();
    const { user } = useAuthStore();
    const isOnline = useOnlineStatus();

    // Selectores Zustand (reactivos)
    const cart = useCartStore((s) => s.items);
    const addItem = useCartStore((s) => s.addItem);
    const updateQuantity = useCartStore((s) => s.updateQuantity);
    const removeItem = useCartStore((s) => s.removeItem);
    const clearCart = useCartStore((s) => s.clearCart);
    const subtotalCents = useCartTotal();

    const [searchTerm, setSearchTerm] = useState('');
    const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'qr'>('cash');
    const [isProcessing, setIsProcessing] = useState(false);

    // Descuentos en el Ticket (Porcentaje o Monto en Bs)
    const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'amount'>('none');
    const [discountValue, setDiscountValue] = useState<string>('');
    const [discountReason, setDiscountReason] = useState<string>('');

    // Datos del cliente y cobro
    const [clientName, setClientName] = useState('');
    const [clientNit, setClientNit] = useState('');
    const [receivedAmountBs, setReceivedAmountBs] = useState('');

    const [saleSuccess, setSaleSuccess] = useState<{
        id: string;
        total: number;
        subtotal?: number;
        discount_cents?: number;
        discount_type?: string;
        discount_percent?: number;
        discount_reason?: string;
        items: CartItem[];
        client_name?: string;
        client_nit?: string;
        received_amount_cents?: number;
        change_amount_cents?: number;
    } | null>(null);

    // Registrar listener online
    useEffect(() => {
        registerOnlineListener(async () => {
            console.log('🌐 Online - sincronizando...');
            await flushPendingSales();
        });
    }, []);

    // Conteo de favoritos disponibles
    const favoritesCount = useMemo(() => {
        return products.filter(p => p.is_priority).length;
    }, [products]);

    // Cálculo del Descuento aplicado
    const discountCents = useMemo(() => {
        if (discountType === 'none' || subtotalCents <= 0) return 0;
        if (discountType === 'percentage') {
            const pct = parseFloat(discountValue);
            if (isNaN(pct) || pct <= 0) return 0;
            const validPct = Math.min(100, Math.max(0, pct));
            return Math.round(subtotalCents * (validPct / 100));
        }
        if (discountType === 'amount') {
            const bs = parseFloat(discountValue);
            if (isNaN(bs) || bs <= 0) return 0;
            const cents = Math.round(bs * 100);
            return Math.min(subtotalCents, cents);
        }
        return 0;
    }, [discountType, discountValue, subtotalCents]);

    const finalTotalCents = useMemo(() => {
        return Math.max(0, subtotalCents - discountCents);
    }, [subtotalCents, discountCents]);

    const discountBs = useMemo(() => (discountCents / 100).toFixed(2), [discountCents]);
    const subtotalBs = useMemo(() => (subtotalCents / 100).toFixed(2), [subtotalCents]);
    const totalBs = useMemo(() => (finalTotalCents / 100).toFixed(2), [finalTotalCents]);

    const applyQuickPercent = (pct: number) => {
        setDiscountType('percentage');
        setDiscountValue(pct.toString());
    };

    const applyQuickAmount = (amountBs: number) => {
        setDiscountType('amount');
        setDiscountValue(amountBs.toString());
    };

    const clearDiscount = () => {
        setDiscountType('none');
        setDiscountValue('');
        setDiscountReason('');
    };

    // Búsqueda multidimensional (Nombre, Principio Activo, SKU, Descripción, Forma Farmacéutica)
    const filteredProducts = useMemo(() => {
        let result = products;

        if (filterFavoritesOnly) {
            result = result.filter(p => p.is_priority);
        }

        if (selectedCategory) {
            result = result.filter(p => p.category_id === selectedCategory);
        }

        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase().trim();
            result = result.filter(p =>
                p.name.toLowerCase().includes(lower) ||
                (p.active_substance && p.active_substance.toLowerCase().includes(lower)) ||
                (p.sku && p.sku.toLowerCase().includes(lower)) ||
                (p.description && p.description.toLowerCase().includes(lower)) ||
                (p.pharmaceutical_form && p.pharmaceutical_form.toLowerCase().includes(lower)) ||
                (p.categories?.name && p.categories.name.toLowerCase().includes(lower))
            );
        }

        // Ordenar con favoritos al inicio para acceso inmediato en mostrador
        return [...result].sort((a, b) => {
            if (a.is_priority && !b.is_priority) return -1;
            if (!a.is_priority && b.is_priority) return 1;
            return 0;
        });
    }, [products, searchTerm, filterFavoritesOnly, selectedCategory]);

    // Cálculo dinámico de cambio / vuelto considerando el total con descuento
    const receivedAmountCents = useMemo(() => {
        const val = parseFloat(receivedAmountBs);
        return !isNaN(val) && val > 0 ? Math.round(val * 100) : 0;
    }, [receivedAmountBs]);

    const changeAmountCents = useMemo(() => {
        if (paymentMethod !== 'cash' || receivedAmountCents <= 0) return 0;
        return Math.max(0, receivedAmountCents - finalTotalCents);
    }, [paymentMethod, receivedAmountCents, finalTotalCents]);

    const changeAmountBs = useMemo(() => {
        return (changeAmountCents / 100).toFixed(2);
    }, [changeAmountCents]);

    const handleAddToCart = async (product: any) => {
        // 1. Verificación de caducidad (Advertencia con opción de continuar)
        if (product.expiration_date) {
            const exp = new Date(product.expiration_date);
            const today = new Date(); today.setHours(0, 0, 0, 0);

            if (exp < today) {
                const proceed = await confirmDialog({
                    title: '⚠️ Advertencia: Medicamento Vencido',
                    message: `"${product.name}" caducó el ${exp.toLocaleDateString('es-ES')}.\n\nPor normativa sanitaria no se recomienda su venta regular. ¿Deseas autorizar la dispensación y agregarlo al pedido de todas formas?`,
                    confirmText: 'Sí, autorizar y agregar',
                    cancelText: 'No, cancelar',
                    type: 'danger',
                    icon: 'warning',
                });
                if (!proceed) return;
            } else if (exp <= new Date(today.getTime() + 30 * 864e5)) {
                // Alerta de vencimiento próximo (≤ 30 días)
                const proceed = await confirmDialog({
                    title: '⚠️ Aviso FEFO: Vencimiento Próximo',
                    message: `"${product.name}" vence próximamente (${exp.toLocaleDateString('es-ES')}). ¿Deseas confirmar la dispensación al cliente?`,
                    confirmText: 'Sí, dispensar',
                    cancelText: 'Cancelar',
                    type: 'warning',
                    icon: 'event_busy',
                });
                if (!proceed) return;
            }
        }
        // 2. Validación de Stock Físico
        const currentQty = cart.find(i => i.product_id === product.id)?.quantity || 0;
        if (currentQty >= product.stock) {
            toast.warning(`Stock insuficiente para "${product.name}" (solo ${product.stock} disponibles en farmacia)`, 'Límite de Stock');
            return;
        }

        // 3. Alerta de Prescripción Médica (Rx)
        if (product.requires_prescription) {
            toast.info(`Medicamento controlado: Requiere verificar receta médica (${product.name})`, 'Prescripción Médica (Rx)');
        }

        addItem({ product_id: product.id, name: product.name, price_cents: product.price_cents, quantity: 1 });
    };

    const handleUpdateQuantity = (productId: string, delta: number) => {
        const item = cart.find(i => i.product_id === productId);
        if (!item) return;
        const prod = products.find(p => p.id === productId);
        const newQty = item.quantity + delta;
        if (newQty <= 0) { removeItem(productId); return; }
        if (prod && newQty > prod.stock) {
            toast.warning(`Solo hay ${prod.stock} unidades disponibles en inventario de "${prod.name}"`, 'Límite de Stock');
            return;
        }
        updateQuantity(productId, newQty);
    };

    const handleCheckout = async (cashShiftId?: string | null) => {
        if (cart.length === 0 || !user) return;

        // Validar pago en efectivo si ingresó un monto menor al total definitivo con descuento
        if (paymentMethod === 'cash' && receivedAmountBs && receivedAmountCents < finalTotalCents) {
            toast.warning(
                `El monto recibido (Bs ${receivedAmountBs}) es menor al total a pagar con descuento (Bs ${(finalTotalCents / 100).toFixed(2)})`,
                'Efectivo Insuficiente'
            );
            return;
        }

        setIsProcessing(true);
        const cartSnapshot: CartItem[] = JSON.parse(JSON.stringify(cart));
        const finalReceivedCents = paymentMethod === 'cash'
            ? (receivedAmountCents > 0 ? receivedAmountCents : finalTotalCents)
            : finalTotalCents;
        const finalChangeCents = paymentMethod === 'cash' ? changeAmountCents : 0;
        const finalClientName = clientName.trim() || 'Sin Nombre';
        const finalClientNit = clientNit.trim() || '0';

        try {
            const res = await checkout(user.id, paymentMethod, {
                cashShiftId,
                clientName: finalClientName,
                clientNit: finalClientNit,
                receivedAmountCents: finalReceivedCents,
                changeAmountCents: finalChangeCents,
                discountCents,
                discountType,
                discountPercent: discountType === 'percentage' ? parseFloat(discountValue) || 0 : 0,
                discountReason: discountReason.trim(),
            });

            if (res.success) {
                clearCart();
                setClientName('');
                setClientNit('');
                setReceivedAmountBs('');
                clearDiscount();

                toast.success('Venta finalizada y registrada con éxito', 'Ticket Generado');

                await qc.invalidateQueries({ queryKey: ['products-catalog'] });
                qc.invalidateQueries({ queryKey: ['sales-summary'] });
                qc.invalidateQueries({ queryKey: ['consolidated-cash-close'] });
                qc.invalidateQueries({ queryKey: ['cashier-daily-close'] });
                qc.invalidateQueries({ queryKey: ['recent-sales'] });

                setSaleSuccess({
                    id: res.ticket?.sale_id ?? 'PENDIENTE',
                    total: res.ticket?.total_cents ?? finalTotalCents,
                    subtotal: subtotalCents,
                    discount_cents: discountCents,
                    discount_type: discountType,
                    discount_percent: discountType === 'percentage' ? parseFloat(discountValue) || 0 : 0,
                    discount_reason: discountReason.trim(),
                    items: cartSnapshot,
                    client_name: finalClientName,
                    client_nit: finalClientNit,
                    received_amount_cents: finalReceivedCents,
                    change_amount_cents: finalChangeCents,
                });
            } else {
                toast.error(res.error || 'No se pudo procesar la venta', 'Error en Transacción');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const closeSuccessModal = () => setSaleSuccess(null);

    const handleNewSale = () => {
        clearCart();
        setClientName('');
        setClientNit('');
        setReceivedAmountBs('');
        clearDiscount();
        setSaleSuccess(null);
    };

    const handleAfterPrint = () => {
        clearCart();
        setClientName('');
        setClientNit('');
        setReceivedAmountBs('');
        clearDiscount();
        setSaleSuccess(null);
    };

    const handlePrint = () => {
        window.print();
    };

    return {
        products: filteredProducts,
        isLoading,
        cart,
        searchTerm,
        setSearchTerm,
        filterFavoritesOnly,
        setFilterFavoritesOnly,
        favoritesCount,
        selectedCategory,
        setSelectedCategory,
        clientName,
        setClientName,
        clientNit,
        setClientNit,
        receivedAmountBs,
        setReceivedAmountBs,
        changeAmountBs,
        changeAmountCents,
        paymentMethod,
        setPaymentMethod,
        isProcessing,
        isOnline,
        // Cifras y Descuentos
        subtotalCents,
        subtotalBs,
        discountType,
        setDiscountType,
        discountValue,
        setDiscountValue,
        discountReason,
        setDiscountReason,
        discountCents,
        discountBs,
        totalCents: finalTotalCents,
        totalBs,
        applyQuickPercent,
        applyQuickAmount,
        clearDiscount,
        handleAddToCart,
        handleUpdateQuantity,
        removeItem,
        clearCart,
        handleCheckout,
        saleSuccess,
        closeSuccessModal,
        handleNewSale,
        handlePrint,
        handleAfterPrint,
    };
}