# Family HA — Windows installation

## Requirements
- Node.js 20 LTS or later
- Java 17
- Android Studio with Android SDK

## Install dependencies
Open PowerShell in the project folder:

```powershell
npm config set registry https://registry.npmjs.org/
npm install
```

The project intentionally does not use `@types/react-native-sound`; that package does not exist. A local declaration is included under `src/types/react-native-sound.d.ts`.

## Build an APK

```powershell
.\BUILD-APK-WINDOWS.ps1
```

Or manually:

```powershell
cd android
.\gradlew.bat assembleDebug
```

APK output:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## Development after installing once

Terminal 1:

```powershell
npm start
```

Connect the phone by USB and run once:

```powershell
adb reverse tcp:8081 tcp:8081
```

Then reopen Family HA. JavaScript and TypeScript changes use Fast Refresh; rebuilding the APK is only needed after native dependency or Android configuration changes.
