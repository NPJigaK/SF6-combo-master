@echo off
setlocal

set "VSWHERE="
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not defined VSWHERE if exist "%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"

set "VSINSTALL="
set "VSDEV_CMD="
set "MSVC_LINK="

if defined VSWHERE (
  for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -products * -property installationPath`) do set "VSINSTALL=%%I"
  if defined VSINSTALL if exist "%VSINSTALL%\Common7\Tools\VsDevCmd.bat" set "VSDEV_CMD=%VSINSTALL%\Common7\Tools\VsDevCmd.bat"

  for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find VC\Tools\MSVC\**\bin\Hostx64\x64\link.exe`) do set "MSVC_LINK=%%I"
  if not defined MSVC_LINK for /f "usebackq delims=" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find VC\Tools\MSVC\**\bin\Hostx86\x64\link.exe`) do set "MSVC_LINK=%%I"
)

if not defined VSDEV_CMD (
  for %%P in (
    "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles%\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles%\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles%\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\BuildTools\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Community\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Professional\Common7\Tools\VsDevCmd.bat"
    "%ProgramFiles(x86)%\Microsoft Visual Studio\2019\Enterprise\Common7\Tools\VsDevCmd.bat"
  ) do (
    if not defined VSDEV_CMD if exist %%~P set "VSDEV_CMD=%%~P"
  )
)

if not defined VSDEV_CMD (
  echo [tauri-dev] Could not find VsDevCmd.bat.
  echo [tauri-dev] Install Visual Studio Build Tools with C++ workload.
  exit /b 1
)

if not defined VSINSTALL set "VSINSTALL=%VSDEV_CMD:\Common7\Tools\VsDevCmd.bat=%"

call "%VSDEV_CMD%" -arch=x64 -host_arch=x64
if errorlevel 1 exit /b 1

if not defined MSVC_LINK if defined VCToolsInstallDir if exist "%VCToolsInstallDir%bin\Hostx64\x64\link.exe" set "MSVC_LINK=%VCToolsInstallDir%bin\Hostx64\x64\link.exe"
if not defined MSVC_LINK if defined VCToolsInstallDir if exist "%VCToolsInstallDir%bin\Hostx86\x64\link.exe" set "MSVC_LINK=%VCToolsInstallDir%bin\Hostx86\x64\link.exe"

if not defined MSVC_LINK if defined VSINSTALL (
  set "MSVC_VER="
  for /f "delims=" %%V in ('dir /b /ad "%VSINSTALL%\VC\Tools\MSVC" 2^>nul') do set "MSVC_VER=%%V"
  if defined MSVC_VER if exist "%VSINSTALL%\VC\Tools\MSVC\%MSVC_VER%\bin\Hostx64\x64\link.exe" set "MSVC_LINK=%VSINSTALL%\VC\Tools\MSVC\%MSVC_VER%\bin\Hostx64\x64\link.exe"
  if not defined MSVC_LINK if defined MSVC_VER if exist "%VSINSTALL%\VC\Tools\MSVC\%MSVC_VER%\bin\Hostx86\x64\link.exe" set "MSVC_LINK=%VSINSTALL%\VC\Tools\MSVC\%MSVC_VER%\bin\Hostx86\x64\link.exe"
)

if not defined MSVC_LINK (
  for /f "delims=" %%F in ('dir /b /s "%ProgramFiles(x86)%\Microsoft Visual Studio\*\*\VC\Tools\MSVC\*\bin\Host*\x64\link.exe" 2^>nul') do set "MSVC_LINK=%%F"
)
if not defined MSVC_LINK (
  for /f "delims=" %%F in ('dir /b /s "%ProgramFiles%\Microsoft Visual Studio\*\*\VC\Tools\MSVC\*\bin\Host*\x64\link.exe" 2^>nul') do set "MSVC_LINK=%%F"
)

if not defined MSVC_LINK (
  echo [tauri-dev] Could not find MSVC link.exe under VC tools.
  if defined VSINSTALL (
    echo [tauri-dev] Run this in Administrator PowerShell:
    echo [tauri-dev] ^& "${env:ProgramFiles^(x86^)}\Microsoft Visual Studio\Installer\setup.exe" modify --installPath "%VSINSTALL%" --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --includeRecommended --passive --norestart
  ) else (
    echo [tauri-dev] Open Visual Studio Installer and install:
    echo [tauri-dev] - Desktop development with C++
    echo [tauri-dev] - MSVC v143 and Windows SDK
  )
  exit /b 1
)

for %%D in ("%MSVC_LINK%") do set "MSVC_LINK_DIR=%%~dpD"
set "PATH=%MSVC_LINK_DIR%;%PATH%"
set "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=%MSVC_LINK%"
if exist "%MSVC_LINK_DIR%lib.exe" set "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_AR=%MSVC_LINK_DIR%lib.exe"

echo [tauri-dev] Forced linker: %MSVC_LINK%
echo [tauri-dev] where link:
where link

set "TAURI_CLI=%~dp0..\node_modules\.bin\tauri.cmd"
if not exist "%TAURI_CLI%" (
  echo [tauri-dev] Missing local CLI: "%TAURI_CLI%"
  echo [tauri-dev] Run pnpm install and try again.
  exit /b 1
)

if "%~1"=="" (
  call "%TAURI_CLI%" dev
) else (
  call "%TAURI_CLI%" %*
)
exit /b %ERRORLEVEL%
