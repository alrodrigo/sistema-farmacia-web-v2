import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeColorKey = 'emerald' | 'ocean' | 'indigo' | 'teal' | 'purple' | 'amber';

export interface ThemeColorDefinition {
    key: ThemeColorKey;
    name: string;
    description: string;
    primary: string;
    primaryContainer: string;
    primaryFixed: string;
    surfaceTint: string;
    previewBg: string;
}

export const THEME_PALETTES: Record<ThemeColorKey, ThemeColorDefinition> = {
    emerald: {
        key: 'emerald',
        name: 'Verde Clínico (Original)',
        description: 'Tono esmeralda farmacéutico estándar y profesional',
        primary: '#006948',
        primaryContainer: '#00855d',
        primaryFixed: '#85f8c4',
        surfaceTint: '#006c4a',
        previewBg: 'bg-[#006948]',
    },
    ocean: {
        key: 'ocean',
        name: 'Azul Médico / Hospital',
        description: 'Tono azul médico de confianza y precisión clínica',
        primary: '#0284c7',
        primaryContainer: '#0369a1',
        primaryFixed: '#bae6fd',
        surfaceTint: '#0284c7',
        previewBg: 'bg-[#0284c7]',
    },
    indigo: {
        key: 'indigo',
        name: 'Índigo / Farmacéutico',
        description: 'Azul índigo moderno y de alta tecnología',
        primary: '#4f46e5',
        primaryContainer: '#4338ca',
        primaryFixed: '#c7d2fe',
        surfaceTint: '#4f46e5',
        previewBg: 'bg-[#4f46e5]',
    },
    teal: {
        key: 'teal',
        name: 'Turquesa / Salud & Bienestar',
        description: 'Tono refrescante para farmacia natural y bienestar',
        primary: '#0d9488',
        primaryContainer: '#0f766e',
        primaryFixed: '#99f6e4',
        surfaceTint: '#0d9488',
        previewBg: 'bg-[#0d9488]',
    },
    purple: {
        key: 'purple',
        name: 'Amatista / Cuidado Personal',
        description: 'Tono violeta distinguido para dermocosmética y salud',
        primary: '#7c3aed',
        primaryContainer: '#6d28d9',
        primaryFixed: '#ddd6fe',
        surfaceTint: '#7c3aed',
        previewBg: 'bg-[#7c3aed]',
    },
    amber: {
        key: 'amber',
        name: 'Ámbar / Botica Tradicional',
        description: 'Tono cálido tradicional de botica y herbolaria',
        primary: '#d97706',
        primaryContainer: '#b45309',
        primaryFixed: '#fde68a',
        surfaceTint: '#d97706',
        previewBg: 'bg-[#d97706]',
    },
};

export const CLINICAL_ICONS = [
    { id: 'local_pharmacy', label: 'Cruz Farmacia', icon: 'local_pharmacy' },
    { id: 'health_and_safety', label: 'Salud y Escudo', icon: 'health_and_safety' },
    { id: 'medical_services', label: 'Maletín Médico', icon: 'medical_services' },
    { id: 'medication', label: 'Cápsula / Píldora', icon: 'medication' },
    { id: 'healing', label: 'Curación / Venda', icon: 'healing' },
    { id: 'vaccines', label: 'Vacuna / Inyección', icon: 'vaccines' },
    { id: 'ecg_heart', label: 'Cardio / Corazón', icon: 'ecg_heart' },
    { id: 'storefront', label: 'Comercio / Botica', icon: 'storefront' },
];

export function applyThemeVariables(themeKey: ThemeColorKey) {
    if (typeof document === 'undefined') return;
    const palette = THEME_PALETTES[themeKey] || THEME_PALETTES.emerald;
    const root = document.documentElement;

    root.style.setProperty('--color-primary', palette.primary);
    root.style.setProperty('--color-primary-container', palette.primaryContainer);
    root.style.setProperty('--color-primary-fixed', palette.primaryFixed);
    root.style.setProperty('--color-surface-tint', palette.surfaceTint);
}

interface BrandingState {
    systemTitle: string;
    systemSubtitle: string;
    logoType: 'icon' | 'image';
    logoIcon: string;
    logoImage: string | null;
    themeColor: ThemeColorKey;
    setSystemTitle: (title: string) => void;
    setSystemSubtitle: (subtitle: string) => void;
    setLogoType: (type: 'icon' | 'image') => void;
    setLogoIcon: (icon: string) => void;
    setLogoImage: (image: string | null) => void;
    setThemeColor: (color: ThemeColorKey) => void;
    setBranding: (branding: Partial<Omit<BrandingState, 'setSystemTitle' | 'setSystemSubtitle' | 'setLogoType' | 'setLogoIcon' | 'setLogoImage' | 'setThemeColor' | 'setBranding'>>) => void;
}

export const useBrandingStore = create<BrandingState>()(
    persist(
        (set) => ({
            systemTitle: 'PharmaCore',
            systemSubtitle: 'ERP Clinical',
            logoType: 'icon',
            logoIcon: 'local_pharmacy',
            logoImage: null,
            themeColor: 'emerald',
            setSystemTitle: (title) => set({ systemTitle: title }),
            setSystemSubtitle: (subtitle) => set({ systemSubtitle: subtitle }),
            setLogoType: (logoType) => set({ logoType }),
            setLogoIcon: (logoIcon) => set({ logoIcon }),
            setLogoImage: (logoImage) => set({ logoImage }),
            setThemeColor: (themeColor) => {
                applyThemeVariables(themeColor);
                set({ themeColor });
            },
            setBranding: (updates) => {
                if (updates.themeColor) {
                    applyThemeVariables(updates.themeColor);
                }
                set((state) => ({ ...state, ...updates }));
            },
        }),
        {
            name: 'pharmacore_branding_store',
            onRehydrateStorage: () => (state) => {
                if (state?.themeColor) {
                    applyThemeVariables(state.themeColor);
                }
            },
        }
    )
);

// Aplicar tema inmediatamente si está en el navegador
if (typeof window !== 'undefined') {
    try {
        const raw = localStorage.getItem('pharmacore_branding_store');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed?.state?.themeColor) {
                applyThemeVariables(parsed.state.themeColor);
            }
        }
    } catch {
        // Fallback silencioso
    }
}

