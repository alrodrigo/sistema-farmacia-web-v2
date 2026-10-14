import { create } from 'zustand';

export interface ConfirmModalOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    icon?: string;
}

interface ConfirmModalState {
    isOpen: boolean;
    options: ConfirmModalOptions;
    resolveRef: ((value: boolean) => void) | null;
    ask: (options: ConfirmModalOptions) => Promise<boolean>;
    handleConfirm: () => void;
    handleCancel: () => void;
}

const DEFAULT_OPTIONS: ConfirmModalOptions = {
    title: 'Confirmación requerida',
    message: '¿Estás seguro de que deseas continuar con esta acción?',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: 'warning',
};

export const useConfirmModalStore = create<ConfirmModalState>((set, get) => ({
    isOpen: false,
    options: DEFAULT_OPTIONS,
    resolveRef: null,
    ask: (options) => {
        return new Promise<boolean>((resolve) => {
            set({
                isOpen: true,
                options: {
                    ...DEFAULT_OPTIONS,
                    ...options,
                    icon: options.icon || (options.type === 'danger' ? 'delete_forever' : options.type === 'warning' ? 'warning' : 'info'),
                },
                resolveRef: resolve,
            });
        });
    },
    handleConfirm: () => {
        const resolve = get().resolveRef;
        set({ isOpen: false, resolveRef: null });
        if (resolve) resolve(true);
    },
    handleCancel: () => {
        const resolve = get().resolveRef;
        set({ isOpen: false, resolveRef: null });
        if (resolve) resolve(false);
    },
}));

// Helper rápido tipo `const ok = await confirmDialog({ ... })`
export const confirmDialog = (options: ConfirmModalOptions): Promise<boolean> => {
    return useConfirmModalStore.getState().ask(options);
};
