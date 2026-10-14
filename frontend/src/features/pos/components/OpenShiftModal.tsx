import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { openCashShift, type CashShift } from '../services/cashShiftsApi';
import { toast } from '@/stores/toastStore';

interface OpenShiftModalProps {
    isOpen: boolean;
    onClose: () => void;
    onShiftOpened: (shift: CashShift) => void;
}

export default function OpenShiftModal({ isOpen, onClose, onShiftOpened }: OpenShiftModalProps) {
    const { user } = useAuthStore();
    const [openingBs, setOpeningBs] = useState('100.00');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        const amountCents = Math.round((parseFloat(openingBs) || 0) * 100);
        if (amountCents < 0) {
            toast.warning('El monto inicial no puede ser negativo.');
            return;
        }

        setIsSubmitting(true);
        try {
            const shift = await openCashShift(user.id, amountCents, notes);
            toast.success(`Caja abierta con éxito con un fondo de Bs ${parseFloat(openingBs).toFixed(2)}`, 'Turno Iniciado');
            onShiftOpened(shift);
            onClose();
        } catch (err: any) {
            console.error('Error abriendo caja:', err);
            toast.error(err.message || 'Error al abrir caja', 'Error de Apertura');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-sm">
            <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-surface-container">
                <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
                    <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-[22px]">lock_open</span>
                        </span>
                        <div>
                            <h2 className="text-lg font-bold text-on-surface">Apertura de Caja / Turno</h2>
                            <p className="text-xs text-secondary">Registro de fondo inicial de cambio</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-secondary hover:text-error transition-colors p-1.5 rounded-lg hover:bg-surface-container"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                        <span className="font-bold block mb-1">💡 Fondo de Cambio (Caja Chica):</span>
                        Ingresa el monto de dinero en billetes y monedas que tienes en la gaveta antes de iniciar las ventas.
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase text-secondary tracking-wider">
                            Fondo Inicial de Apertura (Bs) *
                        </label>
                        <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-secondary">
                                Bs
                            </span>
                            <input
                                type="number"
                                step="0.50"
                                min="0"
                                value={openingBs}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setOpeningBs(e.target.value.replace(/^0+(?=\d)/, ''))}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface font-mono text-lg font-bold border border-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
                                placeholder="0.00"
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase text-secondary tracking-wider">
                            Observaciones / Nota (Opcional)
                        </label>
                        <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-3.5 py-2 rounded-xl bg-surface-container-low text-on-surface text-xs border border-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Ej. Billetes de 20 y 10 para cambio..."
                        />
                    </div>

                    <div className="mt-2 flex justify-end gap-3 pt-3 border-t border-surface-container">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:bg-surface-container transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-2 bg-primary hover:bg-primary-container text-on-primary px-5 py-2.5 rounded-xl text-xs font-bold shadow transition-all active:scale-95 disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-[18px]">lock_open</span>
                            <span>{isSubmitting ? 'Abriendo...' : 'Abrir Caja'}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
