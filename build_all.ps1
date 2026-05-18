param (
    [string]$env = "dev"
)

$ErrorActionPreference = "Stop"

Write-Host "Building everything for environment: $env" -ForegroundColor Green

# 1. Build Python Sidecar
Write-Host "`n[1/3] Building Python Sidecar..." -ForegroundColor Cyan
Push-Location "sidecar_wechat"
try {
    .\package.ps1 -env $env
} finally {
    Pop-Location
}

# 2. Build User Frontend (Electron + React)
Write-Host "`n[2/3] Building Electron Frontend..." -ForegroundColor Cyan
Push-Location "user"
try {
    # Install dependencies if node_modules is missing (optional but good practice)
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing npm dependencies..."
        npm install
    }

    Write-Host "Running electron-vite build..."
    # Ensure we use the correct environment mode for vite if needed, 
    # though electron-vite usually uses .env files based on mode.
    # For now, we rely on .env.development and .env.production existence.
    if ($env -eq "prod") {
        # Copy .env.production to .env if needed, or rely on vite's mode selection
        # Typically 'npm run build' is production build.
        $env:VITE_USER_NODE_ENV = "production" 
    } else {
        $env:VITE_USER_NODE_ENV = "development"
    }
    
    npm run build
} finally {
    Pop-Location
}

# 3. Package Electron App
Write-Host "`n[3/3] Packaging Electron App..." -ForegroundColor Cyan
Push-Location "user"
try {
    Write-Host "Running electron-builder..."
    npm run dist
} finally {
    Pop-Location
}

Write-Host "`nAll builds complete!" -ForegroundColor Green
Write-Host "Installer is located in: user/dist"
