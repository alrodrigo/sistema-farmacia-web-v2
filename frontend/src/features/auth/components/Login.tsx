import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useBrandingStore, applyThemeVariables } from '@/stores/brandingStore';
import { toast } from '@/stores/toastStore';

export default function Login() {
    const { systemTitle, systemSubtitle, logoType, logoIcon, logoImage, themeColor } = useBrandingStore();
    const navigate = useNavigate();
    const setUser = useAuthStore((state) => state.setUser);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberEmail, setRememberEmail] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Modal de recuperación de contraseña
    const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [isSendingForgot, setIsSendingForgot] = useState(false);
    const [forgotSuccess, setForgotSuccess] = useState(false);

    // Aplicar variables de color de la marca en la pantalla de login
    useEffect(() => {
        applyThemeVariables(themeColor);
    }, [themeColor]);

    // Recuperar correo recordado si existe
    useEffect(() => {
        const saved = localStorage.getItem('pharmacore_remembered_email');
        if (saved) {
            setEmail(saved);
            setRememberEmail(true);
        }
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            if (signInError) {
                if (signInError.message.includes('Invalid login credentials')) {
                    setError('Credenciales incorrectas. Verifica tu correo y contraseña.');
                } else if (signInError.message.includes('Email not confirmed')) {
                    setError('Tu cuenta aún no ha sido confirmada en Supabase.');
                } else {
                    setError(signInError.message || 'Error al iniciar sesión en el servidor.');
                }
                setIsLoading(false);
                return;
            }

            if (authData.user) {
                // Recordar correo si el usuario marcó la casilla
                if (rememberEmail) {
                    localStorage.setItem('pharmacore_remembered_email', email.trim());
                } else {
                    localStorage.removeItem('pharmacore_remembered_email');
                }

                // Cargar rol y estado activo inmediatamente
                const { data: profile, error: profileError } = await supabase
                    .from('user_profiles')
                    .select('role_id, is_active, full_name, roles(name)')
                    .eq('id', authData.user.id)
                    .single();

                if (profileError) {
                    console.warn('Advertencia cargando perfil:', profileError.message);
                }

                // Si el usuario está suspendido por un administrador:
                if (profile && profile.is_active === false) {
                    await supabase.auth.signOut();
                    useAuthStore.getState().clearUser();
                    setError('Acceso denegado: Esta cuenta se encuentra suspendida. Contacta a la administración.');
                    setIsLoading(false);
                    return;
                }

                const roleData = profile?.roles as any;
                const roleName = (Array.isArray(roleData) ? roleData[0]?.name : roleData?.name) ?? null;

                setUser(authData.user, roleName);
                toast.success(
                    `Bienvenido, ${profile?.full_name || authData.user.email?.split('@')[0]}`,
                    'Sesión Iniciada'
                );
                navigate('/');
            }
        } catch (err: any) {
            setError(err.message || 'Ocurrió un error inesperado al conectar con el servidor.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendPasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!forgotEmail.trim()) return;

        setIsSendingForgot(true);
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
                redirectTo: window.location.origin + '/login',
            });

            if (resetError) {
                toast.error(resetError.message || 'No se pudo enviar el correo de recuperación.');
            } else {
                setForgotSuccess(true);
                toast.success('Enlace de recuperación enviado. Revisa tu bandeja de entrada o spam.');
            }
        } catch (err: any) {
            toast.error(err.message || 'Error al solicitar recuperación de contraseña.');
        } finally {
            setIsSendingForgot(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden font-sans">
            {/* Luces y auras de fondo dinámicas con el color temático */}
            <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary/20 blur-[120px] pointer-events-none"></div>
            <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-primary/15 blur-[140px] pointer-events-none"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[160px] pointer-events-none"></div>

            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center z-10">
                {/* Columna Izquierda: Presentación Institucional (visible en pantallas grandes) */}
                <div className="hidden lg:flex lg:col-span-6 flex-col justify-between h-full py-6 pr-6">
                    <div>
                        {/* Insignia de estado */}
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-primary-fixed text-xs font-bold uppercase tracking-wider mb-8 backdrop-blur-md">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                            PharmaCore v2.0 • Edición Cloud
                        </div>

                        <h1 className="text-4xl xl:text-5xl font-black text-white tracking-tight leading-tight">
                            Gestión farmacéutica inteligente, ágil y segura.
                        </h1>

                        <p className="mt-4 text-base text-slate-400 leading-relaxed font-normal">
                            Punto de venta de alta velocidad con deducción automática de lotes FEFO, arqueos de caja en tiempo real y gobierno de permisos por rol.
                        </p>

                        {/* Tarjetas de características clave */}
                        <div className="mt-8 space-y-3.5">
                            <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] backdrop-blur-sm">
                                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary-fixed shrink-0">
                                    <span className="material-symbols-outlined text-xl">event_upcoming</span>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Trazabilidad FEFO</h4>
                                    <p className="text-xs text-slate-400 truncate">Venta automática por lotes según fecha de caducidad más cercana</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] backdrop-blur-sm">
                                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary-fixed shrink-0">
                                    <span className="material-symbols-outlined text-xl">shield_person</span>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Seguridad y Roles RBAC</h4>
                                    <p className="text-xs text-slate-400 truncate">33 permisos ortogonales para control de turnos y anulación</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] backdrop-blur-sm">
                                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary-fixed shrink-0">
                                    <span className="material-symbols-outlined text-xl">cloud_sync</span>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Sincronización Continua</h4>
                                    <p className="text-xs text-slate-400 truncate">Inventario, comprobantes y reportes respaldados en Supabase Cloud</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-8 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-emerald-400">verified_user</span>
                            Conexión SSL Segura
                        </span>
                        <span>Multi-sucursal & POS</span>
                    </div>
                </div>

                {/* Columna Derecha: Tarjeta de Acceso */}
                <div className="lg:col-span-6 flex justify-center">
                    <div className="w-full max-w-md bg-slate-900/80 border border-white/10 rounded-3xl p-7 sm:p-9 shadow-2xl backdrop-blur-2xl relative">
                        {/* Cabecera de la Marca */}
                        <div className="flex flex-col items-center text-center mb-8">
                            <div className="w-16 h-16 rounded-2xl bg-white p-2 flex items-center justify-center overflow-hidden shadow-xl ring-2 ring-primary/40 border border-slate-100 mb-4 transition-transform hover:scale-105 duration-200">
                                {logoType === 'image' && logoImage ? (
                                    <img src={logoImage} alt="Logo" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="w-full h-full rounded-xl bg-primary flex items-center justify-center text-white">
                                        <span className="material-symbols-outlined text-3xl">
                                            {logoIcon || 'local_pharmacy'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <h2 className="text-2xl font-black text-white tracking-tight uppercase leading-tight">
                                {systemTitle || 'PharmaCore'}
                            </h2>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-primary-fixed">
                                    {systemSubtitle || 'ERP Clinical'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-2">
                                Ingresa con tus credenciales asignadas
                            </p>
                        </div>

                        {/* Alerta de Error */}
                        {error && (
                            <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1">
                                <span className="material-symbols-outlined text-lg text-rose-400 shrink-0">
                                    error
                                </span>
                                <span className="flex-1 font-medium leading-relaxed">{error}</span>
                            </div>
                        )}

                        {/* Formulario */}
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                                    Correo Electrónico
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                        <span className="material-symbols-outlined text-lg">alternate_email</span>
                                    </div>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="usuario@farmacia.com"
                                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                        required
                                        autoComplete="email"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                        Contraseña
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setForgotEmail(email);
                                            setIsForgotModalOpen(true);
                                            setForgotSuccess(false);
                                        }}
                                        className="text-xs text-primary-fixed hover:text-white font-semibold transition-colors cursor-pointer"
                                    >
                                        ¿Olvidaste tu contraseña?
                                    </button>
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                        <span className="material-symbols-outlined text-lg">lock</span>
                                    </div>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full pl-10 pr-11 py-3 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                        required
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors cursor-pointer"
                                        tabIndex={-1}
                                        aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                                    >
                                        <span className="material-symbols-outlined text-lg">
                                            {showPassword ? 'visibility_off' : 'visibility'}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* Recordar correo */}
                            <div className="flex items-center pt-1">
                                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={rememberEmail}
                                        onChange={(e) => setRememberEmail(e.target.checked)}
                                        className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-primary focus:ring-primary"
                                    />
                                    <span>Recordar mi correo en este equipo</span>
                                </label>
                            </div>

                            {/* Botón de Enviar */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-primary to-primary-container hover:opacity-95 text-white font-bold text-sm tracking-wide shadow-lg shadow-primary/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
                            >
                                {isLoading ? (
                                    <>
                                        <span className="material-symbols-outlined text-lg animate-spin">
                                            progress_activity
                                        </span>
                                        <span>Autenticando...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Ingresar al Sistema</span>
                                        <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Pie de seguridad */}
                        <div className="mt-8 pt-5 border-t border-slate-800 text-center">
                            <p className="text-[11px] text-slate-500">
                                Acceso restringido al personal autorizado de la farmacia.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal de Recuperación de Contraseña */}
            {isForgotModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative text-left">
                        <button
                            onClick={() => setIsForgotModalOpen(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>

                        <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 text-primary-fixed flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-2xl">lock_reset</span>
                        </div>

                        <h3 className="text-lg font-bold text-white mb-1">Recuperar Contraseña</h3>
                        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                            Ingresa el correo electrónico asociado a tu cuenta. Te enviaremos un enlace seguro para restablecer tu contraseña.
                        </p>

                        {forgotSuccess ? (
                            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs mb-5 space-y-2">
                                <div className="flex items-center gap-2 font-bold text-emerald-300">
                                    <span className="material-symbols-outlined text-lg">mark_email_read</span>
                                    ¡Enlace Enviado!
                                </div>
                                <p className="leading-relaxed">
                                    Hemos enviado las instrucciones a <strong>{forgotEmail}</strong>. Revisa tu bandeja de entrada o spam para completar el proceso.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleSendPasswordReset} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                                        Correo Electrónico
                                    </label>
                                    <input
                                        type="email"
                                        value={forgotEmail}
                                        onChange={(e) => setForgotEmail(e.target.value)}
                                        placeholder="usuario@farmacia.com"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsForgotModalOpen(false)}
                                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSendingForgot}
                                        className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold shadow-md shadow-primary/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                    >
                                        {isSendingForgot ? 'Enviando enlace...' : 'Enviar enlace'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {forgotSuccess && (
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={() => setIsForgotModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-bold cursor-pointer"
                                >
                                    Entendido
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}