import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import type { Database } from '../lib/database.types'

//1.tipo ded fila real de products
type ProductRow = Database['public']['Tables']['products']['Row'];

//2. CartItem derivado de la BD
export type CartItem = Pick<ProductRow, 'name' | 'price_cents'> & {
    product_id: ProductRow['id'];
    quantity: number;
};

//1.Adaptador para indexeddb
//Traducimos las funcones de idb-keyval al idioma de zustand
const idbStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        return (await get(name)) || null;
    },
    setItem: async (name: string, value: string): Promise<void> => {
        await set(name, value)
    },
    removeItem: async (name: string): Promise<void> => {
        await del(name)
    },
};
type CartState = {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    removeItem: (product_id: string) => void;
    updateQuantity: (product_id: string, quantity: number) => void;
    clearCart: () => void;
};

export const useCartStore = create<CartState>()(
    persist(
        (set) => ({
            items: [],

            addItem: (item) =>
                set((state) => {
                    const existing = state.items.find((i) => i.product_id === item.product_id);
                    if (existing) {
                        return {
                            items: state.items.map((i) =>
                                i.product_id === item.product_id
                                    ? { ...i, quantity: i.quantity + item.quantity }
                                    : i
                            ),
                        };
                    }
                    return { items: [...state.items, item] };
                }),

            removeItem: (product_id) =>
                set((state) => ({
                    items: state.items.filter((i) => i.product_id !== product_id),
                })),

            updateQuantity: (product_id, quantity) =>
                set((state) => ({
                    items: quantity <= 0
                        ? state.items.filter((i) => i.product_id !== product_id)
                        : state.items.map((i) =>
                            i.product_id === product_id ? { ...i, quantity } : i
                        ),
                })),
            clearCart: () => set({ items: [] }),
        }),
        {
            name: 'pos-cart-storage',
            storage: createJSONStorage(() => idbStorage),
            partialize: (state) => ({ items: state.items }),
        }
    )
);
// Selector derivado (mejor que método en state)
export const useCartTotal = () =>
    useCartStore((state) =>
        state.items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0)
    );