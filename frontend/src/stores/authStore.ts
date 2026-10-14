import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

type AuthState = {
    user: User | null;
    role: string | null;
    isLoading: boolean;
    setUser: (user: User | null, role?: string | null) => void;
    clearUser: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    role: null,
    isLoading: true,
    setUser: (user, role = null) => set({ user, role, isLoading: false }),
    clearUser: () => set({ user: null, role: null, isLoading: false }),
}));
