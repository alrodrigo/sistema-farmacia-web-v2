import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useBrandingStore } from '@/stores/brandingStore';

type TicketReceiptProps = {
    saleId: string;
    onComplete: () => void;
};

export default function TicketReceipt({ saleId, onComplete }: TicketReceiptProps) {
    const { logoType, logoIcon, logoImage } = useBrandingStore();
    const [saleData, setSaleData] = useState<any>(null);
    const [storeInfo, setStoreInfo] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function fetchSale() {
            try {
                // 1. Cargar datos de la venta y sus detalles con lotes
                const { data: sale, error } = await supabase
                    .from('sales')
                    .select(`
                        *,
                        sale_details (
                            quantity,
                            unit_price_cents,
                            subtotal_cents,
                            products (name, active_substance),
                            product_batches (lot_number, expiration_date)
                        ),
                        user_profiles!sales_user_id_fkey (full_name)
                    `)
                    .eq('id', saleId)
                    .single();

                if (error) throw error;
                setSaleData(sale);

                // 2. Cargar configuración de farmacia (nombre, NIT, dirección)
                const { data: settings } = await supabase
                    .from('store_settings')
                    .select('*')
                    .limit(1)
                    .maybeSingle();

                setStoreInfo(settings);
            } catch (err) {
                console.error("Error cargando ticket:", err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchSale();
    }, [saleId]);

    const groupedDetails = useMemo(() => {
        if (!saleData?.sale_details) return [];
        const map = new Map<string, any>();
        for (const item of saleData.sale_details) {
            const key = item.product_id || item.products?.name || item.id;
            if (map.has(key)) {
                const prev = map.get(key);
                prev.quantity += item.quantity;
                prev.subtotal_cents += item.subtotal_cents;
            } else {
                map.set(key, { ...item });
            }
        }
        return Array.from(map.values());
    }, [saleData?.sale_details]);

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/80 backdrop-blur-sm">
                <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-xl flex items-center gap-3 text-secondary text-sm font-semibold">
                    <span className="material-symbols-outlined animate-spin text-primary text-2xl">progress_activity</span>
                    <span>Generando vista del ticket...</span>
                </div>
            </div>
        );
    }

    if (!saleData) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/80 backdrop-blur-sm">
                <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-xl text-center max-w-sm">
                    <span className="material-symbols-outlined text-error text-4xl mb-2">error</span>
                    <p className="text-on-surface font-bold text-base mb-1">Error al cargar el ticket</p>
                    <p className="text-secondary text-xs mb-4">No se pudieron recuperar los detalles de esta venta.</p>
                    <button
                        onClick={onComplete}
                        className="bg-primary text-on-primary px-5 py-2 rounded-xl text-xs font-bold shadow hover:bg-primary-container transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        );
    }

    const totalBs = (saleData.total_cents / 100).toFixed(2);
    const receivedBs = saleData.received_amount_cents ? (saleData.received_amount_cents / 100).toFixed(2) : null;
    const changeBs = saleData.change_amount_cents ? (saleData.change_amount_cents / 100).toFixed(2) : null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-inverse-surface/80 backdrop-blur-sm overflow-y-auto">
            {/* TICKET TÉRMICO (80mm) */}
            <div
                id="ticket-receipt"
                className="bg-white text-black p-4 w-[80mm] min-h-[100mm] font-mono text-sm shadow-2xl border border-gray-300"
            >
                {/* Cabecera del Ticket (Cargada desde store_settings y branding) */}
                <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
                    {logoType === 'image' && logoImage ? (
                        <div className="flex justify-center mb-1.5">
                            <img src={logoImage} alt="Logo" className="max-h-12 max-w-[140px] object-contain grayscale" />
                        </div>
                    ) : (
                        <div className="w-7 h-7 mx-auto mb-1.5 rounded bg-black text-white flex items-center justify-center">
                            <span className="material-symbols-outlined text-[18px]">{logoIcon || 'local_pharmacy'}</span>
                        </div>
                    )}
                    <h2 className="text-base font-bold uppercase tracking-tight">
                        {storeInfo?.business_name || 'Farmacia PharmaCore'}
                    </h2>
                    {storeInfo?.address && <p className="text-xs">{storeInfo.address}</p>}
                    {storeInfo?.phone && <p className="text-xs">Tel: {storeInfo.phone}</p>}
                    <p className="text-xs">NIT: {storeInfo?.nit || '1234567018'}</p>
                    <p className="text-xs mt-2 font-bold">Ticket: #{saleId.split('-')[0].toUpperCase()}</p>
                    <p className="text-xs">Fecha: {new Date(saleData.created_at).toLocaleString('es-ES')}</p>
                    <p className="text-xs">Cajero: {saleData.user_profiles?.full_name || 'Caja 1'}</p>
                    <p className="text-xs font-semibold">
                        Pago: {saleData.payment_method === 'card' ? 'Tarjeta' : saleData.payment_method === 'qr' ? 'Pago QR' : 'Efectivo'}
                    </p>

                    {/* Datos del Cliente */}
                    <div className="mt-1.5 pt-1.5 border-t border-dotted border-gray-300 text-left">
                        <p className="text-xs">
                            <span className="font-bold">Cliente:</span> {saleData.client_name || 'Sin Nombre'}
                        </p>
                        <p className="text-xs">
                            <span className="font-bold">NIT/CI:</span> {saleData.client_nit || '0'}
                        </p>
                    </div>

                    {saleData.status === 'cancelled' && (
                        <p className="text-xs font-bold text-red-600 mt-1 uppercase border border-red-600 p-0.5">
                            *** VENTA ANULADA ***
                        </p>
                    )}
                </div>

                {/* Detalles de la Venta */}
                <table className="w-full text-xs mb-2">
                    <thead>
                        <tr className="border-b border-gray-400">
                            <th className="text-left font-bold py-1 w-2/4">CANT / DESC</th>
                            <th className="text-right font-bold py-1 w-1/4">P.U.</th>
                            <th className="text-right font-bold py-1 w-1/4">SUBT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupedDetails.map((item: any, index: number) => (
                            <tr key={index} className="align-top border-b border-dotted border-gray-200">
                                <td className="py-1 pr-1">
                                    <div>{item.quantity}x {item.products?.name}</div>
                                </td>
                                <td className="py-1 text-right">{(item.unit_price_cents / 100).toFixed(2)}</td>
                                <td className="py-1 text-right font-bold">{(item.subtotal_cents / 100).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Totales y Vuelto */}
                <div className="border-t border-dashed border-gray-400 pt-2 mt-2">
                    {saleData.discount_cents > 0 && (
                        <div className="mb-1 text-xs text-gray-700">
                            <div className="flex justify-between">
                                <span>SUBTOTAL:</span>
                                <span>Bs {((saleData.total_cents + saleData.discount_cents) / 100).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-green-800 font-semibold">
                                <span>
                                    DESCUENTO {saleData.discount_type === 'percentage' && saleData.discount_percent ? `(${saleData.discount_percent}%)` : ''}:
                                </span>
                                <span>-Bs {(saleData.discount_cents / 100).toFixed(2)}</span>
                            </div>
                            {saleData.discount_reason && (
                                <p className="text-[10px] text-gray-500 italic text-left">{saleData.discount_reason}</p>
                            )}
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-base border-t border-dotted border-gray-300 pt-1">
                        <span>TOTAL A PAGAR:</span>
                        <span>Bs {totalBs}</span>
                    </div>

                    {saleData.payment_method === 'cash' && receivedBs && (
                        <div className="mt-1 pt-1 border-t border-dotted border-gray-300 text-xs text-gray-700">
                            <div className="flex justify-between">
                                <span>Efectivo Recibido:</span>
                                <span>Bs {receivedBs}</span>
                            </div>
                            {changeBs && (
                                <div className="flex justify-between font-bold text-black mt-0.5">
                                    <span>Cambio / Vuelto:</span>
                                    <span>Bs {changeBs}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Pie del Ticket */}
                <div className="text-center mt-5 text-xs text-gray-600">
                    <p>{storeInfo?.ticket_footer || '¡Gracias por su preferencia! Conserve su comprobante.'}</p>
                    <p className="mt-3 text-[10px]">PharmaCore ERP</p>
                </div>
            </div>

            {/* Botones de acción en Pantalla (Ocultos al Imprimir) */}
            <div className="mt-6 flex gap-4 print:hidden">
                <button
                    onClick={handlePrint}
                    className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold shadow hover:bg-primary-container transition-all flex items-center gap-2 active:scale-95"
                >
                    <span className="material-symbols-outlined text-[20px]">print</span>
                    <span>Imprimir en Tiquetera</span>
                </button>
                <button
                    onClick={onComplete}
                    className="bg-surface-container-high text-on-surface px-6 py-2.5 rounded-xl font-bold shadow hover:bg-surface-variant transition-colors"
                >
                    Cerrar
                </button>
            </div>
        </div>
    );
}