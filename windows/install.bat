@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════╗
echo ║   استوديو بوت تيليغرام - تثبيت           ║
echo ╚══════════════════════════════════════════╝
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [خطأ] Node.js غير مثبت!
    echo قم بتحميله من: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1" %%v in ('node --version') do set NODE_VER=%%v
echo [✓] Node.js موجود: %NODE_VER%

:: Install npm packages
echo.
echo [جاري] تثبيت الحزم...
npm install
if errorlevel 1 (
    echo [خطأ] فشل تثبيت الحزم!
    pause
    exit /b 1
)

:: Create .env if not exists
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [✓] تم إنشاء ملف .env — يمكنك تعديله لإضافة بروكسي
)

echo.
echo ══════════════════════════════════════════
echo [✓] اكتمل التثبيت بنجاح!
echo.
echo لتشغيل التطبيق: انقر مزدوجاً على start.bat
echo ══════════════════════════════════════════
echo.
pause
