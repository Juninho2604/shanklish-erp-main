# ✅ Checklist de Despliegue - Shanklish Caracas ERP

## Pre-requisitos
- [ ] Cuenta de GitHub/GitLab con el repositorio
- [ ] Cuenta de Vercel (gratis)
- [ ] Cuenta de Supabase (gratis)

---

## Paso 1: Supabase (Base de Datos + Storage)

### 1.1 Crear Proyecto
- [ ] Ir a https://supabase.com → New Project
- [ ] Nombre: `shanklish-erp`
- [ ] Región: `South America (São Paulo)`
- [ ] Password: **GUARDAR en lugar seguro**
- [ ] Esperar ~2 min a que se cree

### 1.2 Obtener URLs de Base de Datos
- [ ] Ir a **Settings** → **Database**
- [ ] Copiar **Connection String (URI)** → `DIRECT_URL`
- [ ] Copiar **Connection Pooling URL** (puerto 6543) → `DATABASE_URL`
- [ ] Reemplazar `[PASSWORD]` en ambas URLs

### 1.3 Crear Bucket de Storage
- [ ] Ir a **Storage** → **New bucket**
- [ ] Nombre: `notas-entrega`
- [ ] Público: ✅ Sí
- [ ] Límite: 5MB
- [ ] MIME types: `image/jpeg, image/png, image/webp, application/pdf`

### 1.4 Obtener Claves API
- [ ] Ir a **Settings** → **API**
- [ ] Copiar **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- [ ] Copiar **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Copiar **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

---

## Paso 2: Ejecutar Migraciones

Desde tu PC local (con las variables configuradas):

```powershell
# Configurar variables temporalmente
$env:DATABASE_URL = "tu-url-directa"
$env:DIRECT_URL = "tu-url-directa"

# Generar cliente
npx prisma generate

# Ejecutar migraciones
npx prisma migrate deploy

# Verificar (opcional)
npx prisma studio
```

---

## Paso 3: Vercel

### 3.1 Crear Proyecto
- [ ] Ir a https://vercel.com → Add New Project
- [ ] Conectar repositorio de GitHub
- [ ] Framework: **Next.js**

### 3.2 Configurar Variables de Entorno
En **Settings** → **Environment Variables**, agregar:

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | URL con pooling (6543) + `?pgbouncer=true` |
| `DIRECT_URL` | URL directa (5432) |
| `NEXTAUTH_URL` | `https://tu-proyecto.vercel.app` |
| `NEXTAUTH_SECRET` | Generar con `openssl rand -base64 32` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role |

### 3.3 Desplegar
- [ ] Click en **Deploy**
- [ ] Esperar ~2-3 minutos
- [ ] Abrir URL del proyecto

---

## Paso 4: Verificación

- [ ] Abrir la URL de producción
- [ ] Verificar que carga el dashboard
- [ ] Probar subir una imagen en Entrada de Mercancía
- [ ] Verificar que la imagen aparece desde Supabase Storage
- [ ] Probar crear una entrada y ver que se guarda en la BD

---

## Paso 5: Poblar Datos (Opcional)

```powershell
# Desde tu PC local
$env:DATABASE_URL = "tu-url-directa"
npx tsx prisma/seed.ts
```

---

## URLs Finales

| Servicio | URL |
|----------|-----|
| **App (Vercel)** | `https://shanklish-erp.vercel.app` |
| **Supabase Dashboard** | `https://app.supabase.com/project/xxx` |
| **Prisma Studio (local)** | `npx prisma studio` |

---

## Acceso para el Equipo

Compartir con el equipo:

| Nombre | Email | Contraseña | Rol |
|--------|-------|------------|-----|
| Omar | admin@shanklish.com | ******** | Dueño |
| Christian | auditor@shanklish.com | ******** | Auditor |
| Victor | victor@shanklish.com | ******** | Chef |
| Miguel | miguel@shanklish.com | ******** | Chef |
| Nahomy | nahomy@shanklish.com | ******** | Almacén |

---

## Troubleshooting Rápido

| Error | Solución |
|-------|----------|
| `prepared statement already exists` | Agregar `?pgbouncer=true` a DATABASE_URL |
| `ECONNREFUSED` | Verificar URL y que Supabase esté activo |
| Imágenes no cargan | Bucket debe ser público |
| Migraciones fallan | Usar DIRECT_URL (5432), no pooling |
