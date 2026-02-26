Place `nircmd.exe` in this directory for Windows screenshot fallback.

Runtime lookup order:
1. `GV_SCREENSHOT_EXE` environment variable
2. Bundled resource path (`resources/bin/nircmd.exe`)
3. App executable directory
4. `src-tauri/bin/nircmd.exe` in development
5. `PATH`

Reference:
https://www.nirsoft.net/utils/nircmd.html
