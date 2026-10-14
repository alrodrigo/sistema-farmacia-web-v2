import { supabase } from '@/lib/supabase';

export interface DateRange {
    from: string; // ISO date string (YYYY-MM-DD)
    to: string;   // ISO date string (YYYY-MM-DD)
}

export interface SalesSummary {
    total_sales_cents: number;
    total_discount_cents: number;
    gross_sales_cents: number;
    total_tickets: number;
    avg_ticket_cents: number;
    total_items_sold: number;
}

export interface TopProduct {
    product_id: string;
    name: string;
    sku: string | null;
    category: string | null;
    total_quantity: number;
    total_revenue_cents: number;
    margin_percent: number;
}

export interface SalesByCashier {
    user_id: string;
    cashier_name: string;
    total_tickets: number;
    total_sales_cents: number;
    avg_ticket_cents: number;
}

export interface DailySales {
    date: string;
    total_cents: number;
    tickets: number;
}

export interface StockAlert {
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    min_stock: number;
    expiration_date: string | null;
    category: string | null;
    supplier: string | null;
    alert_type: 'low_stock' | 'expiring' | 'expired';
}

export interface ProfitMargin {
    product_id: string;
    name: string;
    category: string | null;
    cost_cents: number;
    price_cents: number;
    margin_cents: number;
    margin_percent: number;
    total_sold: number;
    total_profit_cents: number;
}

function toTimestamp(range: DateRange) {
    const [fy, fm, fd] = range.from.split('-').map(Number);
    const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);

    const [ty, tm, td] = range.to.split('-').map(Number);
    const end = new Date(ty, tm - 1, td, 23, 59, 59, 999);

    return { from: start.toISOString(), to: end.toISOString() };
}

