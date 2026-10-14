FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY web ./web
COPY scripts/offline-manifest.mjs ./scripts/offline-manifest.mjs
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM python:3.13.16-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=5001
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules/three ./node_modules/three
COPY --from=build /app/node_modules/qrcode-generator ./node_modules/qrcode-generator
COPY --from=build /app/node_modules/fflate ./node_modules/fflate
COPY web ./web
COPY --from=build /app/web/offline-manifest.json ./web/offline-manifest.json
COPY backend ./backend
COPY docs ./docs
COPY scripts/solve-stdin.mjs ./scripts/solve-stdin.mjs
COPY scripts/validate-board.mjs ./scripts/validate-board.mjs
COPY THIRD_PARTY_NOTICES.md ./
COPY licenses ./licenses
RUN useradd --create-home --uid 10001 orbitalboard && mkdir -p /app/var && chown orbitalboard:orbitalboard /app/var
USER orbitalboard
EXPOSE 5001
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-5001} --workers 1 --threads 4 --timeout 30 backend.app:app"]
