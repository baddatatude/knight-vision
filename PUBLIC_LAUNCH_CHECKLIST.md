# Knight Vision — public launch checklist

Practical tasks for shipping this app (React + FastAPI + Stockfish + optional OpenAI). Check items as you complete them.

---

## Security

- [ ] Confirm `OPENAI_API_KEY` exists only in server `.env` / host secrets — never in `frontend/`, Capacitor bundle, or git.
- [ ] Verify `.env` is gitignored; rotate any key ever committed or pasted in chat.
- [ ] Set `ENV=production` on the cloud host; configure `CORS_ORIGINS` to your real web/app origins only (no `*` with credentials).
- [ ] Serve API over **HTTPS** with a valid certificate.
- [ ] Review rate limits (`RATE_LIMIT_ENABLED`, `RATE_LIMIT_PER_MINUTE`); plan Redis-backed limits if traffic grows.
- [ ] Restrict cloud firewall / security groups to needed ports (443, optional SSH).
- [ ] Document incident response if API key leaks (revoke in OpenAI dashboard, redeploy).

---

## Backend deployment

- [ ] Choose host (Fly.io, Railway, Render, VPS, etc.).
- [ ] Install Stockfish in the image or mount binary; set `STOCKFISH_PATH` if not on `PATH`.
- [ ] Deploy `backend/` with `uvicorn main:app --host 0.0.0.0 --port $PORT` (or platform entrypoint).
- [ ] Inject secrets via platform env (not files in the image).
- [ ] Set `CORS_ORIGINS` to production web URL + `capacitor://localhost` if using iOS shell.
- [ ] Smoke test: `GET /health`, `POST /api/analyze`, `POST /api/engine/eval`, `POST /api/engine/plan`.
- [ ] Optional: serve built `frontend/dist` from the same origin as `/api` to simplify CORS.
- [ ] Set process memory limits; Stockfish `Hash` is already capped low in code — tune if needed.

---

## iOS / Capacitor

- [ ] Build frontend with `VITE_API_BASE=https://your-production-api`.
- [ ] Add Capacitor iOS project (`frontend/docs/CAPACITOR.md`).
- [ ] Test on physical iPhone against staging API.
- [ ] Handle offline/errors (network failure messages already in UI — verify on device).
- [ ] Add app icons and launch screen in Xcode.
- [ ] Privacy manifest / required reason APIs if Apple prompts for third-party SDKs.

---

## App Store readiness

- [ ] Apple Developer Program enrollment ($99/year).
- [ ] App name, subtitle, description, keywords, category (Games → Board or Education).
- [ ] Screenshots (6.7" and 6.5" iPhone).
- [ ] 1024×1024 app icon.
- [ ] **Privacy Policy URL** — must describe chess position data sent to OpenAI when “Explain plan” is used.
- [ ] Support URL or contact email.
- [ ] App Privacy questionnaire: data collected, third-party AI, not linked to identity (unless you add accounts later).
- [ ] Age rating questionnaire.
- [ ] TestFlight beta before public submission.
- [ ] Export compliance: typically “uses encryption” = HTTPS only → standard exemption.

---

## OpenAI API cost controls

- [ ] Set **usage limits** and billing alerts in OpenAI dashboard.
- [ ] Prefer `gpt-4o-mini` (already used) for explanations; avoid upgrading model without cost review.
- [ ] Consider max depth / disabling `explain` by default for free tier.
- [ ] Rate limit `/api/engine/plan` aggressively in production if abused (current middleware is per-IP in-memory).
- [ ] Log token usage per request (extend `notebooks/openai_usage.ipynb` pattern or server logging).
- [ ] Plan behavior when key missing: walk-through without narrative (already supported).

---

## User privacy

- [ ] Publish policy: what you send (FEN, move list, engine line), who receives it (your server, OpenAI), retention.
- [ ] In-app short notice before first AI explanation (optional but helps review and trust).
- [ ] Do not log full API keys or raw OpenAI responses in production logs.
- [ ] GDPR/CCPA: if EU/CA users, define lawful basis and deletion contact (even without accounts).

---

## Logging / monitoring

- [ ] Structured logs on API (request path, status, latency; no secrets).
- [ ] Uptime check on `/health` (Pingdom, Better Stack, etc.).
- [ ] Alert on 5xx rate, engine 503s, OpenAI 502s.
- [ ] Error tracking (Sentry, etc.) for frontend + backend if desired.
- [ ] Disk/memory monitoring on host running Stockfish.

---

## Future authentication

- [ ] Not required for v1. When added:
  - [ ] User accounts + JWT or session cookies.
  - [ ] Per-user OpenAI quotas instead of shared server key.
  - [ ] Apple Sign In if required for social login policies.
  - [ ] Update privacy policy and App Privacy labels.

---

## Monetization / subscriptions

- [ ] Not implemented. If you charge for AI coaching:
  - [ ] Apple IAP for digital features consumed in the app (guideline 3.1.1).
  - [ ] Or keep AI free and monetize elsewhere with clear App Review notes.
  - [ ] Terms of service + refund policy.
  - [ ] Server-side entitlement checks before calling OpenAI.

---

## Quick pre-submit smoke test

1. Production `VITE_API_BASE` build loads on device.  
2. Play moves, overlays update.  
3. Engine plays Black / eval works.  
4. Explain plan works with server key; graceful message without key.  
5. Airplane mode shows friendly network error, not a blank screen.
