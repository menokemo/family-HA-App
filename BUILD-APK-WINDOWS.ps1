$ErrorActionPreference = "Stop"
Write-Host "Installing dependencies..."
npm install
Write-Host "Building debug APK..."
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location
$apk = Join-Path $PSScriptRoot "android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host "APK ready: $apk"