function formatLocalYmd(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export async function getSalesSummary(range: DateRange): Promise<SalesSummary> {
    const { from, to } = toTimestamp(range);

    const { data: sales, error } = await supabase
        .from('sales')
        .select('total_cents, discount_cents, id')
        .gte('created_at', from)
        .lte('created_at', to)
        .neq('status', 'cancelled');

    if (error) throw error;

    const saleIds = sales?.map(s => s.id) || [];
    if (saleIds.length === 0) {
        return {
            total_sales_cents: 0,
            total_discount_cents: 0,
            gross_sales_cents: 0,
            total_tickets: 0,
            avg_ticket_cents: 0,
            total_items_sold: 0,
        };
    }

    const { data: details, error: detailsError } = await supabase
        .from('sale_details')
        .select('quantity, sale_id, unit_price_cents')
        .in('sale_id', saleIds);

    if (detailsError) throw detailsError;

    const total_sales_cents = sales?.reduce((sum, s) => sum + s.total_cents, 0) || 0;
    const total_discount_cents = sales?.reduce((sum, s) => sum + (s.discount_cents || 0), 0) || 0;
    const gross_sales_cents = total_sales_cents + total_discount_cents;
    const total_tickets = sales?.length || 0;
    const total_items_sold = details?.reduce((sum, d) => sum + d.quantity, 0) || 0;

    return {
        total_sales_cents,
        total_discount_cents,
        gross_sales_cents,
        total_tickets,
        avg_ticket_cents: total_tickets > 0 ? Math.round(total_sales_cents / total_tickets) : 0,
        total_items_sold,
    };
}

export async function getTopProducts(range: DateRange, limit = 10): Promise<TopProduct[]> {
    const { from, to } = toTimestamp(range);

    const { data: details, error } = await supabase
        .from('sale_details')
        .select(`
            quantity,
            unit_price_cents,
            products!inner (
                id,
                name,
                sku,
                cost_cents,
                categories (name)
            ),
            sales!inner (
                created_at,
                status
            )
        `)
        .gte('sales.created_at', from)
        .lte('sales.created_at', to)
        .neq('sales.status', 'cancelled')
        .limit(1000);

    if (error) throw error;

    const aggregated = new Map<string, { name: string; sku: string | null; category: string | null; cost_cents: number; total_qty: number; total_rev: number }>();

    details?.forEach(d => {
        const p = d.products as any;
        const key = p.id;
        const existing = aggregated.get(key) || { name: p.name, sku: p.sku, category: p.categories?.name || null, cost_cents: p.cost_cents, total_qty: 0, total_rev: 0 };
        existing.total_qty += d.quantity;
        existing.total_rev += d.unit_price_cents * d.quantity;
        aggregated.set(key, existing);
    });

    return Array.from(aggregated.entries())
        .map(([product_id, v]) => {
            const margin_cents = v.total_rev - v.cost_cents * v.total_qty;
            const margin_percent = v.total_rev > 0 ? Math.round((margin_cents / v.total_rev) * 100) : 0;
            return {
                product_id,
                name: v.name,
                sku: v.sku,
                category: v.category,
                total_quantity: v.total_qty,
                total_revenue_cents: v.total_rev,
                margin_percent,
            };
        })
        .sort((a, b) => b.total_quantity - a.total_quantity)
        .slice(0, limit);
}

export async function getSalesByCashier(range: DateRange): Promise<SalesByCashier[]> {
    const { from, to } = toTimestamp(range);

    const { data, error } = await supabase
        .from('sales')
        .select(`
            id,
            total_cents,
            user_id,
            user_profiles!sales_user_id_fkey (full_name)
        `)
        .gte('created_at', from)
        .lte('created_at', to)
        .neq('status', 'cancelled');

    if (error) throw error;

    const aggregated = new Map<string, { name: string; tickets: number; total: number }>();

    data?.forEach(s => {
        const u = s.user_profiles as any;
        const key = s.user_id;
        const existing = aggregated.get(key) || { name: u?.full_name || 'Desconocido', tickets: 0, total: 0 };
        existing.tickets += 1;
        existing.total += s.total_cents;
        aggregated.set(key, existing);
    });

    return Array.from(aggregated.entries())
        .map(([user_id, v]) => ({
            user_id,
            cashier_name: v.name,
            total_tickets: v.tickets,
            total_sales_cents: v.total,
            avg_ticket_cents: v.tickets > 0 ? Math.round(v.total / v.tickets) : 0,
        }))
        .sort((a, b) => b.total_sales_cents - a.total_sales_cents);
}

export async function getDailySales(range: DateRange): Promise<DailySales[]> {
    const { from, to } = toTimestamp(range);

    const { data, error } = await supabase
        .from('sales')
        .select('created_at, total_cents')
        .gte('created_at', from)
        .lte('created_at', to)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });

    if (error) throw error;

    const dailyMap = new Map<string, { total: number; tickets: number }>();

    data?.forEach(s => {
        const date = formatLocalYmd(new Date(s.created_at));
        const existing = dailyMap.get(date) || { total: 0, tickets: 0 };
        existing.total += s.total_cents;
        existing.tickets += 1;
        dailyMap.set(date, existing);
    });

    return Array.from(dailyMap.entries())
        .map(([date, v]) => ({ date, total_cents: v.total, tickets: v.tickets }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getStockAlerts(): Promise<StockAlert[]> {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const endDate = thirtyDays.toISOString().split('T')[0];

    type ProductWithRelations = {
        id: string;
        name: string;
        sku: string | null;
        stock: number;
        min_stock: number | null;
        expiration_date: string | null;
        categories: { name: string } | null;
        suppliers: { name: string } | null;
    };

    // Fetch products with stock > 0 and min_stock > 0 for low-stock check
    // Column-to-column comparison (stock <= min_stock) not supported in PostgREST filters,
    // so we filter in JS after fetching candidates.
    const [{ data: candidates, error: candidatesError }, { data: expiring, error: expError }] = await Promise.all([
        supabase
            .from('products')
            .select(`
                id, name, sku, stock, min_stock, expiration_date,
                categories (name),
                suppliers (name)
            `)
            .gt('stock', 0)
            .gt('min_stock', 0)
            .order('stock', { ascending: true })
            .returns<ProductWithRelations[]>(),
        supabase
            .from('products')
            .select(`
                id, name, sku, stock, min_stock, expiration_date,
                categories (name),
                suppliers (name)
            `)
            .not('expiration_date', 'is', null)
            .lte('expiration_date', endDate)
            .gt('stock', 0)
            .order('expiration_date', { ascending: true })
            .returns<ProductWithRelations[]>(),
    ]);

    if (candidatesError) throw candidatesError;
    if (expError) throw expError;

    const alerts: StockAlert[] = [];

    // Low stock: filter where stock <= min_stock
    const lowStock = candidates?.filter(p => p.stock <= (p.min_stock ?? 0)) || [];
    lowStock.forEach(p => {
        alerts.push({
            id: p.id,
            name: p.name,
            sku: p.sku,
            stock: p.stock,
            min_stock: p.min_stock ?? 0,
            expiration_date: p.expiration_date,
            category: p.categories?.name ?? null,
            supplier: p.suppliers?.name ?? null,
            alert_type: 'low_stock',
        });
    });

    expiring?.forEach(p => {
        const expDate = p.expiration_date || '';
        const isExpired = expDate < today;
        alerts.push({
            id: p.id,
            name: p.name,
            sku: p.sku,
            stock: p.stock,
            min_stock: p.min_stock ?? 0,
            expiration_date: p.expiration_date,
            category: p.categories?.name ?? null,
            supplier: p.suppliers?.name ?? null,
            alert_type: isExpired ? 'expired' : 'expiring',
        });
    });

    return alerts;
}

export async function getProfitMargins(range: DateRange): Promise<ProfitMargin[]> {
    const { from, to } = toTimestamp(range);

    const { data: details, error } = await supabase
        .from('sale_details')
        .select(`
            quantity,
            unit_price_cents,
            products!inner (
                id,
                name,
                cost_cents,
                categories (name)
            ),
            sales!inner (
                created_at
            )
        `)
        .gte('sales.created_at', from)
        .lt('sales.created_at', to)
        .limit(1000);

    if (error) throw error;

    const aggregated = new Map<string, { name: string; category: string | null; cost_cents: number; price_cents: number; total_qty: number; total_rev: number }>();

    details?.forEach(d => {
        const p = d.products as any;
        const key = p.id;
        const existing = aggregated.get(key) || { name: p.name, category: p.categories?.name || null, cost_cents: p.cost_cents, price_cents: d.unit_price_cents, total_qty: 0, total_rev: 0 };
        existing.total_qty += d.quantity;
        existing.total_rev += d.unit_price_cents * d.quantity;
        aggregated.set(key, existing);
    });

    return Array.from(aggregated.entries())
        .map(([product_id, v]) => {
            const margin_cents = v.price_cents - v.cost_cents;
            const margin_percent = v.price_cents > 0 ? Math.round((margin_cents / v.price_cents) * 100) : 0;
            const total_profit_cents = margin_cents * v.total_qty;
            return {
                product_id,
                name: v.name,
                category: v.category,
                cost_cents: v.cost_cents,
                price_cents: v.price_cents,
                margin_cents,
                margin_percent,
                total_sold: v.total_qty,
                total_profit_cents,
            };
        })
        .sort((a, b) => b.total_profit_cents - a.total_profit_cents);
}