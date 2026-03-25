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
 * Usa iframe oculto para no interrumpir la pantalla de cocina.
 * Para impresión completamente silenciosa (sin diálogo), lanzar Chrome con:
 *   --kiosk-printing
 */
// station: 'kitchen' (default) | 'bar'
export function printKitchenCommand(data: any, station: 'kitchen' | 'bar' = 'kitchen') {
    const date = new Date(data.createdAt);
    const formattedTime = date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    const orderNum = data.orderNumber.split('-').pop();
    const stationLabel = station === 'bar' ? '-- BARRA --' : '-- COCINA --';

    // Deduplicar items: combinar entradas con mismo nombre + mismos modificadores
    const deduped: any[] = [];
    for (const item of (data.items || [])) {
        const modsKey = (item.modifiers || []).slice().sort().join('|');
        const existing = deduped.find(
            d => d.name === item.name && d._modsKey === modsKey
        );
        if (existing) {
            existing.quantity += item.quantity;
        } else {
            deduped.push({ ...item, _modsKey: modsKey });
        }
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>COMANDA ${data.orderNumber}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', Courier, monospace;
            width: 80mm;
            background: white;
            color: black;
            font-size: 14px;
            padding: 2mm 2mm 0 2mm;
        }
        .sep {
            font-size: 13px;
            letter-spacing: 1px;
            text-align: center;
            margin: 4px 0;
        }
        .title {
            text-align: center;
            font-size: 16px;
            font-weight: 900;
            letter-spacing: 4px;
            margin: 4px 0;
        }
        .order-num {
            text-align: center;
            font-size: 64px;
            font-weight: 900;
            line-height: 1;
            margin: 6px 0 4px;
        }
        .meta {
            text-align: center;
            font-size: 14px;
            font-weight: bold;
            margin: 2px 0;
        }
        .customer {
            text-align: center;
            font-size: 14px;
            font-weight: bold;
            margin-top: 2px;
        }
        .item {
            border-bottom: 1px dashed #000;
            padding: 7px 2px;
            display: flex;
            align-items: flex-start;
            gap: 6px;
        }
        .qty-box {
            background: #000;
            color: #fff;
            font-size: 22px;
            font-weight: 900;
            padding: 2px 8px;
            min-width: 38px;
            text-align: center;
            flex-shrink: 0;
        }
        .details { flex: 1; }
        .name {
            font-size: 17px;
            font-weight: 900;
            line-height: 1.2;
        }
        .mods {
            font-size: 13px;
            margin-top: 3px;
            font-style: italic;
            font-weight: normal;
        }
        .notes {
            font-size: 13px;
            font-weight: 900;
            margin-top: 4px;
            padding: 2px 4px;
            border: 1px solid #000;
        }
        .tail {
            text-align: center;
            font-size: 13px;
            margin-top: 6px;
            letter-spacing: 1px;
        }
        .order-type {
            text-align: center;
            font-size: 24px;
            font-weight: 900;
            margin: 4px 0 2px;
            letter-spacing: 1px;
        }
        .correlativo {
            text-align: center;
            font-size: 11px;
            font-weight: normal;
            letter-spacing: 1px;
            margin-top: 4px;
        }
        @media print {
            @page { margin: 0mm 2mm; size: 80mm auto; }
            body { padding: 2mm 2mm 0 2mm; }
        }
    </style>
</head>
<body>
    <div class="sep">--------------------------------</div>
    <div class="title">${stationLabel}</div>
    <div class="order-num">#${orderNum}</div>
    <div class="order-type">${
        data.orderType === 'DELIVERY'
            ? '🛵 DELIVERY'
            : data.sourceChannel === 'POS_PEDIDOSYA'
                ? '📱 PEDIDOS YA'
                : data.tableName
                    ? `🪑 ${data.tableName}`
                    : '🥡 PICKUP'
    }</div>
    <div class="sep">--------------------------------</div>
    <div class="meta">${formattedTime}</div>
    ${data.customerName ? `<div class="customer">${data.customerName}</div>` : ''}
    ${data.address ? `<div style="text-align:center;font-size:12px;font-weight:normal;margin:2px 4px;">${data.address}</div>` : ''}
    <div class="sep">--------------------------------</div>

    ${deduped.map((item: any) => `
    <div class="item">
        <div class="qty-box">${item.quantity}</div>
        <div class="details">
            <div class="name">${item.name}</div>
            ${item.modifiers && item.modifiers.length > 0 ? `
                <div class="mods">+ ${item.modifiers.join('<br>+ ')}</div>
            ` : ''}
            ${item.notes ? `<div class="notes">*** ${item.notes} ***</div>` : ''}
        </div>
    </div>
    `).join('')}

    <div class="tail">--------------------------------</div>
    <div class="correlativo">${data.orderNumber}</div>
    <br><br><br><br><br><br><br><br>
</body>
</html>`;

    // Iframe oculto: no abre nueva ventana ni interrumpe la pantalla de cocina
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
        document.body.removeChild(iframe);
        return;
    }

    doc.open('text/html', 'replace');
    doc.write(html);
    doc.close();

    // Esperar a que el contenido cargue antes de imprimir
    setTimeout(() => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } catch (e) {
            console.warn('Error al imprimir comanda:', e);
        }
        setTimeout(() => {
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
        }, 2000);
    }, 300);
}
