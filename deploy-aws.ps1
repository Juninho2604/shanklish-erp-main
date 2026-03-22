# Script de despliegue a AWS ECR para Windows (PowerShell)
# Uso: .\deploy-aws.ps1 -AccountId "123456789012" -Region "us-east-1" -RepoName "shanklish-erp"

param(
    [string]$AccountId,
    [string]$Region = "us-east-1",
    [string]$RepoName = "shanklish-erp"
)

# Verificar si se pasaron los parámetros necesarios
if ([string]::IsNullOrEmpty($AccountId)) {
    Write-Host "Error: Debes proporcionar tu AWS Account ID." -ForegroundColor Red
    Write-Host "Ejemplo: .\deploy-aws.ps1 -AccountId 123456789012" -ForegroundColor Yellow
    exit 1
}

$EcrUri = "$AccountId.dkr.ecr.$Region.amazonaws.com"
$ImageUri = "$EcrUri/${RepoName}:latest"

Write-Host "--- Iniciando Despliegue a AWS ECR ---" -ForegroundColor Cyan
Write-Host "Region: $Region"
Write-Host "Repo: $RepoName"
Write-Host "URI: $ImageUri"
Write-Host "--------------------------------------"

# 1. Login en ECR
Write-Host "1. Iniciando sesión en AWS ECR..." -ForegroundColor Green
try {
    (Get-ECRLoginCommand -Region $Region).Password | docker login --username AWS --password-stdin $EcrUri
}
catch {
    Write-Host "Error haciendo login. Asegúrate de tener AWS CLI configurado ('aws configure') y Docker corriendo." -ForegroundColor Red
    exit 1
}

# 2. Construir la imagen Docker
Write-Host "2. Construyendo imagen Docker (esto puede tardar unos minutos)..." -ForegroundColor Green
docker build -t $RepoName .

# 3. Etiquetar la imagen
Write-Host "3. Etiquetando imagen..." -ForegroundColor Green
docker tag "${RepoName}:latest" $ImageUri

# 4. Subir la imagen (Push)
Write-Host "4. Subiendo imagen a ECR..." -ForegroundColor Green
docker push $ImageUri

Write-Host "--------------------------------------"
Write-Host "¡Despliegue completado con éxito!" -ForegroundColor Cyan
Write-Host "Tu imagen está disponible en: $ImageUri"
Write-Host "Ahora puedes usar esta URI en App Runner o ECS."
