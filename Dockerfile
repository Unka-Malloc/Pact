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

# ── runtime-deps stage ────────────────────────────────────────────────────────
# Download JRE (Temurin 21) and Apache Tika once so they are baked into the image.
# Versions are pinned here; update them whenever setup-local-runtime.mjs changes.
FROM debian:bookworm-slim AS runtime-deps

ARG JRE_VERSION=21.0.10+7
ARG JRE_FILENAME=OpenJDK21U-jre_x64_linux_hotspot_21.0.10_7.tar.gz
ARG JRE_URL=https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B7/${JRE_FILENAME}
ARG TIKA_VERSION=3.2.3
ARG TIKA_URL=https://repo.maven.apache.org/maven2/org/apache/tika/tika-app/${TIKA_VERSION}/tika-app-${TIKA_VERSION}.jar

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Download and unpack JRE
RUN mkdir -p /modules/jre /modules/tika \
    && curl -fsSL --retry 3 "${JRE_URL}" -o /tmp/jre.tar.gz \
    && tar -xzf /tmp/jre.tar.gz -C /modules/jre --strip-components=1 \
    && rm /tmp/jre.tar.gz

# Download Tika jar
RUN curl -fsSL --retry 3 "${TIKA_URL}" -o /modules/tika/tika-app-${TIKA_VERSION}.jar

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    AGENTSTUDIO_SERVER_HOST=0.0.0.0 \
    AGENTSTUDIO_SERVER_PORT=8787 \
    AGENTSTUDIO_SERVER_DATA_DIR=/data \
    AGENTSTUDIO_SERVER_WITH_UI=1 \
    CODEX_HOME=/codex-home \
    PATH=/app/node_modules/.bin:$PATH

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build/dist ./build/dist
COPY --from=build /app/server ./server
COPY --from=runtime-deps /modules ./server/modules

RUN mkdir -p /data /codex-home

EXPOSE 8787

CMD ["node", "server/scripts/start-server.mjs", "--with-ui", "--host", "0.0.0.0", "--port", "8787", "--data-dir", "/data"]
