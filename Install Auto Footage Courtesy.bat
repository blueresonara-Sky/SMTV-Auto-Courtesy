@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "SOURCE_ROOT="

if exist "%SCRIPT_DIR%CSXS\manifest.xml" (
    set "SOURCE_ROOT=%SCRIPT_DIR%"
) else if exist "%SCRIPT_DIR%Auto Footage Courtesy Extension\CSXS\manifest.xml" (
    set "SOURCE_ROOT=%SCRIPT_DIR%Auto Footage Courtesy Extension\"
) else (
    echo Could not find the Auto Footage Courtesy extension files.
    echo Keep this installer next to the flat extension files or next to the "Auto Footage Courtesy Extension" folder.
    goto :fail
)

if "%APPDATA%"=="" (
    echo APPDATA is not available for this Windows user.
    goto :fail
)

set "TARGET_ROOT=%APPDATA%\Adobe\CEP\extensions"
set "TARGET_DIR=%TARGET_ROOT%\Auto Footage Courtesy"
set "CSXS_BASE_KEY=HKCU\Software\Adobe"
set "CSXS_FALLBACK_KEY=%CSXS_BASE_KEY%\CSXS.11"
set "OLD_DIR_1=%TARGET_ROOT%\premiere_filename_panel_v5_2"
set "OLD_DIR_2=%TARGET_ROOT%\Filename Courtesy Panel v5.2"
set "OLD_DIR_3=%TARGET_ROOT%\Filename Courtesy Panel"

echo Installing Auto Footage Courtesy...
echo Source: %SOURCE_ROOT%
echo Target: %TARGET_DIR%
echo.

if not exist "%TARGET_ROOT%" mkdir "%TARGET_ROOT%"
if errorlevel 1 (
    echo Could not create "%TARGET_ROOT%".
    goto :fail
)

if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
if errorlevel 1 (
    echo Could not create "%TARGET_DIR%".
    goto :fail
)

call :remove_old_install "%OLD_DIR_1%"
if errorlevel 1 goto :fail

call :remove_old_install "%OLD_DIR_2%"
if errorlevel 1 goto :fail

call :remove_old_install "%OLD_DIR_3%"
if errorlevel 1 goto :fail

call :copy_dir "CSXS"
if errorlevel 1 goto :fail

call :copy_dir "js"
if errorlevel 1 goto :fail

call :copy_dir "jsx"
if errorlevel 1 goto :fail

call :copy_file "index.html"
if errorlevel 1 goto :fail

echo.
call :check_debug_mode
if errorlevel 1 goto :fail

echo.
echo Install complete.
echo Open Premiere Pro, then go to Window ^> Extensions ^> Auto Footage Courtesy.
echo If Premiere was already open, restart it first.
goto :end

:remove_old_install
set "OLD_INSTALL_DIR=%~1"
if /I "%OLD_INSTALL_DIR%"=="%TARGET_DIR%" exit /b 0

if exist "%OLD_INSTALL_DIR%" (
    echo Found old install: %OLD_INSTALL_DIR%
    rmdir /S /Q "%OLD_INSTALL_DIR%"
    if exist "%OLD_INSTALL_DIR%" (
        echo Could not remove old install: %OLD_INSTALL_DIR%
        exit /b 1
    )
    echo Removed old install.
)
exit /b 0

:copy_dir
set "ITEM_NAME=%~1"
if not exist "%SOURCE_ROOT%%ITEM_NAME%" (
    echo Missing required folder: %SOURCE_ROOT%%ITEM_NAME%
    exit /b 1
)

robocopy "%SOURCE_ROOT%%ITEM_NAME%" "%TARGET_DIR%\%ITEM_NAME%" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
set "ROBOCOPY_EXIT=%ERRORLEVEL%"
if %ROBOCOPY_EXIT% GEQ 8 (
    echo Failed to copy folder: %ITEM_NAME%
    exit /b 1
)

echo Copied folder: %ITEM_NAME%
exit /b 0

:copy_file
set "FILE_NAME=%~1"
if not exist "%SOURCE_ROOT%%FILE_NAME%" (
    echo Missing required file: %SOURCE_ROOT%%FILE_NAME%
    exit /b 1
)

copy /Y "%SOURCE_ROOT%%FILE_NAME%" "%TARGET_DIR%\%FILE_NAME%" >nul
if errorlevel 1 (
    echo Failed to copy file: %FILE_NAME%
    exit /b 1
)

echo Copied file: %FILE_NAME%
exit /b 0

:check_debug_mode
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $names=@(Get-ChildItem -Path 'HKCU:\Software\Adobe' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^CSXS\.\d+$' } | ForEach-Object { $_.PSChildName }); if (-not $names.Count) { $names=@('CSXS.11') }; $targets=@($names | Sort-Object { [int]($_ -replace '^CSXS\.','') } | ForEach-Object { [PSCustomObject]@{ Name=$_; Path=('HKCU:\Software\Adobe\' + $_) } }); $needsEnable=$false; foreach ($target in $targets) { $value=(Get-ItemProperty -Path $target.Path -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode; Write-Output ('Checked: ' + ($target.Path -replace '^HKCU:','HKCU') + '\PlayerDebugMode'); if ($value -ne '1') { $needsEnable=$true } }; if (-not $needsEnable) { Write-Output 'CEP debug mode is already enabled for detected CSXS versions.'; exit 0 }; foreach ($target in $targets) { if (-not (Test-Path $target.Path)) { New-Item -Path 'HKCU:\Software\Adobe' -Name $target.Name -Force | Out-Null }; New-ItemProperty -Path $target.Path -Name PlayerDebugMode -PropertyType String -Value '1' -Force | Out-Null }; Write-Output 'CEP debug mode enabled for detected CSXS versions.'; foreach ($target in $targets) { Write-Output ('Enabled: ' + ($target.Path -replace '^HKCU:','HKCU')) }"
if errorlevel 1 (
    echo Could not enable CEP debug mode automatically.
    exit /b 1
)

echo Restart Premiere Pro if it was already open.
exit /b 0

:fail
echo.
echo Install failed.
exit /b 1

:end
echo.
pause
exit /b 0
