@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   DocDesk - Push deploy package to GitHub
echo ============================================================
echo.

set /p REPO_URL="Paste your GitHub repo URL (https://github.com/USER/docdesk.git): "
if "%REPO_URL%"=="" goto :end

echo.
echo [1/5] git init
git init
echo [2/5] config identity (local only)
set /p GIT_NAME="Your GitHub username: "
set /p GIT_EMAIL="Your GitHub email: "
git config user.name "%GIT_NAME%"
git config user.email "%GIT_EMAIL%"
echo [3/5] stage files
git add .
echo [4/5] commit
git commit -m "DocDesk deploy 1.6 - free server ready"
echo [5/5] push to remote
git branch -M main
git remote remove origin 2>nul
git remote add origin "%REPO_URL%"
git push -u origin main

echo.
echo ============================================================
echo   DONE. Now go to render.com - New - Blueprint - pick this repo.
echo ============================================================

:end
pause
