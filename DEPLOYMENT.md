# 🚀 Despliegue y Preparación para Producción

Este documento detalla cómo gestionar los entornos de **Desarrollo** y **Producción** para Shanklish Caracas ERP, y cómo realizar el mantenimiento de la base de datos.

## Guía de Entornos

Para evitar mezclar datos de prueba con operaciones reales del restaurante, recomendamos usar dos bases de datos separadas.

### 1. Configuración de Entornos

#### Opción A: Google Cloud SQL (Recomendado)
Crea dos bases de datos en tu instancia de PostgreSQL:
1. `shanklish-prod` (Para el restaurante real)
2. `shanklish-dev` (Para pruebas y simulaciones)

#### Opción B: Local + Cloud
- **Producción**: Base de datos en Cloud (GCP)
- **Desarrollo**: Base de datos local (Docker/Postgres local)

### 2. Cambiar de Entorno

En tu archivo `.env`, cambia la variable `DATABASE_URL` según dónde quieras conectarte.

**Para Producción:**
```bash
# .env
DATABASE_URL="postgresql://user:password@localhost:5432/shanklish-prod?schema=public"
```

**Para Desarrollo:**
```bash
# .env
DATABASE_URL="postgresql://user:password@localhost:5432/shanklish-dev?schema=public"
```

> **Nota**: Si usas Google Cloud SQL Proxy, el host suele ser `localhost` y el puerto `5432` (o el que hayas configurado). Asegúrate de que el proxy apunte a la instancia correcta o que la URL incluya el nombre de la DB correcta.

---

## 🧹 Limpieza de Datos (Reset for Go-Live)

Si necesitas reiniciar el sistema para empezar a operar desde cero (Go-Live), hemos creado un script de utilidad que elimina **todos los movimientos transaccionales** pero preserva tu configuración maestra.

### Qué se borra:
- ❌ Ventas y Órdenes
- ❌ Movimientos de Inventario
- ❌ Producciones
- ❌ Historial de Costos
- ❌ Conteos de Inventario

### Qué se mantiene:
- ✅ Usuarios y Roles
- ✅ Insumos (Catálogo)
- ✅ Recetas
- ✅ Áreas
- ✅ Proveedores

### Cómo ejecutar:

1. Asegúrate de estar conectado a la base de datos correcta (revisa `.env`).
2. Ejecuta el comando:
   ```bash
   npm run db:clean
   ```
3. Confirma escribiendo "BORRAR DATOS" cuando se te solicite.

> ⚠️ **ADVERTENCIA**: Esta acción no se puede deshacer. Haz un backup antes si no estás seguro.

---

## 🛡️ Backups (Copias de Seguridad)

### Google Cloud SQL (Automático)
GCP realiza backups automáticos diarios si está configurado.
1. Ve a la consola de Google Cloud -> SQL.
2. Selecciona tu instancia.
3. Ve a la pestaña "Copias seguridad".
4. Verifica que estén habilitadas.

### Backup Manual (pg_dump)
Si deseas tener un backup local antes de una operación peligrosa:

```bash
# Reemplaza los valores con tus credenciales
pg_dump -h localhost -U postgres -d shanklish-prod > backup_fecha.sql
```
