-- Restringe al usuario mesonero@shanklish.com a solo el módulo POS Mesero.
-- Idempotente: solo afecta a ese email si existe.

UPDATE "User"
SET "allowedModules" = '["pos_waiter"]',
    "updatedAt"      = NOW()
WHERE "email" = 'mesonero@shanklish.com';
