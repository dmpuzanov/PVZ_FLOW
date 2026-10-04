@echo off
setlocal
title PVZ.FLOW

rem ---------------------------------------------------------------------------
rem  Portable launcher. Uses the Node runtime bundled in .\runtime — the user
rem  never has to install Node, npm or any dependency.
rem ---------------------------------------------------------------------------

cd /d "%~dp0"

if not exist "runtime\node.exe" (
  echo.
  echo   [ОШИБКА] Не найден runtime\node.exe
  echo   Комплект распакован не полностью. Распакуйте архив целиком и повторите.
  echo.
  pause
  exit /b 1
)

if not exist "app\dist\index.html" (
  echo.
  echo   [ОШИБКА] Не найдена собранная часть интерфейса app\dist
  echo   Комплект распакован не полностью. Распакуйте архив целиком и повторите.
  echo.
  pause
  exit /b 1
)

if not exist "data" mkdir "data"

echo.
echo   Запуск PVZ.FLOW...
echo.

rem Keep the console readable regardless of the system code page.
chcp 65001 >nul 2>&1

"runtime\node.exe" "launcher.mjs"

endlocal
