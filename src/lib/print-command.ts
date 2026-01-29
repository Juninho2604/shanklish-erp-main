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
    items: ReceiptItem[];
    subtotal?: number;
    discount?: number;
    total: number;
    serviceFee?: number;
}

export function printReceipt(data: ReceiptData) {
    // Ventana para el Recibo del Cliente (Nota de Entrega)
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
        alert('Habilite popups para imprimir');
        return;
    }

    const date = new Date(data.date);
    const formattedDate = date.toLocaleDateString('es-VE');
    const formattedTime = date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });

    // Cálculo de montos
    const subtotal = data.subtotal || data.items.reduce((s, i) => s + i.total, 0);
    const discountAmount = data.discount || 0;
    const total = data.total;
    // Asumimos que el 10% ya está incluido o se calcula aparte. En la foto parece ser un cargo extra "10% Servicio".
    // Si data.serviceFee viene, lo usamos.
    const serviceFee = data.serviceFee || 0;
    const totalSuggested = total + serviceFee;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Recibo ${data.orderNumber}</title>
    <style>
        body {
            font-family: 'Courier New', Courier, monospace; /* Fuente monoespaciada tipo ticket */
            font-size: 12px;
            width: 72mm; /* Ajustado para margen seguro en papel de 80mm */
            margin: 0 auto;
            color: #000;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .bold { font-weight: bold; }
        .uppercase { text-transform: uppercase; }
        
        .header { margin-bottom: 10px; }
        .logo-font { font-family: 'Brush Script MT', cursive; font-size: 24px; }
        
        .separator { border-top: 1px dashed #000; margin: 5px 0; }
        
        .info-grid { display: grid; grid-template-columns: auto auto; justify-content: space-between; }
        
        .items-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        .items-table th { border-bottom: 1px solid #000; text-align: left; font-size: 11px; }
        .items-table td { padding-top: 4px; vertical-align: top; }
        
        .totals-grid { margin-top: 10px; display: flex; flex-direction: column; align-items: flex-end; }
        .total-row { display: flex; justify-content: space-between; width: 100%; }
        .total-label { font-weight: bold; }
        
        @media print {
            @page { margin: 0; size: auto; }
            body { margin: 5mm; }
        }
    </style>
</head>
<body>
    <div class="header text-center">
        <!-- Puedes reemplazar esto con una imagen <img> tag base64 si tienes el logo -->
        <div class="logo-font">Shanklish</div>
        <div style="font-size: 10px;">- Caracas -</div>
        
        <div class="bold upppercase" style="margin-top: 5px;">SHANKLISH CARACAS, C.A</div>
        <div class="bold">J-41308727-8</div>
        <div class="bold" style="margin-top: 5px;">RECIBO DE PAGO</div>
    </div>
    
    <div class="separator"></div>
    
    <div class="info-grid">
        <span class="bold">Numero:</span>
        <span>${data.orderNumber.split('-').pop()}</span>
    </div>
    <div class="info-grid">
        <span class="bold">Fecha:</span>
        <span>${formattedDate} ${formattedTime}</span>
    </div>
    
    <div class="separator"></div>
    
    <div class="uppercase bold">
        ${data.cashierName}: #01
    </div>
    <div class="uppercase bold">
        ${data.orderType === 'RESTAURANT' ? 'RESTAURANT' : 'DELIVERY'}
    </div>
    
    ${data.customerName ? `
    <div class="separator"></div>
    <div class="uppercase">
        <div>CLI: ${data.customerName}</div>
        ${data.customerAddress ? `<div style="font-size: 10px;">DIR: ${data.customerAddress}</div>` : ''}
    </div>
    ` : ''}
    
    <div class="separator"></div>
    
    <table class="items-table">
        <thead>
            <tr>
                <th width="15%">Cod</th>
                <th width="60%">Desc</th>
                <th width="25%" class="text-right">Monto</th>
            </tr>
        </thead>
        <tbody>
            ${data.items.map(item => `
            <tr>
                <td colspan="3" class="bold uppercase">${item.name}</td>
            </tr>
            <tr>
                <td>${(item.sku || '001').substring(0, 3)}</td>
                <td>
                    ${item.quantity.toFixed(2)} X $${item.unitPrice.toFixed(2)}
                    ${item.modifiers.length > 0 ? `<br><span style="font-size:10px; font-style:italic;">+ ${item.modifiers.join(', ')}</span>` : ''}
                </td>
                <td class="text-right">$${item.total.toFixed(2)}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    
    <div class="separator"></div>
    
    <div class="totals-grid">
        <div class="total-row">
            <span>Subtotal:</span>
            <span>$${subtotal.toFixed(2)}</span>
        </div>
        
        ${discountAmount > 0 ? `
        <div class="total-row bold">
            <span>Descuento:</span>
            <span>-$${discountAmount.toFixed(2)}</span>
        </div>
        ` : ''}
        
        <div class="total-row bold" style="font-size: 14px; margin: 2px 0;">
            <span>TOTAL:</span>
            <span>$${total.toFixed(2)}</span>
        </div>
        
        ${serviceFee > 0 ? `
        <div class="total-row">
            <span>10% Servicio:</span>
            <span>$${serviceFee.toFixed(2)}</span>
        </div>
        <div class="total-row bold" style="margin-top: 2px;">
            <span>Total Sugerido:</span>
            <span>$${totalSuggested.toFixed(2)}</span>
        </div>
        ` : ''}
    </div>
    
    <div class="text-center" style="margin-top: 15px; font-size: 10px;">
        GRACIAS POR SU COMPRA
    </div>

    <script>
        window.onload = function() {
            window.print();
            // Cerrar automáticamente después de imprimir (pequeño delay para asegurar spool)
            setTimeout(function() {
                window.close();
            }, 500);
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
