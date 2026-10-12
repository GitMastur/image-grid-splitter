@echo off
title Build GridSplitter Android APK
echo ========================================================
echo   Building GridSplitter Android APK locally (Gradle)
echo ========================================================
cd /d "%~dp0\android"
call gradlew.bat assembleDebug
if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   BUILD SUCCESSFUL!
    echo   APK created at:
    echo   android\app\build\outputs\apk\debug\app-debug.apk
    echo ========================================================
) else (
    echo.
    echo Build failed. Ensure Java 17 (JDK) is installed and in PATH.
)
pause
