-- FASE 4 — Data migration
-- 1. Create mesonero@shanklish.com (CASHIER + allowedModules = pos_waiter only)
-- 2. Update Alexis email to julhian@shanklish.com
-- NOTE: passwordHash stored as plaintext legacy format; use admin UI to set proper password.

INSERT INTO "User" (
    "id",
    "email",
    "firstName",
    "lastName",
    "role",
    "passwordHash",
    "allowedModules",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    'clmesonero000000000000000001',
    'mesonero@shanklish.com',
    'Mesonero',
    'POS',
    'CASHIER',
    'Mesonero2024!',
    '["pos_waiter"]',
    true,
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "User" WHERE "email" = 'mesonero@shanklish.com'
);

-- Change Alexis's email to julhian@shanklish.com (verify no conflict first)
UPDATE "User"
SET "email" = 'julhian@shanklish.com',
    "updatedAt" = NOW()
WHERE "email" = 'alexis@shanklish.com'
  AND NOT EXISTS (
      SELECT 1 FROM "User" WHERE "email" = 'julhian@shanklish.com'
  );
