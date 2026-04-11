/**
 * PBKDF2-SHA256 password hashing via Web Crypto API (Node 18+, Edge runtime).
 * Formato almacenado: "saltHex:hashHex" (100 000 iteraciones, 256 bits).
 *
 * Retrocompatibilidad: si el hash almacenado no contiene ':', se asume texto
 * plano (usuarios legacy antes de la implementación de hashing).
 */

function hexToUint8Array(hex: string): Uint8Array {
    const pairs = hex.match(/.{2}/g) ?? [];
    return new Uint8Array(pairs.map(b => parseInt(b, 16)));
}

function uint8ArrayToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function pbkdf2Hex(input: string, saltHex: string): Promise<string> {
    const salt = hexToUint8Array(saltHex);
    const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(input),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    const hashBuf = await globalThis.crypto.subtle.deriveBits(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { name: 'PBKDF2', salt: salt as any, iterations: 100_000, hash: 'SHA-256' },
        keyMaterial,
        256,
    );
    return uint8ArrayToHex(new Uint8Array(hashBuf));
}

/** Hashea una contraseña con PBKDF2-SHA256 + salt aleatorio de 16 bytes. */
export async function hashPassword(password: string): Promise<string> {
    const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const saltHex = uint8ArrayToHex(saltBytes);
    const hashHex = await pbkdf2Hex(password, saltHex);
    return `${saltHex}:${hashHex}`;
}

/**
 * Verifica una contraseña contra el hash almacenado.
 * - Si el hash contiene ':', usa PBKDF2 (usuarios nuevos / con contraseña actualizada).
 * - Si no contiene ':', compara texto plano (usuarios legacy).
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    if (!stored.includes(':')) {
        // Legacy: plain-text (usuarios creados antes del hashing)
        return stored === password;
    }
    const [saltHex] = stored.split(':');
    const computed = await pbkdf2Hex(password, saltHex);
    return `${saltHex}:${computed}` === stored;
}
