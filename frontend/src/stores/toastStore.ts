import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
    id: string;
    type: ToastType;
    title?: string;
    message: string;
    duration?: number;
    createdAt: number;
}

interface ToastStore {
    toasts: ToastMessage[];
    addToast: (toast: Omit<ToastMessage, 'id' | 'createdAt'>) => string;
    removeToast: (id: string) => void;
    clearAll: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
    toasts: [],
    addToast: (toast) => {
        const id = 'toast_' + Math.random().toString(36).substring(2, 9);
        const newToast: ToastMessage = {
            ...toast,
            id,
            duration: toast.duration ?? 4000,
            createdAt: Date.now(),
        };

        set((state) => ({
            toasts: [...state.toasts.slice(-4), newToast], // Mantener máximo 5 toasts a la vez
        }));

        if (newToast.duration && newToast.duration > 0) {
            setTimeout(() => {
                set((state) => ({
                    toasts: state.toasts.filter((t) => t.id !== id),
                }));
            }, newToast.duration);
        }

        return id;
    },
    removeToast: (id) =>
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        })),
    clearAll: () => set({ toasts: [] }),
}));

// Helpers rápidos para usar en cualquier archivo
export const toast = {
    success: (message: string, title?: string, duration = 4000) =>
        useToastStore.getState().addToast({ type: 'success', message, title, duration }),
    error: (message: string, title?: string, duration = 5000) =>
        useToastStore.getState().addToast({ type: 'error', message, title, duration }),
    info: (message: string, title?: string, duration = 4000) =>
        useToastStore.getState().addToast({ type: 'info', message, title, duration }),
    warning: (message: string, title?: string, duration = 4500) =>
        useToastStore.getState().addToast({ type: 'warning', message, title, duration }),
    dismiss: (id: string) => useToastStore.getState().removeToast(id),
};
