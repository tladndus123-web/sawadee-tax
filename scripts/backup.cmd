@echo off
rem Weekly backup (Windows Task Scheduler "Sawadee TAX backup"): runs scripts/backup.ts, appends to backup.log.
cd /d "%~dp0.."
if not exist "%USERPROFILE%\Documents\SawadeeTAX-backup" mkdir "%USERPROFILE%\Documents\SawadeeTAX-backup"
echo ==== %date% %time% >> "%USERPROFILE%\Documents\SawadeeTAX-backup\backup.log"
call npx.cmd tsx scripts\backup.ts >> "%USERPROFILE%\Documents\SawadeeTAX-backup\backup.log" 2>&1
