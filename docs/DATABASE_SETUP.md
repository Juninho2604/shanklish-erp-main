# 🗄️ Guía de Configuración de Base de Datos - Shanklish Caracas ERP

## Opción 1: PostgreSQL Local (Recomendado para desarrollo)

### Paso 1: Instalar PostgreSQL
1. Descarga PostgreSQL desde: https://www.postgresql.org/download/windows/
2. Durante la instalación:
   - Puerto: `5432` (default)
   - Usuario: `postgres`
   - Password: Anota la contraseña que elijas
   - Selecciona instalar pgAdmin 4

### Paso 2: Crear la Base de Datos
Abre pgAdmin 4 o la terminal de PostgreSQL y ejecuta:

```sql
CREATE DATABASE shanklish_erp;
```

O desde la línea de comandos:
```bash
psql -U postgres -c "CREATE DATABASE shanklish_erp;"
```

### Paso 3: Configurar el archivo .env.local
```bash
# Crea el archivo desde el ejemplo
copy .env.local.example .env.local
```

Edita `.env.local` y cambia la línea:
```
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:5432/shanklish_erp?schema=public"
```

Reemplaza `TU_PASSWORD` con la contraseña que configuraste en PostgreSQL.

### Paso 4: Ejecutar Migraciones
```bash
# Genera el cliente de Prisma
npx prisma generate

# Crea las tablas en la base de datos
npx prisma migrate dev --name init

# (Opcional) Poblar con datos iniciales
npx tsx prisma/seed.ts
```

### Paso 5: Verificar (Opcional)
```bash
# Abre Prisma Studio para ver tus datos
npx prisma studio
```

---

## Opción 2: Docker (Más fácil, sin instalar PostgreSQL)

### Paso 1: Instalar Docker Desktop
Descarga desde: https://www.docker.com/products/docker-desktop/

### Paso 2: Crear archivo docker-compose.yml
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    container_name: shanklish_db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: shanklish_erp
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Paso 3: Iniciar contenedor
```bash
docker-compose up -d
```

### Paso 4: Configurar .env.local
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shanklish_erp?schema=public"
```

### Paso 5: Ejecutar migraciones
```bash
npx prisma migrate dev --name init
```

---

## Opción 3: Supabase (Cloud, Gratis)

### Paso 1: Crear proyecto en Supabase
1. Ve a https://supabase.com
2. Crea una cuenta y un nuevo proyecto
3. Ve a Settings → Database → Connection String
4. Copia la URI de conexión

### Paso 2: Configurar .env.local
```
DATABASE_URL="postgresql://postgres:[TU_PASSWORD]@db.[TU_PROJECT].supabase.co:5432/postgres"
```

### Paso 3: Ejecutar migraciones
```bash
npx prisma migrate dev --name init
```

---

## Comandos Útiles de Prisma

```bash
# Ver estado de migraciones
npx prisma migrate status

# Resetear base de datos (¡CUIDADO! Borra todo)
npx prisma migrate reset

# Generar cliente después de cambios en schema
npx prisma generate

# Abrir interfaz visual de la base de datos
npx prisma studio

# Sincronizar schema con DB sin migración (desarrollo)
npx prisma db push
```

---

## Verificar Conexión

Después de configurar, verifica que todo funciona:

```bash
# 1. Verifica que Prisma puede conectar
npx prisma db pull

# 2. Si no hay errores, ejecuta las migraciones
npx prisma migrate dev --name init

# 3. Pobla con datos de prueba
npx tsx prisma/seed.ts

# 4. Inicia el servidor
npm run dev
```

---

## Troubleshooting

### Error: "Connection refused"
- Verifica que PostgreSQL esté corriendo
- Verifica que el puerto 5432 no esté bloqueado
- Verifica el firewall de Windows

### Error: "Authentication failed"
- Verifica usuario y contraseña en .env.local
- Asegúrate de que no haya espacios extra en la URL

### Error: "Database does not exist"
```sql
CREATE DATABASE shanklish_erp;
```

### Error: "Role does not exist"
```sql
CREATE ROLE postgres WITH LOGIN PASSWORD 'tu_password';
```
