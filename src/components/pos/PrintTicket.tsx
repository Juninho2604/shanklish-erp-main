'use client';

import { forwardRef } from 'react';

interface TicketItem {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    modifiers: { name: string; priceAdjustment: number }[];
    notes?: string;
}

interface TicketData {
    orderNumber: string;
    orderType: 'RESTAURANT' | 'DELIVERY';
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    items: TicketItem[];
    subtotal: number;
    total: number;
    paymentMethod: string;
    amountPaid: number;
    change: number;
    date: Date;
}

interface PrintTicketProps {
    data: TicketData;
}

const PrintTicket = forwardRef<HTMLDivElement, PrintTicketProps>(({ data }, ref) => {
    const formatDate = (date: Date) => {
        return date.toLocaleDateString('es-VE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getPaymentMethodLabel = (method: string) => {
        switch (method) {
            case 'CASH': return 'Efectivo';
            case 'CARD': return 'Tarjeta';
            case 'TRANSFER': return 'Transferencia';
            default: return method;
        }
    };

    return (
        <div
            ref={ref}
            className="hidden print:block bg-white text-black p-2 font-serif text-[11px] leading-tight"
            style={{ width: '80mm', maxWidth: '80mm' }}
        >
            {/* Header */}
            <div className="text-center mb-4">
                <img src="/logo-shanklish.png" alt="Shanklish Caracas" className="max-w-[120px] mx-auto mb-2" />
                <div className="font-bold text-[12px]">RIF: J413087278</div>
                <div className="font-bold text-[12px] mt-2">RECIBO DE PAGO</div>
            </div>

            {/* Info Orden */}
            <div className="mb-2">
                <div className="flex justify-between">
                    <span>Numero:</span>
                    <span className="font-bold">{data.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                    <span>Fecha</span>
                    <span>{data.date.toLocaleString('es-VE')}</span>
                </div>
            </div>

            {/* Cliente */}
            <div className="mb-2 uppercase font-bold text-[12px] border-b border-black border-dashed pb-2">
                {data.customerName || 'CLIENTE GENERICO'}
                <div className="font-normal">{data.orderType}</div>
            </div>

            {/* Encabezados Tabla */}
            <div className="flex text-[10px] font-bold mb-1">
                <span className="w-12 text-center">Codigo</span>
                <span className="flex-1 text-center">Descripcion</span>
                <span className="w-16 text-right">Monto</span>
            </div>

            {/* Items */}
            <div className="mb-2">
                {data.items.map((item, idx) => (
                    <div key={idx} className="mb-2">
                        {/* Línea 1: Código y Nombre */}
                        <div className="flex">
                            <span className="w-8 text-[10px] pt-0.5 text-center">{(idx + 1).toString().padStart(2, '0')}</span>
                            <span className="flex-1 uppercase font-bold text-[11px]">{item.name}</span>
                        </div>
                        {/* Línea 2: Cálculo */}
                        <div className="flex justify-end text-[11px]">
                            <span className="mr-2">{item.quantity.toFixed(2)}</span>
                            <span className="mr-2">X</span>
                            <span className="mr-2">$ {item.unitPrice.toFixed(2)}</span>
                            <span className="mr-2">=</span>
                            <span className="w-14 text-right">$ {item.lineTotal.toFixed(2)}</span>
                        </div>
                        {/* Modificadores */}
                        {item.modifiers.length > 0 && (
                            <div className="text-[10px] pl-10 italic text-gray-800">
                                {item.modifiers.map(m => m.name).join(', ')}
                            </div>
                        )}
                        {/* Nota */}
                        {item.notes && (
                            <div className="text-[10px] pl-10 italic">({item.notes})</div>
                        )}
                    </div>
                ))}
            </div>

            <div className="border-t border-black my-2"></div>

            {/* Totales */}
            <div className="flex flex-col items-end text-[12px]">
                {/* Descuento si existe */}
                {/* 
                <div className="flex justify-between w-full">
                    <span>Descuento:</span>
                    <span>$ 0.00</span>
                </div> 
                */}

                <div className="flex justify-between w-48 font-bold text-[14px] mt-1">
                    <span>Total:</span>
                    <span>$ {data.total.toFixed(2)}</span>
                </div>

                {/* Servicio (Simulado o real, en la imagen sale) */}
                <div className="flex justify-between w-48 mt-1 text-[11px]">
                    <span>10 % Servicio:</span>
                    <span>$ {(data.total * 0.10).toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-48 font-bold mt-1 text-[12px]">
                    <span>Total Sugerido:</span>
                    <span>$ {(data.total * 1.10).toFixed(2)}</span>
                </div>

                <div className="flex justify-between w-48 mt-2 text-[10px] italic">
                    <span>Pagado ({getPaymentMethodLabel(data.paymentMethod)}):</span>
                    <span>$ {data.amountPaid.toFixed(2)}</span>
                </div>
            </div>

            <div className="mt-8 text-center text-[10px]">
                GRACIAS POR SU COMPRA
            </div>
            <div className="h-4"></div>
        </div>
    );
});

PrintTicket.displayName = 'PrintTicket';

export default PrintTicket;
