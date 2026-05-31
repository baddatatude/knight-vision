# Deploy Knight Vision on Railway

Single service: React UI + FastAPI + Stockfish. Connect your **baddatatude** GitHub repo in Railway and deploy from the repo root.

## 1. Push code to GitHub

Ensure the Knight Vision repo is on GitHub under your account (e.g. `baddatatude/KnightSchool`).

```bash
git remote -v   # confirm origin points at GitHub
git push origin main
```

## 2. Create a Railway project

1. Open [railway.app](https://railway.app) and sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo**.
3. Select the Knight Vision repository.
4. Railway reads `railway.toml` and builds with the root `Dockerfile`.

No root directory override needed — build context is the repo root.

## 3. Set environment variables

In the Railway service → **Variables**:

| Variable | Required | Example |
|----------|----------|---------|
| `ENV` | Yes | `production` |
| `OPENAI_API_KEY` | For AI study/plan text | `sk-proj-...` |
| `CORS_ORIGINS` | Optional if UI and API share one domain | `https://your-app.up.railway.app` |

Railway sets automatically (do not override unless you know why):

- `PORT` — HTTP port for uvicorn  
- `RAILWAY_PUBLIC_DOMAIN` — used for CORS when `ENV=production`

`STOCKFISH_PATH` is set in the Dockerfile (`/usr/games/stockfish`).

## 4. Deploy and open the app

1. **Deploy** runs the Docker build (~3–5 min first time).
2. **Settings** → **Networking** → **Generate domain** (e.g. `knight-vision-production.up.railway.app`).
3. Open that URL — you should see the chess board.

### Smoke tests

```bash
curl https://YOUR-DOMAIN.up.railway.app/health
curl https://YOUR-DOMAIN.up.railway.app/api/engine/status
```

In the UI: make a move, toggle overlays, try **Study famous games** (needs `OPENAI_API_KEY` for full commentary).

## 5. Redeploy on push

With GitHub connected, pushes to the tracked branch trigger a new deploy automatically.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on `npm ci` | Commit `frontend/package-lock.json` or change Dockerfile to `npm install` |
| Health check fails | Logs → confirm uvicorn started; check `PORT` is used (start script does) |
| Engine unavailable | Image includes Stockfish; check `/api/engine/status` |
| CORS errors from another origin | Set `CORS_ORIGINS` to your exact frontend URL |
| OpenAI explanations missing | Set `OPENAI_API_KEY` in Railway variables |

## Local Docker test (optional)

```bash
docker build -t knight-vision .
docker run --rm -p 8000:8000 -e ENV=production -e OPENAI_API_KEY=sk-... knight-vision
# Open http://localhost:8000
```

## Split frontend / API (later)

This setup serves UI and API from one domain. To host the frontend elsewhere, build with `VITE_API_BASE=https://your-api.up.railway.app` and deploy only the API (custom start command without static files).
