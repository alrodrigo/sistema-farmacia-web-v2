import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    getSalesSummary,
    getTopProducts,
    getSalesByCashier,
    getDailySales,
    getStockAlerts,
    getProfitMargins,
    type DateRange,
} from '../services/reportsApi';
export type {
    DateRange,
    SalesSummary,
    TopProduct,
    SalesByCashier,
    DailySales,
    StockAlert,
    ProfitMargin,
} from '../services/reportsApi';
import { getConsolidatedCashClose } from '@/features/pos/services/cashCloseApi';

function toLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function useDateRange() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    const [range, setRange] = useState<DateRange>({
        from: toLocalDateString(firstDay),
        to: toLocalDateString(today),
    });

    const setPreset = (preset: 'today' | 'week' | 'month' | 'year') => {
        const end = new Date();
        const start = new Date();

        switch (preset) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'week':
                start.setDate(start.getDate() - 6);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'month':
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'year':
                start.setMonth(0, 1);
                start.setHours(0, 0, 0, 0);
                end.setMonth(11, 31);
                end.setHours(23, 59, 59, 999);
                break;
        }

        setRange({
            from: toLocalDateString(start),
            to: toLocalDateString(end),
        });
    };

    return { range, setRange, setPreset };
}

export function useSalesSummary(range: DateRange) {
    return useQuery({
        queryKey: ['sales-summary', range.from, range.to],
        queryFn: () => getSalesSummary(range),
        staleTime: 1000 * 60 * 2,
    });
}

export function useTopProducts(range: DateRange, limit = 10) {
    return useQuery({
        queryKey: ['top-products', range.from, range.to, limit],
        queryFn: () => getTopProducts(range, limit),
        staleTime: 1000 * 60 * 2,
    });
}

export function useSalesByCashier(range: DateRange) {
    return useQuery({
        queryKey: ['sales-by-cashier', range.from, range.to],
        queryFn: () => getSalesByCashier(range),
        staleTime: 1000 * 60 * 2,
    });
}

export function useDailySales(range: DateRange) {
    return useQuery({
        queryKey: ['daily-sales', range.from, range.to],
        queryFn: () => getDailySales(range),
        staleTime: 1000 * 60 * 2,
    });
}

export function useStockAlerts() {
    return useQuery({
        queryKey: ['stock-alerts'],
        queryFn: () => getStockAlerts(),
        staleTime: 1000 * 60 * 5,
        refetchInterval: 1000 * 60 * 5,
    });
}

export function useProfitMargins(range: DateRange) {
    return useQuery({
        queryKey: ['profit-margins', range.from, range.to],
        queryFn: () => getProfitMargins(range),
        staleTime: 1000 * 60 * 2,
    });
}

export function useConsolidatedCashClose(from: string, to: string, filterUserId?: string) {
    return useQuery({
        queryKey: ['consolidated-cash-close', from, to, filterUserId],
        queryFn: () => getConsolidatedCashClose(from, to, filterUserId),
        staleTime: 1000 * 60 * 2,
    });
}