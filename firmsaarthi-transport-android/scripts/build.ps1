param(
 [string]$SdkRoot = $env:ANDROID_HOME,
 [string]$JdkRoot = $env:JAVA_HOME
)
$ErrorActionPreference='Stop'
$cacheRoot=Join-Path $env:USERPROFILE '.cache\firmsaarthi-android'
if (-not $JdkRoot) { $JdkRoot=(Get-ChildItem -LiteralPath $cacheRoot -Directory -Filter 'jdk-21*' | Select-Object -First 1).FullName }
if (-not $SdkRoot) { $SdkRoot=Join-Path $cacheRoot 'sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $JdkRoot 'bin\java.exe'))) { throw 'Install a verified JDK17+ first.' }
if (-not (Test-Path -LiteralPath (Join-Path $SdkRoot 'platforms\android-36\android.jar'))) { throw 'Android SDK36 is unavailable. Owner-approved SDK licensing/setup is required.' }
$env:JAVA_HOME=$JdkRoot
$env:ANDROID_HOME=$SdkRoot
$env:GRADLE_USER_HOME=Join-Path $cacheRoot 'gradle-cache'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
 & .\gradlew.bat --no-daemon :app:assembleStagingDebug :app:assembleProductionDebug :app:testProductionDebugUnitTest :app:lintProductionDebug
 if ($LASTEXITCODE -ne 0) { throw 'Android build/checks failed.' }
 New-Item -ItemType Directory -Force -Path outputs | Out-Null
 Copy-Item -LiteralPath app\build\outputs\apk\staging\debug\app-staging-debug.apk -Destination outputs\FirmSaarthi-Transport-staging-test.apk
 Copy-Item -LiteralPath app\build\outputs\apk\production\debug\app-production-debug.apk -Destination outputs\FirmSaarthi-Transport-test.apk
 Get-FileHash -Algorithm SHA256 -LiteralPath outputs\FirmSaarthi-Transport-staging-test.apk,outputs\FirmSaarthi-Transport-test.apk | Format-Table -AutoSize
} finally { Pop-Location }
