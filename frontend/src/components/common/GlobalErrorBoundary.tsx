import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useRouteError } from 'react-router-dom';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class GlobalErrorBoundaryClass extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('🛑 [PharmaCore Global Error]:', error, errorInfo);
        this.setState({ errorInfo });
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleResetToPos = () => {
        window.location.href = '/pos';
    };

    private handleClearCache = () => {
        if (window.confirm('¿Deseas restablecer la memoria local de la aplicación? Esto no borrará ventas ya registradas en la nube.')) {
            try {
                localStorage.clear();
                sessionStorage.clear();
            } catch (e) {
                console.error(e);
            }
            window.location.href = '/login';
        }
    };

    public render() {
        if (this.state.hasError) {
            return (
                <ErrorDisplay
                    error={this.state.error}
                    errorInfo={this.state.errorInfo}
                    onReload={this.handleReload}
                    onGoPos={this.handleResetToPos}
                    onClearCache={this.handleClearCache}
                />
            );
        }

        return this.props.children;
    }
}

// Para usar como errorElement en react-router-dom
export function RouterErrorBoundary() {
    const error = useRouteError() as any;

    return (
        <ErrorDisplay
            error={error instanceof Error ? error : new Error(error?.statusText || error?.message || 'Error de enrutamiento')}
            errorInfo={null}
            onReload={() => window.location.reload()}
            onGoPos={() => (window.location.href = '/pos')}
            onClearCache={() => {
                localStorage.clear();
                window.location.href = '/login';
            }}
        />
    );
}

function ErrorDisplay({
    error,
    errorInfo,
    onReload,
    onGoPos,
    onClearCache,
}: {
    error: Error | null;
    errorInfo: ErrorInfo | null;
    onReload: () => void;
    onGoPos: () => void;
    onClearCache: () => void;
}) {
    return (
        <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans">
            <div className="max-w-xl w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center">
                {/* Icono de advertencia clínica */}
                <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-5 shadow-lg shadow-rose-500/10">
                    <span className="material-symbols-outlined text-3xl">emergency_home</span>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-bold uppercase tracking-wider mb-3">
                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
                    Interrupción Controlada
                </div>

                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
                    El sistema detectó una excepción inesperada
                </h1>

                <p className="text-xs sm:text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
                    Tus datos en Supabase Cloud están a salvo. La interfaz capturó un fallo para evitar corrupción de memoria en tu turno.
                </p>

                {/* Detalle técnico colapsable */}
                {error && (
                    <details className="w-full text-left bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 mb-6 text-xs group cursor-pointer">
                        <summary className="font-semibold text-slate-300 flex items-center justify-between select-none">
                            <span className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm text-slate-400">code</span>
                                Ver detalle técnico del error
                            </span>
                            <span className="material-symbols-outlined text-sm text-slate-400 group-open:rotate-180 transition-transform">
                                expand_more
                            </span>
                        </summary>
                        <div className="mt-3 pt-3 border-t border-slate-800/60 font-mono text-[11px] text-rose-300/90 overflow-x-auto max-h-40 whitespace-pre-wrap">
                            <p className="font-bold text-white mb-1">{error.name}: {error.message}</p>
                            {error.stack}
                            {errorInfo?.componentStack}
                        </div>
                    </details>
                )}

                {/* Botones de acción */}
                <div className="w-full flex flex-col sm:flex-row items-center gap-3">
                    <button
                        onClick={onReload}
                        className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                    >
                        <span className="material-symbols-outlined text-lg">refresh</span>
                        Recargar Sistema
                    </button>
                    <button
                        onClick={onGoPos}
                        className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-sm border border-slate-700/80 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-lg">point_of_sale</span>
                        Ir a Punto de Venta
                    </button>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/60 w-full flex items-center justify-center">
                    <button
                        onClick={onClearCache}
                        className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1.5 cursor-pointer underline underline-offset-4"
                    >
                        <span className="material-symbols-outlined text-sm">delete_sweep</span>
                        Restablecer sesión local si persiste el error
                    </button>
                </div>
            </div>
        </div>
    );
}

export default GlobalErrorBoundaryClass;
