import { supabase } from '@/lib/supabase';

export interface CriticalStockItem {
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    min_stock: number;
    faltante: number;
    laboratory: string;
    category: string;
}

export interface ExpiringItem {
    id: string; // batch ID (or product ID if legacy)
    productId: string;
    lot_number: string | null;
    name: string;
    sku: string | null;
    stock: number; // Unidades específicas de este lote
    totalProductStock: number; // Stock consolidado del producto
    expiration_date: string;
    diffDays: number;
    status: 'vencido' | 'urgente' | 'proximo' | 'vigente';
    laboratory: string;
    category: string;
}

export interface DashboardMetrics {
    // Ventas
    totalSalesTodayCents: number;
    totalSalesYesterdayCents: number;
    vsYesterdayPct: number | null;
    totalTicketsToday: number;
    avgTicketCents: number;
    
    // Métodos de pago hoy
    paymentBreakdown: {
        cashCents: number;
        cardCents: number;
        qrCents: number;
    };

    // Horas pico de ventas
    hourlyDistribution: {
        hour: number;
        label: string;
        count: number;
        totalCents: number;
    }[];
    peakHour: { hour: number; label: string; totalCents: number; count: number } | null;

    // Estado del Turno / Caja
    activeShift: {
        id: string;
        user_id: string;
        opening_amount_cents: number;
        status: string;
        opened_at: string;
        cashier_name: string;
        cash_sales_cents: number;
    } | null;

    // Listas completas para las tablas del dashboard (foto de referencia)
    criticalStockProducts: CriticalStockItem[];
    expiringProducts: ExpiringItem[];
    expiredLotsCount: number;
    urgentLotsCount: number;

    // Laboratorios únicos para los dropdowns de filtro
    laboratoriesList: string[];

    // Transacciones recientes
    recentSales: {
        id: string;
        total_cents: number;
        payment_method: string;
        status: string;
        created_at: string;
        cashier_name: string;
    }[];
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
    const now = new Date();

    // Rango hoy (hora local)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0).toISOString();

