# Guía de Despliegue en AWS ECR y App Runner

Esta guía te ayudará a subir tu aplicación **Shanklish ERP** a la nube de AWS usando Docker y ECR (Elastic Container Registry).

## Prerrequisitos

1.  **Docker Desktop** (instalado y corriendo en tu PC).
2.  **AWS CLI** (instalado y configurado con tus credenciales).
    - Ejecuta `aws configure` en PowerShell si no lo has hecho.

## Paso 1: Crear un Repositorio en AWS ECR

Antes de subir nada, necesitas un lugar donde guardar tu imagen Docker en AWS.

1.  Entra a la **Consola de AWS** -> Busca **ECR (Elastic Container Registry)**.
2.  Haz clic en **"Create repository"**.
3.  Nombre del repositorio: `shanklish-erp` (o el que prefieras).
4.  Configuración: Mantén todo por defecto (Private).
5.  Haz clic en **"Create repository"**.
6.  Copia el **URI** de tu repositorio (se verá algo como `123456789012.dkr.ecr.us-east-1.amazonaws.com/shanklish-erp`).

## Paso 2: Ejecutar el Script de Despliegue

Abre PowerShell en la carpeta del proyecto y ejecuta el script que preparé (`deploy-aws.ps1`). Necesitas tu **AWS Account ID** (el número de 12 dígitos que sale en la esquina superior derecha de la consola de AWS).

```powershell
.\deploy-aws.ps1 -AccountId "TU_ID_DE_CUENTA_AWS" -Region "us-east-1"
```

El script hará automáticamente lo siguiente:
1.  Iniciará sesión en tu Docker local con tus credenciales de AWS.
2.  Construirá la imagen de tu aplicación (`docker build`).
3.  Etiquetará la imagen para AWS (`docker tag`).
4.  Subirá la imagen a la nube (`docker push`).

## Paso 3: Desplegar la Aplicación (App Runner)

Una vez que la imagen esté subida a ECR, la forma más fácil de correrla es con **AWS App Runner**:

1.  Ve a la consola de **AWS App Runner**.
2.  Clic en **"Create service"**.
3.  Source: **Container registry**.
4.  Provider: **Amazon ECR**.
5.  Image URI: Selecciona la imagen que acabamos de subir (`shanklish-erp:latest`).
6.  Deployment settings: **Automatic** (para que se actualice sola cuando subas cambios).
7.  **Configuración del Servicio**:
    - Service name: `shanklish-erp-prod`
    - CPU/Memory: 1 vCPU / 2 GB (suficiente para empezar).
    - **Environment variables** (¡IMPORTANTE!):
      Aquí debes copiar TODAS las variables de tu archivo `.env` local:
      - `DATABASE_URL` (Tu base de datos de producción)
      - `NEXTAUTH_URL` (La URL que te dará App Runner al final)
      - `NEXTAUTH_SECRET`
      - `GOOGLE_VISION_API_KEY`
      - `JWT_SECRET`
8.  Clic en **"Create & deploy"**.

¡Listo! En unos minutos tendrás tu URL pública (ej: `https://xyz.us-east-1.awsapprunner.com`) funcionando.
