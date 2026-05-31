# Knight Vision — API + React UI + Stockfish (single Railway service)

FROM node:20-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
# Same origin as API — relative /api URLs
ENV VITE_API_BASE=
RUN npm run build

FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY --from=frontend /app/frontend/dist frontend/dist
COPY scripts/start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV ENV=production
ENV STOCKFISH_PATH=/usr/games/stockfish

EXPOSE 8000
CMD ["/app/start.sh"]
