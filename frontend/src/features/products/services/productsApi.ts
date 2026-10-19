import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// Tipamos la respuesta base
type ProductRow = Database['public']['Tables']['products']['Row'];

// Extendemos el tipo para decirle a TypeScript que también vendrán los nombres (JOIN)
// Extendemos el tipo para decirle a TypeScript que también vendrán los nombres y lotes
export type ProductWithDetails = ProductRow & {
    categories: { name: string } | null;
    suppliers: { name: string } | null;
    product_batches: Database['public']['Tables']['product_batches']['Row'][];
};

export async function getProducts(): Promise<ProductWithDetails[]> {
    const { data, error } = await supabase
        .from('products')
        .select(`
      *,
      categories (name),
      suppliers (name),
      product_batches (id, lot_number, expiration_date, stock, cost_cents, created_at)
    `)
        .order('created_at', { ascending: false });

    if (error) throw error;
    // Supabase devuelve un array que coincide con nuestra interfaz extendida
    return data as unknown as ProductWithDetails[];
}

// Sanitiza cualquier payload para enviar estrictamente las columnas reales de la tabla 'products'
function sanitizeProductPayload(data: Record<string, any>) {
    const allowed = [
        'name',
        'sku',
        'active_substance',
        'pharmaceutical_form',
        'description',
        'price_cents',
        'box_price_cents',
        'cost_cents',
        'stock',
        'min_stock',
        'is_priority',
        'requires_prescription',
        'expiration_date',
        'category_id',
        'supplier_id',
    ];
    const clean: Record<string, any> = {};
    for (const key of allowed) {
        if (key in data && data[key] !== undefined) {
            clean[key] = data[key];
        }
    }
    return clean;
}

export interface BatchInput {
    id?: string;
    lot_number: string;
    expiration_date: string | null;
    stock: number;
    cost_cents?: number;
}

export type CreateProductInput = Database['public']['Tables']['products']['Insert'] & {
    initial_lot_number?: string;
    batches?: BatchInput[];
};

export async function createProduct(input: CreateProductInput) {
    const { initial_lot_number, batches } = input;
    const productData = sanitizeProductPayload(input);

    // Si vienen lotes especificados, calcular el stock total y el vencimiento más cercano (FEFO)
    if (batches && batches.length > 0) {
        const totalStock = batches.reduce((acc, b) => acc + (Math.max(0, Number(b.stock) || 0)), 0);
        const validDates = batches
            .map(b => b.expiration_date)
            .filter((d): d is string => !!d && d.trim() !== '')
            .sort();
        productData.stock = totalStock;
        productData.expiration_date = validDates.length > 0 ? validDates[0] : null;
    }

    const { data, error } = await supabase
        .from('products')
        .insert([productData])
        .select()
        .single();

    if (error) throw error;

    if (data) {
        try {
            if (batches && batches.length > 0) {
                // Insertar cada lote individual
                const batchInserts = batches.map(b => ({
                    product_id: data.id,
                    lot_number: b.lot_number?.trim() || `LOTE-${new Date().getFullYear()}`,
                    expiration_date: b.expiration_date || null,
                    stock: Math.max(0, Number(b.stock) || 0),
                    cost_cents: data.cost_cents,
                }));
                const { data: insertedBatches, error: bErr } = await supabase
                    .from('product_batches')
                    .insert(batchInserts)
                    .select('id, lot_number, stock');

                if (bErr) throw bErr;

                if (insertedBatches && insertedBatches.length > 0) {
                    const movements = insertedBatches
                        .filter(b => b.stock > 0)
                        .map(b => ({
                            product_id: data.id,
                            batch_id: b.id,
                            movement_type: 'IN',
                            quantity: b.stock,
                            reason: `Carga inicial lote ${b.lot_number}`,
                        }));
                    if (movements.length > 0) {
                        await supabase.from('inventory_movements').insert(movements);
                    }
                }
            } else if (data.stock > 0 || data.expiration_date) {
                // Fallback a lote único
                const lotNumber = initial_lot_number?.trim() || `LOTE-${new Date().getFullYear()}`;
                const { data: insertedSingle, error: sErr } = await supabase
                    .from('product_batches')
                    .insert([{
                        product_id: data.id,
                        lot_number: lotNumber,
                        expiration_date: data.expiration_date,
                        stock: data.stock,
                        cost_cents: data.cost_cents,
                    }])
                    .select('id, lot_number, stock')
                    .single();

                if (sErr) throw sErr;

                if (data.stock > 0) {
                    await supabase.from('inventory_movements').insert([{
                        product_id: data.id,
                        batch_id: insertedSingle?.id || null,
                        movement_type: 'IN',
                        quantity: data.stock,
                        reason: `Carga inicial de inventario (${lotNumber})`,
                    }]);
                }
            }
        } catch (e) {
            console.warn('Registro de lote / movimiento inicial:', e);
        }
    }

    return data;
}

