'use client';

/**
 * Utilidad para imprimir recibos y comandas con formato térmico 80mm
 */

// ... imports ...

/**
 * IMPRESIÓN DIRECTA SIN DIÁLOGO (Intento)
 * Nota: Los navegadores modernos bloquean la impresión totalmente silenciosa por seguridad.
 * La mejor configuración es usar el modo "Kiosk" del navegador o configurar el navegador
 * para "Impresión silenciosa" en sus argumentos de inicio (--kiosk-printing en Chrome).
 */

// Interfaces para tipado
interface ReceiptItem {
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    sku?: string;
    modifiers: string[];
}

interface ReceiptData {
    orderNumber: string;
    orderType: 'RESTAURANT' | 'DELIVERY';
    date: Date | string;
    cashierName: string;
    customerName?: string;
    customerAddress?: string;
    customerPhone?: string;
    items: ReceiptItem[];
    subtotal?: number;
    discount?: number;
    discountReason?: string; // Ej: "Descuento aplicado"
    deliveryFee?: number;
    total: number;
    serviceFee?: number;
}

export function printReceipt(data: ReceiptData) {
    const printWindow = window.open('', '_blank', 'width=400,height=700');
    if (!printWindow) {
        alert('Habilite popups para imprimir');
        return;
    }

    const date = new Date(data.date);
    const formattedDate = date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const formattedTime = date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });

    const subtotal = data.subtotal ?? data.items.reduce((s, i) => s + i.total, 0);
    const discountAmount = data.discount ?? 0;
    const deliveryFeeAmount = data.deliveryFee ?? 0;
    const total = data.total;
    const serviceFee = data.serviceFee ?? 0;
    const totalSuggested = total + serviceFee;

    // Tipografía profesional para notas de entrega: Arial es la más común en facturas/recibos
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Recibo ${data.orderNumber}</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: Arial, Helvetica, 'Segoe UI', sans-serif;
            font-size: 11px;
            line-height: 1.35;
            color: #1a1a1a;
            max-width: 80mm;
            margin: 0 auto;
            padding: 8px;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .bold { font-weight: 700; }
        .uppercase { text-transform: uppercase; }
        .separator { border-top: 1px dashed #333; margin: 8px 0; }
        .separator-thick { border-top: 2px solid #333; margin: 10px 0; }
        .header { margin-bottom: 12px; padding-bottom: 8px; }
        .company-name { font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
        .doc-title { font-size: 13px; font-weight: 700; margin-top: 6px; letter-spacing: 1px; }
        .info-row { display: flex; justify-content: space-between; margin: 3px 0; }
        .info-label { font-weight: 600; }
        .items-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10px; }
        .items-table th { border-bottom: 1px solid #333; padding: 4px 0; text-align: left; font-weight: 700; }
        .items-table td { padding: 4px 0; vertical-align: top; }
        .items-table .item-name { font-weight: 600; }
        .items-table .item-detail { font-size: 9px; color: #444; }
        .totals-section { margin-top: 10px; }
        .total-row { display: flex; justify-content: space-between; padding: 3px 0; }
        .total-final { font-size: 14px; font-weight: 700; margin-top: 4px; padding-top: 6px; border-top: 2px solid #333; }
        .footer { text-align: center; margin-top: 16px; font-size: 10px; font-weight: 600; }
        @media print {
            @page { margin: 5mm; size: auto; }
            body { padding: 0; }
        }
    </style>
</head>
<body>
    <div class="header text-center">
        <img src="/logo-shanklish.png" alt="Shanklish Caracas" style="max-width: 120px; height: auto; margin-bottom: 8px;">
        <div style="font-size: 10px;">RIF: J413087278</div>
        <div class="doc-title" style="margin-top: 8px;">${data.orderType === 'DELIVERY' ? 'NOTA DE ENTREGA' : 'RECIBO DE PAGO'}</div>
    </div>
    
    <div class="separator"></div>
    
    <div class="info-row">
        <span class="info-label">Control / Correlativo:</span>
        <span class="bold">${data.orderNumber}</span>
    </div>
    <div class="info-row">
        <span class="info-label">Fecha:</span>
        <span>${formattedDate} ${formattedTime}</span>
    </div>
    <div class="info-row">
        <span class="info-label">Operador:</span>
        <span>${data.cashierName}</span>
    </div>
    <div class="info-row">
        <span class="info-label">Tipo:</span>
        <span>${data.orderType === 'RESTAURANT' ? 'RESTAURANTE' : 'DELIVERY'}</span>
    </div>
    
    ${(data.customerName || data.customerAddress || data.customerPhone) ? `
    <div class="separator"></div>
    <div class="bold" style="margin-bottom: 4px;">Cliente</div>
    ${data.customerName ? `<div>${data.customerName}</div>` : ''}
    ${data.customerPhone ? `<div style="font-size: 10px;">Tel: ${data.customerPhone}</div>` : ''}
    ${data.customerAddress ? `<div style="font-size: 10px; margin-top: 2px;">${data.customerAddress}</div>` : ''}
    ` : ''}
    
    <div class="separator"></div>
    
    <table class="items-table">
        <thead>
            <tr>
                <th class="text-left" style="width: 20%;">Cant.</th>
                <th class="text-left" style="width: 50%;">Descripción</th>
                <th class="text-right" style="width: 30%;">Monto</th>
            </tr>
        </thead>
        <tbody>
            ${data.items.map(item => `
            <tr>
                <td class="item-name">${item.quantity} × $${item.unitPrice.toFixed(2)}</td>
                <td>
                    <div class="item-name">${item.name}</div>
                    ${item.modifiers.length > 0 ? `<div class="item-detail">+ ${item.modifiers.join(', ')}</div>` : ''}
                </td>
                <td class="text-right bold">$${item.total.toFixed(2)}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    
    <div class="separator-thick"></div>
    
    <div class="totals-section">
        <div class="total-row">
            <span>Subtotal:</span>
            <span>$${subtotal.toFixed(2)}</span>
        </div>
        ${deliveryFeeAmount > 0 ? `
        <div class="total-row">
            <span>Envío / Delivery:</span>
            <span>$${deliveryFeeAmount.toFixed(2)}</span>
        </div>
        ` : ''}
        ${discountAmount > 0 ? `
        <div class="total-row">
            <span>${data.discountReason || 'Descuento aplicado'}:</span>
            <span>-$${discountAmount.toFixed(2)}</span>
        </div>
        ` : ''}
        ${serviceFee > 0 ? `
        <div class="total-row">
            <span>10% Servicio:</span>
            <span>$${serviceFee.toFixed(2)}</span>
        </div>
        <div class="total-row total-final">
            <span>TOTAL A PAGAR:</span>
            <span>$${totalSuggested.toFixed(2)}</span>
        </div>
        ` : `
        <div class="total-row total-final">
            <span>TOTAL:</span>
            <span>$${total.toFixed(2)}</span>
        </div>
        `}
    </div>
    
    <div class="footer">GRACIAS POR SU COMPRA</div>

    <script>
        window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
        }
    </script>
</body>
</html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
}

/**
 * IMPRESIÓN COMANDA COCINA (Sin precios, letras grandes)
 */
export function printKitchenCommand(data: any) {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) return;

    const date = new Date(data.createdAt);
    const formattedDate = date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>COCINA ${data.orderNumber}</title>
    <style>
        body { font-family: sans-serif; width: 72mm; margin: 2mm; font-weight: bold; }
        .header { text-align: center; border-bottom: 3px solid black; padding-bottom: 5px; margin-bottom: 10px; }
        .title { font-size: 20px; font-weight: 900; }
        .meta { font-size: 14px; margin-top: 5px; }
        .item { border-bottom: 1px dashed #000; padding: 8px 0; display: flex; align-items: flex-start; }
        .qty-box { background: #000; color: #fff; font-size: 22px; padding: 2px 8px; border-radius: 4px; margin-right: 8px; }
        .details { flex: 1; }
        .name { font-size: 18px; line-height: 1.1; }
        .mods { font-size: 14px; margin-top: 4px; font-style: italic; }
        .notes { font-size: 14px; background: #eee; padding: 2px; margin-top: 2px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">COMANDA COCINA</div>
        <div style="font-size: 24px; margin: 5px 0;"># ${data.orderNumber.split('-').pop()}</div>
        <div class="meta">${formattedDate} - ${data.orderType === 'RESTAURANT' ? 'SALA' : 'DELIVERY'}</div>
        ${data.customerName ? `<div>${data.customerName}</div>` : ''}
    </div>
    
    ${data.items.map((item: any) => `
    <div class="item">
        <div class="qty-box">${item.quantity}</div>
        <div class="details">
            <div class="name">${item.name}</div>
            ${item.modifiers && item.modifiers.length > 0 ? `
                <div class="mods">+ ${item.modifiers.join('<br>+ ')}</div>
            ` : ''}
            ${item.notes ? `<div class="notes">📝 ${item.notes}</div>` : ''}
        </div>
    </div>
    `).join('')}
    
    <script>
        window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
        }
    </script>
</body>
</html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
}
