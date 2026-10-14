import { useQuery } from '@tanstack/react-query';
import { getProductKardex } from '../services/kardexApi';

export function useProductKardex(productId: string | null) {
    return useQuery({
        queryKey: ['product-kardex', productId],
        queryFn: () => (productId ? getProductKardex(productId) : Promise.resolve([])),
        enabled: Boolean(productId),
    });
}