export async function updateProduct(id: string, productData: Database['public']['Tables']['products']['Update'] | Record<string, any>) {
    const { lot_number, initial_lot_number, batches, ...rest } = productData as Record<string, any>;
    const cleanData = sanitizeProductPayload(rest);

    // Si se enviaron lotes múltiples, sincronizarlos
    if (Array.isArray(batches)) {
        const totalStock = batches.reduce((acc, b) => acc + (Math.max(0, Number(b.stock) || 0)), 0);
        const validDates = batches
            .map(b => b.expiration_date)
            .filter((d): d is string => !!d && d.trim() !== '')
            .sort();
        cleanData.stock = totalStock;
        cleanData.expiration_date = validDates.length > 0 ? validDates[0] : null;

        // 1. Actualizar producto consolidado
        const { data, error } = await supabase
            .from('products')
            .update(cleanData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // 2. Sincronizar tabla product_batches y registrar en inventory_movements
        try {
            const { data: existingBatches } = await supabase
                .from('product_batches')
                .select('id, lot_number, stock, expiration_date')
                .eq('product_id', id);

            const existingMap = new Map((existingBatches || []).map(eb => [eb.id, eb]));
            const incomingIds = batches.filter(b => b.id).map(b => b.id);

            // Eliminar lotes removidos por el usuario
            if (existingBatches && existingBatches.length > 0) {
                const toDelete = existingBatches.filter(eb => !incomingIds.includes(eb.id));
                if (toDelete.length > 0) {
                    for (const del of toDelete) {
                        if (del.stock > 0) {
                            await supabase.from('inventory_movements').insert([{
                                product_id: id,
                                batch_id: del.id,
                                movement_type: 'ADJUSTMENT',
                                quantity: -del.stock,
                                reason: `Baja de lote ${del.lot_number} (-${del.stock} uds)`,
                            }]);
                        }
                    }
                    await supabase.from('product_batches').delete().in('id', toDelete.map(d => d.id));
                }
            }

            // Actualizar existentes o insertar nuevos
            for (const b of batches) {
                const formattedLot = b.lot_number?.trim() || `LOTE-${new Date().getFullYear()}`;
                const bStock = Math.max(0, Number(b.stock) || 0);

                if (b.id) {
                    const oldBatch = existingMap.get(b.id);
                    const oldStock = oldBatch ? Number(oldBatch.stock) : 0;
                    const delta = bStock - oldStock;

                    await supabase
                        .from('product_batches')
                        .update({
                            lot_number: formattedLot,
                            expiration_date: b.expiration_date || null,
                            stock: bStock,
                            cost_cents: cleanData.cost_cents ?? data.cost_cents,
                        })
                        .eq('id', b.id);

                    if (delta !== 0) {
                        await supabase.from('inventory_movements').insert([{
                            product_id: id,
                            batch_id: b.id,
                            movement_type: delta > 0 ? 'IN' : 'ADJUSTMENT',
                            quantity: delta,
                            reason: delta > 0
                                ? `Ingreso de existencias lote ${formattedLot} (+${delta} uds)`
                                : `Ajuste de inventario lote ${formattedLot} (${delta} uds)`,
                        }]);
                    }
                } else {
                    // Lote NUEVO
                    const { data: newBatch } = await supabase
                        .from('product_batches')
                        .insert([{
                            product_id: id,
                            lot_number: formattedLot,
                            expiration_date: b.expiration_date || null,
                            stock: bStock,
                            cost_cents: cleanData.cost_cents ?? data.cost_cents,
                        }])
                        .select('id, lot_number, stock')
                        .single();

                    if (newBatch && bStock > 0) {
                        await supabase.from('inventory_movements').insert([{
                            product_id: id,
                            batch_id: newBatch.id,
                            movement_type: 'IN',
                            quantity: bStock,
                            reason: `Ingreso de nuevo lote ${formattedLot} (+${bStock} uds)`,
                        }]);
                    }
                }
            }
        } catch (e) {
            console.warn('Error sincronizando lotes en updateProduct:', e);
        }

        return data;
    }

    // Flujo normal / de lote único o ajuste de existencias
    const { data, error } = await supabase
        .from('products')
        .update(cleanData)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    try {
        const { data: existingBatches } = await supabase
            .from('product_batches')
            .select('id, lot_number, stock')
            .eq('product_id', id)
            .order('created_at', { ascending: false });

        const targetLot = lot_number !== undefined ? lot_number : initial_lot_number;
        const formattedLot = targetLot?.trim() || existingBatches?.[0]?.lot_number || `LOTE-${new Date().getFullYear()}`;

        if (existingBatches && existingBatches.length > 0) {
            const latestBatch = existingBatches[0];
            const oldTotalStock = existingBatches.reduce((acc, b) => acc + (b.stock || 0), 0);
            const newStockVal = cleanData.stock !== undefined ? cleanData.stock : data.stock;
            const delta = newStockVal - oldTotalStock;

            const updatedStock = Math.max(0, latestBatch.stock + delta);
            await supabase
                .from('product_batches')
                .update({
                    lot_number: formattedLot,
                    expiration_date: cleanData.expiration_date !== undefined ? cleanData.expiration_date : undefined,
                    stock: updatedStock,
                    cost_cents: cleanData.cost_cents ?? data.cost_cents,
                })
                .eq('id', latestBatch.id);

            if (delta !== 0) {
                await supabase.from('inventory_movements').insert([{
                    product_id: id,
                    batch_id: latestBatch.id,
                    movement_type: delta > 0 ? 'IN' : 'ADJUSTMENT',
                    quantity: delta,
                    reason: delta > 0 ? `Ajuste de existencias (+${delta} uds)` : `Ajuste de inventario (${delta} uds)`,
                }]);
            }
        } else if (cleanData.stock !== undefined || targetLot?.trim() || cleanData.expiration_date) {
            const initialStock = cleanData.stock ?? data.stock;
            const { data: newBatch } = await supabase
                .from('product_batches')
                .insert([{
                    product_id: id,
                    lot_number: formattedLot,
                    expiration_date: cleanData.expiration_date ?? null,
                    stock: initialStock,
                    cost_cents: cleanData.cost_cents ?? data.cost_cents,
                }])
                .select('id')
                .single();

            if (newBatch && initialStock > 0) {
                await supabase.from('inventory_movements').insert([{
                    product_id: id,
                    batch_id: newBatch.id,
                    movement_type: 'IN',
                    quantity: initialStock,
                    reason: `Carga de existencias (${formattedLot})`,
                }]);
            }
        }
    } catch (e) {
        console.warn('Error sincronizando product_batches en updateProduct:', e);
    }

    return data;
}

export async function deleteProduct(id: string) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
}