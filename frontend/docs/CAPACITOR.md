# Capacitor / iOS notes

Knight Vision's UI is a standard Vite static build. Capacitor wraps `frontend/dist` in a native WebView.

## Prerequisites

- macOS with Xcode
- Apple Developer account (for device install / App Store)
- Deployed or LAN-reachable **HTTPS API** (OpenAI and Stockfish stay on the server)

## Steps (outline)

```bash
cd frontend
npm run build
# VITE_API_BASE must point at your API, e.g. https://api.yourdomain.com
# Set in .env.production.local before build

npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Knight Vision" com.yourname.knightvision --web-dir dist
npx cap add ios
npx cap sync ios
npx cap open ios
```

In Xcode: set your signing team, run on a device.

## API URL

Capacitor apps cannot use Vite’s dev proxy. Bake the API origin at build time:

```bash
VITE_API_BASE=https://api.yourdomain.com npm run build
```

For local device testing on Wi‑Fi:

```bash
VITE_API_BASE=http://192.168.1.42:8000 npm run build
```

Add that origin (and `capacitor://localhost`) to server `CORS_ORIGINS`.

## Security

- Do **not** embed `OPENAI_API_KEY` in the iOS app.
- Prefer **HTTPS** in production (App Transport Security).
- Ship a privacy policy if you send positions to OpenAI.

## App Store

See repo-root `PUBLIC_LAUNCH_CHECKLIST.md`.
