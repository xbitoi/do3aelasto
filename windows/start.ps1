# استوديو بوت تيليغرام - سكريبت PowerShell
# تشغيل: Right-click -> Run with PowerShell

$Host.UI.RawUI.WindowTitle = "استوديو بوت تيليغرام"

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     استوديو بوت تيليغرام               ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node --version 2>&1
    Write-Host "[✓] Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[خطأ] Node.js غير مثبت!" -ForegroundColor Red
    Write-Host "قم بتحميله من: https://nodejs.org/"
    Read-Host "اضغط Enter للخروج"
    exit 1
}

# Install if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "[!] تثبيت الحزم..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[خطأ] فشل التثبيت!" -ForegroundColor Red
        Read-Host "اضغط Enter للخروج"
        exit 1
    }
}

# Load .env
if (Test-Path ".env") {
    Write-Host "[✓] تحميل ملف .env" -ForegroundColor Green
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.+)$") {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
}

# Set defaults
if (-not $env:PORT) { $env:PORT = "3000" }
$env:NODE_ENV = "production"

$port = $env:PORT
Write-Host "[✓] المنفذ: $port" -ForegroundColor Green
Write-Host ""
Write-Host "[جاري] تشغيل الخادم..." -ForegroundColor Yellow
Write-Host "[•] افتح المتصفح على: http://localhost:$port" -ForegroundColor Cyan
Write-Host ""
Write-Host "اضغط Ctrl+C لإيقاف التطبيق" -ForegroundColor Gray
Write-Host "══════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""

# Open browser after 2 seconds in background
Start-Job -ScriptBlock {
    param($p)
    Start-Sleep 2
    Start-Process "http://localhost:$p"
} -ArgumentList $port | Out-Null

# Start server
node --enable-source-maps dist/index.mjs

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[خطأ] توقف الخادم!" -ForegroundColor Red
    Read-Host "اضغط Enter للخروج"
}
