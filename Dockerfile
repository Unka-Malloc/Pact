FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json vite.config.ts ./
COPY server ./server
COPY server-web ./server-web

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN npm ci
RUN npm run build:renderer
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    SPLITALL_SERVER_HOST=0.0.0.0 \
    SPLITALL_SERVER_PORT=8787 \
    SPLITALL_SERVER_DATA_DIR=/data \
    SPLITALL_SERVER_WITH_UI=1 \
    CODEX_HOME=/codex-home \
    PATH=/app/node_modules/.bin:$PATH

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build/dist ./build/dist
COPY --from=build /app/server ./server
COPY modules ./modules

RUN mkdir -p /data /codex-home

EXPOSE 8787

CMD ["node", "server/scripts/start-server.mjs", "--with-ui", "--host", "0.0.0.0", "--port", "8787", "--data-dir", "/data"]
