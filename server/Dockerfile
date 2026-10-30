# API image. Build context is the repository root:  docker build -f server/Dockerfile .
FROM node:24-bookworm-slim

# LibreOffice + poppler render previews for templates uploaded through the admin API.
# python3/make/g++ are only needed if better-sqlite3 has to compile from source.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-impress poppler-utils fonts-liberation fonts-dejavu-core \
      python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json server/package.json
COPY client/apps/web/package.json client/apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @office-template/server...

COPY server server

ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/data/app.db \
    STORAGE_DIR=/data/storage
VOLUME ["/data"]
EXPOSE 3001

WORKDIR /app/server
# The server imports the template catalog itself on start (idempotent: unchanged templates are skipped).
CMD ["pnpm", "start"]
