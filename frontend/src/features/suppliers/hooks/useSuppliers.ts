import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../services/suppliersApi';

import type { SupplierPayload } from '../services/suppliersApi';

export function useSuppliers() {
    return useQuery({
        queryKey: ['suppliers'],
        queryFn: getSuppliers,
        staleTime: 1000 * 60, // 1 minuto
        refetchOnMount: 'always',
    });
}

export function useSupplierMutations() {
    const qc = useQueryClient();

    const createMut = useMutation({
        mutationFn: (payload: SupplierPayload | { name: string; contactPhone?: string }) => createSupplier(payload),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, ...payload }: { id: string } & (SupplierPayload | { name: string; contactPhone?: string })) => updateSupplier(id, payload),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => deleteSupplier(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
    });

    return { createMut, updateMut, deleteMut };
}   