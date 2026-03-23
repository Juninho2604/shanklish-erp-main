-- SystemConfig: tabla clave-valor para configuración persistente de instalación
CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);
