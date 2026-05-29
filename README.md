# Knight Vision

Local chess tutor: React board, Python API, Stockfish analysis, optional OpenAI explanations (server-side only).

## Project layout

| Path | Role |
|------|------|
| `frontend/` | Vite + React + TypeScript UI |
| `backend/` | FastAPI, python-chess, Stockfish UCI, OpenAI |
| `.env` | Secrets and server config (gitignored) |
| `.env.example` | Template for `.env` |
| `PUBLIC_LAUNCH_CHECKLIST.md` | Pre-launch tasks |

## Prerequisites

- Python 3.11+
- Node.js 18+
- [Stockfish](https://stockfishchess.org/download/) on your `PATH`, or set `STOCKFISH_PATH` in `.env`

## First-time setup

```bash
cd /path/to/knight-vision
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

cp .env.example .env
# Edit .env — add OPENAI_API_KEY only if you want AI explanations

npm install
npm install --prefix frontend
```

## Run locally (Mac)

From the repo root:

```bash
npm run dev
```

- Web UI: http://localhost:5173  
- API: http://127.0.0.1:8000  
- Health: http://127.0.0.1:8000/health  

The frontend uses relative `/api` URLs; Vite proxies them to FastAPI. **No API keys in the browser.**

### API only

```bash
source .venv/bin/activate
# Optional: export API_HOST=0.0.0.0 API_PORT=8000 for LAN access
uvicorn main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000 --app-dir backend
```

### Static frontend build (production-like)

```bash
cd frontend
cp .env.example .env.production.local
# Set VITE_API_BASE=https://your-api.example  (required when not using Vite proxy)
npm run build
npm run preview
```

## Test from iPhone (same Wi‑Fi)

1. Find your Mac’s LAN IP: **System Settings → Network**, or `ipconfig getifaddr en0`.
2. In repo-root `.env`:

   ```bash
   API_HOST=0.0.0.0
   API_PORT=8000
   CORS_ORIGINS=http://YOUR_MAC_IP:5173,http://YOUR_MAC_IP:4173,capacitor://localhost
   ```

3. In `frontend/.env.development.local` (or build env):

   ```bash
   VITE_API_BASE=http://YOUR_MAC_IP:8000
   ```

4. Restart:

   ```bash
   npm run dev
   ```

5. On iPhone Safari, open `http://YOUR_MAC_IP:5173` (allow local network if prompted).

For a **built** UI without the Vite dev server, set `VITE_API_BASE` and run `npm run build` + `npm run preview -- --host` in `frontend/`, then open `http://YOUR_MAC_IP:4173`.

See `frontend/docs/CAPACITOR.md` for wrapping the build in an iOS app.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `OPENAI_API_KEY` | Server `.env` | AI explanations (never frontend) |
| `API_HOST` / `API_PORT` | Server `.env` | Bind address |
| `CORS_ORIGINS` | Server `.env` | Allowed browser origins (required in production) |
| `STOCKFISH_PATH` | Server `.env` | Engine binary |
| `VITE_API_BASE` | Frontend build | Full API URL when not using Vite proxy |
| `VITE_DEV_PROXY_TARGET` | Frontend dev | Proxy target (default `http://127.0.0.1:8000`) |

## API overview

- `GET /health` — liveness  
- `POST /api/analyze` — attack rings, undefended, opening  
- `POST /api/engine/eval` — Stockfish eval  
- `POST /api/engine/plan` — PV walkthrough + optional OpenAI narrative  
- `GET /api/engine/status` — engine binary check (does not start engine)  
- `GET /api/openai/status` — whether server key is configured  