    // Rango ayer (hora local)
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).toISOString();
    const endOfYesterday = startOfToday;

    // 1. Ventas de Hoy
    const { data: salesToday = [], error: salesTodayError } = await supabase
        .from('sales')
        .select('id, total_cents, payment_method, status, created_at, user_id')
        .gte('created_at', startOfToday)
        .lt('created_at', endOfToday);

    if (salesTodayError) throw salesTodayError;

    // 2. Ventas de Ayer (para comparativa)
    const { data: salesYesterday = [], error: salesYesterdayError } = await supabase
        .from('sales')
        .select('total_cents, status')
        .gte('created_at', startOfYesterday)
        .lt('created_at', endOfYesterday);

    if (salesYesterdayError) throw salesYesterdayError;

    // Filtrar completadas (no anuladas)
    const completedToday = (salesToday || []).filter(s => s.status !== 'cancelled');
    const completedYesterday = (salesYesterday || []).filter(s => s.status !== 'cancelled');

    const totalSalesTodayCents = completedToday.reduce((sum, s) => sum + s.total_cents, 0);
    const totalSalesYesterdayCents = completedYesterday.reduce((sum, s) => sum + s.total_cents, 0);
    const totalTicketsToday = completedToday.length;
    const avgTicketCents = totalTicketsToday > 0 ? Math.round(totalSalesTodayCents / totalTicketsToday) : 0;

    let vsYesterdayPct: number | null = null;
    if (totalSalesYesterdayCents > 0) {
        vsYesterdayPct = Math.round(((totalSalesTodayCents - totalSalesYesterdayCents) / totalSalesYesterdayCents) * 100);
    } else if (totalSalesTodayCents > 0) {
        vsYesterdayPct = 100;
    } else {
        vsYesterdayPct = 0;
    }

    // Desglose por método de pago
    let cashCents = 0;
    let cardCents = 0;
    let qrCents = 0;

    completedToday.forEach(s => {
        if (s.payment_method === 'card') cardCents += s.total_cents;
        else if (s.payment_method === 'qr') qrCents += s.total_cents;
        else cashCents += s.total_cents;
    });

    // Distribución horaria (8:00 a 22:00)
    const hourlyMap: { [hour: number]: { count: number; totalCents: number } } = {};
    for (let h = 8; h <= 22; h++) {
        hourlyMap[h] = { count: 0, totalCents: 0 };
    }

    completedToday.forEach(sale => {
        const d = new Date(sale.created_at);
        const hour = d.getHours();
        if (hourlyMap[hour] !== undefined) {
            hourlyMap[hour].count += 1;
            hourlyMap[hour].totalCents += sale.total_cents;
        }
    });

    const hourlyDistribution = Object.keys(hourlyMap).map(hStr => {
        const h = parseInt(hStr, 10);
        return {
            hour: h,
            label: `${h}:00`,
            count: hourlyMap[h].count,
            totalCents: hourlyMap[h].totalCents
        };
    });

    let peakHour: { hour: number; label: string; totalCents: number; count: number } | null = null;
    const activeHours = hourlyDistribution.filter(h => h.totalCents > 0);
    if (activeHours.length > 0) {
        const sorted = [...activeHours].sort((a, b) => b.totalCents - a.totalCents);
        peakHour = sorted[0];
    }

    // 3. Turno de Caja Activo
    const { data: rawActiveShift } = await supabase
        .from('cash_shifts')
        .select(`
            id,
            user_id,
            opening_amount_cents,
            status,
            opened_at,
            user_profiles (full_name)
        `)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const activeShift = rawActiveShift ? {
        id: rawActiveShift.id,
        user_id: rawActiveShift.user_id,
        opening_amount_cents: rawActiveShift.opening_amount_cents,
        status: rawActiveShift.status,
        opened_at: rawActiveShift.opened_at,
        cashier_name: (rawActiveShift.user_profiles as any)?.full_name || 'Cajero de Turno',
        cash_sales_cents: cashCents,
    } : null;

    // 4. Catálogo Completo de Productos con Categoría y Proveedor / Laboratorio
    const { data: allProducts = [] } = await supabase
        .from('products')
        .select(`
            id,
            name,
            sku,
            stock,
            min_stock,
            expiration_date,
            categories (name),
            suppliers (name)
        `)
        .order('name', { ascending: true });

    // Extraer laboratorios únicos para los dropdowns
    const labsSet = new Set<string>();
    (allProducts || []).forEach(p => {
        const labName = (p.suppliers as any)?.name;
        if (labName) labsSet.add(labName);
    });
    const laboratoriesList = Array.from(labsSet).sort();

    // Productos con Stock Bajo (quiebres y bajo mínimo)
    const criticalStockProducts: CriticalStockItem[] = (allProducts || [])
        .filter(p => p.stock <= (p.min_stock ?? 3))
        .map(p => {
            const min = p.min_stock ?? 3;
            const faltante = Math.max(0, min - p.stock);
            return {
                id: p.id,
                name: p.name,
                sku: p.sku,
                stock: p.stock,
                min_stock: min,
                faltante,
                laboratory: (p.suppliers as any)?.name || 'Sin Laboratorio',
                category: (p.categories as any)?.name || 'Venta Libre',
            };
        })
        .sort((a, b) => a.stock - b.stock);

    // 5. Lotes Activos Próximos a Vencer (Control FEFO: product_batches con stock > 0)
    const ninetyDaysAhead = new Date();
    ninetyDaysAhead.setDate(now.getDate() + 90);

    const { data: activeBatches = [] } = await supabase
        .from('product_batches')
        .select(`
            id,
            product_id,
            lot_number,
            expiration_date,
            stock,
            products (
                id,
                name,
                sku,
                stock,
                categories (name),
                suppliers (name)
            )
        `)
        .gt('stock', 0)
        .not('expiration_date', 'is', null)
        .order('expiration_date', { ascending: true });

    const expiringProducts: ExpiringItem[] = [];
    const productsWithBatches = new Set<string>();

    (activeBatches || []).forEach(batch => {
        if (!batch.expiration_date || !batch.products) return;
        const exp = new Date(batch.expiration_date);
        if (exp > ninetyDaysAhead) return;

        productsWithBatches.add(batch.product_id);

        const diffMs = exp.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        let status: 'vencido' | 'urgente' | 'proximo' | 'vigente' = 'vigente';
        if (diffDays <= 0) status = 'vencido';
        else if (diffDays <= 15) status = 'urgente';
        else if (diffDays <= 30) status = 'proximo';

        const p = batch.products as any;
        expiringProducts.push({
            id: batch.id,
            productId: p.id,
            lot_number: batch.lot_number || 'S/L',
            name: p.name,
            sku: p.sku,
            stock: batch.stock,
            totalProductStock: p.stock ?? batch.stock,
            expiration_date: batch.expiration_date,
            diffDays,
            status,
            laboratory: p.suppliers?.name || 'Sin Laboratorio',
            category: p.categories?.name || 'Venta Libre',
        });
    });

    // Fallback: productos que tengan expiration_date en la tabla products pero aún no en product_batches
    (allProducts || []).forEach(p => {
        if (!p.expiration_date || productsWithBatches.has(p.id) || (p.stock ?? 0) <= 0) return;
        const exp = new Date(p.expiration_date);
        if (exp > ninetyDaysAhead) return;

        const diffMs = exp.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        let status: 'vencido' | 'urgente' | 'proximo' | 'vigente' = 'vigente';
        if (diffDays <= 0) status = 'vencido';
        else if (diffDays <= 15) status = 'urgente';
        else if (diffDays <= 30) status = 'proximo';

        expiringProducts.push({
            id: p.id,
            productId: p.id,
            lot_number: 'General',
            name: p.name,
            sku: p.sku,
            stock: p.stock,
            totalProductStock: p.stock,
            expiration_date: p.expiration_date,
            diffDays,
            status,
            laboratory: (p.suppliers as any)?.name || 'Sin Laboratorio',
            category: (p.categories as any)?.name || 'Venta Libre',
        });
    });

    expiringProducts.sort((a, b) => a.diffDays - b.diffDays);
    const expiredLotsCount = expiringProducts.filter(i => i.diffDays <= 0).length;
    const urgentLotsCount = expiringProducts.filter(i => i.diffDays > 0 && i.diffDays <= 30).length;

    // 6. Transacciones Recientes (con nombre de cajero)
    const { data: rawRecentSales = [] } = await supabase
        .from('sales')
        .select(`
            id,
            total_cents,
            payment_method,
            status,
            created_at,
            user_profiles!sales_user_id_fkey (full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

    const recentSales = (rawRecentSales || []).map(s => ({
        id: s.id,
        total_cents: s.total_cents,
        payment_method: s.payment_method || 'cash',
        status: s.status || 'completed',
        created_at: s.created_at,
        cashier_name: (s.user_profiles as any)?.full_name || 'Desconocido',
    }));

    return {
        totalSalesTodayCents,
        totalSalesYesterdayCents,
        vsYesterdayPct,
        totalTicketsToday,
        avgTicketCents,
        paymentBreakdown: {
            cashCents,
            cardCents,
            qrCents
        },
        hourlyDistribution,
        peakHour,
        activeShift,
        criticalStockProducts,
        expiringProducts,
        expiredLotsCount,
        urgentLotsCount,
        laboratoriesList,
        recentSales
    };
}

/**
 * Registra el ingreso de un nuevo lote físico para un producto con stock bajo,
 * actualizando existencias, lotes y registrando el movimiento de entrada en el Kardex.
 */
export async function addBatchToProduct(params: {
    productId: string;
    lotNumber: string;
    expirationDate: string;
    quantity: number;
    costCents?: number;
}) {
    const { productId, lotNumber, expirationDate, quantity, costCents = 0 } = params;
    if (quantity <= 0) throw new Error('La cantidad a ingresar debe ser mayor a cero.');

    // 1. Obtener producto actual
    const { data: prod, error: prodErr } = await supabase
        .from('products')
        .select('id, stock, cost_cents, expiration_date')
        .eq('id', productId)
        .single();
    if (prodErr || !prod) throw new Error('Producto no encontrado.');

    // 2. Verificar si ya existe un lote idéntico para este producto
    const { data: existingBatch } = await supabase
        .from('product_batches')
        .select('id, stock')
        .eq('product_id', productId)
        .eq('lot_number', lotNumber)
        .eq('expiration_date', expirationDate)
        .maybeSingle();

    let batchId: string;
    if (existingBatch) {
        batchId = existingBatch.id;
        const { error: updBatchErr } = await supabase
            .from('product_batches')
            .update({ stock: existingBatch.stock + quantity })
            .eq('id', batchId);
        if (updBatchErr) throw updBatchErr;
    } else {
        const { data: newBatch, error: insBatchErr } = await supabase
            .from('product_batches')
            .insert({
                product_id: productId,
                lot_number: lotNumber.trim(),
                expiration_date: expirationDate,
                stock: quantity,
                cost_cents: costCents || prod.cost_cents || 0,
            })
            .select('id')
            .single();
        if (insBatchErr || !newBatch) throw insBatchErr || new Error('No se pudo registrar el lote');
        batchId = newBatch.id;
    }

    // 3. Actualizar producto consolidado
    const newProductStock = (prod.stock || 0) + quantity;
    let newMinExp = prod.expiration_date;
    if (!newMinExp || new Date(expirationDate) < new Date(newMinExp)) {
        newMinExp = expirationDate;
    }

    const { error: updProdErr } = await supabase
        .from('products')
        .update({
            stock: newProductStock,
            expiration_date: newMinExp,
        })
        .eq('id', productId);
    if (updProdErr) throw updProdErr;

    // 4. Registrar movimiento en Kardex
    const { error: movErr } = await supabase
        .from('inventory_movements')
        .insert({
            product_id: productId,
            batch_id: batchId,
            movement_type: 'IN',
            quantity: quantity,
            reason: `Ingreso de lote ${lotNumber} desde Panel de Control`,
        });
    if (movErr) console.warn('No se pudo registrar movimiento en Kardex:', movErr);

    return { success: true, batchId };
}

/**
 * Da de baja o retira unidades de un lote vencido o deteriorado,
 * descontando de la tabla de lotes y registrando la salida por merma en el Kardex.
 */
export async function writeOffBatch(params: {
    productId: string;
    batchId: string;
    quantity: number;
    reason: string;
    lotNumber?: string;
}) {
    const { productId, batchId, quantity, reason, lotNumber = 'S/L' } = params;
    if (quantity <= 0) throw new Error('La cantidad a retirar debe ser mayor a cero.');

    // 1. Obtener lote y producto
    const { data: batch, error: batchErr } = await supabase
        .from('product_batches')
        .select('id, stock')
        .eq('id', batchId)
        .single();
    if (batchErr || !batch) throw new Error('Lote no encontrado.');

    const { data: prod, error: prodErr } = await supabase
        .from('products')
        .select('id, stock')
        .eq('id', productId)
        .single();
    if (prodErr || !prod) throw new Error('Producto no encontrado.');

    const deductQty = Math.min(quantity, batch.stock);
    if (deductQty <= 0) throw new Error('Este lote ya no cuenta con existencias disponibles.');

    // 2. Descontar lote
    const { error: updBatchErr } = await supabase
        .from('product_batches')
        .update({ stock: batch.stock - deductQty })
        .eq('id', batchId);
    if (updBatchErr) throw updBatchErr;

    // 3. Descontar producto consolidado
    const newProdStock = Math.max(0, (prod.stock || 0) - deductQty);
    
    // Recalcular vencimiento FEFO más cercano entre lotes activos restantes
    const { data: remainingBatches } = await supabase
        .from('product_batches')
        .select('expiration_date')
        .eq('product_id', productId)
        .gt('stock', 0)
        .order('expiration_date', { ascending: true })
        .limit(1);

    const earliestExp = remainingBatches && remainingBatches.length > 0
        ? remainingBatches[0].expiration_date
        : null;

    const { error: updProdErr } = await supabase
        .from('products')
        .update({
            stock: newProdStock,
            expiration_date: earliestExp,
        })
        .eq('id', productId);
    if (updProdErr) throw updProdErr;

    // 4. Registrar salida en Kardex
    const { error: movErr } = await supabase
        .from('inventory_movements')
        .insert({
            product_id: productId,
            batch_id: batchId,
            movement_type: 'OUT',
            quantity: -deductQty,
            reason: reason || `Baja clínica lote ${lotNumber} por caducidad/merma`,
        });
    if (movErr) console.warn('No se pudo registrar salida en Kardex:', movErr);

    return { success: true, deducted: deductQty };
}