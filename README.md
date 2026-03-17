# Shanklish ERP

Sistema ERP para gestión de restaurantes y producción.

## Inicio rápido

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Base de datos
npm run db:push

# Desarrollo
npm run dev
```

## Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilar para producción |
| `npm run db:studio` | Abrir Prisma Studio |
| `npm run db:migrate` | Ejecutar migraciones |

## Flujo con GitHub

```bash
# Traer cambios remotos
git pull

# Después de hacer cambios
git add .
git commit -m "descripción de los cambios"
git push
```
