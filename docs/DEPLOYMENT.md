# 🚀 Guía de Despliegue - Shanklish Caracas ERP

## Arquitectura de Producción

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│     Vercel      │      │    Supabase     │      │    Supabase     │
│   (Frontend +   │◄────►│   (PostgreSQL)  │      │    (Storage)    │
│   API Routes)   │      │                 │      │   (Imágenes)    │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        ▲
        │
   Christian (Auditor)
   Omar, Nahomy, Víctor
```

---

## Paso 1: Configurar Supabase

### 1.1 Crear Proyecto en Supabase

1. Ve a https://supabase.com y crea una cuenta
2. Click en **"New Project"**
3. Configura:
   - **Name:** `shanklish-erp`
   - **Database Password:** Genera una contraseña segura (¡GUÁRDALA!)
   - **Region:** `South America (São Paulo)` (más cercano a Caracas)
4. Espera 2-3 minutos mientras se crea

### 1.2 Obtener URL de Conexión

1. Ve a **Project Settings** → **Database**
2. En la sección **Connection String**, selecciona **URI**
3. Copia la URL, se ve así:
   ```
   postgresql://postgres:[TU_PASSWORD]@db.xxx.supabase.co:5432/postgres
   ```
4. Reemplaza `[TU_PASSWORD]` con la contraseña que creaste

### 1.3 Configurar Connection Pooling (Requerido para Vercel)

⚠️ **IMPORTANTE:** Vercel usa serverless, necesitas connection pooling.

1. En Supabase, ve a **Project Settings** → **Database**
2. Encuentra la sección **Connection Pooling**
3. Copia la URL de **Transaction mode** (puerto 6543):
   ```
   postgresql://postgres.[PROJECT_ID]:[TU_PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

### 1.4 Configurar Storage para Imágenes

1. Ve a **Storage** en el menú lateral
2. Click en **"New bucket"**
3. Configura:
   - **Name:** `notas-entrega`
   - **Public bucket:** ✅ Activado (para que el Auditor vea las imágenes)
   - **File size limit:** `5MB`
   - **Allowed MIME types:** `image/jpeg, image/png, image/webp, application/pdf`
4. Click en **Create bucket**

### 1.5 Obtener Claves de API

1. Ve a **Project Settings** → **API**
2. Copia:
   - **Project URL:** `https://xxx.supabase.co`
   - **anon public key:** `eyJhbGciOiJ...` (para acceso público)
   - **service_role key:** `eyJhbGciOiJ...` (para backend, ¡mantén secreta!)

---

## Paso 2: Configurar Vercel

### 2.1 Crear Proyecto en Vercel

1. Ve a https://vercel.com y conecta con GitHub/GitLab
2. Click en **"Add New Project"**
3. Importa el repositorio de Shanklish Caracas
4. En **Framework Preset**, selecciona **Next.js**

### 2.2 Configurar Variables de Entorno

En Vercel, ve a **Settings** → **Environment Variables** y agrega:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `DATABASE_URL` | `postgresql://postgres.[ID]:[PASS]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true` | URL con pooling |
| `DIRECT_URL` | `postgresql://postgres:[PASS]@db.xxx.supabase.co:5432/postgres` | URL directa (para migraciones) |
| `NEXTAUTH_URL` | `https://tu-proyecto.vercel.app` | URL de producción |
| `NEXTAUTH_SECRET` | `genera-un-secret-seguro` | Ver comando abajo |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJ...` | Clave pública |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJ...` | Clave privada (solo backend) |

### 2.3 Generar NEXTAUTH_SECRET

Ejecuta en tu terminal:
```bash
openssl rand -base64 32
```

O usa: https://generate-secret.vercel.app/32

---

## Paso 3: Actualizar Código para Producción

### 3.1 Actualizar prisma/schema.prisma

El schema ya está compatible, pero verifica que tenga:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")  // Para migraciones con pooling
}
```

### 3.2 Ejecutar Migraciones en Supabase

Desde tu máquina local:

```bash
# Configura las variables temporalmente
$env:DATABASE_URL = "tu-url-directa-de-supabase"
$env:DIRECT_URL = "tu-url-directa-de-supabase"

# Ejecuta migraciones
npx prisma migrate deploy

# (Opcional) Poblar datos iniciales
npx tsx prisma/seed.ts
```

---

## Paso 4: Desplegar

### 4.1 Primer Deploy

```bash
# Asegúrate de que todo esté commiteado
git add .
git commit -m "feat: preparar para deploy en Vercel + Supabase"
git push origin main
```

Vercel detectará el push y desplegará automáticamente.

### 4.2 Verificar Deploy

1. Ve a tu proyecto en Vercel
2. Espera que el build termine
3. Abre la URL (ej: `shanklish-caracas.vercel.app`)
4. Prueba el login

---

## Paso 5: Configurar Dominio Personalizado (Opcional)

1. En Vercel → **Settings** → **Domains**
2. Agrega tu dominio (ej: `erp.shanklish.com`)
3. Configura los DNS según las instrucciones

---

## Troubleshooting

### Error: "prepared statement already exists"
- Esto pasa con connection pooling
- Asegúrate de usar `?pgbouncer=true` en DATABASE_URL

### Error: "ECONNREFUSED"
- Verifica que DATABASE_URL esté correcta
- Usa la URL con pooling (puerto 6543), no la directa

### Error: "Prisma migrate failed"
- Para migraciones, usa DIRECT_URL (puerto 5432)
- El pooler no soporta migraciones

### Imágenes no cargan
- Verifica que el bucket sea público
- Revisa las políticas de RLS en Supabase

---

## Acceso para el Equipo

Una vez desplegado, comparte las credenciales:

| Usuario | Email | Rol | Acceso |
|---------|-------|-----|--------|
| Omar | admin@shanklish.com | OWNER | Todo |
| Christian | auditor@shanklish.com | AUDITOR | Solo lectura + documentos |
| Víctor | victor@shanklish.com | CHEF | Producción |
| Miguel | miguel@shanklish.com | CHEF | Producción |
| Nahomy | nahomy@shanklish.com | AREA_LEAD | Inventario |
