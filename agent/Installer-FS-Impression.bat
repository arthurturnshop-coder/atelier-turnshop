@echo off
chcp 65001 >nul
echo Installation de FS Impression...
set "D=%LOCALAPPDATA%\FSImpression"
set "S=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
mkdir "%D%" 2>nul
taskkill /f /im FS-Impression.exe >nul 2>&1
timeout /t 1 >nul
copy /y "%~dp0FS-Impression.exe" "%D%\FS-Impression.exe" >nul
if errorlevel 1 (echo ERREUR : fichier FS-Impression.exe introuvable a cote de ce programme. & pause & exit /b 1)
echo CreateObject("WScript.Shell").Run """%D%\FS-Impression.exe""",0,False> "%S%\FS-Impression.vbs"
wscript "%S%\FS-Impression.vbs"
echo.
echo C'est installe. Le programme demarre tout seul avec Windows.
echo Retourne sur FS by TURN Shop et imprime un ticket.
pause
