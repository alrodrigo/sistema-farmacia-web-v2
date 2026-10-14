// src/features/dashboard/hooks/useDashboard.ts
import { useQuery } from '@tanstack/react-query';
import { getDashboardMetrics } from '../services/dashboardApi';

export function useDashboard() {
    return useQuery({
        queryKey: ['dashboard-metrics-v2'],
        queryFn: getDashboardMetrics,
        staleTime: 1000 * 30, // 30 segundos
        refetchOnMount: 'always',
        refetchInterval: 1000 * 60, // Auto-refresco cada 1 minuto
    });
}