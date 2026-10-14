import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProducts, createProduct, updateProduct, deleteProduct, type ProductWithDetails, type CreateProductInput } from '../services/productsApi';
import type { Database } from '@/lib/database.types';

export function useProducts() {
    return useQuery<ProductWithDetails[]>({
        queryKey: ['products-catalog'], // Mantenemos tu llave original para no romper el POS
        queryFn: getProducts,
        staleTime: 1000 * 60 * 5, // 5 minutos de caché para no saturar la BD
    });
}

export function useProductMutations() {
    const qc = useQueryClient();

    const createMut = useMutation({
        mutationFn: (newProduct: CreateProductInput) => createProduct(newProduct),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products-catalog'] });
            qc.invalidateQueries({ queryKey: ['product-kardex'] });
        },
    });

    const updateMut = useMutation({
        mutationFn: ({ id, ...updateData }: { id: string } & Database['public']['Tables']['products']['Update']) => updateProduct(id, updateData),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products-catalog'] });
            qc.invalidateQueries({ queryKey: ['product-kardex'] });
        },
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => deleteProduct(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products-catalog'] });
            qc.invalidateQueries({ queryKey: ['product-kardex'] });
        },
    });

    return { createMut, updateMut, deleteMut };
}