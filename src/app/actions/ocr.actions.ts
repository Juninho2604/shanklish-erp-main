'use server';

// import { ImageAnnotatorClient } from '@google-cloud/vision'; // Ya no es necesario con API Key
import Fuse from 'fuse.js';
import { prisma } from '@/server/db';
import { getSession } from '@/lib/auth';

/**
 * Server Action que recibe una imagen (en base64) y utiliza Google Cloud Vision API (REST)
 * para detectar texto manuscrito. Luego usa Fuzzy Search para mapear ese texto
 * a productos existentes en la base de datos.
 */
export async function processHandwrittenNotesAction(imageBase64: string) {
    try {
        // 1. Verificar Sesión
        const session = await getSession();
        if (!session?.id) {
            return { success: false, message: 'No autorizado' };
        }

        // 2. Verificar API Key
        // En tu .env debes tener: GOOGLE_VISION_API_KEY=AIzaSy...
        const apiKey = process.env.GOOGLE_VISION_API_KEY;

        if (!apiKey) {
            return { success: false, message: 'Falta configurar la API Key de Google (GOOGLE_VISION_API_KEY) en el archivo .env' };
        }

        // 3. Preparar el payload para la API REST
        // Limpiar el header del base64 si existe
        // El cliente sube la imagen cruda base64
        const content = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        const requestBody = {
            requests: [
                {
                    image: {
                        content: content
                    },
                    features: [
                        {
                            type: "DOCUMENT_TEXT_DETECTION" // Ideal para manuscrito denso
                        },
                        {
                            type: "TEXT_DETECTION" // Respaldo
                        }
                    ]
                }
            ]
        };

        // 4. Llamar a la API de Google (Fetch)
        const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Google Vision API Error:', errorData);
            return { success: false, message: `Error de Google: ${errorData.error?.message || response.statusText}` };
        }

        const data = await response.json();
        const fullTextAnnotation = data.responses?.[0]?.fullTextAnnotation;

        if (!fullTextAnnotation || !fullTextAnnotation.text) {
            return { success: false, message: 'No se detectó texto legible en la imagen.' };
        }

        const detectedText = fullTextAnnotation.text;

        // 5. Separar por líneas
        const lines = detectedText.split('\n').filter((line: string) => line.trim().length > 0);

        // 6. Obtener lista de productos activos para comparar
        const products = await prisma.inventoryItem.findMany({
            where: { isActive: true },
            select: { id: true, name: true, sku: true, baseUnit: true }
        });

        // 7. Configurar Fuse.js para búsqueda difusa
        const fuse = new Fuse(products, {
            keys: ['name', 'sku'],
            includeScore: true,
            threshold: 0.5, // Aumentamos un poco para ser más flexibles (0.0 exacto, 1.0 cualquier cosa)
            ignoreLocation: true,
            minMatchCharLength: 3
        });

        const suggestions = [];

        // Palabras a ignorar (encabezados comunes)
        const BLACKLIST = ['FECHA', 'DATE', 'ITEM', 'PRODUCTO', 'DESCRIPCION', 'CANTIDAD', 'TOTAL', 'PRECIO', 'FIRMA', 'RECIBIDO', 'ENTREGADO', 'NOTA', 'CLIENTE', 'DIRECCION', 'RIF'];

        // 8. Procesar cada línea
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.length < 3) continue;

            const upperLine = trimmedLine.toUpperCase();
            if (BLACKLIST.some(keyword => upperLine.includes(keyword) && upperLine.length < keyword.length + 5)) {
                continue;
            }

            // Intentar extraer cantidad
            // Regex: Busca números al inicio (ej: "2.5 kg")
            const quantityMatch = trimmedLine.match(/^(\d+([.,]\d+)?)/);
            let quantity = 1;
            let textToSearch = trimmedLine;

            if (quantityMatch) {
                quantity = parseFloat(quantityMatch[0].replace(',', '.'));
                textToSearch = trimmedLine.replace(quantityMatch[0], '').trim();
            }

            // Limpiar unidades comunes
            textToSearch = textToSearch.replace(/^(kg|gr|lbs|und|uni|lt|ml|paq|caja|bulto)\s+/i, '').trim();

            if (textToSearch.length < 3) continue;

            // Buscar el producto más parecido
            const searchResult = fuse.search(textToSearch);

            let match = null;
            if (searchResult.length > 0 && (searchResult[0].score || 1) < 0.6) {
                match = {
                    item: searchResult[0].item,
                    score: searchResult[0].score,
                };
            }

            suggestions.push({
                originalText: line,
                detectedQuantity: quantity,
                match: match,
            });
        }

        return {
            success: true,
            suggestions,
            rawText: detectedText
        };

    } catch (error) {
        console.error('Error processing image with Google Vision:', error);
        return { success: false, message: 'Error procesando la imagen con IA: ' + (error as Error).message };
    }
}
