import { useState, useEffect, useRef } from 'react';
import { useStoreSettings, useUpdateStoreSettings } from '../hooks/useStoreSettings';
import { useHasPermission } from '@/features/users/hooks/usePermissions';
import { useAuthStore } from '@/stores/authStore';
import {
    useBrandingStore,
    THEME_PALETTES,
    CLINICAL_ICONS,
    applyThemeVariables,
    type ThemeColorKey,
} from '@/stores/brandingStore';
import { toast } from '@/stores/toastStore';

export default function SettingsPage() {
    const { role } = useAuthStore();
    const canEdit = useHasPermission('settings:edit') || (role || '').toLowerCase() === 'admin';

    const { data: settings, isLoading, isError, refetch } = useStoreSettings();
    const updateMutation = useUpdateStoreSettings();

    // Store global de personalización del sistema
    const branding = useBrandingStore();

    // Estado del formulario de Datos de la Farmacia (Supabase)
    const [businessName, setBusinessName] = useState('');
    const [nit, setNit] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [ticketFooter, setTicketFooter] = useState('');

    // Estado del formulario de Marca / Identidad Global (Branding)
    const [systemTitle, setSystemTitle] = useState(branding.systemTitle);
    const [systemSubtitle, setSystemSubtitle] = useState(branding.systemSubtitle);
    const [logoType, setLogoType] = useState<'icon' | 'image'>(branding.logoType);
    const [logoIcon, setLogoIcon] = useState(branding.logoIcon);
    const [logoImage, setLogoImage] = useState<string | null>(branding.logoImage);
    const [themeColor, setThemeColor] = useState<ThemeColorKey>(branding.themeColor);

    // Estado de la interfaz
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [previewTab, setPreviewTab] = useState<'ticket' | 'sidebar' | 'header'>('ticket');
    const [logoTab, setLogoTab] = useState<'icon' | 'image'>(branding.logoType);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sincronizar datos iniciales cuando cargan desde Supabase
    useEffect(() => {
        if (settings) {
            setBusinessName(settings.business_name || '');
            setNit(settings.nit || '');
            setAddress(settings.address || '');
            setPhone(settings.phone || '');
            setTicketFooter(settings.ticket_footer || '');
            // Si el título del sistema es el genérico por defecto, sincronizar con el nombre real de la farmacia
            if (!branding.systemTitle || branding.systemTitle === 'PharmaCore') {
                if (settings.business_name) {
                    setSystemTitle(settings.business_name);
                }
            }
        }
    }, [settings, branding.systemTitle]);

    // Sincronizar estado local de branding con el store
    useEffect(() => {
        if (branding.systemTitle && branding.systemTitle !== 'PharmaCore') {
            setSystemTitle(branding.systemTitle);
        } else if (settings?.business_name) {
            setSystemTitle(settings.business_name);
        }
        setSystemSubtitle(branding.systemSubtitle);
        setLogoType(branding.logoType);
        setLogoIcon(branding.logoIcon);
        setLogoImage(branding.logoImage);
        setThemeColor(branding.themeColor);
        setLogoTab(branding.logoType);
    }, [branding.systemTitle, branding.systemSubtitle, branding.logoType, branding.logoIcon, branding.logoImage, branding.themeColor, settings?.business_name]);

    // Comprobar si hay cambios pendientes (en base de datos o en branding)
    const isDirty =
        (Boolean(settings) &&
            (businessName !== (settings?.business_name || '') ||
                nit !== (settings?.nit || '') ||
                address !== (settings?.address || '') ||
                phone !== (settings?.phone || '') ||
                ticketFooter !== (settings?.ticket_footer || ''))) ||
        systemTitle !== branding.systemTitle ||
        systemSubtitle !== branding.systemSubtitle ||
        logoType !== branding.logoType ||
        logoIcon !== branding.logoIcon ||
        logoImage !== branding.logoImage ||
        themeColor !== branding.themeColor;

    const handleReset = () => {
        if (settings) {
            setBusinessName(settings.business_name || '');
            setNit(settings.nit || '');
            setAddress(settings.address || '');
            setPhone(settings.phone || '');
            setTicketFooter(settings.ticket_footer || '');
        }
        setSystemTitle(branding.systemTitle || settings?.business_name || 'PharmaCore');
        setSystemSubtitle(branding.systemSubtitle);
        setLogoType(branding.logoType);
        setLogoIcon(branding.logoIcon);
        setLogoImage(branding.logoImage);
        setThemeColor(branding.themeColor);
        applyThemeVariables(branding.themeColor);
        setLogoTab(branding.logoType);
        setSaveSuccess(false);
    };

    // Subir imagen para el logo con auto-optimización en Canvas (para persistencia garantizada en IndexedDB)
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toast.warning('La imagen seleccionada supera los 5 MB. Elige una imagen más ligera.', 'Archivo muy pesado');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const rawData = reader.result as string;
            const img = new Image();
            img.onload = () => {
                // Redimensionar suavemente a un tamaño óptimo para pantallas y tickets (máx 360px)
                const maxDim = 360;
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, w, h);
                    const optimizedDataUrl = canvas.toDataURL('image/png', 0.92);
                    setLogoImage(optimizedDataUrl);
                    setLogoType('image');
                    setLogoTab('image');
                    toast.success('Logotipo corporativo optimizado y cargado', 'Logo Listo');
                } else {
                    setLogoImage(rawData);
                    setLogoType('image');
                    setLogoTab('image');
                }
            };
            img.onerror = () => {
                setLogoImage(rawData);
                setLogoType('image');
                setLogoTab('image');
            };
            img.src = rawData;
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveImage = () => {
        setLogoImage(null);
        setLogoType('icon');
        setLogoTab('icon');
        if (fileInputRef.current) fileInputRef.current.value = '';
        toast.info('Logo retirado. Se usará el isotipo vectorial.');
    };

    const handleSelectTheme = (paletteKey: ThemeColorKey) => {
        setThemeColor(paletteKey);
        applyThemeVariables(paletteKey); // Cambio visual instantáneo
    };

    const handleSelectIcon = (iconName: string) => {
        setLogoIcon(iconName);
        setLogoType('icon');
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEdit || !settings) return;

        const finalBusinessName = businessName.trim() || systemTitle.trim();
        if (!finalBusinessName) {
            toast.warning('El nombre de la farmacia es obligatorio.', 'Campo requerido');
            return;
        }

        const finalSystemTitle = systemTitle.trim() || finalBusinessName;

        try {
            // 1. Guardar en Supabase (Persistencia permanente en Nube)
            await updateMutation.mutateAsync({
                id: settings.id,
                updates: {
                    business_name: finalBusinessName,
                    nit: nit.trim() || null,
                    address: address.trim() || null,
                    phone: phone.trim() || null,
                    ticket_footer: ticketFooter.trim() || null,
                },
            });

            // 2. Guardar en Store de Branding (Persistencia local en IndexedDB y localStorage)
            branding.setBranding({
                systemTitle: finalSystemTitle,
                systemSubtitle: systemSubtitle.trim() || 'ERP Clinical',
                logoType,
                logoIcon,
                logoImage,
                themeColor,
            });

            setSaveSuccess(true);
            toast.success(`Configuración de "${finalBusinessName}" guardada en la base de datos y memoria permanente`, 'Guardado Exitoso');
            setTimeout(() => setSaveSuccess(false), 4500);
        } catch (err: any) {
            toast.error(err?.message || 'Error al guardar los cambios en Supabase', 'Error de Configuración');
        }
    };

    if (isLoading) {
        return (
            <div className="p-8 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-3">
                <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                    progress_activity
                </span>
                <span className="text-sm font-semibold text-secondary">
                    Cargando configuración institucional de la farmacia...
                </span>
            </div>
        );
    }

    if (isError || !settings) {
        return (
            <div className="p-8 max-w-lg mx-auto text-center mt-12 bg-surface-container-lowest rounded-2xl border border-error/20 p-8 shadow-sm">
                <span className="material-symbols-outlined text-4xl text-error mb-2">error</span>
                <h2 className="text-base font-bold text-on-surface">No se pudo cargar la configuración</h2>
                <p className="text-xs text-secondary mt-1 mb-4">
                    Ocurrió un error al contactar la base de datos de parámetros institucionales.
                </p>
                <button
                    onClick={() => refetch()}
                    className="px-4 py-2 bg-primary text-on-primary font-bold text-xs rounded-xl hover:bg-primary-container transition-colors cursor-pointer"
                >
                    Reintentar Conexión
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
            {/* ==============================================================================
                1. CABECERA INSTITUCIONAL & ACCIONES RÁPIDAS
               ============================================================================== */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-lowest p-6 rounded-3xl border border-surface-container shadow-sm">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                            Identidad & Parámetros
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Establecimiento Activo
                        </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-on-surface tracking-tight">
                        Configuración de la Farmacia
                    </h1>
                    <p className="text-xs sm:text-sm text-secondary max-w-2xl">
                        Personaliza el título del sistema, logotipo corporativo, paleta de colores clínicos, datos fiscales y el diseño del ticket térmico POS.
                    </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    {isDirty && (
                        <button
                            type="button"
                            onClick={handleReset}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-on-surface bg-surface-container-low hover:bg-surface-container transition-colors cursor-pointer"
                            disabled={updateMutation.isPending}
                        >
                            Descartar Cambios
                        </button>
                    )}

                    {canEdit && (
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={updateMutation.isPending || !isDirty}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer ${
                                isDirty
                                    ? 'bg-primary hover:bg-primary-container text-on-primary active:scale-95 shadow-primary/20 ring-2 ring-primary/20'
                                    : 'bg-surface-container text-secondary cursor-not-allowed opacity-60'
                            }`}
                        >
                            {updateMutation.isPending ? (
                                <>
                                    <span className="material-symbols-outlined text-[18px] animate-spin">
                                        progress_activity
                                    </span>
                                    <span>Guardando...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[18px]">save</span>
                                    <span>Guardar Cambios</span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Alerta de confirmación de guardado */}
            {saveSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center justify-between shadow-xs animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-emerald-600 text-2xl">check_circle</span>
                        <div>
                            <span className="font-bold text-xs block">Configuración y marca actualizadas exitosamente</span>
                            <span className="text-[11px] text-emerald-700">
                                El nuevo título, logotipo, paleta de color y comprobantes ya están activos en todo el sistema.
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSaveSuccess(false)}
                        className="text-emerald-700 hover:text-emerald-900"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
            )}

            {!canEdit && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex items-center gap-2.5 text-xs">
                    <span className="material-symbols-outlined text-amber-600 text-xl">lock</span>
                    <span>
                        Modo de sólo lectura: Tu rol actual no cuenta con el permiso <code>settings:edit</code> para modificar los parámetros institucionales.
                    </span>
                </div>
            )}

            {/* ==============================================================================
                2. CUERPO PRINCIPAL: FORMULARIO (7 COLS) Y SIMULADOR EN VIVO (5 COLS)
               ============================================================================== */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* COLUMNA IZQUIERDA: FORMULARIO DE PERSONALIZACIÓN */}
                <form onSubmit={handleSave} className="lg:col-span-7 space-y-6">

                    {/* SECCIÓN A: TÍTULO DEL SISTEMA & MENÚ PRINCIPAL */}
                    <div className="bg-surface-container-lowest p-6 rounded-3xl border border-surface-container shadow-sm space-y-4">
                        <div className="flex items-center gap-2.5 border-b border-surface-container pb-3">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px]">badge</span>
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-on-surface">Título del Menú Principal & Sistema</h2>
                                <p className="text-[11px] text-secondary">
                                    Nombre que encabeza la barra lateral izquierda, la pestaña del navegador y la identidad global.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                            {/* Título Principal */}
                            <div className="space-y-1.5">
                                <label className="font-bold text-on-surface flex items-center justify-between">
                                    <span>Título Principal *</span>
                                    <span className="text-[10px] text-secondary">Barra Lateral</span>
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
                                        apps
                                    </span>
                                    <input
                                        type="text"
                                        value={systemTitle}
                                        onChange={(e) => setSystemTitle(e.target.value)}
                                        disabled={!canEdit}
                                        placeholder="Ej. PharmaCore, Farmacia Cruz Verde"
                                        className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low rounded-xl border border-surface-container text-on-surface font-semibold placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                        required
                                    />
                                </div>
                                <p className="text-[10px] text-secondary">
                                    Reemplaza el texto &ldquo;PharmaCore&rdquo; en la barra principal.
                                </p>
                            </div>

                            {/* Subtítulo / Lema */}
                            <div className="space-y-1.5">
                                <label className="font-bold text-on-surface flex items-center justify-between">
                                    <span>Subtítulo / Especialidad</span>
                                    <span className="text-[10px] text-secondary">Eslogan</span>
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
                                        label
                                    </span>
                                    <input
                                        type="text"
                                        value={systemSubtitle}
                                        onChange={(e) => setSystemSubtitle(e.target.value)}
                                        disabled={!canEdit}
                                        placeholder="Ej. ERP Clinical, Sucursal Central"
                                        className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low rounded-xl border border-surface-container text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-secondary">
                                    Reemplaza el texto &ldquo;ERP Clinical&rdquo; debajo del título.
                                </p>
                            </div>
                        </div>

                        {/* Botón rápido para replicar título al nombre comercial */}
                        {canEdit && (
                            <div className="pt-1 flex items-center justify-end">
                                <button
                                    type="button"
                                    onClick={() => setBusinessName(systemTitle)}
                                    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[14px]">sync_alt</span>
                                    Usar también como Razón Social en facturas y tickets
                                </button>
                            </div>
                        )}
                    </div>

                    {/* SECCIÓN B: LOGOTIPO DEL SISTEMA */}
                    <div className="bg-surface-container-lowest p-6 rounded-3xl border border-surface-container shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-surface-container pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[18px]">verified</span>
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-on-surface">Logotipo de la Farmacia</h2>
                                    <p className="text-[11px] text-secondary">
                                        Selecciona un icono vectorial clínico de alta resolución o sube tu propia imagen corporativa.
                                    </p>
                                </div>
                            </div>

                            {/* Selector modo icono / imagen */}
                            <div className="flex bg-surface-container-low p-0.5 rounded-xl text-xs">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLogoTab('icon');
                                        setLogoType('icon');
                                    }}
                                    className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                        logoTab === 'icon'
                                            ? 'bg-primary text-on-primary shadow-xs'
                                            : 'text-secondary hover:text-on-surface'
                                    }`}
                                >
                                    Icono Clínico
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLogoTab('image');
                                        if (logoImage) setLogoType('image');
                                    }}
                                    className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                        logoTab === 'image'
                                            ? 'bg-primary text-on-primary shadow-xs'
                                            : 'text-secondary hover:text-on-surface'
                                    }`}
                                >
                                    Subir Imagen
                                </button>
                            </div>
                        </div>

                        {/* MODO 1: CATÁLOGO DE ICONOS */}
                        {logoTab === 'icon' && (
                            <div className="space-y-3">
                                <span className="text-[11px] font-bold text-on-surface block">
                                    Elige el icono representativo para tu botica o farmacia:
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    {CLINICAL_ICONS.map((item) => {
                                        const isSelected = logoType === 'icon' && logoIcon === item.icon;
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                disabled={!canEdit}
                                                onClick={() => handleSelectIcon(item.icon)}
                                                className={`p-3 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all cursor-pointer border ${
                                                    isSelected
                                                        ? 'bg-primary/10 border-primary shadow-xs text-primary ring-2 ring-primary/20'
                                                        : 'bg-surface-container-low border-surface-container hover:bg-surface-container text-secondary hover:text-on-surface'
                                                }`}
                                            >
                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                                    isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-secondary'
                                                }`}>
                                                    <span className="material-symbols-outlined text-[22px]">
                                                        {item.icon}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] font-bold leading-tight">
                                                    {item.label}
                                                </span>
                                                {isSelected && (
                                                    <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                                                        Seleccionado
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* MODO 2: SUBIR IMAGEN */}
                        {logoTab === 'image' && (
                            <div className="space-y-4">
                                {logoImage ? (
                                    <div className="p-4 bg-surface-container-low rounded-2xl border border-surface-container flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 rounded-xl bg-white border border-surface-container flex items-center justify-center p-1 overflow-hidden shadow-xs">
                                                <img
                                                    src={logoImage}
                                                    alt="Logo corporativo"
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            <div className="space-y-0.5">
                                                <span className="text-xs font-bold text-on-surface block">
                                                    Logo Corporativo Cargado
                                                </span>
                                                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium inline-block">
                                                    Activo en Sidebar y Comprobantes
                                                </span>
                                                <p className="text-[10px] text-secondary">
                                                    Formato optimizado para visualización web y térmica.
                                                </p>
                                            </div>
                                        </div>

                                        {canEdit && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="px-3 py-1.5 bg-surface-container text-on-surface hover:bg-surface-container-high rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                                >
                                                    Cambiar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveImage}
                                                    className="p-1.5 text-error hover:bg-error/10 rounded-xl transition-colors cursor-pointer"
                                                    title="Eliminar logo y usar icono"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => canEdit && fileInputRef.current?.click()}
                                        className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-colors ${
                                            canEdit
                                                ? 'border-surface-container hover:border-primary/50 bg-surface-container-low/40 hover:bg-surface-container-low cursor-pointer'
                                                : 'border-surface-container bg-surface-container-low/20 cursor-not-allowed opacity-60'
                                        }`}
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                                            <span className="material-symbols-outlined text-[24px]">add_photo_alternate</span>
                                        </div>
                                        <div className="space-y-0.5">
                                            <span className="text-xs font-bold text-on-surface block">
                                                Haz clic para seleccionar el logotipo de tu farmacia
                                            </span>
                                            <span className="text-[10px] text-secondary">
                                                Archivos PNG, JPG o SVG (Recomendado fondo transparente, máx 2 MB)
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                    disabled={!canEdit}
                                />
                            </div>
                        )}
                    </div>

                    {/* SECCIÓN C: COLORES DEL SISTEMA (TEMAS VISUALES) */}
                    <div className="bg-surface-container-lowest p-6 rounded-3xl border border-surface-container shadow-sm space-y-4">
                        <div className="flex items-center gap-2.5 border-b border-surface-container pb-3">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px]">palette</span>
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-on-surface">Colores del Sistema (Paleta Visual)</h2>
                                <p className="text-[11px] text-secondary">
                                    Cambia el color de acento institucional. Se aplica de inmediato a botones, indicadores y menús.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {(Object.values(THEME_PALETTES) as typeof THEME_PALETTES[ThemeColorKey][]).map((palette) => {
                                const isSelected = themeColor === palette.key;
                                return (
                                    <button
                                        key={palette.key}
                                        type="button"
                                        disabled={!canEdit}
                                        onClick={() => handleSelectTheme(palette.key)}
                                        className={`p-3.5 rounded-2xl text-left transition-all cursor-pointer border flex flex-col justify-between gap-2.5 ${
                                            isSelected
                                                ? 'bg-surface-container-lowest border-primary shadow-sm ring-2 ring-primary/20'
                                                : 'bg-surface-container-low border-surface-container hover:bg-surface-container'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-5 h-5 rounded-full shadow-xs flex items-center justify-center border border-black/10 shrink-0"
                                                    style={{ backgroundColor: palette.primary }}
                                                >
                                                    {isSelected && (
                                                        <span className="material-symbols-outlined text-white text-[12px] font-bold">
                                                            check
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs font-bold text-on-surface leading-tight">
                                                    {palette.name.split('(')[0].trim()}
                                                </span>
                                            </div>
                                            {isSelected && (
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                                    Activo
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-secondary leading-tight">
                                            {palette.description}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* SECCIÓN D: IDENTIDAD COMERCIAL & DATOS FISCALES (SUPABASE) */}
                    <div className="bg-surface-container-lowest p-6 rounded-3xl border border-surface-container shadow-sm space-y-4">
                        <div className="flex items-center gap-2.5 border-b border-surface-container pb-3">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px]">storefront</span>
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-on-surface">Datos Fiscales & Emisión de Comprobantes</h2>
                                <p className="text-[11px] text-secondary">
                                    Razón social registrada y Número de Identificación Tributaria (NIT) para facturación.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4 text-xs">
                            {/* Razón Social */}
                            <div className="space-y-1.5">
                                <label className="font-bold text-on-surface flex items-center justify-between">
                                    <span>Razón Social / Nombre Comercial en Ticket *</span>
                                    <span className="text-[10px] text-secondary font-normal">Obligatorio</span>
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
                                        local_pharmacy
                                    </span>
                                    <input
                                        type="text"
                                        value={businessName}
                                        onChange={(e) => setBusinessName(e.target.value)}
                                        disabled={!canEdit}
                                        placeholder="Ej. Farmacia PharmaCore San Rafael"
                                        className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low rounded-xl border border-surface-container text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium transition-all"
                                        required
                                    />
                                </div>
                                <p className="text-[10px] text-secondary">
                                    Este título exacto se imprime en la parte superior del comprobante térmico y en los reportes contables.
                                </p>
                            </div>

                            {/* NIT */}
                            <div className="space-y-1.5">
                                <label className="font-bold text-on-surface flex items-center justify-between">
                                    <span>Número de Identificación Tributaria (NIT)</span>
                                    <span className="text-[10px] text-secondary font-mono">SIN Bolivia</span>
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
                                        badge
                                    </span>
                                    <input
                                        type="text"
                                        value={nit}
                                        onChange={(e) => setNit(e.target.value)}
                                        disabled={!canEdit}
                                        placeholder="Ej. 1028374019"
                                        className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low rounded-xl border border-surface-container text-on-surface font-mono font-semibold placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-secondary">
                                    Número tributario de la empresa que valida las ventas emitidas.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN E: UBICACIÓN Y CONTACTO */}
                    <div className="bg-surface-container-lowest p-6 rounded-3xl border border-surface-container shadow-sm space-y-4">
                        <div className="flex items-center gap-2.5 border-b border-surface-container pb-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px]">location_on</span>
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-on-surface">Ubicación & Contacto</h2>
                                <p className="text-[11px] text-secondary">
                                    Dirección física del establecimiento y teléfonos de atención.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div className="space-y-1.5">
                                <label className="font-bold text-on-surface">
                                    Dirección Completa de la Sucursal
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-3 text-secondary text-[18px]">
                                        pin_drop
                                    </span>
                                    <textarea
                                        rows={2}
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                        disabled={!canEdit}
                                        placeholder="Ej. Av. Principal #450, Esq. Calle 8, Zona Central"
                                        className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low rounded-xl border border-surface-container text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-on-surface">
                                    Teléfono / Celular / WhatsApp
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
                                        call
                                    </span>
                                    <input
                                        type="text"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        disabled={!canEdit}
                                        placeholder="Ej. +591 70000000 / 2-2456789"
                                        className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low rounded-xl border border-surface-container text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN F: PIE DE TICKET TÉRMICO */}
                    <div className="bg-surface-container-lowest p-6 rounded-3xl border border-surface-container shadow-sm space-y-4">
                        <div className="flex items-center gap-2.5 border-b border-surface-container pb-3">
                            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-on-surface">Pie de Ticket & Leyenda POS</h2>
                                <p className="text-[11px] text-secondary">
                                    Mensaje impreso al final del comprobante térmico entregado al paciente.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="space-y-1.5">
                                <label className="font-bold text-on-surface">
                                    Mensaje de Agradecimiento o Política Sanitaria
                                </label>
                                <textarea
                                    rows={3}
                                    value={ticketFooter}
                                    onChange={(e) => setTicketFooter(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="Ej. ¡Gracias por su preferencia! Medicamentos no sujetos a cambio según normativa sanitaria."
                                    className="w-full p-3 bg-surface-container-low rounded-xl border border-surface-container text-on-surface placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                                />
                            </div>

                            {/* Atajos de texto sugerido */}
                            {canEdit && (
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold uppercase text-secondary tracking-wider block">
                                        Textos Rápidos Sugeridos:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            '¡Gracias por su preferencia! Conserve su comprobante.',
                                            'Atención Farmacéutica Profesional las 24 Horas.',
                                            'Medicamentos no sujetos a cambio según normativa sanitaria.',
                                            '¡Tu salud es nuestro mayor compromiso! Vuelve pronto.',
                                        ].map((suggested, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setTicketFooter(suggested)}
                                                className="px-2.5 py-1 bg-surface-container-low hover:bg-surface-container rounded-lg text-[10px] text-secondary hover:text-on-surface transition-colors border border-surface-container cursor-pointer"
                                            >
                                                {suggested}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </form>

                {/* COLUMNA DERECHA: PREVISUALIZADOR EN TIEMPO REAL (5 COLS) */}
                <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
                    {/* Simulador Interactivo */}
                    <div className="bg-surface-container-lowest p-6 rounded-3xl border border-surface-container shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-surface-container pb-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[20px]">visibility</span>
                                <h3 className="text-sm font-bold text-on-surface">Simulador en Tiempo Real</h3>
                            </div>

                            {/* Pestañas de previsualización */}
                            <div className="flex bg-surface-container-low p-0.5 rounded-xl text-xs">
                                <button
                                    type="button"
                                    onClick={() => setPreviewTab('ticket')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                        previewTab === 'ticket'
                                            ? 'bg-primary text-on-primary shadow-xs'
                                            : 'text-secondary hover:text-on-surface'
                                    }`}
                                >
                                    Ticket POS
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewTab('sidebar')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                        previewTab === 'sidebar'
                                            ? 'bg-primary text-on-primary shadow-xs'
                                            : 'text-secondary hover:text-on-surface'
                                    }`}
                                >
                                    Sidebar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewTab('header')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                                        previewTab === 'header'
                                            ? 'bg-primary text-on-primary shadow-xs'
                                            : 'text-secondary hover:text-on-surface'
                                    }`}
                                >
                                    Membrete
                                </button>
                            </div>
                        </div>

                        {/* VISTA 1: TICKET TÉRMICO 80MM */}
                        {previewTab === 'ticket' && (
                            <div className="flex justify-center p-2 bg-surface-container-low/50 rounded-2xl">
                                <div className="bg-white text-slate-900 w-[270px] p-4 rounded shadow-md border border-slate-300 font-mono text-[11px] leading-tight space-y-2 select-none">
                                    {/* Cabecera del Ticket con Logo */}
                                    <div className="text-center border-b border-dashed border-slate-400 pb-2.5 space-y-1">
                                        {logoType === 'image' && logoImage ? (
                                            <div className="flex justify-center mb-1">
                                                <img
                                                    src={logoImage}
                                                    alt="Logo Ticket"
                                                    className="max-h-12 max-w-[140px] object-contain grayscale"
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-7 h-7 mx-auto mb-1 rounded bg-black text-white flex items-center justify-center">
                                                <span className="material-symbols-outlined text-[18px]">
                                                    {logoIcon || 'local_pharmacy'}
                                                </span>
                                            </div>
                                        )}
                                        <div className="font-black text-sm uppercase tracking-tight text-slate-900 break-words">
                                            {businessName || 'NOMBRE DE LA FARMACIA'}
                                        </div>
                                        <p className="text-[10px] text-slate-600 break-words">
                                            {address || 'Dirección de la sucursal'}
                                        </p>
                                        <p className="text-[10px] text-slate-600">
                                            Tel: {phone || '+591 00000000'}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-800">
                                            NIT: {nit || '0000000000'}
                                        </p>
                                        <div className="pt-1 text-[10px] text-slate-500 border-t border-dotted border-slate-300 mt-1">
                                            Ticket: #DEMO-001 • {new Date().toLocaleDateString('es-ES')}
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                            Cajero: Administrador (Caja 1)
                                        </div>
                                    </div>

                                    {/* Detalle simulado */}
                                    <div className="border-b border-dashed border-slate-400 py-2 space-y-1.5 text-[10px]">
                                        <div className="flex justify-between font-bold border-b border-slate-200 pb-1">
                                            <span>Cant. / Detalle</span>
                                            <span>Subtotal</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>2x Paracetamol 500mg</span>
                                            <span>Bs 10.00</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>1x Amoxicilina 1g</span>
                                            <span>Bs 25.50</span>
                                        </div>
                                    </div>

                                    {/* Totales simulados */}
                                    <div className="border-b border-dashed border-slate-400 py-2 space-y-1 text-right text-xs">
                                        <div className="flex justify-between font-bold text-sm">
                                            <span>TOTAL A PAGAR:</span>
                                            <span>Bs 35.50</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-slate-500">
                                            <span>Método:</span>
                                            <span>Efectivo</span>
                                        </div>
                                    </div>

                                    {/* Pie del ticket dinámico */}
                                    <div className="text-center pt-2 text-[10px] text-slate-600 space-y-1">
                                        <p className="font-semibold italic break-words">
                                            {ticketFooter || '¡Gracias por su compra!'}
                                        </p>
                                        <p className="text-[8px] text-slate-400">
                                            {systemTitle || 'PharmaCore'} POS • Sistema Certificado
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* VISTA 2: SIDEBAR MOCKUP (BARRA LATERAL) */}
                        {previewTab === 'sidebar' && (
                            <div className="p-3 bg-surface-container-low/50 rounded-2xl flex justify-center">
                                <div className="w-[280px] bg-[#111827] text-white rounded-2xl p-4 shadow-xl border border-white/10 space-y-4">
                                    {/* Encabezado del Sidebar simulado */}
                                    <div className="flex items-center gap-3.5 pb-3 border-b border-white/10">
                                        <div className="w-11 h-11 rounded-2xl bg-white p-1.5 flex items-center justify-center overflow-hidden shrink-0 shadow-lg shadow-black/20 ring-1 ring-white/20 border border-slate-100">
                                            {logoType === 'image' && logoImage ? (
                                                <img src={logoImage} alt="Logo" className="w-full h-full object-contain" />
                                            ) : (
                                                <div className="w-full h-full rounded-xl bg-primary flex items-center justify-center text-white">
                                                    <span className="material-symbols-outlined text-[24px]">
                                                        {logoIcon || 'local_pharmacy'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[14px] font-black text-white tracking-tight truncate leading-tight uppercase">
                                                {systemTitle || 'PharmaCore'}
                                            </span>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary-fixed truncate">
                                                    {systemSubtitle || 'ERP Clinical'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Items de navegación con color de acento activo */}
                                    <div className="space-y-1.5 text-xs">
                                        <div className="px-2 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                            Operaciones
                                        </div>
                                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-container text-white font-bold shadow-lg shadow-primary/30 border-l-4 border-white">
                                            <span className="material-symbols-outlined text-[18px]">grid_view</span>
                                            <span>Dashboard</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-300 hover:bg-white/5">
                                            <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
                                            <span>Punto de Venta / POS</span>
                                        </div>
                                        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-300 hover:bg-white/5">
                                            <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                                            <span>Inventario</span>
                                        </div>
                                    </div>

                                    <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-[11px] text-gray-400">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                        <span>Tema Activo: {THEME_PALETTES[themeColor]?.name.split('(')[0].trim()}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* VISTA 3: MEMBRETE OFICIAL PDF */}
                        {previewTab === 'header' && (
                            <div className="p-3 bg-surface-container-low/50 rounded-2xl">
                                <div className="bg-white text-slate-900 p-5 rounded-xl shadow-md border border-slate-300 font-sans space-y-3 select-none">
                                    <div className="flex justify-between items-start border-b-2 border-primary pb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                                                {logoType === 'image' && logoImage ? (
                                                    <img src={logoImage} alt="Logo" className="w-full h-full object-contain p-1" />
                                                ) : (
                                                    <span className="material-symbols-outlined text-[24px]">
                                                        {logoIcon || 'local_pharmacy'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="space-y-0.5">
                                                <h4 className="text-base font-black text-primary tracking-tight">
                                                    {businessName || systemTitle || 'NOMBRE DE LA FARMACIA'}
                                                </h4>
                                                <p className="text-[10px] text-slate-600">
                                                    NIT: {nit || '0000000000'} • {address || 'Dirección de la Farmacia'}
                                                </p>
                                                <p className="text-[10px] text-slate-500">
                                                    Teléfono: {phone || '+591 00000000'} • {systemSubtitle || 'ERP Clinical'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="inline-block bg-primary/10 text-primary font-bold text-[9px] uppercase px-2 py-0.5 rounded">
                                                REPORTE OFICIAL
                                            </span>
                                            <p className="text-[9px] text-slate-500 mt-1">
                                                Período: Mes Actual
                                            </p>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center text-slate-400 text-xs py-6">
                                        [Contenido del Reporte Documental A4]
                                    </div>

                                    <div className="text-center text-[8px] text-slate-400 border-t border-dashed border-slate-300 pt-2">
                                        Documento generado automáticamente por {systemTitle || 'PharmaCore'} {systemSubtitle || 'ERP Clinical'}
                                    </div>
                                </div>
                            </div>
                        )}

                        <p className="text-[11px] text-secondary text-center">
                            💡 Los cambios guardados se aplican inmediatamente en el menú principal, tickets de venta y reportes.
                        </p>
                    </div>

                    {/* Tarjeta de Metadatos del Sistema */}
                    <div className="bg-surface-container-lowest p-5 rounded-3xl border border-surface-container shadow-sm space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-secondary text-[18px]">info</span>
                            <span className="text-xs font-bold text-on-surface">Metadatos de la Instalación</span>
                        </div>
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between py-1 border-b border-surface-container text-secondary">
                                <span>Versión del Software:</span>
                                <span className="font-mono font-bold text-on-surface">{systemTitle || 'PharmaCore'} v2.4</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-surface-container text-secondary">
                                <span>ID del Establecimiento:</span>
                                <span className="font-mono text-[10px] text-on-surface">
                                    {settings.id.slice(0, 8)}...
                                </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-surface-container text-secondary">
                                <span>Última Actualización:</span>
                                <span className="font-mono text-[10px] text-on-surface">
                                    {settings.updated_at
                                        ? new Date(settings.updated_at).toLocaleString('es-ES')
                                        : 'Sin registrar'}
                                </span>
                            </div>
                            <div className="flex justify-between py-1 text-secondary">
                                <span>Motor de Base de Datos:</span>
                                <span className="font-semibold text-emerald-700">Supabase Cloud PostgreSQL</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
