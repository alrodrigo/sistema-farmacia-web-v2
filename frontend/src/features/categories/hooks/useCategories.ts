import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCategories, createCategory, updateCategory, deleteCategory } from '../services/categoriesApi';

import type { CategoryPayload } from '../services/categoriesApi';

export function useCategories() {
    return useQuery({
        queryKey: ['categories'],
        queryFn: getCategories,
        staleTime: 1000 * 60, // 1 minuto
        refetchOnMount: 'always',
    });
}

export function useCategoriesMutations() {
    const qc = useQueryClient();

    const createMut = useMutation({
        mutationFn: (payload: CategoryPayload | { name: string }) => createCategory(payload),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, ...payload }: { id: string } & (CategoryPayload | { name: string })) => updateCategory(id, payload),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => deleteCategory(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    });

    return { createMut, updateMut, deleteMut };
}       