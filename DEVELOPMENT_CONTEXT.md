# SHANKLISH ERP 3.0 - Contexto de Desarrollo

Este archivo sirve como memoria central para el desarrollo continuo del proyecto. Contiene el estado actual, decisiones arquitectónicas, y tareas pendientes para facilitar la continuación del trabajo por cualquier desarrollador o asistente de IA.

## 1. Descripción del Proyecto
ERP (Enterprise Resource Planning) para gestión de operaciones, inventario y producción de "Shanklish Caracas".
- **Objetivo**: Controlar flujo de insumos, recetas, producción y ventas.
- **Stack Tecnológico**:
  - **Framework**: Next.js 14 (App Router).
  - **Lenguaje**: TypeScript.
  - **Base de Datos**: PostgreSQL (Inicialmente NeonDB/Google Cloud, preparado para migración).
  - **ORM**: Prisma.
  - **Estilos**: Tailwind CSS.
  - **Autenticación**: Custom JWT Session (Server Actions + Cookies).
  - **Despliegue**: Preparado para Docker / AWS ECR + App Runner (Anteriormente Vercel).

## 2. Estado Actual de Módulos

### ✅ Implementado y Funcional
- **Autenticación**: Login, Sesiones seguras, Roles y Permisos (`roles.ts`).
- **Gestión de Usuarios**:
  - Cambio de roles (Gerentes).
  - **Cambio de contraseña** (Usuario final) -> *Implementado en `ChangePasswordDialog.tsx`*.
- **Inventario**: CRUD de insumos, auditorías.
- **Producción**: Registro de producción diaria, descuento automático de inventario basado en Recetas.
- **Ventas (Historial)**: Visualización de ventas importadas.
  - **Restricción**: Rol `AREA_LEAD` (Jefe de Área) NO tiene acceso al Historial de Ventas en el Sidebar.
- **OCR (Facturas)**:
  - Integración con **Google Cloud Vision API** implementada en `ocr.actions.ts`.
  - **Estado**: Funcionalidad en backend lista, pero **botón ocultado en frontend** (`entrada-form.tsx`) a petición del usuario por practicidad.

### 🚧 En Proceso / Pendiente
- **Despliegue AWS**: Se crearon `Dockerfile`, `deploy-aws.ps1` y `AWS_DEPLOY_GUIDE.md`, pero el despliegue se pausó.
- **Reportes**: Generación de Reporte Z (Cierre de caja) básico implementado. Faltan reportes más avanzados de costos.

## 3. Arquitectura Clave

### Roles y Permisos
- Definidos en `src/lib/constants/roles.ts`.
- Validación en Sidebar (`src/components/layout/Sidebar.tsx`) y en Server Actions.
- **Roles principales**: OWNER, ADMIN_MANAGER, OPS_MANAGER, CHIEF, AREA_LEAD.

### Server Actions
- Toda la lógica de negocio y base de datos reside en `src/app/actions`.
- **Patrón**: Frontend (Client Component) -> Server Action -> Prisma -> DB.

## 4. Variables de Entorno Requeridas (.env)
```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="tu_secreto"
JWT_SECRET="tu_secreto_jwt"
GOOGLE_VISION_API_KEY="AIzaSy..." # Necesario si se reactiva el botón de OCR
```

## 5. Historial de Cambios Recientes (Log)
- **OCR**: Se implementó `ocr.actions.ts` usando API Key de Google. Se ajustó `fuse.js` para ignorar encabezados (FECHA, TOTAL). Se desactivó el botón en UI.
- **Corrección Build**: Se añadió fallback `?? []` en `entrada-form.tsx` para evitar errores de compilación con las sugerencias del OCR.
- **Seguridad**: Se restringió el acceso a "Historial Ventas" para el rol `AREA_LEAD`.
- **Usuarios**: Se creó el componente `ChangePasswordDialog` para permitir cambio de clave seguro con validación de contraseña actual.

## 6. Comandos Útiles
- **Correr localmente**: `npm run dev` (Puerto 3000 por defecto).
- **Desplegar a AWS**: `.\deploy-aws.ps1 -AccountId "TU_ID"` (Requiere Docker activo).
- **Prisma Studio**: `npx prisma studio` (Para ver la BD visualmente).

## 7. Notas para el Futuro
- Si se reactiva el OCR, revisar la "lista negra" de palabras en `ocr.actions.ts` si cambia el formato de las facturas.
- El puerto local fue reseteado al 3000 tras conflictos con el 3003.
- Para producción en AWS, recordar configurar las Variables de Entorno en el panel de App Runner/ECS.
