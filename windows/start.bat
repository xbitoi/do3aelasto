@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════╗
echo ║     استوديو بوت تيليغرام               ║
echo ╚══════════════════════════════════════════╝
echo.

:: Check node_modules
if not exist "node_modules" (
    echo [!] لم يتم التثبيت بعد. يُشغَّل install.bat أولاً...
    call install.bat
)

:: Load .env if exists
if exist ".env" (
    echo [✓] تحميل ملف .env
    for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
        set line=%%a
        if not "!line:~0,1!"=="#" (
            if not "%%b"=="" set %%a=%%b
        )
    )
)

:: Set default PORT if not set
if "%PORT%"=="" set PORT=3000

echo [✓] المنفذ: %PORT%
echo.
echo [جاري] تشغيل الخادم...
echo [•] افتح المتصفح على: http://localhost:%PORT%
echo.
echo اضغط Ctrl+C لإيقاف التطبيق
echo ══════════════════════════════════════════
echo.

set NODE_ENV=production
node --enable-source-maps dist/index.mjs

if errorlevel 1 (
    echo.
    echo [خطأ] توقف الخادم بسبب خطأ!
    pause
)
